# M0 DSP Self-Test Report

**실행일**: 2026-05-08
**환경**: macOS Darwin 24.6.0, ffmpeg 8.1, Python 3.14
**대상**: `apps/api/app/services/dsp/ffmpeg_service.py` `DspService.process()`
**스크립트**: `apps/api/scripts/m0_dsp_self_test.py`

## 결론

**모든 M0 합격 기준 통과 (5/5 PASS)** — DSP 파이프라인이 v1 release 진입 게이트 충족.

| 항목 | 결과 | 합격 기준 | 실측 |
|---|---|---|---|
| 1. 파이프라인 프로토타입 | ✅ PASS | ffmpeg afftdn/equalizer/aecho/acrossfade 무결 실행 | 4 클립 × 30s → 119.5s master.mp3, 1.9MB |
| 2. 이음새 (crossfade 무음) | ✅ PASS | mid-track 무음 0건 | 0건 (trailing 0.1s fade-out 1건은 정상) |
| 3. 노이즈 (SNR) | ✅ PASS | ≥ 15 dB | **21.64 dB** improvement (raw -32.95 → dsp -54.59 dBFS) |
| 4. 단조로움 (셔플) | ✅ PASS | 최빈 ordering 빈도 ≤ 50% | 40% (10 trials, 6 가능 perms 중 4 unique) |
| 5. End-to-end latency | ✅ PASS | < 30s | **0.94s cold / 0.93s warm** |

## 합격 기준 detail

### Test 1 — 파이프라인 프로토타입 실행

`afftdn → equalizer → aecho → acrossfade` 체인 N=4 클립 (각 30s synthetic voice + 노이즈) 1회 처리.

```
input:  clip_0~3.wav (각 30s, sine 220-310Hz + white noise -25dBFS)
output: master.mp3 (119.5s, 1.9MB, 128kbps stereo)
elapsed: 0.92s
```

ffmpeg 호출 4(individual_dsp) + 3(acrossfade chain) + 1(mp3_encode) = **8 invocations**, 무에러.

### Test 2 — 이음새 (crossfade 무음 없음)

`silencedetect=noise=-50dB:d=0.1` 으로 무음 구간 검출. mid-track (시작 0.5s + 끝 0.5s 제외) 무음 0건.

```
silence_periods: [(119.40, 0.10)]   # MP3 encoder trailing tail 정상
mid_track_silence_count: 0
```

`acrossfade=d=0.3:c1=tri:c2=tri` 설정이 N=4 체인 내내 이음새 무음 0 보장.

### Test 3 — SNR (afftdn 노이즈 제거 효과)

afftdn 단독 적용 전/후 RMS noise floor 비교 (`astats=metadata=1:reset=1`):

```
raw_floor_db:    -32.95 dBFS  (sine + noise mix, pre-DSP)
dsp_floor_db:    -54.59 dBFS  (afftdn nr=10 nf=-25 적용)
improvement_db:   21.64 dB    (>15 dB threshold ✓)
```

`AFFTDN_NR=10` (noise reduction) + `AFFTDN_NF=-25` (noise floor) 파라미터로 ~21.6 dB 감쇠 확인. 실 voice 녹음에서는 더 큰 SNR 개선 예상 (synthetic 노이즈는 white spectrum, 실제는 환경 저주파 위주).

### Test 4 — 단조로움 (셔플 다양성)

N=4, previous_index=0 제외 → 3 클립 셔플 → 3! = 6 possible orderings. 10 trials 결과:

```
unique_orderings:        4 / 6 max
top_dominance_ratio:     0.40   (최빈 ordering 4회 / 10 trials)
pass_threshold:          ≤ 0.50 (단일 ordering 지배 방지)
```

`random.shuffle()` Fisher-Yates 가 6 perm 공간을 충분히 cover. 단일 ordering 이 50%+ 지배하는 패턴 없음.

> 참고: production 시나리오에서 N=4 보다 더 많은 클립 누적 시 max_perms 가 24(N=5), 120(N=6) 으로 폭증해 단조로움 우려 자연 해소.

### Test 5 — End-to-end latency

cold start (DspService 첫 호출) + warm (인스턴스 재사용) 측정:

```
cold_start_s:  0.94s   (Python import + ffmpeg subprocess 8회)
warm_run_s:    0.93s   (인스턴스 재사용, ffmpeg 호출만)
threshold:     30.0s
margin:        > 30x   여유
```

ffmpeg subprocess overhead 가 latency 의 전부 (~0.1s × 8 invocations). 실 production 에서 30s voice clip 4개 처리도 ≤2s 수준 예상.

## Contingency 결과

backlog M0 게이트 \"실패 항목 발생 → 대안 결정 후 진입\" 발화 없음. 모든 항목 첫 실행 PASS.

## 후속 권장

1. **production 운영 모니터링**: 실 voice 녹음 (배경 소음 다양) 으로 SNR 재측정 — synthetic 보다 보수적일 수 있음. Celery worker 의 latency p95 추적.
2. **DSP 파라미터 튜닝**: 본 self-test 는 `ffmpeg_service.py` L28~38 default 값 그대로. 실 사용자 피드백 기반 후속 튜닝 (`AFFTDN_NR` / `EQ_GAIN` / `AECHO_DECAY`) 별도 epic 에서.
3. **셔플 회귀 보호**: `_shuffle_exclude_previous` 의 dominance ratio 회귀 감지를 unit test 에 추가 권장.

## 참조

- 스크립트: `apps/api/scripts/m0_dsp_self_test.py`
- 대상 코드: `apps/api/app/services/dsp/ffmpeg_service.py`
- 합격 기준 출처: `backlog.md` §마일스톤 0 — DSP self-test
- 관련 이슈: Epic 03 #190 (DSP 음원 후처리 생성)
