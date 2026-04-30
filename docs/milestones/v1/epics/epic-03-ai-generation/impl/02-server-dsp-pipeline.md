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
    └── config.py                     [수정 — MOCK_DSP, MOCK_LATENCY_MS 설정 추가]
```

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

```python
# apps/api/app/tasks/dsp_processing.py

import uuid
import time
import tempfile
import os
import structlog
from datetime import datetime, timezone, timedelta
from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded

from app.core.db import SyncSessionLocal
from app.models.recording_session import RecordingSession
from app.models.recording import Recording
from app.models.master_audio import MasterAudio
from app.models.generation_counter import GenerationCounter   # 기존 Epic 01 구현
from app.services.dsp import get_dsp_service
from app.services import storage_service
from sqlalchemy import select, update

logger = structlog.get_logger()

SAMPLE_DELETE_DELAY_HOURS = 24
MAX_RETRIES = 3


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
    _session_id    = uuid.UUID(session_id)
    _master_id     = uuid.UUID(master_audio_id)
    _user_id       = uuid.UUID(user_id)

    logger.info("dsp_task.start", session_id=session_id, master_id=master_audio_id)

    # ── 재실행 가드: 이미 completed이면 skip ────────────────────────
    with SyncSessionLocal() as db:
        master = db.get(MasterAudio, _master_id)
        if master and master.status == "completed":
            logger.info("dsp_task.already_completed", master_id=master_audio_id)
            return

    dsp = get_dsp_service()
    tmp_dir = tempfile.mkdtemp(prefix="jajang_dsp_")
    output_path = os.path.join(tmp_dir, "master.mp3")

    try:
        with SyncSessionLocal() as db:
            # Step 1: status → processing
            db.execute(
                update(MasterAudio)
                .where(MasterAudio.id == _master_id)
                .values(status="processing")
            )
            db.commit()

            # Step 2: 녹음 클립 조회 (validated 클립만)
            result = db.execute(
                select(Recording)
                .where(
                    Recording.session_id == _session_id,
                    Recording.is_validated == True,
                    Recording.s3_key.isnot(None),
                )
            )
            recordings = result.scalars().all()

            if not recordings:
                raise RuntimeError("No validated recordings found for session")

        # Step 3: S3 다운로드
        clip_paths = []
        for rec in recordings:
            local_path = os.path.join(tmp_dir, f"{rec.id}.wav")
            storage_service.download_file(rec.s3_key, local_path)
            clip_paths.append(local_path)

        start_ms = int(time.monotonic() * 1000)

        # Step 4: DSP 처리
        dsp.process(
            clip_paths=clip_paths,
            output_path=output_path,
            previous_clip_index=None,  # 최초 생성 — 직전 클립 제외 없음
        )

        dsp_duration_ms = int(time.monotonic() * 1000) - start_ms

        # Step 5: S3 업로드
        s3_key = storage_service.upload_mp3(
            user_id=_user_id,
            session_id=_session_id,
            mp3_path=output_path,
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
            # 무료 유저만 카운터 +1
            if entitlement == "free":
                db.execute(
                    update(GenerationCounter)
                    .where(GenerationCounter.user_id == _user_id)
                    .values(count=GenerationCounter.count + 1)
                )
            db.commit()

        logger.info(
            "dsp_task.completed",
            session_id=session_id,
            s3_key=s3_key,
            dsp_duration_ms=dsp_duration_ms,
        )

    except SoftTimeLimitExceeded:
        _fail_task(db, _master_id, "timeout: exceeded 30s soft limit")
        logger.error("dsp_task.timeout", session_id=session_id)

    except Exception as exc:
        logger.error("dsp_task.error", session_id=session_id, exc=str(exc))
        # exponential backoff: 60s / 180s / 600s
        backoff_delays = [60, 180, 600]
        retry_count = self.request.retries
        if retry_count < MAX_RETRIES:
            countdown = backoff_delays[retry_count]
            raise self.retry(exc=exc, countdown=countdown)
        else:
            # 최대 재시도 소진 → on_failure
            _fail_task_final(_master_id, str(exc))

    finally:
        # /tmp/ 정리
        import shutil
        try:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        except Exception:
            pass


def _fail_task(db, master_id: uuid.UUID, error_message: str) -> None:
    """즉시 실패 처리 (타임아웃 등 재시도 없는 케이스)."""
    try:
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
    with SyncSessionLocal() as db:
        db.execute(
            update(MasterAudio)
            .where(MasterAudio.id == master_id)
            .values(status="failed", error_message=f"max_retries exceeded: {error_message}")
        )
        db.commit()
```

---

## 6. Celery Beat — clip_cleanup task

```python
# apps/api/app/tasks/dsp_processing.py 에 추가

from celery import shared_task

@shared_task(name="tasks.clip_cleanup")
def clip_cleanup_task():
    """
    1시간 주기 실행. schedule_delete_at <= NOW() 인 recordings S3 삭제 후 s3_key = NULL.
    """
    import structlog
    logger = structlog.get_logger()
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
            try:
                storage_service.delete_file(rec.s3_key)
                db.execute(
                    update(Recording)
                    .where(Recording.id == rec.id)
                    .values(s3_key=None)
                )
                logger.info("clip.deleted", recording_id=str(rec.id), s3_key=rec.s3_key)
            except Exception as e:
                logger.warning("clip.delete_failed", recording_id=str(rec.id), error=str(e))

        db.commit()
```

Celery Beat 스케줄:
```python
# apps/api/app/core/celery_app.py 에 추가
app.conf.beat_schedule = {
    "clip-cleanup-hourly": {
        "task": "tasks.clip_cleanup",
        "schedule": 3600.0,  # 1시간
    },
    "hard-delete-users-daily": {
        "task": "tasks.hard_delete_expired_users",
        "schedule": crontab(hour=3, minute=0),  # 매일 03:00 KST (기존 유지)
    },
}
```

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
