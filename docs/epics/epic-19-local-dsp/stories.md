# Epic 19 — Local DSP Migration: Server ffmpeg DSP → Mobile Local DSP path 추가

**목표:** v1.3.0 피벗으로 확립된 서버 DSP 파이프라인 4 효과 (`afftdn` 노이즈 감소 / `equalizer` peak EQ / `aecho` delay reverb / `acrossfade` segment cross-fade) 의 *결과* 를 **mobile (Expo Bare React Native) 디바이스에서 달성**. 서버 path 는 코드 살린 채로 MVP 비활성. 미래 sync 기능 도입 시 *완성 mp3* 만 서버 업로드 (raw 녹음은 영구 로컬). 무료 3회 BM 유지 (클라이언트 카운터).

**framing 재정의 (2026-05-13):** 초기 framing = "server ffmpeg → mobile ffmpeg" port-implementation. Story 1 task 01 spike 결과 ffmpeg-kit fork 양쪽 broken 확정 ([spike-results/01-fork-build.log](spike-results/01-fork-build.log)) → port-requirement framing 으로 재정의. 후보 set = C1 pure-JS / C2 react-native-audio-api 합성 / C3 DSP 강등 + UX 보강 / C4 afftdn-only 자체 native ([architecture.md §3.1](architecture.md#31-후보-set-framing-재정의-후-2026-05-13) + [adr.md ADR-19A](adr.md#adr-19a-local-dsp-path-도입--후보-set-framing-재정의-진행-중)). memory: [feedback_migration_epic_port_vs_requirement](../../../../../.claude/projects/-Users-dc-kim-project-jajang/memory/feedback_migration_epic_port_vs_requirement.md).

**선행 조건:**
- Epic 12 종료 (theme drift fix 완료, main 안정 — 2026-05-13)
- ~~plan-reviewer PRE_CHECK 결과 = **ESCALATE** (2026-05-13). `ffmpeg-kit-react-native` 본가 retire 확정 + 활성 fork 모두 결함. **Story 1 spike 5 artifacts 모두 PASS 시에만 Story 2 진입**~~ → task 01 spike 결과로 ffmpeg-kit 경로 NO_GO 확정. 새 Spike Gate (NS1~NS4) PASS 시에만 Story 2 진입

**완료 기준 (Epic 단위 수용 — framing 재정의 반영):**

1. Story 1 신규 Spike Gate PASS — 후보 1개 채택:
   - **NS1** (afftdn 강등 perceptual diff): m0-self-test 데이터에 afftdn 제외 + highpass IIR 만 적용 → SNR ≥15dB 합격선 유지 가능 측정
   - **NS2** (pure-JS DSP 처리시간): 저사양 Android (Galaxy A 시리즈) 30s 입력 ≤ 30s 처리 측정
   - **NS3** (`react-native-audio-api` Expo Bare 통합): npm install + Expo prebuild + Galaxy 빌드 + 1-tap echo demo 동작 측정
   - **NS4** (4 후보 perceptual quality 비교): C1/C2/C3/C4 4 후보 동일 입력 출력 perceptual 비교 + 최종 1개 선정

2. Story 2 시 mobile path 가 서버 self-test 와 동등한 출력 품질 — M0 합격 기준 3항목 충족:
   - 단조로움 (셔플 dominance ≤50%)
   - 이음새 (mid-track 무음 0)
   - 노이즈 (SNR ≥15 dB) — NS1 결과에 따라 afftdn 강등 시에도 합격선 충족 의무

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

## Story 1 — Spike: DSP 달성 후보 결정 (NS1~NS4)

**GitHub Issue:** [#263](https://github.com/alruminum/jajang/issues/263) (epic #262 sub-issue)

**진행 상태 (2026-05-13):**
- **task 01 (구 framing)** = 완료, RESULT: NO_GO ([spike-results/01-fork-build.log](spike-results/01-fork-build.log)). ffmpeg-kit fork 양쪽 broken 확정 (Maven 4-repo missing + monorepo wrapper autolinking 미발견). PR [#270](https://github.com/alruminum/jajang/pull/270).
- **task 02 / task 03 (구 framing)** = **DEPRECATED**. ffmpeg-kit fork 의존 전제 무효화 → impl 파일 폐기 마크 ([impl/02](impl/02-spike-filter-probe.md) / [impl/03](impl/03-spike-device-perf-size-license.md)).
- **새 Spike Gate NS1~NS4** = 미실행. impl 파일 미작성 (module-architect 재호출 필요).

**As a** jajang 엔지니어 / PM,
**I want** mobile 디바이스에서 서버 DSP 4 효과 (afftdn / equalizer / aecho / acrossfade) 의 *결과* 를 달성하는 최적 경로 1개 (C1 pure-JS / C2 react-native-audio-api 합성 / C3 DSP 강등 + UX 보강 / C4 afftdn-only 자체 native 중) 를 측정 결과로 결정하길 원한다,
**So that** Story 2 진입 = 추측 아닌 측정으로 후보 채택 + 선정 후보가 product 요구 (m0-self-test 합격선 + ≤30s 처리 + Expo Bare 통합) 모두 충족 보장된다.

**새 Spike 4 task** (impl 파일 미작성 — module-architect 재호출 시 정식화):

| spike | 결정할 것 | 측정 방법 | PASS 조건 | impl 파일 (예정) |
|---|---|---|---|---|
| **NS1** afftdn 강등 perceptual diff | C3 후보 viability | m0-self-test 30s 입력에 afftdn 제외 + highpass IIR 만 적용 후 SNR 재측정 | SNR ≥15dB 유지 → C3 viable | `impl/04-spike-ns1-afftdn-perceptual.md` |
| **NS2** pure-JS DSP 처리시간 | C1 후보 viability + 저사양 Android 성능 | Galaxy A 시리즈 + `fft.js` + biquad/delay/gain JS 구현 / `performance.now()` | 30s 입력 ≤ 30s 처리 | `impl/05-spike-ns2-pure-js-perf.md` |
| **NS3** react-native-audio-api Expo Bare 통합 | C2 후보 viability | npm install + Expo prebuild + Galaxy 빌드 + 1-tap echo demo | 빌드 + demo 동작 | `impl/06-spike-ns3-rn-audio-api-integration.md` |
| **NS4** 4 후보 perceptual 비교 | 최종 후보 1개 선정 | 동일 30s 입력에 4 후보 적용 → blind comparison + waveform diff | C3 강등 합격 시 채택, 미달 시 perceptual 우위 후보 채택 | `impl/07-spike-ns4-candidate-comparison.md` |

NS1~NS3 직렬 (각 후보 viability), NS4 = NS1~NS3 결과 후. 각 spike = 1 sub-PR (Epic 19 통합 브랜치 패턴 ADR-19E 정합).

**NO_GO 분기**:
- NS1~NS4 모두 FAIL (어떤 후보도 viable X) → V2+ 이관 결정 필요. 단 본 framing reset 의 후보 4개 중 *최소 1개* 가 viable 일 가능성 매우 높음 (특히 C3 강등 = perceptual 합격선만 충족하면 즉시 채택)

---

## Story 2 — Local DSP Path 추가 (mobile-side DSP 구현 + 클라이언트 카운터)

**GitHub Issue:** [#264](https://github.com/alruminum/jajang/issues/264) (epic #262 sub-issue, **미등록**)

**(전제: Story 1 NS1~NS4 spike PASS + 후보 1개 채택 — 미달 시 Story 2 폐기 또는 V2+ 이관)**

**As a** jajang 부모 사용자,
**I want** 부모 raw 녹음으로부터 자장가 mp3 생성이 *디바이스 안에서* 완결되길 원한다 (네트워크 의존 없이),
**So that** 새벽 와이파이 끊긴 환경에서도 생성이 가능하고, raw 목소리가 서버 밖으로 나가지 않는 프라이버시 보장을 받으며, 무료 3회 BM 은 클라이언트 카운터로 그대로 유지된다.

> 구체적 구현 (라이브러리 / 모듈 구조) = NS4 결과 후보 1개에 따라 결정. architecture.md §3.2 의 모듈 경계 (`LocalDspService` / `DspPipeline` / `FfmpegBridge`(or 후보 wrapper) / `LocalCounterRepo`) 는 framing 무관 그대로 유지.

---

## Story 3 — 서버 DSP path 보존 + 미래 sync 정책 architecture 박힘

**GitHub Issue:** [#265](https://github.com/alruminum/jajang/issues/265) (epic #262 sub-issue, **미등록**)

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
