# Epic 04 — impl 실행 순서 & 의존 관계

## 실행 순서 (권고)

```
01-app-audio-engine
        │
        ▼
02-app-play-screen
       ├──── 03-app-timer-bottomsheet  (병행 가능)
       ├──── 04-app-mini-player        (병행 가능)
       └──── 05-app-back-navigation-policy
                    │
                    ▼
             06-app-upgrade-sheet-A
                    │
                    ▼
             07-app-banner-ad
```

## impl 목록

| 순번 | 파일 | 커버 스토리 | depth | 예상 소요 | 의존 |
|---|---|---|---|---|---|
| 01 | [01-app-audio-engine.md](01-app-audio-engine.md) | Story 2, 3, 5 | deep | 3~4일 | Epic 03 완료 |
| 02 | [02-app-play-screen.md](02-app-play-screen.md) | Story 1, 3 | std | 2일 | impl/01 |
| 03 | [03-app-timer-bottomsheet.md](03-app-timer-bottomsheet.md) | Story 4 | std | 1일 | impl/01, impl/02 |
| 04 | [04-app-mini-player.md](04-app-mini-player.md) | C06 | std | 0.5일 | impl/01, impl/02 |
| 05 | [05-app-back-navigation-policy.md](05-app-back-navigation-policy.md) | Story 1, 3 | std | 0.5일 | impl/01, impl/02, impl/04 |
| 06 | [06-app-upgrade-sheet-A.md](06-app-upgrade-sheet-A.md) | S14 A형 | deep | 2일 | impl/01, impl/02, AdMob SDK |
| 07 | [07-app-banner-ad.md](07-app-banner-ad.md) | Story 1 (F10) | std | 0.5일 | impl/02, AdMob SDK |

**총 예상 소요**: 9.5~10.5일

## 의존 관계 상세

### 강한 의존 (이전 impl 완료 필수)

- `impl/02` → `impl/01`: AudioEngine.startPlayback/pause/resume/setVolume 호출
- `impl/03` → `impl/01`: AudioEngine.setTimer/clearTimer/notifyOneMinuteWarning
- `impl/04` → `impl/01`: AudioEngine.pause/resumePlayback
- `impl/04` → `impl/02`: PlayerSlice.currentTrackId/isPlaying 동기화 완료 필요
- `impl/05` → `impl/02`: S13 화면 구조 완료 후 handleBack 연결
- `impl/05` → `impl/04`: MiniPlayer 노출 동작 확인 필요
- `impl/06` → `impl/01`: pendingUpgradePrompt, resumePlayback
- `impl/06` → `impl/02`: S13 useEffect 트리거 완료 필요

### 약한 의존 (병행 개발 후 연결)

- `impl/07` → `impl/02`: BannerAdSlot placeholder import 교체만
- `impl/03` → `impl/02`: TimerBottomSheet import를 S13에 연결만
- `impl/06` B형 → Epic 03: 횟수 소진 경로 (이미 존재 가정)

## 병행 개발 가능 구간

impl/01 완료 후 아래를 동시 진행 가능:
- impl/02 + impl/03 (타이머 로직은 AudioEngine 직접 호출)
- impl/04 (MiniPlayer는 Zustand read-only)

impl/02 완료 후 아래를 동시 진행 가능:
- impl/05 + impl/06 + impl/07

## 사전 확인 체크리스트

impl/01 착수 전:
- [ ] RNTP v4 설치 확인 (`docs/reference.md §RNTP`)
- [ ] expo-av 설치 확인
- [ ] iOS Info.plist UIBackgroundModes: audio 설정
- [ ] Android AndroidManifest FOREGROUND_SERVICE_MEDIA_PLAYBACK 설정
- [ ] iOS 실기기에서 expo-av + RNTP AVAudioSession 충돌 여부 테스트 (`docs/audio-engine.md §12`)

impl/06 착수 전:
- [ ] AdMob 앱 ID 등록 완료 (iOS + Android)
- [ ] Rewarded Unit ID 발급
- [ ] Banner Unit ID 발급
- [ ] `ADMOB_*` 환경변수 설정

## Epic 04 완료 기준

모든 impl 완료 후 아래 E2E 플로우 검증:

1. S13 재생 → 10분 대기 → crossfade gap 없음 확인
2. Premium 유저: 화면 잠금 → 재생 유지 → 잠금화면 ⏸ 탭 → 중단
3. 무료 유저: 화면 잠금 → 재생 중단 → 앱 복귀 → S14 A형 팝업
4. 타이머 30분 설정 → 29분 후 로컬 푸시 → 30분 후 10초 fade-out 종료
5. Rewarded Ad 시청 → 당일 자정까지 백그라운드 재생
6. S13 ← (Premium) → S06 MiniPlayer 표시 → 바 탭 → S13 복귀
7. S13 ← (무료, 재생 중) → "중단할까요?" → 확인 → S06 MiniPlayer 미표시
