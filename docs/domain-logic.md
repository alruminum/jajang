# Domain Logic — 자장(Jajang)

**버전**: v1.3.1
**작성일**: 2026-04-30

> v1.3.1 (2026-04-30): PRD v1.3.1 반영 — AI 합성 로직 전면 삭제, DSP 파이프라인 의사코드 신설, N=1/N≥2 분기 확정, 셔플 알고리즘 서버 사전 concat 방식으로 확정.

---

## 1. 핵심 가치 정의

"AI clone이 아닌 진짜 부모가 직접 부른 자장가" — 녹음 1 loop이면 부모 목소리가 담긴 자장가 완성. DSP 후처리(ffmpeg)로 볼륨·잡음 정제 + seamless loop 제공.

---

## 2. 생성 횟수 카운터 로직

### 상수

```
FREE_GENERATION_LIMIT = 3  # 무료 계정 총 생성 횟수
```

### 체크 시점 및 증가 조건

| 이벤트 | 카운터 동작 |
|---|---|
| POST /sessions/init 수신 | SELECT FOR UPDATE → count >= 3이면 402 반환, count < 3이면 session 생성 |
| master_audio 생성 완료 | count + 1 |
| DSP 실패 / 타임아웃 | count 변경 없음 |
| 재시도 (동일 session_id) | count 변경 없음 |
| 클립 추가 ("다시 녹음" 후 "사용하기") | 동일 session — count 변경 없음. 클립만 추가 |
| Premium 유저 또는 Trial 유저 (`trial_expires_at > NOW()`) | count 체크 스킵 (조회 없음) + DSP 완료 후 count +1 없음 |
| Trial 만료 후 무료 다운그레이드 | Trial 중 생성분 소급 가산 없음 — Trial 진입 전 소진 횟수 그대로 유지 |

### Race condition 대응

```
BEGIN
  SELECT count FROM generation_counters WHERE user_id = ? FOR UPDATE;
  -- count < 3 이면:
  INSERT INTO recording_sessions ...;
COMMIT
-- DSP 완료 후 별도 트랜잭션:
UPDATE generation_counters SET count = count + 1 WHERE user_id = ?;
```

### Entitlement 체크 (server-side custom trial 반영)

```python
def is_premium(user_id: str, revenuecat_active: bool, trial_expires_at: datetime | None) -> bool:
    """
    Trial OR RevenueCat 유효 구독 = Premium 동등
    - revenuecat_active: subscriptions.is_active (RevenueCat webhook 동기화)
    - trial_expires_at: subscriptions.trial_expires_at (가입 시 서버 설정)
    """
    if revenuecat_active:
        return True
    if trial_expires_at is not None and trial_expires_at > datetime.utcnow():
        return True
    return False
```

체크 우선순위:

1. RevenueCat 유효 구독 (`is_active=True`) → premium
2. `trial_expires_at > NOW()` → trial (Premium 동등)
3. 그 외 → free

> Trial 전환율 측정: `subscriptions.trial_expires_at IS NOT NULL` 유저 중 추후 `is_active=True` 전환한 유저 비율 — 자체 DB 쿼리로 산출.

---

## 3. 샘플 품질 검증 기준

### 3-1. 클라이언트 1차 검증 (즉시, 업로드 전)

| 항목 | 기준 | 도구 |
|---|---|---|
| 길이 | 1 loop 이상 (선택 곡 재생 길이) | expo-av duration |
| 음량 | RMS -40dB ~ -6dB | 클라이언트 PCM 분석 |
| 클리핑 | 피크 3회 이하 | 클라이언트 PCM 분석 |

### 3-2. 서버 2차 검증 (librosa, 업로드 후)

| 항목 | 기준 | 도구 |
|---|---|---|
| SNR | 15dB 이상 | librosa (분석 전용) |

**librosa 역할 범위**: SNR 측정 + 음량/클리핑 재확인만. DSP 처리는 ffmpeg 단독.

---

## 4. DSP 파이프라인

### 4-1. 처리 단계 (서버, Celery task)

```python
def run_dsp_pipeline(session_id: str, clip_s3_keys: list[str], song_key: str) -> str:
    """
    입력: N개 클립 S3 경로 리스트
    출력: master mp3 S3 경로
    """
    # Step 1: S3에서 클립 다운로드
    local_clips = [download_from_s3(key) for key in clip_s3_keys]

    # Step 2: librosa SNR 재검증
    for clip in local_clips:
        snr = measure_snr(clip)  # librosa 사용
        if snr < 15:
            raise QualityError(f"SNR {snr:.1f}dB < 15dB")

    # Step 3: 각 클립에 개별 DSP 적용 (노이즈→EQ→reverb)
    processed_clips = [apply_clip_dsp(clip) for clip in local_clips]

    # Step 4: 셔플 concat + acrossfade
    ordered_clips = shuffle_clips(processed_clips, session_id)
    output_path = concat_with_crossfade(ordered_clips)

    # Step 5: S3 업로드
    s3_key = f"masters/{session_id}.mp3"
    upload_to_s3(output_path, s3_key)

    return s3_key
```

### 4-2. 개별 클립 DSP (ffmpeg)

```bash
# 단일 클립에 노이즈 제거 + EQ + reverb 적용
ffmpeg -i input.m4a \
  -af "afftdn=nf=-25,equalizer=f=200:width_type=o:width=2:g=3,aecho=0.8:0.88:60:0.4" \
  -b:a 128k processed.mp3
```

| 필터 | 파라미터 | 목적 |
|---|---|---|
| `afftdn` | `nf=-25` | 배경 잡음 -25dB 기준 스펙트럼 제거 |
| `equalizer` | `f=200:width_type=o:width=2:g=3` | 저역 2옥타브 +3dB 부스트 (목소리 온기) |
| `aecho` | `0.8:0.88:60:0.4` | 미세 reverb (방울림 효과, 수면 분위기) |

> M0 self-test에서 파라미터 튜닝 필수. 위 값은 초기 추정치.

### 4-3. concat + acrossfade (ffmpeg)

```python
def concat_with_crossfade(clips: list[str]) -> str:
    """
    N개 클립 concat + 경계마다 acrossfade 적용
    N=1: [A, A] 2회 concat으로 자기 loop 이음새 처리
    N≥2: 셔플 순서 concat
    """
    if len(clips) == 1:
        input_list = [clips[0], clips[0]]  # 동일 클립 2회
    else:
        input_list = clips  # 이미 셔플된 순서

    # ffmpeg 입력 인수 구성
    input_args = []
    for clip in input_list:
        input_args += ["-i", clip]

    # filter_complex 구성
    n = len(input_list)
    if n == 2:
        filter_str = "[0][1]acrossfade=d=0.3:c1=tri:c2=tri"
    else:
        # 체인: [0][1]acrossfade→[cf01], [cf01][2]acrossfade→[cf02], ...
        chains = []
        prev = "0"
        for i in range(1, n):
            out_label = f"cf{i:02d}"
            chains.append(f"[{prev}][{i}]acrossfade=d=0.3:c1=tri:c2=tri[{out_label}]")
            prev = out_label
        # 마지막 체인 출력 라벨 제거 (최종 출력으로 직결)
        chains[-1] = chains[-1].rsplit(f"[{prev}]", 1)[0]
        filter_str = ";".join(chains)

    output = "/tmp/master_output.mp3"
    subprocess.run(
        ["ffmpeg"] + input_args +
        ["-filter_complex", filter_str, "-b:a", "128k", output],
        check=True
    )
    return output
```

---

## 5. 셔플 알고리즘 (N≥2 — 직전 제외 Fisher-Yates)

### 규칙

- N=1: 단순 반복. 셔플 미적용.
- N≥2: 재생 순서 결정 시 직전 재생한 클립을 제외한 N-1개 풀에서 다음 클립 선택.

### 서버 사전 concat 방식 (채택)

```python
def shuffle_clips(clips: list[str], session_id: str) -> list[str]:
    """
    직전 제외 셔플 — 단일 패스 순서 생성
    클라이언트는 이 순서로 concat된 단일 mp3를 loop 재생
    """
    if len(clips) == 1:
        return clips  # N=1: 그대로 반환 (concat에서 [A, A]로 처리)

    result = []
    pool = clips.copy()
    last_chosen = None

    # 클립을 한 번씩 배치 (단일 순서 — loop는 클라이언트 mp3 반복)
    while pool:
        if last_chosen is not None and len(pool) > 1:
            candidates = [c for c in pool if c != last_chosen]
        else:
            candidates = pool

        chosen = random.choice(candidates)
        result.append(chosen)
        pool.remove(chosen)
        last_chosen = chosen

    return result
```

**재생성 정책**: "다시 녹음" 후 클립이 추가(N 증가)되면 새 셔플 순서로 master_audio 재생성. 동일 클립 구성이면 기존 master_audio 재사용 (S3 캐시).

---

## 6. 클립 삭제 정책

| 데이터 | 삭제 시점 | 방법 |
|---|---|---|
| 녹음 클립 (recordings) | master_audio 완료 후 24h | Celery Beat 1h 주기 + S3 lifecycle 2일 백업 |
| master mp3 (master_audios) | 유저 삭제 요청 또는 계정 탈퇴 | API 즉시 삭제 |
| 계정 데이터 | 탈퇴 즉시 soft delete → 30일 후 hard delete | Celery Beat 매일 03:00 KST |

---

## 7. 백그라운드 재생 entitlement 규칙

| entitlement | 화면 잠금 시 동작 |
|---|---|
| `premium` | RNTP 계속 재생 |
| `trial` | RNTP 계속 재생 |
| `free` (rewarded_unlock 유효) | RNTP 계속 재생 (자정까지) |
| `free` (rewarded_unlock 없음) | RNTP pause → foreground 복귀 시 S14 팝업 |

`rewardedUnlockExpiresAt` 체크: `Date.now() < rewardedUnlockExpiresAt`.

---

## 8. Rewarded Ad 월 7회 제한

| 상수 | 값 |
|---|---|
| `MONTHLY_REWARDED_LIMIT` | 7 |
| 리셋 기준 | 캘린더 월 변경 (YYYYMM 정수 비교) |
| 당일 언락 만료 | KST 자정 (DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Seoul') + INTERVAL '1 day' - INTERVAL '1 second') |

체크 순서:
1. `monthly_count >= 7` → "이번 달은 이미 모두 사용했어요"
2. `today_unlock_expires_at > NOW()` → "오늘은 이미 사용했어요" (광고 버튼 비활성)
3. 광고 로드 실패 → 에러 토스트, 구독 CTA 활성 유지

---

## 9. 곡별 메타데이터 상수

| song_key | 곡명 | 예상 1 loop 길이 |
|---|---|---|
| `brahms` | 브람스 자장가 | ~105초 |
| `mozart` | 모차르트 자장가 | ~90초 |
| `schubert` | 슈베르트 자장가 | ~120초 |
| `twinkle` | Twinkle Twinkle Little Star | ~75초 |
| `rockabye` | Rock-a-bye Baby | ~90초 |
| `hush` | Hush Little Baby | ~105초 |

> 실제 1 loop 길이는 CC0 소스 MIDI/오디오 파일 기준으로 M0에서 확정. 위 값은 추정치. `F2` 녹음 자동 종료 기준 = 곡별 BGM 파일 재생 완료 시점.

---

## 10. 카피 / 메타데이터 정합

PRD v1.3.1 "AI clone이 아닌 진짜 부모가 직접 부른" 정책:

| 위치 | 금지 표현 | 대체 표현 |
|---|---|---|
| S12 대기 화면 | "AI 생성 중" | "부모님 목소리를 다듬고 있어요" |
| S13 앨범 아트 서브텍스트 | "내 목소리 AI 자장가" | "내 목소리로 만든 자장가" |
| 앱스토어 설명 | "AI 음성 합성" | "DSP 후처리로 목소리 정제" |
| 온보딩 S03 슬라이드 1 | — | "진짜 우리 부모가 직접 부른 자장가" |
