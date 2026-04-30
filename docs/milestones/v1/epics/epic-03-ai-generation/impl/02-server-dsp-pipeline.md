---
depth: deep
---

# impl/02 — 서버: DSP 파이프라인 (DspService + Celery task + MockDspService)

**Epic**: 03 — DSP 음원 후처리 생성  
**커버 스토리**: Story 2 (DSP 서버 파이프라인), Story 4 (녹음 샘플 자동 삭제)  
**선행 조건**: impl/01 완료 (RecordingSession/Recording/MasterAudio ORM + 0006 migration)  
**예상 소요**: 6~8시간

> **[v1.3.1 피벗]** 구 impl/03(VoiceInferenceClient ABC + MockClient + factory), 구 impl/04(generate_track_task GPU Celery task) 대체.  
> **depth=deep**: 서버 DSP 처리는 음원 품질 직결. ffmpeg subprocess 오작동 시 corrupted mp3 클라이언트 배포 위험.

---

## 1. 생성/수정할 파일 목록

```
apps/api/app/
├── services/
│   └── dsp/
│       ├── __init__.py               [신규]
│       ├── ffmpeg_service.py         [신규 — DspService 구현]
│       └── mock_dsp_service.py       [신규 — MockDspService (MOCK_DSP=true)]
├── tasks/
│   └── dsp_processing.py             [신규 — Celery DSP task (구 generation.py 대체)]
└── core/
    ├── config.py                     [수정 — MOCK_DSP 필드 추가 (MOCK_LATENCY_MS는 이미 존재)]
    ├── celery_app.py                 [수정 — include에 app.tasks.dsp_processing 추가]
    └── celery_config.py              [수정 — beat_schedule에 clip-cleanup-hourly 추가]
```

> **실존 확인 (검증 완료)**
> - `config.py`: `MOCK_LATENCY_MS: int = 3000` 이미 존재. `MOCK_DSP` 필드만 추가.
> - `celery_app.py` include: `["app.tasks.cleanup", "app.tasks.generation", "app.tasks.hard_delete_users"]` — `app.tasks.dsp_processing` 미포함, 수정 필요.
> - `celery_config.py` beat_schedule: `cleanup-voice-samples` + `hard-delete-expired-users` 존재. `clip-cleanup-hourly` 추가 필요. `app.conf.beat_schedule` 직접 할당 금지 — 기존 `celery_config.py` 패턴 유지.
> - `storage_service.py` 실제 함수: `upload_mp3(user_id, track_id, mp3_bytes)` / `generate_presigned_url(s3_key)` / `delete_object(s3_key)`. `download_file` / `delete_file` 미존재. Celery task에서 S3 다운로드는 boto3 직접 호출, 업로드는 바이트 변환 후 기존 함수 사용.

---

## 1-A. config.py 수정 (MOCK_DSP 필드 추가)

```python
# apps/api/app/core/config.py — 기존 MOCK_GPU 블록 아래에 추가

# DSP 분기 (v1.3.1)
MOCK_DSP: bool = True   # True 시 ffmpeg 호출 없이 MockDspService 사용 (개발/테스트 환경)
# MOCK_LATENCY_MS는 이미 존재 (3000 기본값) — 재선언 불필요
```

## 1-B. celery_app.py 수정 (include 추가)

```python
# apps/api/app/core/celery_app.py
celery_app = Celery(
    "jajang",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.tasks.cleanup",
        "app.tasks.generation",
        "app.tasks.hard_delete_users",
        "app.tasks.dsp_processing",   # 추가 — DSP Celery task 등록
    ],
)
```

## 1-C. celery_config.py 수정 (beat_schedule 추가)

```python
# apps/api/app/core/celery_config.py — 기존 beat_schedule dict에 항목 추가

beat_schedule = {
    "cleanup-voice-samples": {
        "task": "tasks.cleanup_voice_samples",
        "schedule": crontab(minute=0),
    },
    "hard-delete-expired-users": {
        "task": "tasks.hard_delete_expired_users",
        "schedule": crontab(hour=18, minute=0),
    },
    "clip-cleanup-hourly": {              # 추가 — Recording S3 클립 24h TTL 삭제
        "task": "tasks.clip_cleanup",
        "schedule": 3600.0,              # 1시간 고정 주기
    },
}
```

> `app.conf.beat_schedule` 직접 할당 금지 — 프로젝트 패턴은 `celery_config.py` 단일 출처.

---

## 2. DspService 인터페이스

```python
# apps/api/app/services/dsp/__init__.py
from app.core.config import settings
from app.services.dsp.ffmpeg_service import DspService
from app.services.dsp.mock_dsp_service import MockDspService


def get_dsp_service():
    """MOCK_DSP 환경변수에 따라 DspService 또는 MockDspService 반환."""
    if settings.MOCK_DSP:
        return MockDspService(latency_ms=settings.MOCK_LATENCY_MS)
    return DspService()
```

---

## 3. DspService (ffmpeg subprocess)

```python
# apps/api/app/services/dsp/ffmpeg_service.py

import subprocess
import tempfile
import os
import random
import structlog
from pathlib import Path

logger = structlog.get_logger()


class DspService:
    """
    ffmpeg 기반 DSP 후처리 파이프라인.

    파이프라인 순서 (클립 1개 기준):
    1. afftdn — 적응형 노이즈 제거
    2. equalizer — EQ (음성 주파수 강조)
    3. aecho — reverb (부드러운 공간감)

    concat 단계:
    4. N=1: [A, A] acrossfade (단순 반복 crossfade)
       N≥2: Fisher-Yates 직전 제외 셔플 → acrossfade 체인

    출력: MP3 128kbps stereo, 약 3분 (loop 단위 클립)
    """

    # DSP 파라미터 상수 (M0 self-test 튜닝 값으로 교체 예정)
    AFFTDN_NR   = 10         # noise reduction (dB)
    AFFTDN_NF   = -25        # noise floor (dBFS)
    EQ_FREQ     = 2500       # 음성 명료도 강조 주파수
    EQ_WIDTH    = 200
    EQ_GAIN     = 3          # +3dB
    AECHO_IN    = 0.6
    AECHO_OUT   = 0.3
    AECHO_DELAY = 100        # ms
    AECHO_DECAY = 0.3
    CROSSFADE_D = 0.3        # 300ms crossfade (acrossfade d 파라미터)
    CROSSFADE_C = "tri"      # c1, c2 커브 타입

    def process(
        self,
        clip_paths: list[str],       # S3에서 다운로드된 로컬 경로 목록
        output_path: str,            # master.mp3 출력 경로
        previous_clip_index: int | None = None,  # 직전 재생 클립 인덱스 (셔플 제외용)
    ) -> None:
        """
        DSP 처리 + concat → output_path에 master.mp3 저장.
        실패 시 subprocess.CalledProcessError 또는 RuntimeError 발생.
        """
        if not clip_paths:
            raise ValueError("clip_paths is empty")

        # Step 1~3: 각 클립 개별 DSP
        processed_paths = []
        for i, clip_path in enumerate(clip_paths):
            out_path = clip_path + ".dsp.wav"
            self._apply_individual_dsp(clip_path, out_path)
            processed_paths.append(out_path)

        # Step 4: 셔플 + concat + acrossfade
        if len(processed_paths) == 1:
            ordered = [processed_paths[0], processed_paths[0]]  # N=1: A,A
        else:
            ordered = self._shuffle_exclude_previous(processed_paths, previous_clip_index)

        self._concat_acrossfade(ordered, output_path)

        # 임시 DSP 중간 파일 정리
        for p in processed_paths:
            try:
                os.remove(p)
            except FileNotFoundError:
                pass

    def _apply_individual_dsp(self, input_path: str, output_path: str) -> None:
        """단일 클립 DSP: afftdn → equalizer → aecho."""
        filter_chain = (
            f"afftdn=nr={self.AFFTDN_NR}:nf={self.AFFTDN_NF},"
            f"equalizer=f={self.EQ_FREQ}:width_type=h:width={self.EQ_WIDTH}:g={self.EQ_GAIN},"
            f"aecho={self.AECHO_IN}:{self.AECHO_OUT}:{self.AECHO_DELAY}:{self.AECHO_DECAY}"
        )
        cmd = [
            "ffmpeg", "-y",
            "-i", input_path,
            "-af", filter_chain,
            output_path,
        ]
        self._run_ffmpeg(cmd, context="individual_dsp")

    def _shuffle_exclude_previous(
        self,
        paths: list[str],
        previous_index: int | None,
    ) -> list[str]:
        """
        N≥2 Fisher-Yates 직전 제외 셔플.
        previous_index=None 이면 셔플만 (제외 없음).
        반환: acrossfade concat 순서 리스트.
        """
        pool = list(range(len(paths)))
        if previous_index is not None and previous_index in pool:
            pool.remove(previous_index)

        random.shuffle(pool)

        # 생성된 순서 인덱스로 실제 경로 매핑
        return [paths[i] for i in pool]

    def _concat_acrossfade(self, ordered_paths: list[str], output_path: str) -> None:
        """
        acrossfade 체인 concat.
        ffmpeg -i A -i B -filter_complex "[0][1]acrossfade=d=0.3:c1=tri:c2=tri" output.mp3
        N>2: 체인 방식 (A→B acrossfade → result, result→C acrossfade → final)
        """
        if len(ordered_paths) < 2:
            raise ValueError("acrossfade requires at least 2 inputs")

        # 순차 2-파일 acrossfade 체인
        current = ordered_paths[0]
        for next_clip in ordered_paths[1:]:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp_path = tmp.name
            cmd = [
                "ffmpeg", "-y",
                "-i", current,
                "-i", next_clip,
                "-filter_complex",
                f"[0][1]acrossfade=d={self.CROSSFADE_D}:c1={self.CROSSFADE_C}:c2={self.CROSSFADE_C}",
                tmp_path,
            ]
            self._run_ffmpeg(cmd, context="acrossfade")
            if current != ordered_paths[0]:
                # 중간 임시 파일 정리 (첫 번째는 원본이므로 보존)
                try:
                    os.remove(current)
                except FileNotFoundError:
                    pass
            current = tmp_path

        # 최종 파일 → MP3 128kbps 인코딩
        cmd = [
            "ffmpeg", "-y",
            "-i", current,
            "-codec:a", "libmp3lame",
            "-b:a", "128k",
            "-ac", "2",      # stereo
            output_path,
        ]
        self._run_ffmpeg(cmd, context="mp3_encode")
        try:
            os.remove(current)
        except FileNotFoundError:
            pass

    @staticmethod
    def _run_ffmpeg(cmd: list[str], context: str) -> None:
        logger.debug("ffmpeg.run", context=context, cmd=" ".join(cmd))
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            logger.error("ffmpeg.failed", context=context, stderr=result.stderr)
            raise RuntimeError(f"ffmpeg failed [{context}]: {result.stderr[-500:]}")
```

---

## 4. MockDspService

```python
# apps/api/app/services/dsp/mock_dsp_service.py

import time
import shutil
import os
import structlog

logger = structlog.get_logger()

# placeholder mp3: 실제 CC0 자장가 30초 클립 또는 sine wave mp3
# 경로: apps/api/app/static/mock_master.mp3 (git tracked)
MOCK_MP3_PATH = os.path.join(os.path.dirname(__file__), "../../static/mock_master.mp3")


class MockDspService:
    def __init__(self, latency_ms: int = 3000):
        self._latency_ms = latency_ms

    def process(
        self,
        clip_paths: list[str],
        output_path: str,
        previous_clip_index: int | None = None,
    ) -> None:
        """MOCK_DSP=true 환경: ffmpeg 없이 placeholder mp3 반환."""
        logger.info("mock_dsp.process", latency_ms=self._latency_ms, clips=len(clip_paths))
        time.sleep(self._latency_ms / 1000)

        if not os.path.exists(MOCK_MP3_PATH):
            # static 파일 없으면 빈 파일 생성 (최소 동작 보장)
            with open(output_path, "wb") as f:
                f.write(b"ID3")  # 최소 MP3 헤더 (실제 재생 불가하나 파이프라인 테스트용)
        else:
            shutil.copy2(MOCK_MP3_PATH, output_path)
```

---

## 5. Celery DSP task

> **storage_service 실존 인터페이스 (검증 완료)**
> - `upload_mp3(user_id, track_id, mp3_bytes: bytes) -> str` — 파일 경로 X, bytes 인자.
> - `delete_object(s3_key: str)` — cleanup task에서 사용.
> - `download_file` / `delete_file` 미존재 — S3 다운로드는 boto3 직접 호출.
>
> **SoftTimeLimitExceeded scope 수정**: try 블록 내 DB context 외부에서 `db` 참조 불가.
> 타임아웃 처리는 독립 `with SyncSessionLocal()` 내부에서 실행.
>
> **GenerationCounter update**: 기존 `generation.py` 패턴 참조 — `last_generated_at` + `updated_at` 함께 갱신.

```python
# apps/api/app/tasks/dsp_processing.py

import uuid
import time
import tempfile
import os
import shutil
import boto3
import structlog
from datetime import datetime, timezone, timedelta
from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded
from botocore.exceptions import ClientError
from sqlalchemy import select, update

from app.core.db import SyncSessionLocal
from app.core.config import settings
from app.models.recording import Recording
from app.models.master_audio import MasterAudio
from app.models.generation_counter import GenerationCounter
from app.services.dsp import get_dsp_service
from app.services.storage_service import upload_mp3, delete_object

logger = structlog.get_logger()

SAMPLE_DELETE_DELAY_HOURS = 24
MAX_RETRIES = 3
# exponential backoff 간격 (초): retry 0→60s, 1→180s, 2→600s
BACKOFF_DELAYS = [60, 180, 600]


def _s3_download(s3_key: str, local_path: str) -> None:
    """boto3 직접 S3 다운로드 (storage_service에 download_file 미존재)."""
    client = boto3.client(
        "s3",
        region_name=settings.S3_REGION,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        **({"endpoint_url": settings.S3_ENDPOINT_URL} if settings.S3_ENDPOINT_URL else {}),
    )
    client.download_file(settings.S3_BUCKET_NAME, s3_key, local_path)


def _s3_download_mock(s3_key: str, local_path: str) -> None:
    """MOCK_S3=true 환경: /static/ 로컬 경로에서 복사."""
    from app.core.config import STATIC_ROOT
    src = STATIC_ROOT / s3_key
    if src.exists():
        shutil.copy2(str(src), local_path)
    else:
        # 파일 없어도 빈 wav 생성 (DSP mock이 처리)
        with open(local_path, "wb") as f:
            f.write(b"")


@shared_task(
    name="tasks.dsp_process",
    bind=True,
    max_retries=MAX_RETRIES,
    default_retry_delay=60,     # 기본 60초. countdown override로 exponential backoff 적용
    acks_late=True,
    soft_time_limit=35,         # 30초 NFR + 5초 버퍼
    time_limit=60,              # Celery 강제 종료
)
def dsp_process_task(
    self,
    session_id: str,
    master_audio_id: str,
    user_id: str,
    entitlement: str,
):
    """
    DSP 처리 Celery task.

    Retry 정책 (DESIGN_VALIDATION advisory 반영):
    - max_retries=3
    - countdown=exponential backoff (60/180/600s)
    - on_failure: master_audios.status=failed + Sentry 알림 (structlog.error fallback)
    """
    _session_id = uuid.UUID(session_id)
    _master_id  = uuid.UUID(master_audio_id)
    _user_id    = uuid.UUID(user_id)

    logger.info("dsp_task.start", session_id=session_id, master_id=master_audio_id)

    # ── 재실행 가드: acks_late=True 환경에서 worker 크래시 후 중복 실행 방지 ──
    with SyncSessionLocal() as db:
        master = db.get(MasterAudio, _master_id)
        if master and master.status == "completed":
            logger.info("dsp_task.already_completed", master_id=master_audio_id)
            return

    dsp = get_dsp_service()
    tmp_dir = tempfile.mkdtemp(prefix="jajang_dsp_")
    output_path = os.path.join(tmp_dir, "master.mp3")

    try:
        # Step 1: status → processing
        with SyncSessionLocal() as db:
            db.execute(
                update(MasterAudio)
                .where(MasterAudio.id == _master_id)
                .values(status="processing")
            )
            db.commit()

        # Step 2: 녹음 클립 조회 (validated 클립만)
        with SyncSessionLocal() as db:
            result = db.execute(
                select(Recording)
                .where(
                    Recording.session_id == _session_id,
                    Recording.is_validated == True,  # noqa: E712
                    Recording.s3_key.isnot(None),
                )
            )
            recordings = result.scalars().all()

        if not recordings:
            raise RuntimeError("No validated recordings found for session")

        # Step 3: S3 다운로드 (MOCK_S3 분기 포함)
        clip_paths = []
        for rec in recordings:
            local_path = os.path.join(tmp_dir, f"{rec.id}.wav")
            if settings.MOCK_S3:
                _s3_download_mock(rec.s3_key, local_path)
            else:
                _s3_download(rec.s3_key, local_path)
            clip_paths.append(local_path)

        start_ms = int(time.monotonic() * 1000)

        # Step 4: DSP 처리
        dsp.process(
            clip_paths=clip_paths,
            output_path=output_path,
            previous_clip_index=None,  # 최초 생성 — 직전 클립 제외 없음
        )

        dsp_duration_ms = int(time.monotonic() * 1000) - start_ms

        # Step 5: S3 업로드 — upload_mp3는 bytes 인자. Path에서 읽어 전달.
        mp3_bytes = open(output_path, "rb").read()
        s3_key = upload_mp3(
            user_id=_user_id,
            track_id=_master_id,   # master_audio.id를 track_id 위치에 전달 (s3 prefix = tracks/{user}/{master_id}.mp3)
            mp3_bytes=mp3_bytes,
        )

        # Step 6: DB 업데이트 (completed + counter +1 + 클립 삭제 예약)
        schedule_delete = datetime.now(timezone.utc) + timedelta(hours=SAMPLE_DELETE_DELAY_HOURS)

        with SyncSessionLocal() as db:
            db.execute(
                update(MasterAudio)
                .where(MasterAudio.id == _master_id)
                .values(
                    status="completed",
                    s3_key=s3_key,
                    dsp_duration_ms=dsp_duration_ms,
                    completed_at=datetime.now(timezone.utc),
                )
            )
            db.execute(
                update(Recording)
                .where(Recording.session_id == _session_id)
                .values(schedule_delete_at=schedule_delete)
            )
            # 무료 유저만 카운터 +1 (generation.py 패턴 준용 — last_generated_at + updated_at 함께)
            if entitlement == "free":
                db.execute(
                    update(GenerationCounter)
                    .where(GenerationCounter.user_id == _user_id)
                    .values(
                        count=GenerationCounter.count + 1,
                        last_generated_at=datetime.now(timezone.utc),
                        updated_at=datetime.now(timezone.utc),
                    )
                    .execution_options(synchronize_session=False)
                )
            db.commit()

        logger.info(
            "dsp_task.completed",
            session_id=session_id,
            s3_key=s3_key,
            dsp_duration_ms=dsp_duration_ms,
        )

    except SoftTimeLimitExceeded:
        # SoftTimeLimitExceeded: db 스코프 밖 → 독립 세션으로 실패 처리
        logger.error("dsp_task.timeout", session_id=session_id)
        _fail_task_new_session(_master_id, "timeout: exceeded 30s soft limit")

    except Exception as exc:
        logger.error("dsp_task.error", session_id=session_id, exc=str(exc))
        # exponential backoff: 60s / 180s / 600s
        retry_count = self.request.retries
        if retry_count < MAX_RETRIES:
            countdown = BACKOFF_DELAYS[retry_count]
            raise self.retry(exc=exc, countdown=countdown)
        else:
            # 최대 재시도 소진 → on_failure
            _fail_task_final(_master_id, str(exc))

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _fail_task_new_session(master_id: uuid.UUID, error_message: str) -> None:
    """독립 세션으로 즉시 실패 처리 (타임아웃 케이스 — 기존 db 스코프 밖)."""
    try:
        with SyncSessionLocal() as db:
            db.execute(
                update(MasterAudio)
                .where(MasterAudio.id == master_id)
                .values(status="failed", error_message=error_message)
            )
            db.commit()
    except Exception:
        pass


def _fail_task_final(master_id: uuid.UUID, error_message: str) -> None:
    """재시도 소진 후 최종 실패 처리 + Sentry 알림."""
    logger.error(
        "dsp_task.final_failure",
        master_id=str(master_id),
        error_message=error_message,
        alert="SENTRY_NOTIFY",    # Sentry SDK 설정 시 자동 capture_exception
    )
    try:
        with SyncSessionLocal() as db:
            db.execute(
                update(MasterAudio)
                .where(MasterAudio.id == master_id)
                .values(status="failed", error_message=f"max_retries exceeded: {error_message}")
            )
            db.commit()
    except Exception:
        pass
```

---

## 6. Celery Beat — clip_cleanup task

> **실존 확인**: `storage_service.delete_file` 미존재. 실제 함수명은 `delete_object(s3_key)`. 아래 코드 정합.

```python
# apps/api/app/tasks/dsp_processing.py 에 추가

@shared_task(name="tasks.clip_cleanup")
def clip_cleanup_task():
    """
    1시간 주기 실행. schedule_delete_at <= NOW() 인 recordings S3 삭제 후 s3_key = NULL.
    S3 삭제 실패 시 해당 레코드 스킵 — 다음 주기에 재시도.
    """
    now = datetime.now(timezone.utc)

    with SyncSessionLocal() as db:
        result = db.execute(
            select(Recording)
            .where(
                Recording.schedule_delete_at <= now,
                Recording.s3_key.isnot(None),
            )
        )
        targets = result.scalars().all()

        for rec in targets:
            s3_key = rec.s3_key
            try:
                delete_object(s3_key)   # storage_service.delete_object (실존 함수명)
                db.execute(
                    update(Recording)
                    .where(Recording.id == rec.id)
                    .values(s3_key=None)
                )
                logger.info("clip.deleted", recording_id=str(rec.id), s3_key=s3_key)
            except Exception as e:
                logger.warning("clip.delete_failed", recording_id=str(rec.id), error=str(e))
                # schedule_delete_at 유지 → 다음 주기에 재시도

        db.commit()
```

Beat 스케줄은 `§1-C` (`celery_config.py`)에서 관리. `app.conf.beat_schedule` 직접 할당 금지.

---

## 7. 결정 근거

### exponential backoff 재시도 정책 (DESIGN_VALIDATION advisory)

DSP 처리 실패는 일시적 리소스 부족 또는 네트워크 오류가 주원인. 즉시 재시도(countdown=0)는 동일 조건에서 재실패 확률 높음. 60/180/600초 backoff로 간격 확보.

Sentry 알림: `max_retries` 소진 시 `logger.error(..., alert="SENTRY_NOTIFY")`. Sentry SDK의 `before_send` 훅 또는 Celery `signals.task_failure`에서 capture. MVP에서 구체적 설정은 engineer 판단.

### N=1 처리: [A, A] acrossfade (셔플 X)

PRD §F4: "N=1: 셔플 분기 미적용 — 단순 loop 반복". 동일 클립을 2번 acrossfade하면 seamless loop 준비 완료. 클라이언트는 이 master.mp3를 `RepeatMode.Queue`로 단순 반복.

### DspService.process() 시그니처에 previous_clip_index 포함

향후 "재생성 시 직전 재생 클립 제외" 기능 지원을 위해 파라미터 보존. 최초 생성 시 None 전달 → 랜덤 셔플.

---

## 8. 수용 기준

- [ ] (TEST) `MOCK_DSP=true` 환경: Celery task 실행 → `MOCK_LATENCY_MS`ms 후 `master_audios.status=completed`
- [ ] (TEST) `MOCK_DSP=false` + ffmpeg 설치 환경: 실제 DSP 처리 → `output_path`에 MP3 파일 생성
- [ ] (TEST) N=1 클립 → DspService.process() → [A,A] acrossfade 실행 확인 (ffmpeg cmd에 같은 파일 2번)
- [ ] (TEST) N=2 클립 → Fisher-Yates 셔플 적용 확인 (previous_clip_index=None 시 랜덤)
- [ ] (TEST) DSP 실패 → retry 1회 (countdown=60s) → 성공 시 `status=completed`
- [ ] (TEST) 3회 재시도 소진 → `master_audios.status=failed` + `max_retries exceeded` error_message
- [ ] (TEST) DSP 성공 + 무료 유저 → `generation_counters.count +1`
- [ ] (TEST) DSP 성공 → `recordings.schedule_delete_at = NOW() + 24h` 설정
- [ ] (TEST) `tasks.clip_cleanup` 실행 → `schedule_delete_at <= NOW()` recordings S3 삭제 + `s3_key=None`
- [ ] (MANUAL) soft_time_limit=35 초과 시 → `master_audios.status=failed` + timeout error_message

---

## 9. 주의사항

- `DspService._concat_acrossfade`의 체인 방식은 중간 임시 파일이 누적될 수 있음. `tmp_dir` 삭제는 `finally` 블록에서 `shutil.rmtree`로 보장.
- `ffmpeg` 바이너리가 서버 PATH에 존재하지 않으면 `FileNotFoundError`. 도커 이미지에 `apt-get install -y ffmpeg` 추가 필수.
- `MOCK_DSP=true`의 `mock_master.mp3`가 없으면 빈 파일(3바이트 ID3 헤더) 반환. 클라이언트에서 재생 오류 발생하지만 파이프라인 테스트는 가능. 실제 CC0 음원 파일 커밋 권장.
- Celery task `acks_late=True`: worker 크래시 시 재실행됨. task 시작 시 `status=completed` 체크로 중복 실행 방지 (재실행 가드 §5 상단).
- `SyncSessionLocal`은 Celery task 전용. FastAPI 라우터는 `get_db()` async 사용.
- `psycopg2-binary` 의존성 필요 (SyncSession용). `requirements.txt`에 추가 확인.

---

## Appendix. SPEC_GAP 보강 내역 (MODULE_PLAN 검증 결과)

| # | 갭 | 수정 위치 |
|---|---|---|
| G1 | `storage_service.upload_mp3` 시그니처 불일치 — 실제는 `(user_id, track_id, mp3_bytes)`. 파일경로/session_id 파라미터 없음 | §5 Step 5 재작성 |
| G2 | `storage_service.download_file` 미존재 — S3 다운로드는 boto3 직접 호출 필요 | §5 `_s3_download()` 추가 |
| G3 | `storage_service.delete_file` 미존재 — 실제 함수명 `delete_object(s3_key)` | §6 cleanup task 수정 |
| G4 | `MOCK_DSP` 설정 미존재 — `config.py`에 추가 필요 (`MOCK_LATENCY_MS`는 이미 존재) | §1-A 신규 추가 |
| G5 | `celery_app.py` include에 `app.tasks.dsp_processing` 미등록 | §1-B 신규 추가 |
| G6 | beat_schedule을 `celery_app.py`에 직접 할당 지시 — 프로젝트 패턴은 `celery_config.py` 단일 출처 | §1-C + §6 수정 |
| G7 | `SoftTimeLimitExceeded` except 블록에서 `db` 변수 스코프 오류 — `with` 블록 밖에서 참조 불가 | §5 `_fail_task_new_session()` 분리 |
| G8 | `GenerationCounter` update 시 `last_generated_at` + `updated_at` 누락 — 기존 generation.py 패턴 미준용 | §5 Step 6 수정 |
