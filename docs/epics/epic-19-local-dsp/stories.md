# Epic 19 — Local DSP Migration: Server ffmpeg DSP → Mobile Local DSP path 추가

**목표:** v1.3.0 피벗으로 확립된 서버 ffmpeg DSP 파이프라인 (`afftdn` + `equalizer` + `aecho` + `acrossfade`) 을 **mobile (Expo Bare React Native) 디바이스에서 직접 실행하는 path 추가**. 서버 path 는 코드 살린 채로 MVP 비활성. 미래 sync 기능 도입 시 *완성 mp3* 만 서버 업로드 (raw 녹음은 영구 로컬). 무료 3회 BM 유지 (클라이언트 카운터).

**선행 조건:**
- Epic 12 종료 (theme drift fix 완료, main 안정 — 2026-05-13)
- plan-reviewer PRE_CHECK 결과 = **ESCALATE** (2026-05-13). `ffmpeg-kit-react-native` 본가 retire 확정 + 활성 fork 모두 결함. **Story 1 spike 5 artifacts 모두 PASS 시에만 Story 2 진입**

**완료 기준 (Epic 단위 수용):**

1. Story 1 spike PASS — 5 측정 artifacts 확보:
   - 동작하는 fork build (iOS + Android 양쪽, real device 설치)
   - `ffprobe -filters` 출력에 `afftdn` / `equalizer` / `aecho` / `acrossfade` 4개 포함 증거
   - 디바이스별 30초 입력 처리시간 측정 (저사양 Android Galaxy A 시리즈 + 중간 iPhone 12/13)
   - ipa/apk 크기 델타 (현재 vs 추가 후, 단위 MB)
   - 라이선스 = LGPL 확정 (변종명에 `-gpl` 없음 + LICENSE 파일 read)

2. Story 2 시 mobile path 가 서버 self-test 와 동등한 출력 품질 — M0 합격 기준 3항목 충족:
   - 단조로움 (셔플 dominance ≤50%)
   - 이음새 (mid-track 무음 0)
   - 노이즈 (SNR ≥15 dB)

3. Story 3 시 서버 DSP 엔드포인트 (`POST /generation/dsp` + Celery 워커 + S3 업로드) 코드 *유지*, MVP 클라이언트는 mobile path 단독 호출. deploy 만 stop.

4. 미래 sync 정책 — "raw 녹음 = 영구 로컬 / 완성 mp3 만 서버 업로드" 가 `docs/ARCHITECTURE.md` 또는 `docs/ADR.md` 에 박혀 있음. v2+ sync 기능 진입 시 참조.

**GitHub Epic Issue:** [#262](https://github.com/alruminum/jajang/issues/262)

---

## 통합 브랜치 패턴 (본 epic 한정)

```
main ←──────────── feature/local-dsp (마지막 한방 머지)
                        ↑↑↑
                sub-PR 1 (#261, 본 문서)
                sub-PR 2~N (spike artifacts, 구현, 정책 문서)
```

- sub-PR base = `feature/local-dsp` (main 아님)
- **story 이슈 = epic 의 GitHub sub-issue 등록** (옵션 c-1 — 통합 브랜치 close 메커니즘):
  - epic 이슈 1개 (Epics 마일스톤) + Story 1~3 이슈 (Story 마일스톤, sub-issue API 로 epic 에 연결)
  - GitHub `Closes #N` auto-close 키워드는 base ≠ main 일 때 미발동 → **story 이슈는 메인 Claude 가 sub-PR 머지 직후 수동 close** (`gh issue close #story-N --comment "PR #M merged into feature/local-dsp"`)
  - CLAUDE.md "GitHub API 이슈 직접 close 금지" 룰 정합: 본 case = PR-ref 박힌 comment 동반 close → 추적 손실 0. 본문은 trunk-based 가정, 통합 브랜치 한정 예외 명시 수용
  - sub-PR 작업 이슈 (예: #261 = 본 문서 작업 sub-PR) = 별도 트랙. 마찬가지 sub-PR 머지 직후 메인이 수동 close
- sub-PR body = `Part of #<epic 이슈>` (진행 마커, 통합 브랜치 진행 표시)
- 마지막 main 머지 PR = `Closes #<epic>` (story 이슈는 이미 진행 중 수동 close 완료 → 마지막엔 epic 만 close auto-발동)
- main backport 주기적 (drift 방지 — spike 가 며칠~몇 주 단위면 큰 문제 X)

---

## Story 1 — Local DSP Spike (5 measured artifacts)

**GitHub Issue:** [#263](https://github.com/alruminum/jajang/issues/263) (epic #262 sub-issue)

**As a** jajang 엔지니어 / PM,
**I want** mobile (iOS + Android) 디바이스에서 ffmpeg 4 필터 chain (`afftdn` + `equalizer` + `aecho` + `acrossfade`) 이 실제로 동작하는지 + 라이선스 정합 + 앱 크기 비용 + 디바이스별 처리시간을 측정 데이터로 확보하길 원한다,
**So that** local DSP path 본격 진입(Story 2) GO/NO_GO 를 추측 아닌 *측정 결과*로 결정할 수 있고, NO_GO 시 V2+ 이관 또는 epic 폐기 결정의 근거가 명확해진다.

---

## Story 2 — Local DSP Path 추가 (mobile-side ffmpeg DSP 호출 + 클라이언트 카운터)

**GitHub Issue:** [#264](https://github.com/alruminum/jajang/issues/264) (epic #262 sub-issue)

**(전제: Story 1 spike artifacts 모두 PASS — 1+ FAIL 시 Story 2 폐기 또는 V2+ 이관)**

**As a** jajang 부모 사용자,
**I want** 부모 raw 녹음으로부터 자장가 mp3 생성이 *디바이스 안에서* 완결되길 원한다 (네트워크 의존 없이),
**So that** 새벽 와이파이 끊긴 환경에서도 생성이 가능하고, raw 목소리가 서버 밖으로 나가지 않는 프라이버시 보장을 받으며, 무료 3회 BM 은 클라이언트 카운터로 그대로 유지된다.

---

## Story 3 — 서버 DSP path 보존 + 미래 sync 정책 architecture 박힘

**GitHub Issue:** [#265](https://github.com/alruminum/jajang/issues/265) (epic #262 sub-issue)

**As a** jajang 시스템 운영자 / 미래 AI 합성 또는 sync 기능 도입 시점의 엔지니어,
**I want** 서버 DSP 엔드포인트 + Celery 워커 + S3 업로드 코드가 *그대로 보존* 되고, 미래 sync 기능 도입 시 "raw 녹음은 영구 로컬 / 완성 mp3 만 서버 업로드" 정책이 `docs/ARCHITECTURE.md` 또는 `docs/ADR.md` 에 박혀있길 원한다,
**So that** V2+ AI 합성 부활 또는 sync 기능 진입 시 *라우팅 분기 추가만으로* 서버 path 복귀 가능하고, raw 목소리 디바이스 외 유출 0 정책이 미래에도 일관되게 유지된다.

---

## 참고

### plan-reviewer PRE_CHECK 보고서 (2026-05-13) — 외부 검증된 사실

- `ffmpeg-kit` 본가 retire 확정:
  - 2025-01-06 retire 공식 발표 ([taner sener medium](https://tanersener.medium.com/saying-goodbye-to-ffmpegkit-33ae939767e1))
  - v6.0 바이너리 2025-04-01 npm/CocoaPods/Maven 제거 (v6.0 미만은 2025-02-01 선행 제거)
  - 2025-06-23 GitHub repo 아카이브 ([arthenica/ffmpeg-kit](https://github.com/arthenica/ffmpeg-kit))
- 활성 fork 모두 결함:
  - `@spreen/ffmpeg-kit-react-native` — iOS-only + GPL-only (클로즈드 앱스토어 배포 불가)
  - `jdarshan5/ffmpeg-kit-react-native` — 단일 binary release (2025-04-08), semver 없음, Expo 문서 없음
  - `pgahq/ffmpeg-kit-fork` — star 1개, 활동 미미
- 2026 dev.to 가이드 = *Android 빌드 broken* (`Could not find com.arthenica:ffmpeg-kit-https:6.0-2`)
- 대안 평가:
  - `react-native-audio-api` (Software Mansion 0.12.2) — EQ + Reverb ✓ but `afftdn` 동등 noise reduction + `acrossfade` 동등 missing, MP3 export 미확인
  - `expo-av` — 재생/녹음만, DSP X
  - `ffmpeg-expo` (kingjnr4 v0.0.1, 2026-01-29) — 1 commit, production track record 없음
  - 자체 native module (iOS AVAudioEngine + Android AudioEffect) — `afftdn` 같은 spectral 노이즈 = custom DSP 직접 구현, 필터당 1~2주
  - `ffmpeg.wasm` on RN — Hermes/JSC WASM 미지원
- 바이너리 크기: 1건 보고 = 45MB → 150MB (+105MB, full variant). `min` 변종 미측정
- LGPL App Store 정합: Arthenica wiki "hard to achieve", Apple 공식 입장 없음

### 결론 (plan-reviewer)

> 측정 spike 없이 Story 2 진입은 catastrophic. 5 artifacts 확보 후 PRD spec 확정 + 본격 진입.
