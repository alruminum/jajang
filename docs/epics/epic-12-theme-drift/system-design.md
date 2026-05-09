---
epic: 12
title: Theme Drift Fix — hex → ColorTokens 마이그레이션
status: design-complete
---

# Epic 12 System Design — Theme Drift Fix

> 코드 전체의 직접 hex를 `ColorTokens` 토큰으로 기계적 교체. 신규 인프라 0, DB/API/외부 SDK 변경 0.

---

## 1. 시스템 컨텍스트

### 재사용 인프라 (변경 X)

| 인프라 | 위치 | 역할 |
|---|---|---|
| `ColorTokens` 타입 (15 토큰) | `apps/mobile/src/theme/tokens.ts` | 색상 계약 타입 |
| `darkColors` / `lightColors` | 동일 파일 | 팔레트 SSOT |
| `Colors = darkColors` 별칭 | 동일 파일 | 하위 호환, 변경 X |
| `useTheme()` 훅 | `apps/mobile/src/hooks/useTheme.ts` | `{ colors, isDark }` 반환 |
| `useThemeStore` | `apps/mobile/src/store/theme-store.ts` | pref 영구 저장 |
| S16 테마 토글 UI | `S16SettingsScreen.tsx` | 이미 구현 완료 |

본 Epic은 위 인프라를 *호출만* 할 뿐 수정하지 않는다. 단 Story 5에서 누락 토큰 발견 시 `tokens.ts`에 토큰 추가 한정.

### 실측 hex 현황 (grep 기준)

| 영역 | 파일 수 | hex 건수 |
|---|---|---|
| screens/ | 19 파일 | 252건 |
| components/ | 9 파일 | 40건 |
| navigation/ | 2 파일 | 8건 |
| hooks/ (useBackNavigation.tsx) | 1 파일 | 7건 |
| **합계** | **31 파일** | **307건** |

> PRD stories.md의 hex 수는 주요 파일 기준이며, 위 실측값이 우선한다. Story 5에서 `기타 파일 일괄 처리` 범위에 PRD 미명시 파일 포함 (아래 §2 참조).

---

## 2. 모듈 분해 (Story → task 매핑)

### Story 1 — M0 인증·온보딩 (task 01)

| 파일 | hex 수 | useTheme 상태 |
|---|---|---|
| S01SplashScreen.tsx | 1 | 미채택 |
| S02PrivacyScreen.tsx | 17 | 미채택 |
| S03OnboardingScreen.tsx | 10 | 미채택 |
| S04SignupScreen.tsx | 16 | 미채택 |
| S05LoginScreen.tsx | 15 | 미채택 |
| LegalScreen.tsx | 8 | 미채택 |
| SocialAuthButtons.tsx | 4 | 미채택 |

작업: `useTheme()` 추가 + 전량 `colors.<token>` 교체. AuthNavigator.tsx(1건, `contentStyle.backgroundColor`)는 S01과 함께 task 01에 포함 — 인증 플로우 스택 컨텍스트.

### Story 2 — M0 결제·구독 (task 02)

| 파일 | hex 수 | useTheme 상태 |
|---|---|---|
| S14UpgradeSheet.tsx | 12 | 미채택 |
| S15SubscribeScreen.tsx | 22 | 미채택 |
| S17TrialExpiredScreen.tsx | 10 | 미채택 |

### Story 3 — M0 Settings + AccountDeletion (task 03)

| 파일 | hex 수 | useTheme 상태 |
|---|---|---|
| S16SettingsScreen.tsx | 24 | 채택 완료 (잔여 hex만 교체) |
| AccountDeletionScreen.tsx | 27 | 미채택 |

### Story 4 — M1 핵심 기능 (task 04 + 05 + 06)

대상 10개 모듈을 3 task로 분할 — PR당 4~6 모듈 기준.

**task 04** — 핵심 플로우 (화면 4개)

| 파일 | hex 수 | useTheme 상태 |
|---|---|---|
| S06HomeScreen.tsx | 11 | 미채택 |
| S07SongSelectScreen.tsx | 6 | 미채택 |
| RecordGuideScreen.tsx | 17 | 미채택 |
| RecordScreen.tsx | 13 | 미채택 |

**task 05** — 재생·대기·내비게이터 (화면 4개 + 내비게이터 2개)

| 파일 | hex 수 | useTheme 상태 |
|---|---|---|
| S11PreviewScreen.tsx | 17 | 미채택 |
| S12GeneratingScreen.tsx | 5 | 미채택 |
| S13PlayScreen.tsx | 11 | 미채택 |
| RecordModeScreen.tsx | 10 | 미채택 |
| MainNavigator.tsx | 7 | 미채택 |

**task 06** — useBackNavigation hook + 컴포넌트 (hook 1개 + 관련 컴포넌트)

| 파일 | hex 수 | 비고 |
|---|---|---|
| useBackNavigation.tsx | 7 | hook이지만 JSX 반환 (BottomSheet 포함) |
| LyricsBox.tsx | 5 | S10RecordScreen에서만 사용 — task 04와 병렬 가능하나 결합도상 분리 |
| WaveformVisualizer.tsx | 2 | S10RecordScreen props color — `accentPrimary` 기본값 교체 |

> WaveformVisualizer는 `color` prop을 외부에서 주입받는 구조. hex 기본값만 토큰으로 교체 (API 시그니처 변경 없음).

### Story 5 — 공유 컴포넌트 + 누락 토큰 + 회귀 방지 (task 07 + 08)

**task 07** — 공유 컴포넌트 일괄 정리

PRD 명시분:

| 파일 | hex 수 | useTheme 상태 |
|---|---|---|
| JustArrivedMasterCard.tsx | 7 | 미채택 |
| CompletedTrackCard.tsx | — | 채택 완료, 잔여 확인 |
| MasterAudioCard.tsx | — | 채택 완료, 잔여 확인 |
| EmptyMastersState.tsx | — | 채택 완료, 잔여 확인 |
| SongListItem.tsx | — | 채택 완료, 잔여 확인 |
| TrackCard.tsx | — | 채택 완료, 잔여 확인 |
| MiniPlayer.tsx | — | 채택 완료, 잔여 확인 |
| TimerBottomSheet.tsx | — | 채택 완료, 잔여 확인 |
| TrialBadge.tsx | — | 채택 완료, 잔여 확인 |
| TrialExpiryBanner.tsx | — | 채택 완료, 잔여 확인 |
| EmptyTrackState.tsx | — | 채택 완료, 잔여 확인 |

PRD 미명시 + 실측 hex 존재 파일 (task 07 흡수):

| 파일 | hex 수 | 비고 |
|---|---|---|
| DeleteTracksSheet.tsx | 9 | S16/S06에서 사용 |
| GeneratingFailureView.tsx | 5 | S12에서 사용 |
| GeneratingTimeoutNotice.tsx | 4 | S12에서 사용 |
| VolumeSlider.tsx | 3 | S13에서 사용 |
| AlbumArtRotating.tsx | 1 | S13에서 사용 |

> "기타 1~6 hex 보유 파일 일괄 처리"(PRD §3.4 Story 5) 범위에 해당. AC-1 최종 충족은 이 파일들 처리 후.

**task 08** — 누락 토큰 추가 + Jest hex-lint

- Story 1~4 수행 중 발견한 매핑 불가 hex를 `tokens.ts`에 토큰 추가 (dark/light 양쪽)
- 현재 후보: `gradientStart`, `gradientEnd`, `surfaceMid` (PRD §5 누락 토큰 후보 표 참조)
- Jest hex-lint (`__tests__/theme/no-raw-hex.test.ts`) 구현

---

## 3. 마이그레이션 패턴

### 3.1 createStyles factory (권장 패턴)

`StyleSheet.create`는 정적이라 `useTheme()` 훅 내부 직접 사용 불가. factory 패턴:

```ts
// 화면 파일 하단
const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    container: { backgroundColor: colors.bgPrimary },
    title:     { color: colors.textPrimary },
  });

// 화면 컴포넌트 내부
const { colors } = useTheme();
const styles = makeStyles(colors);
```

채택 기준: 스타일 속성이 4개 이상이거나 재사용 컴포넌트인 경우.

### 3.2 inline style (단순 케이스)

스타일 속성 3개 이하인 단순 뷰:

```tsx
<View style={{ backgroundColor: colors.bgPrimary }} />
```

### 3.3 `darkColors` 별칭 (`Colors`) 처리

`import { Colors } from '../theme/tokens'`로 직접 참조하는 파일이 있으면, 해당 파일을 `useTheme()`으로 전환 시 기존 `Colors.xxx` 참조를 `colors.xxx`로 교체. `Colors` 별칭 자체는 tokens.ts에서 유지.

### 3.4 WaveformVisualizer prop 처리

`color` prop 기본값이 `'#5A7AA8'`(accentPrimary dark). 기본값을 `darkColors.accentPrimary`로 교체하되, 호출부(RecordScreen)에서 `colors.accentPrimary`를 명시 전달하도록 변경 → prop 시그니처 유지, 동적 테마 대응.

---

## 4. 다크 회귀 0 보장 전략

`darkColors` hex = Epic 12 전후 동일 — tokens.ts 수정 없으므로 다크 팔레트 값 변화 없음. 교체 후 hex가 `darkColors`의 기존 값과 동일한지 검증하는 방법:

1. **교체 전**: `grep -r '#[0-9A-Fa-f]{6}'` 로 대상 파일 hex 목록 추출
2. **매핑 확인**: 각 hex가 `darkColors` 상수 중 어느 토큰인지 1:1 매핑 (매핑 불가 hex → 누락 토큰 후보 등재)
3. **교체 후 light 시각 검증**: 시뮬레이터 라이트 모드 → 각 화면 진입 → `bgPrimary(#FBF7F0)` 계열 배경 육안 확인 (AC-2, AC-4)
4. **다크 유지 확인**: 교체 후 다크 모드 동일 화면 → 색상 변화 없음 확인 (AC-3)

---

## 5. 회귀 방지 인프라 — Jest 옵션 A 채택 근거

**옵션 A (Jest)** vs **옵션 B (ESLint custom rule)** 비교:

| 기준 | Jest (A) | ESLint rule (B) |
|---|---|---|
| 구현 복잡도 | 낮음 — fs.readFileSync + regex | 높음 — custom rule 작성 + 빌드 필요 |
| 기존 인프라 활용 | jest-expo 이미 구축 (Epic 08~10) | ESLint 설정 추가 필요 |
| CI 연동 | `npm test` 기존 스크립트 그대로 | lint script 별도 추가 |
| 에러 메시지 품질 | 파일명·행 번호 출력 커스텀 가능 | rule 메시지 수준 |
| 예외 처리 | 파일 경로 regex로 간단히 제어 | overrides 설정 |

**결론: Jest 채택 (옵션 A)**. 기존 `jest-expo` 인프라 재사용 + `npm test` 단일 커맨드로 기능·회귀 테스트와 hex-lint 동시 실행. ESLint rule 추가 대비 구현 비용이 낮고 CI 추가 없음.

### 5.1 hex-lint 도입 시점 — task 08 (Story 5)

Story 1 직후 도입하면 Story 2~4 PR에서 자동 검증 가능하다는 장점이 있다. 그러나 1인 개발 컨텍스트에서 Story 1~4는 "전량 교체 완료 후 PR" 단위이므로, PR 전 `grep` 수동 확인으로 충분. hex-lint는 Story 5 마지막 task(08)로 배치 — Epic 완료 후 신규 PR 방어용.

> 만약 Story 4 PR 이전에 hex-lint를 먼저 넣고 싶다면, task 08을 task 04 이전으로 앞당길 수 있다. impl에서 engineer 재량으로 결정.

---

## 6. 누락 토큰 처리 흐름

```
Story 1~4 교체 작업
      │
      ├─ 기존 15 토큰으로 1:1 매핑 가능 → 교체 진행
      │
      └─ 매핑 불가 hex 발견
              │
              ├─ 시각 차이 4dp 이내 / 동일 맥락 → 가장 가까운 기존 토큰으로 대체
              │   예) '#1A1D2E' → surface('#1A1D30') (2dp 차이 — 흡수)
              │
              └─ 시각 의도 독립 → 누락 토큰 후보 목록에 등재
                      │
                      ▼
              Story 5 task 08에서 일괄:
              tokens.ts에 토큰 추가 (dark/light 양쪽) → 소급 교체
```

현재 후보 (구현 전 가설 — 실측 확정 필요):

| 후보 토큰 | 예상 hex (dark) | 예상 용도 |
|---|---|---|
| `gradientStart` | S13 배경 그라디언트 top | PlayScreen 배경 상단 |
| `gradientEnd` | S13 배경 그라디언트 bottom | PlayScreen 배경 하단 |
| `surfaceMid` | S09/S11 카드 중간 | surface와 surfaceHigh 사이 |

> `DeleteTracksSheet.tsx`의 `'#5A8A6A'`(녹색 계열)는 `success` 토큰(`#6BCB77`)과 다름. 실측 후 대체 가능 여부 판단 — 대체 불가 시 신규 토큰 `successMuted` 후보 등재.

---

## 7. 의존성 그래프

```
task 01 (Story 1 — M0 인증·온보딩)
    │
    ▼
task 02 (Story 2 — M0 결제·구독)
    │
    ▼
task 03 (Story 3 — M0 Settings·Deletion)
    │
    ▼
task 04 (Story 4 — M1 핵심 플로우: S06·S07·RecordGuide·RecordScreen)
task 05 (Story 4 — M1 재생·대기·내비게이터: S11·S12·S13·RecordMode·MainNav)  ← 04, 05 병렬 가능
task 06 (Story 4 — M1 useBackNavigation + LyricsBox·WaveformVisualizer)        ← 04, 05와 독립
    │
    ▼ (04+05+06 모두 완료 후)
task 07 (Story 5 — 공유 컴포넌트 일괄)
    │
    ▼
task 08 (Story 5 — 누락 토큰 정비 + Jest hex-lint)
```

**병렬 가능 범위 (Option α 재정렬 후)**:
- task 05, 06, 07 — task 04 (token-define) 완료 후 화면 간 독립성으로 병렬 가능. 1인 개발 환경에서는 순차 권장.
- task 08, 09 — task 05~07 완료 후 순차 진행.

---

## 8. impl 목차 (Option α 재정렬 — 2026-05-09)

| NN | 파일명 | 대응 Story | 의존 |
|---|---|---|---|
| 01 | `01-m0a-auth-onboarding.md` | Story 1 | — |
| 02 | `02-m0b-paywall.md` | Story 2 | task 01 |
| 03 | `03-m0c-settings-deletion.md` | Story 3 | task 02 |
| 04 | `04-missing-tokens-define-and-apply.md` ⭐ NEW | Story 5 (분할) | task 03 |
| 05 | `05-m1a-core-flow-screens.md` | Story 4 | task 04 |
| 06 | `06-m1b-play-pending-nav.md` | Story 4 | task 04 |
| 07 | `07-m1c-back-nav-hook.md` | Story 4 | task 04 |
| 08 | `08-shared-components.md` | Story 5 | task 05+06+07 |
| 09 | `09-regression-test-jest-hex-lint.md` | Story 5 | task 08 |

### Option α 결정 근거 (2026-05-09)

task 02 (paywall) MODULE_PLAN 작성 중 누락 토큰 6종 / 16 hex (36%) 발견 + task 03 (settings/deletion) 에서 추가 누락 후보 누적 (총 9 후보). 원안 (task 08 일괄 처리) 유지 시:
- task 02~07 매 PR 머지 후에도 라이트 모드 부분 깨짐 잔존 (subscribeCta `#4A6FFF`, textHighlight `#F5F5F5` 등)
- task 08 (구 위치) 일괄 PR = task 02~07 누적분 모두 포함 → 변경 라인 수 폭증 + 회귀 위험 ↑
- 출시 차단 완전 해소 시점이 epic 마지막 task 까지 미뤄짐

재정렬 후 (Option α):
- 신규 task 04 = "missing-tokens-define-and-apply" — 토큰 정의 + task 02/03 보류분 일괄 교체
- task 05~07 (M1) = 정의된 신규 토큰 즉시 활용 가능 (보류 0)
- task 09 = 구 task 08 의 hex-lint 회귀 테스트만 분리

기존 NN 04~08 → 05~09 로 1씩 밀음. 슬러그 변경 0 (파일명 prefix 만 갱신).

---

## 결론

Epic 12는 신규 인프라 신설 없이 기존 `useTheme()` / `ColorTokens` 인프라를 31개 파일(screens 19, components 9, navigation 2, hooks 1)에 전파하는 기계적 교체 작업이다. DB/API/외부 SDK 변경이 없고 다크 팔레트 hex가 동일하게 유지되므로 기술 위험은 낮다. impl 목차 8개 task 분할은 PRD의 "PR당 4~6 화면 묶음" 기준을 준수하며 M0 우선순위 순서(task 01→02→03)를 보장한다. task 04~06은 M0 완료 후 병렬 가능하나 1인 컨텍스트에서 순차 권장. PRD 미명시 hex 파일(DeleteTracksSheet, GeneratingFailureView 등 5개 컴포넌트)은 "기타 일괄 처리" 범위로 task 07에 흡수했다. AC-1(직접 hex 0건) 충족은 task 08 완료 시점.

SYSTEM_DESIGN_READY — impl 목차 표 포함 완료. 다음 단계로 validator DESIGN_VALIDATION 후 architect MODULE_PLAN × 8을 순차 진행하길 권장한다.
