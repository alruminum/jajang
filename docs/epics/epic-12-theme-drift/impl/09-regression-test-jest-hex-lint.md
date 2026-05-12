---
depth: std
task: 09
slug: regression-test-jest-hex-lint
story: Story 5 (공유 컴포넌트 + 누락 토큰 정비 + 회귀 방지 인프라)
github_issue: 242
epic: 12
branch_prefix: chore/epic12-task09-hex-lint
---

# task 09 — 잔여 hex 최종 처리 + Jest hex-lint 회귀 방지 인프라

## 1. 목적 (왜)

- **PRD AC-1 최종 충족** (`docs/epics/epic-12-theme-drift/prd.md` §4): `apps/mobile/src/` (테스트·`tokens.ts`·`__mocks__` 제외) 6/3 자리 hex 리터럴 0건. task 08 머지 후 잔여 = 4 매치 (`#82B090` ×2 + `#FF4444` ×2 + `#fff` ×1 — 단 `#fff` 은 task 05 가 `colors.textOnAccent` 로 처리 예정. 본 task 진입 시점에 *어느 위치* 가 보류로 남았는지 직접 grep 후 확정). 본 task 가 마지막 신규 토큰 정의 + 4 매치 교체로 잔여 0 달성.
- **system-design §5 Jest 옵션 A 채택안 구현** (`docs/epics/epic-12-theme-drift/system-design.md` §5): `jest-expo` 인프라 재사용. `__tests__/theme/no-raw-hex.test.ts` 신규 — `apps/mobile/src/` 전체 walk + regex 검출. ESLint custom rule (옵션 B) 대비 구현 비용 LOW + `npm test` 단일 커맨드. **본 task = system-design §8 impl 목차 NN=09 행 산출물**.
- **회귀 방지 영구화** (PRD §3.5 + AC-5): "신규 PR 에서 직접 hex 가 재삽입되는 것을 자동 차단". 본 task 머지 후 미래 PR 누군가 `#FF0000` 박으면 즉시 RED — `apps/mobile/src/` 전 영역 1차 방어선. 개별 task 회귀 테스트 (`auth-onboarding-no-raw-hex.test.ts`, `paywall-processed-hex-map.test.ts` 등) 와 *병존* — §3.4 결정.
- **Epic 12 종료 시점**: 본 task PR 머지 = Epic 12 (Theme Drift Fix) 종료. CLAUDE.md / backlog.md 의 Epic 12 행을 *완료* 로 갱신 가능 시점.
- **다크 회귀 0 보장 유지**: `darkColors` 신규 2 토큰 hex = task 05 §3.2.3 발견 hex *그대로* (`#82B090` / `#FF4444`). 시각 변화 0. 본 task 가 `darkColors` 의 기존 27 토큰 (15 기존 + task 04 신규 9 + task 08 신규 3) 을 *변경 X*. 본 task 머지 후 최종 토큰 카운트 = 29.
- **출시 차단 회귀 완전 해소 종결**: M0 화면 (task 01~04 처리) + M1 화면 (task 05~07 처리) + 공유 컴포넌트 (task 08 처리) + 잔여 4 매치 (본 task 처리) = `apps/mobile/src/` hex 0건. v1 라이트 모드 출시 차단 회귀 = 본 task 머지 시점에 영구 해소.

## 2. 영향 파일 (실측 — grep + Read 직접 검증)

### 2.0 본 task 진입 시점 잔여 hex 전수 (architect 직접 grep 검증)

본 architect 가 메인 worktree 에서 직접 grep `#82B090|#FF4444` 결과 (2026-05-11 작성 시점):

| 파일 | 라인 | 발견 hex | 의도 (직접 Read 검증) |
|---|---|---|---|
| `apps/mobile/src/screens/RecordGuideScreen.tsx` | L302 | `'#82B090'` | HeadphoneChip `borderColor` — "이어폰을 끼면 더 또렷하게 담겨요" 권고 chip |
| `apps/mobile/src/screens/RecordGuideScreen.tsx` | L310 | `'#82B090'` | HeadphoneChip `text.color` — 동일 chip 안 텍스트 |
| `apps/mobile/src/screens/RecordScreen.tsx` | L497 | `'#FF4444'` | `stopRing.borderColor` — 녹음 중지 버튼 *외곽 링* |
| `apps/mobile/src/screens/RecordScreen.tsx` | L505 | `'#FF4444'` | `stopBtn.backgroundColor` — 녹음 중지 버튼 *본체* |

> **카운트 = 2 고유 hex / 4 매치**. task 05 plan §3.2.3 + task 08 plan §3.2.4 가 본 task 위임 명시. task 05~07 진행 후 (PR 흐름) 보류분이 사라질 가능성을 architect 가 검토했으나, task 05 = "본 task 보류 (Option B)" 명시 → engineer 가 5/6/7 PR 에서 *건드리지 X 약속*. 따라서 본 task 진입 시점에 위 4 매치 *그대로 잔존* 가정. 만약 engineer 가 task 05/08 PR 머지 후 다른 hex 추가 도입 (=드물지만 가능) 시 본 task §11 verify 단계에서 발견 → 본 task 내 처리 또는 SPEC_GAP cycle.

### 2.1 3자리 hex 잔존 확인 (`#fff` 등)

architect 가 메인 worktree 에서 직접 grep `['"]#[0-9A-Fa-f]{3}['"]` 결과:

| 파일 | 라인 | 발견 | 비고 |
|---|---|---|---|
| `apps/mobile/src/screens/RecordScreen.tsx` | L512 | `'#fff'` | stopIcon `backgroundColor` — task 05 plan §2.2 가 *task 04 textOnAccent 즉시 활용* 위임. task 05 머지 후에는 0건. 본 task 진입 시점에 *잔존* 시 본 task 가 `colors.textOnAccent` 교체. |

> 본 task 진입 시점에 task 05 가 미머지 또는 task 05 가 `#fff` 처리 누락 발견 시 — 본 task §5 Phase 2 가 `colors.textOnAccent` 교체. 단 task 05 plan 의 §3.2.3 + §4.5 가 명시 처리 → 보통은 본 task 진입 시 0건 잔존 예상.

### 2.2 본 task 처리 후 파일

| 경로 | 변경 내용 |
|---|---|
| `apps/mobile/src/theme/tokens.ts` | ColorTokens 타입 2 토큰 추가 (`successHigh` / `destructiveAction`) + darkColors / lightColors 양쪽 2 토큰 hex 정의 (총 29 토큰) |
| `apps/mobile/src/__tests__/theme/tokens.test.ts` | `REQUIRED_KEYS` 배열에 2 신규 토큰 추가 + 키셋 카운트 '27개' → '29개' + dark/light 양쪽 hex assertion 2×2 = 4 it 블록 추가 |
| `apps/mobile/src/screens/RecordGuideScreen.tsx` | L302/L310 `'#82B090'` × 2 → `colors.successHigh`. useTheme/factory 패턴 적용 검토 — task 05 머지 후 상태 의존 (§3.5) |
| `apps/mobile/src/screens/RecordScreen.tsx` | L497/L505 `'#FF4444'` × 2 → `colors.destructiveAction`. useTheme/factory 패턴 적용 — task 05 머지 후 상태 의존 (§3.5). + (조건부) L512 `'#fff'` → `colors.textOnAccent` (task 05 누락 발견 시 본 task 보강) |
| `apps/mobile/src/__tests__/theme/no-raw-hex.test.ts` | **신규** — `apps/mobile/src/` 재귀 walk + 6/3자리 hex regex 검출 + 예외 등재 + fail 시 위치 노출 |

> Phase 1 = tokens.ts + tokens.test.ts (단일 파일 정의). Phase 2 = 2 화면 4 매치 교체. Phase 3 = no-raw-hex.test.ts 신규 + 머지 후 GREEN 확인. PR 분할 검토 §3.6.

### 2.3 본 task 가 *건드리지 X* 파일

- `apps/mobile/src/theme/tokens.ts` 의 *기존 27 토큰 hex* 변경 X (회귀 0)
- task 01~08 처리 완료 27 파일 (screens 19 + components 6 + navigation 2 + hook 1 — 단 RecordGuide/Record 는 본 task 가 추가 교체) — 본 task 가 *읽기만*, 수정 X
- task 01~08 의 회귀 테스트 파일 8개 (`auth-onboarding-no-raw-hex.test.ts` / `paywall-processed-hex-map.test.ts` / `settings-deletion-processed-hex-map.test.ts` / `missing-tokens-applied.test.ts` / `m1a-core-flow-processed-hex-map.test.ts` / `m1b-play-pending-nav-processed-hex-map.test.ts` / `m1c-back-nav-hook-processed-hex-map.test.ts` / `shared-components-processed-hex-map.test.ts`) — 본 task 가 *유지 결정* §3.4 → 변경 X

## 3. 결정 근거 (선택 + 버린 대안)

### 3.1 Jest 옵션 A 채택 — system-design §5 인용

system-design §5 표:

| 기준 | Jest (A) | ESLint rule (B) |
|---|---|---|
| 구현 복잡도 | 낮음 — fs.readFileSync + regex | 높음 — custom rule 작성 + 빌드 필요 |
| 기존 인프라 활용 | jest-expo 이미 구축 (Epic 08~10) | ESLint 설정 추가 필요 |
| CI 연동 | `npm test` 기존 스크립트 그대로 | lint script 별도 추가 |
| 에러 메시지 품질 | 파일명·행 번호 출력 커스텀 가능 | rule 메시지 수준 |
| 예외 처리 | 파일 경로 regex 로 간단히 제어 | overrides 설정 |

**결정 = 옵션 A 채택**. `jest-expo` 인프라 재사용 + `npm test` 단일 커맨드 + 에러 메시지 커스텀 (파일:행:hex + 가까운 토큰 제안). architect 추가 검증 = `apps/mobile/jest.config.js` (직접 read) — `testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx', ...]` + `testEnvironment: 'node'` → `fs.readdirSync` / `fs.readFileSync` 동작 보장.

### 3.2 잔여 hex 처리 = 신규 2 토큰 정의 (vs hex-lint 예외 등재)

task 08 plan §3.2.4 가 두 옵션 제시:
- 옵션 X: hex-lint 예외 등재 (`#82B090` / `#FF4444` 통과 허용)
- 옵션 Y: 신규 토큰 정의 + 교체

**결정 = 옵션 Y (신규 토큰 정의)**. 근거:

1. **PRD AC-1 = "직접 hex 0건"** — 예외 등재 시 코드에 hex 잔존 = AC-1 *형식상* 위반. PRD §4 "예외 목록에 등재된 그라디언트 / 미커버 시각 의도 hex 는 Story 5 누락 토큰 추가 + 일괄 교체 시점에 0건 충족" = *최종 0건* 의도 명시.
2. **task 04 + task 08 패턴 일관** — 두 task 모두 "발견 hex 가 기존 토큰 매핑 불가 시 신규 토큰 정의" 패턴 채택. 본 task 만 예외 등재 = 패턴 균열 + 미래 PR 에서 "어차피 예외 등재 가능" 인식 → 토큰 SSOT 약화.
3. **재사용 가능성** — `successHigh` / `destructiveAction` 은 *의미 기반* 토큰 (sister of `successMuted` / `destructive`). 미래 다른 화면에서 동일 시각 의도 발생 시 즉시 재사용 가능. 예외 등재 hex 는 컴포넌트 한정 → 재사용 0.
4. **변경 비용 LOW** — tokens.ts 4 라인 (타입 + dark + light) + 2 파일 4 매치 교체 + tokens.test.ts 4 it = ~15~20 라인. 옵션 X 의 hex-lint exception array 대비 코드 변경량 비슷 + 미래 영향 ↑.

### 3.3 신규 2 토큰 정의 — architect 1차 결정

| 토큰 | dark hex (= 발견 hex) | light hex (architect 1차 결정) | 시각 의도 |
|---|---|---|---|
| `successHigh` | `#82B090` | `#5C8270` (라이트 success `#2E8B44` 보다 *부드러운 sage*, 베이지 위 가독성 + 권고 톤 보존) | "이어폰 권장 chip border/text" — success 보다 *밝은 sage / 권고 톤*. successMuted (warm-olive) 와 별도 hue |
| `destructiveAction` | `#FF4444` | `#D63838` (라이트 destructive `#C0392B` 보다 *채도 ↑ saturation* — 액션 버튼 시각 강도 보존) | "녹음 중지 버튼" — *위험 액션 버튼*. destructive (text 톤) 보다 강한 vivid red |

#### 3.3.1 라이트 hex 결정 근거 (팔레트 정합)

라이트 팔레트 베이스 (tokens.ts L42~58 직접 read):
- `bgPrimary #FBF7F0` (베이지) / `textPrimary #1C1A18` (짙은 갈색) / `accentPrimary #3A5A88` (진한 남색)
- `destructive #C0392B` (짙은 빨강) / `success #2E8B44` (진녹색) / `border #C8BEB0` (옅은 베이지)
- task 04 신규 — `interactive #3A5FE0` (진한 파랑) / `destructiveBg #F4E8DC` (옅은 베이지/주황)
- task 08 신규 — `successMuted #3E6749` (warm-olive) / `errorText #C0392B` (= destructive 흡수) / `warning #A07840` (진한 황금색)

**`successHigh` light = `#5C8270`** — sage green. successMuted (`#3E6749` warm-olive) 와 hue 차별화 (sage vs olive). 베이지 위 *권고 chip 톤* — 너무 진하지 않으면서 (textSecondary `#6B6055` 갈색 보다는 시각 강함) "이어폰 권장 = positive hint" 의도 보존. success (`#2E8B44` 진녹색) 와 차별 — success 는 *완료 액션*, successHigh 는 *권고/안내*. 채널차 vs success: R+46/G-9/B+44 = 33dp avg → 별도 토큰 유지 정당.

**`destructiveAction` light = `#D63838`** — saturation ↑ 빨강. destructive (`#C0392B` 짙은 빨강) 보다 더 vivid + 약간 밝음. 베이지 위 *큰 버튼 본체 색* 으로 강한 시각 강도 필요 (destructive 텍스트보다 강한 어필). 채널차 vs destructive: R+22/G-1/B+13 = 12dp avg — 흡수 부적합 (디자인 의도 = 액션 버튼 더 vivid). 라이트의 `#FF4444` 그대로 사용 옵션 → 베이지 위 *너무 밝아* 가독성 ↓ + textOnAccent `#FFFFFF` 흰 아이콘 대비 약함 → reject. `#D63838` 은 채도 보존 + 베이지 위 가독성 ↑.

#### 3.3.2 토큰명 흡수 검토 — 모두 별도 유지 결정

- **`successHigh` vs `successMuted` 흡수?** 다크 `#82B090` vs `#5A8A6A` 채널차 R+40/G+0/B+38 = 26dp avg → 흡수 부적합. hue 도 다름 (sage vs warm-olive). 별도 유지.
- **`successHigh` vs `success` 흡수?** 다크 `#82B090` vs `#6BCB77` 채널차 R+23/G-59/B+25 = 36dp avg → 흡수 부적합. success 는 *진녹색 완료 액션*, successHigh 는 *muted sage 권고*. 별도 유지.
- **`destructiveAction` vs `destructive` 흡수?** 다크 `#FF4444` vs `#E85A5A` 채널차 R+23/G-22/B-22 = 22dp avg → 흡수 부적합. destructive 는 *섬세한 위험 텍스트*, destructiveAction 은 *강한 액션 버튼*. 의도 별도. 별도 유지.
- **`destructiveAction` vs `errorText` 흡수?** 다크 `#FF4444` vs `#FF6B6B` 채널차 R+0/G-39/B-39 = 26dp avg → 흡수 부적합. errorText 는 *옅은 핑크-red 텍스트*, destructiveAction 은 *순수 강한 red 버튼*. 별도 유지.

→ 2 토큰 모두 별도 유지가 안전한 결정.

### 3.4 hex-lint 통합 테스트 vs 개별 task 테스트 = **병존 결정 (옵션 B)**

mode prompt §3 가 두 옵션 제시:
- 옵션 A: 본 task 가 *통합 테스트만* — 개별 task 의 hex 0 assertion 제거하고 본 테스트로 일원화 (positive assertion = useTheme 도입 확인 등은 개별 테스트 유지)
- 옵션 B: 본 task 가 *추가 회귀 방지선* — 개별 테스트와 병존, 본 테스트는 신규 hex 도입 차단 목적

**결정 = 옵션 B (병존)**. 근거:

1. **개별 task 테스트의 *positive assertion 보존*** — `auth-onboarding-no-raw-hex.test.ts` 는 useTheme 호출 검증 (REQ-001) + hex 0 (REQ-002) 이중 책임. `paywall-processed-hex-map.test.ts` / `settings-deletion-processed-hex-map.test.ts` / `missing-tokens-applied.test.ts` 등은 *특정 hex → 특정 token 매핑* 의도 검증 (positive). 통합 테스트로 일원화 시 *의도 검증 손실*.
2. **본 테스트의 *역할 명확화*** — task 09 `no-raw-hex.test.ts` = **앱 전체 1차 방어선** (미래 PR 차단). 개별 task 테스트 = **각 task 의도 검증** (useTheme 채택 + 토큰 매핑 + 신규 토큰 활용). 역할 분리 = 디버깅 시 빠른 위치 추적.
3. **변경 비용 LOW** — 개별 테스트 8개 *유지* → 본 task 변경 영향 0. 옵션 A (통합 테스트만) 채택 시 개별 테스트 8개 일부 삭제 + assertion 재배치 → 본 task PR 변경량 ↑ + 회귀 위험 ↑ (테스트 삭제 자체가 회귀 위험).
4. **CI 시간 영향 미미** — 개별 8 테스트 fs.readFileSync = ~10 파일 read 합산. 본 task fs.readdirSync recursive = ~50~70 파일 read. 합산 ~80 파일 read = ms 단위. CI 영향 무시 가능.
5. **미래 task / Epic 16 호환** — Epic 16 (Pencil 매핑 확장) 등 후속 작업 시 본 task `no-raw-hex.test.ts` 만 신뢰 가능. 개별 테스트는 task 별 컨텍스트 한정 (= Epic 12 한정). 본 테스트만 *영구 인프라*.

> 단 미래에 개별 테스트 8개의 hex 0 assertion 가 *완전히 redundant* 로 느껴지면 별도 cleanup PR 로 제거 가능 — 본 task PR 범위 외.

### 3.5 RecordGuideScreen / RecordScreen 의 useTheme 채택 여부 — task 05 머지 후 상태 의존

본 task 진입 시점에 task 05 (`05-m1a-core-flow-screens.md`) 가 머지된 상태 가정 (system-design §7 의존: 09 ← 08 ← 05/06/07 ← 04 ← 03 ...). task 05 plan §3.1 가 RecordGuideScreen / RecordScreen 에 *useTheme 채택 + factory* 적용 명시. 따라서 본 task 진입 시점에 두 파일은:
- useTheme 이미 채택
- factory 패턴 적용 (createStyles)
- 보류 hex (`#82B090` ×2 / `#FF4444` ×2) 가 *factory 본문 내* 또는 *임시 hex + TODO 주석* 형태로 잔존

본 task engineer 가 *기존 factory 안 보류 hex 위치만* `colors.successHigh` / `colors.destructiveAction` 으로 1행씩 교체. useTheme/factory 도입 X (이미 task 05 가 도입). TODO 주석 *모두 제거* (보류 해소).

**만약 task 05 가 머지되지 않은 상태 (예: PR 순서 역전)** 에서 본 task 진입 시 — useTheme 미채택 상태에서 본 task 가 *전체 useTheme + factory 도입 + 4 hex 교체* 책임 도입. 본 task §10.7 위험 등재.

### 3.6 PR 단위 — Phase 1 + Phase 2 + Phase 3 = 1 PR 권장

**옵션 A (권장): 3 Phase 1 PR**
- Phase 1 (tokens.ts + tokens.test.ts) + Phase 2 (4 매치 교체) + Phase 3 (no-raw-hex.test.ts) 일체화
- AC-1 충족 + AC-5 (회귀 방지 테스트 GREEN) *본 PR 머지 시점에 동시 달성*
- PR 변경 라인 수 ~80~100 라인 (tokens.ts 8 + tokens.test.ts 12 + 2 파일 8 + no-raw-hex.test.ts 60) — 1 PR 적정
- Phase 3 의 no-raw-hex.test.ts 가 Phase 1+2 의 결과를 *즉시 검증* (테스트 도입 후 GREEN 확인) → CI feedback 빠름

**옵션 B (분할): Phase 1+2 = 1 PR + Phase 3 = 1 PR = 2 PR**
- Phase 1+2 머지 후 잔여 hex 0 *그러나* hex-lint 인프라 X. 외부 hex 재삽입 차단 X 상태에서 Phase 3 머지까지 시차 발생.
- 분할 이점 = 리뷰 부담 ↓ *그러나* 변경량 작음.

**결정 = 옵션 A**. 단 engineer 가 PR 변경 라인 수 폭증 시 분할 가능. branch_prefix `chore/epic12-task09-hex-lint` 유지.

### 3.7 외부 SDK / API / DB / navigation 영향 0

- **외부 SDK**: revenue-cat / accountApi / dataManagementApi / AudioEngine / AsyncStorage / expo-file-system / react-navigation / react-native-purchases / rewardedAdService / AdMob — 변경 0.
- **DB**: 영향 0. `docs/db-schema.md` 참조 — 색상 토큰은 DB 와 무관.
- **API**: 변경 0.
- **navigation**: 변경 0. RecordGuideScreen / RecordScreen 의 navigation prop 시그니처 / route params 변경 0.
- **테스트 환경**: jest 설정 변경 0. `apps/mobile/jest.config.js` 의 `testMatch` 가 이미 `**/__tests__/**/*.test.ts` 패턴 포함 → 신규 `no-raw-hex.test.ts` 자동 픽업. `testEnvironment: 'node'` → `fs` 모듈 사용 보장.

## 4. 인터페이스 (TypeScript)

### 4.1 ColorTokens 타입 확장 (tokens.ts)

```ts
export type ColorTokens = {
  // ─── 기존 15 (변경 X) ───
  accentPrimary:     string;
  accentSecondary:   string;
  bgPrimary:         string;
  bgDeep:            string;
  surface:           string;
  surfaceHigh:       string;
  textPrimary:       string;
  textSecondary:     string;
  border:            string;
  destructive:       string;
  success:           string;
  overlay:           string;
  accentPrimary14:   string;
  accentPrimary20:   string;
  accentPrimary33:   string;
  // ─── task 04 신규 9 (변경 X) ───
  textHighlight:     string;
  textBody:          string;
  textBodyHigh:      string;
  textBodyMuted:     string;
  textOnAccent:      string;
  textMuted:         string;
  interactive:       string;
  destructiveBg:     string;
  toastBg:           string;
  // ─── task 08 신규 3 (변경 X) ───
  successMuted:      string;
  errorText:         string;
  warning:           string;
  // ─── task 09 신규 2 ───
  successHigh:       string;  // 권고/안내 chip (sage tone, success 보다 muted)
  destructiveAction: string;  // 위험 액션 버튼 본체 (destructive 보다 강한 vivid red)
};
```

### 4.2 darkColors / lightColors 2 토큰 추가

```ts
export const darkColors: ColorTokens = {
  // ─── 기존 27 (변경 X) — 생략 ───
  // ─── 신규 2 (다크 = task 05 §3.2.3 발견 hex 그대로) ───
  successHigh:       '#82B090',
  destructiveAction: '#FF4444',
};

export const lightColors: ColorTokens = {
  // ─── 기존 27 (변경 X) — 생략 ───
  // ─── 신규 2 (라이트 = architect 1차 결정 — §3.3.1 근거) ───
  successHigh:       '#5C8270',
  destructiveAction: '#D63838',
};
```

### 4.3 4 매치 교체 매핑 (engineer 의 검색·치환 가이드)

| 발견 hex | 신규 토큰 참조 | 처리 위치 |
|---|---|---|
| `'#82B090'` | `colors.successHigh` | `RecordGuideScreen.tsx` L302 (HeadphoneChip border) + L310 (HeadphoneChip text) |
| `'#FF4444'` | `colors.destructiveAction` | `RecordScreen.tsx` L497 (stopRing border) + L505 (stopBtn bg) |
| (조건부) `'#fff'` | `colors.textOnAccent` | `RecordScreen.tsx` L512 (stopIcon bg) — task 05 누락 발견 시만. 본 task 진입 시 0건 잔존이면 처리 X |

> **주의 — task 05 머지 후 상태**: 본 task PR 진입 시점에 task 05 가 *useTheme + factory 도입 + 위 4 hex 외 모든 hex 교체* 완료된 상태여야 함. 본 task engineer 가 factory 안 4 hex 위치 + `// TODO(task 09 token-define): ...` 주석 모두 *교체 + 제거*.

### 4.4 tokens.test.ts 갱신

```ts
const REQUIRED_KEYS: (keyof ColorTokens)[] = [
  // ─── 기존 15 (변경 X) ───
  'accentPrimary', 'accentSecondary', 'bgPrimary', 'bgDeep',
  'surface', 'surfaceHigh', 'textPrimary', 'textSecondary',
  'border', 'destructive', 'success', 'overlay',
  'accentPrimary14', 'accentPrimary20', 'accentPrimary33',
  // ─── task 04 신규 9 (변경 X) ───
  'textHighlight', 'textBody', 'textBodyHigh', 'textBodyMuted',
  'textOnAccent', 'textMuted', 'interactive', 'destructiveBg',
  'toastBg',
  // ─── task 08 신규 3 (변경 X) ───
  'successMuted', 'errorText', 'warning',
  // ─── task 09 신규 2 ───
  'successHigh', 'destructiveAction',
];

// 키셋 카운트 변경: 27 → 29
it('ColorTokens 필수 키 29개를 모두 포함한다', () => {
  for (const key of REQUIRED_KEYS) {
    expect(darkColors).toHaveProperty(key);
    expect(lightColors).toHaveProperty(key);
  }
});

// darkColors 신규 2 토큰 정확 hex assertion
describe('darkColors — 신규 토큰 hex 값 (task 09 hex-lint)', () => {
  it('successHigh: #82B090', () =>
    expect(darkColors.successHigh).toBe('#82B090'));
  it('destructiveAction: #FF4444', () =>
    expect(darkColors.destructiveAction).toBe('#FF4444'));
});

// lightColors 신규 2 토큰 정확 hex assertion (architect 1차 결정값)
describe('lightColors — 신규 토큰 hex 값 (task 09 hex-lint)', () => {
  it('successHigh: #5C8270', () =>
    expect(lightColors.successHigh).toBe('#5C8270'));
  it('destructiveAction: #D63838', () =>
    expect(lightColors.destructiveAction).toBe('#D63838'));
});
```

### 4.5 no-raw-hex.test.ts (신규 — 전체 src 1차 방어선)

```ts
/**
 * task 09 — Jest hex-lint 회귀 방지 인프라
 *
 * 대상: apps/mobile/src/ 전체 (.ts/.tsx)
 * 패턴: /#[0-9A-Fa-f]{3,6}\b/g (3자리 + 6자리 hex; \b 로 8자리 alpha hex 자연 제외)
 * 예외 (절대 경로 기준):
 *   - apps/mobile/src/theme/tokens.ts  (SSOT — hex 정의 본체)
 *   - **\/__tests__\/**                  (테스트 파일 자체)
 *   - **\/__mocks__\/**                  (mock 파일)
 *   - *.test.ts / *.test.tsx / *.spec.ts / *.spec.tsx
 *   - 본 테스트 파일 자체 (자동 — __tests__ 안)
 *
 * 실패 시 출력: 파일 상대 경로:라인 + 발견 hex (가까운 토큰 제안 = 별도 옵션, MVP 미포함)
 *
 * 도입 시점: task 09 (Epic 12 마지막 task). 본 테스트 머지 시점에 GREEN 보장 → 이후 미래 PR
 * 누군가 src/ 안에 hex 추가 시 즉시 RED.
 */
import * as fs from 'fs';
import * as path from 'path';

// ─── 경로 설정 ────────────────────────────────────────────────────────────────

/**
 * __dirname = .../apps/mobile/src/__tests__/theme/
 * SRC_ROOT  = .../apps/mobile/src/
 */
const SRC_ROOT = path.resolve(__dirname, '..', '..');

/** hex 검출 정규식 — 3 또는 6 자리. \b word boundary 로 8자리 (alpha 포함) 자연 제외. */
const HEX_REGEX = /#[0-9A-Fa-f]{3,6}\b/g;

/** 파일 단위 예외 — SSOT 본체 + 본 테스트. 상대 경로 (SRC_ROOT 기준). */
const ALLOWED_FILES: string[] = [
  'theme/tokens.ts',
];

/** 디렉토리 단위 예외 — 테스트 + mock. (SRC_ROOT 기준 prefix) */
const ALLOWED_DIR_PREFIXES: string[] = [
  '__tests__/',
  '__mocks__/',
];

/** 파일 suffix 예외 — *.test.* / *.spec.* */
const ALLOWED_SUFFIXES: RegExp[] = [
  /\.test\.ts$/,
  /\.test\.tsx$/,
  /\.spec\.ts$/,
  /\.spec\.tsx$/,
];

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

/** SRC_ROOT 하위 .ts/.tsx 파일 재귀 수집 (상대 경로 반환). */
function collectSourceFiles(absDir: string, relPrefix: string = ''): string[] {
  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  const results: string[] = [];
  for (const ent of entries) {
    const rel = relPrefix ? `${relPrefix}/${ent.name}` : ent.name;
    const abs = path.join(absDir, ent.name);
    if (ent.isDirectory()) {
      results.push(...collectSourceFiles(abs, rel));
    } else if (ent.isFile() && /\.(ts|tsx)$/.test(ent.name)) {
      results.push(rel);
    }
  }
  return results;
}

/** 예외 등재 여부. */
function isAllowed(relPath: string): boolean {
  if (ALLOWED_FILES.includes(relPath)) return true;
  if (ALLOWED_DIR_PREFIXES.some((p) => relPath.startsWith(p))) return true;
  if (ALLOWED_SUFFIXES.some((re) => re.test(relPath))) return true;
  return false;
}

/** content 안 hex match + 라인 번호 추출. */
function findHexMatches(content: string): Array<{ line: number; hex: string }> {
  const lines = content.split('\n');
  const matches: Array<{ line: number; hex: string }> = [];
  lines.forEach((lineText, idx) => {
    const found = lineText.match(HEX_REGEX);
    if (found) {
      found.forEach((hex) => matches.push({ line: idx + 1, hex }));
    }
  });
  return matches;
}

// ─── 테스트 본문 ──────────────────────────────────────────────────────────────

describe('task 09 — no-raw-hex (apps/mobile/src/ 전체 hex 0)', () => {
  it('src/ 하위 .ts/.tsx 파일에 직접 hex 리터럴 0건 (예외 등재 분 제외)', () => {
    const allFiles = collectSourceFiles(SRC_ROOT);
    const violations: Array<{ file: string; line: number; hex: string }> = [];

    for (const rel of allFiles) {
      if (isAllowed(rel)) continue;
      const abs = path.join(SRC_ROOT, rel);
      const content = fs.readFileSync(abs, 'utf-8');
      const matches = findHexMatches(content);
      for (const m of matches) {
        violations.push({ file: rel, line: m.line, hex: m.hex });
      }
    }

    // 실패 시 위반 목록을 가독성 있는 메시지로 출력
    if (violations.length > 0) {
      const msg = violations
        .map((v) => `  ${v.file}:${v.line}  ${v.hex}`)
        .join('\n');
      throw new Error(
        `[task 09 hex-lint] ${violations.length} 위반 발견:\n${msg}\n\n` +
          `→ src/theme/tokens.ts 에 정의된 토큰 사용 또는 신규 토큰 추가 후 토큰 참조로 교체.`,
      );
    }

    expect(violations).toEqual([]);
  });
});

// ─── 자가 검증 (테스트 메타) ───────────────────────────────────────────────────

describe('task 09 — no-raw-hex 인프라 자가 검증', () => {
  it('SRC_ROOT 가 apps/mobile/src 절대 경로로 해석된다', () => {
    expect(fs.existsSync(path.join(SRC_ROOT, 'theme/tokens.ts'))).toBe(true);
  });

  it('ALLOWED_FILES 의 tokens.ts 는 실제 hex 정의를 포함한다 (regex 동작 확인)', () => {
    const content = fs.readFileSync(
      path.join(SRC_ROOT, 'theme/tokens.ts'),
      'utf-8',
    );
    const matches = content.match(HEX_REGEX);
    // tokens.ts = hex SSOT → 최소 15+9+3+2 = 29 토큰 × 2 (dark/light) ≈ 58 hex (3자리·6자리 합산).
    // 단 8자리 (`#000000AA` 등) 는 \b 로 자연 제외 → 6자리 hex 카운트 < 전체. 정확 카운트 X — 0보다 큰지만 확인.
    expect(matches).not.toBeNull();
    expect((matches ?? []).length).toBeGreaterThan(0);
  });

  it('예외 등재 함수 isAllowed — tokens.ts / __tests__ / __mocks__ / *.test.* 통과', () => {
    expect(isAllowed('theme/tokens.ts')).toBe(true);
    expect(isAllowed('__tests__/theme/no-raw-hex.test.ts')).toBe(true);
    expect(isAllowed('__mocks__/react-native-track-player.js')).toBe(false); // .js 확장자 → 수집 대상 외
    expect(isAllowed('components/Foo.test.tsx')).toBe(true);
    expect(isAllowed('components/Foo.spec.ts')).toBe(true);
    expect(isAllowed('screens/RecordScreen.tsx')).toBe(false);
  });
});
```

> **regex `\b` word boundary 효과 검증**: `'#5A7AA824'` (8자리 alpha hex) → `/#[0-9A-Fa-f]{3,6}\b/g` = 매치 *X* (뒤에 hex 글자 `24` 이어짐 → boundary 0). `'#5A7AA8'` (6자리) → 매치 *O*. `'#fff'` (3자리, 뒤에 `'` quote) → 매치 *O*. 따라서 tokens.ts 의 8자리 alpha hex 는 *예외 등재* + 정규식 양쪽 보호. 단 본 task 가 *tokens.ts 자체를 예외 등재* 하므로 alpha hex 보호는 redundant — 안전 마진.

> **3자리 hex 포함**: task 05 의 `'#fff'` 처리 누락 시 본 테스트가 즉시 검출. `#fff` → 매치 `O` (3자리 = HEX_REGEX `{3,6}` 범위).

> **자가 검증 it 블록 3개**: regex 동작 + 예외 함수 동작 직접 검증. 테스트 자체의 buggy 가능성 ↓.

## 5. 핵심 로직 (의사코드)

### 5.1 Phase 1 — tokens.ts 갱신 (단일 파일)

```
1. ColorTokens 타입에 신규 2 토큰 (successHigh / destructiveAction) 추가 (§4.1)
2. darkColors 객체에 신규 2 hex 추가 (§4.2 darkColors)
   ── task 05 §3.2.3 발견 hex 그대로 (다크 회귀 0)
3. lightColors 객체에 신규 2 hex 추가 (§4.2 lightColors)
   ── architect 1차 결정값 (§3.3.1)
4. tokens.test.ts 갱신:
   ── REQUIRED_KEYS 2 추가 (총 29)
   ── '27개' 문자열 → '29개' 갱신
   ── darkColors 신규 2 hex assertion 2 it 추가
   ── lightColors 신규 2 hex assertion 2 it 추가
5. jest 실행 → tokens.test.ts GREEN 확인
```

### 5.2 Phase 2 — 2 파일 4 매치 교체

```
for file in [RecordGuideScreen.tsx, RecordScreen.tsx]:
  1. 파일 read — task 05 머지 후 상태 (useTheme + factory + 보류 hex 잔존)
  2. factory 안 보류 hex 위치 검색·치환 (§4.3 매핑):
     - RecordGuide L302 '#82B090'  → colors.successHigh
     - RecordGuide L310 '#82B090'  → colors.successHigh
     - Record L497     '#FF4444'   → colors.destructiveAction
     - Record L505     '#FF4444'   → colors.destructiveAction
     - (조건부) Record L512 '#fff' → colors.textOnAccent  ← task 05 누락 발견 시만
  3. TODO 주석 모두 제거 — 보류 해소 (`// TODO(task 09 token-define): #82B090` 등)
  4. file-by-file grep 확인 — `/['"]#(82B090|FF4444|fff)['"]/g` 0건
```

### 5.3 Phase 3 — no-raw-hex.test.ts 신규 작성 + GREEN 확인

```
1. apps/mobile/src/__tests__/theme/no-raw-hex.test.ts 신규 작성 (§4.5 인용 그대로)
2. jest 실행 — 단일 it 블록 GREEN 확인:
   - collectSourceFiles(SRC_ROOT) → ~50~70 파일 수집
   - isAllowed 필터링 → 테스트 파일 + tokens.ts 제외
   - 각 파일 readFileSync + HEX_REGEX 매치
   - violations 누적 → 0 이어야 GREEN
3. 자가 검증 3 it 블록 GREEN 확인 (SRC_ROOT 해석 / regex 동작 / isAllowed 동작)
4. 의도적 RED 검증 (engineer 권장 self-check):
   - 임시로 src/screens/S01SplashScreen.tsx 안에 `// '#ABCDEF'` 1 라인 추가
   - jest 실행 → 본 테스트 FAIL + 출력 메시지에 "screens/S01SplashScreen.tsx:NN  #ABCDEF" 노출 확인
   - 임시 추가 제거
```

### 5.4 검증 절차 (전체)

```
1. jest run 전체:
   - tokens.test.ts (기존 + 신규 4 it = 29 키셋 + 29×2 hex assertion 모두 GREEN)
   - 개별 task 회귀 테스트 8개 (auth-onboarding-no-raw-hex / paywall-processed-hex-map / settings-deletion-processed-hex-map / missing-tokens-applied / m1a-core-flow-processed-hex-map / m1b-play-pending-nav-processed-hex-map / m1c-back-nav-hook-processed-hex-map / shared-components-processed-hex-map) — 모두 GREEN 회귀 0
   - no-raw-hex.test.ts (신규 — 통합 hex 0 + 자가 검증 3 it 모두 GREEN)
2. 시각 검증 (manual — REQ-007/008):
   - 다크 모드: RecordGuide 진입 → 이어폰 chip 시각 = Epic 12 전 캡처 동일 (#82B090 sage 톤). Record 진입 → stopBtn 시각 = #FF4444 강렬한 red. 회귀 0.
   - 라이트 모드: RecordGuide 진입 → 이어폰 chip 시각 = #5C8270 (베이지 위 sage 톤 — 권고 의도 가독성). Record 진입 → stopBtn 시각 = #D63838 (베이지 위 vivid red — 위험 액션 시각 강도). 가독성 OK.
3. 전체 grep 검증 (manual):
   - `grep -rE '#[0-9A-Fa-f]{3,6}\b' apps/mobile/src/ --include='*.ts' --include='*.tsx' \\
       | grep -vE '(theme/tokens\.ts|__tests__|__mocks__|\.test\.|\.spec\.)' \\
       → 0 매치`
```

## 6. 다른 모듈과의 경계

- **상위 의존**: `@theme/tokens` (변경 = 본 task 책임 — 2 토큰 추가), `@hooks/useTheme` (변경 0 — 자동으로 신규 2 토큰 반환).
- **하위 의존 (Phase 2 적용 대상)**: RecordGuideScreen.tsx + RecordScreen.tsx. 본 task 가 *교체만* — Props/렌더 동작/navigation 변경 0.
- **graceful 동작**: 본 task 의 신규 토큰 2종은 ColorTokens 타입 *필수* (옵셔널 X) → useTheme 호출자 모두 자동 노출. 부재 graceful 불필요.
- **역방향 cascade 필요 시 DIP interface**: 불필요 (단방향 — 화면이 tokens.ts 를 import).
- **의존 부재 graceful**: useTheme 부재 시 ColorTokens 반환 보장 (기존 동작). 신규 2 토큰도 동일 보장.
- **Breaking Change 검토**:
  - ColorTokens 타입 확장 → 기존 useTheme 호출자가 *새 키 2개에 무지한 경우* 영향 0 (TypeScript = 추가 키 접근 시점에만 검사).
  - tokens.ts 기존 27 토큰 hex 변경 0 → task 01~08 처리 분 시각 회귀 0.
  - RecordGuide / Record 의 props / export / navigation 변경 0.
  - **Breaking Change = 없음**.

## 7. 테스트 환경 영향

- 기존 jest 테스트 영향 0 — tokens.test.ts 만 갱신, 다른 테스트는 ColorTokens *추가* 키만 인지 (TypeScript 자동).
- 신규 테스트 1개 (`no-raw-hex.test.ts`) — fs.readdirSync recursive + fs.readFileSync 기반. `apps/mobile/jest.config.js` 의 `testEnvironment: 'node'` 보장 → Node fs 모듈 동작.
- CI 시간 영향 — `collectSourceFiles(SRC_ROOT)` 가 src/ 전체 walk = ~50~70 파일 readdirSync + readFileSync. 합산 ms 단위. 무시 가능.
- 개별 task 회귀 테스트 8개 *유지* (§3.4 옵션 B 결정) → 본 task 머지 후 jest test suite 카운트 = 기존 + 1 (`no-raw-hex.test.ts`).

## 8. 모듈 = 테스트 단위 정합 (self-check)

1. **테스트 단위 정합**:
   - tokens.ts 갱신 → tokens.test.ts 의 키셋 + hex assertion (29 키 + 4 신규 hex assertion) 으로 명확 PASS/FAIL
   - 2 파일 4 매치 교체 → no-raw-hex.test.ts 의 통합 hex 0 검증으로 명확 PASS/FAIL (= 잔여 0 시 GREEN)
   - 변경 이유 단일 (= "잔여 hex 최종 처리 + Jest hex-lint 도입") — SRP 충족
2. **의존성 묶음 정합**:
   - 의존 = `@theme/tokens` (단일). 단방향. 역방향 cascade 0. DIP 불필요.
   - 단독 lifecycle = tokens.ts 만 갱신 시 → ColorTokens 신규 2 키가 *unused* 잠시 발생 (Phase 1 후 Phase 2 전). 옵션 A (1 PR) 머지 시 dead code 잔존 0.
   - no-raw-hex.test.ts 는 외부 모듈 의존 0 (fs/path = node 표준).
3. **테스트 가능성 ✓** — 모듈 분할/통합 권유 0. 단 본 task 는 *의도적으로 작은 task* — Epic 12 종료 마무리 + 영구 인프라 1 PR.

## 9. 수용 기준

| ID | 내용 | 검증 방법 | 통과 조건 |
|---|---|---|---|
| REQ-001 | ColorTokens 타입에 신규 2 토큰 (`successHigh` / `destructiveAction`) 추가 + 키셋 카운트 29 | (TEST) `tokens.test.ts` REQUIRED_KEYS 29개 키셋 검증 | `cd apps/mobile && npm test -- src/__tests__/theme/tokens.test.ts` → `ColorTokens 필수 키 29개를 모두 포함한다` PASS |
| REQ-002 | darkColors 신규 2 토큰 hex = task 05 §3.2.3 발견 hex 그대로 (다크 회귀 0) | (TEST) `tokens.test.ts` darkColors 신규 2 it 블록 — `darkColors.successHigh === '#82B090'` / `darkColors.destructiveAction === '#FF4444'` | `cd apps/mobile && npm test -- src/__tests__/theme/tokens.test.ts -t "darkColors — 신규 토큰 hex 값 (task 09 hex-lint)"` → 2 passed |
| REQ-003 | lightColors 신규 2 토큰 hex = §3.3.1 architect 결정값 | (TEST) `tokens.test.ts` lightColors 신규 2 it 블록 — `lightColors.successHigh === '#5C8270'` / `lightColors.destructiveAction === '#D63838'` | `cd apps/mobile && npm test -- src/__tests__/theme/tokens.test.ts -t "lightColors — 신규 토큰 hex 값 (task 09 hex-lint)"` → 2 passed |
| REQ-004 | tokens.ts 의 기존 27 토큰 dark/light hex 변경 X (회귀 0) | (TEST) `tokens.test.ts` 기존 it 블록 (darkColors 27 + lightColors 27 hex assertion) 모두 GREEN | `cd apps/mobile && npm test -- src/__tests__/theme/tokens.test.ts` → 전체 GREEN (54+4 hex it + 1 키셋 it) |
| REQ-005 | RecordGuideScreen.tsx 에서 `'#82B090'` 0건 + `colors.successHigh` 참조 ≥1 회 | (TEST) `no-raw-hex.test.ts` 통합 검증 + (MANUAL) grep | `cd apps/mobile && grep -c "'#82B090'" src/screens/RecordGuideScreen.tsx` → 0 + `grep -c "colors.successHigh" src/screens/RecordGuideScreen.tsx` → ≥1 |
| REQ-006 | RecordScreen.tsx 에서 `'#FF4444'` 0건 + `colors.destructiveAction` 참조 ≥1 회 | (TEST) `no-raw-hex.test.ts` 통합 검증 + (MANUAL) grep | `cd apps/mobile && grep -c "'#FF4444'" src/screens/RecordScreen.tsx` → 0 + `grep -c "colors.destructiveAction" src/screens/RecordScreen.tsx` → ≥1 |
| REQ-007 | 다크 모드 RecordGuide / Record 시각 회귀 0 — Epic 12 전 캡처 동일 | (MANUAL) iOS 시뮬레이터 다크 → S07 → S09 RecordGuide (이어폰 chip = sage 톤 `#82B090`) → S10 Record (stop 버튼 = vivid red `#FF4444`) 진입 후 Epic 12 전 캡처 비교 | 2/2 동일 PASS |
| REQ-008 | 라이트 모드 RecordGuide / Record hex 0 시각 검증 — 라이트 결정값 적용 + 베이지 팔레트 위 가독성 OK | (MANUAL) 라이트 모드 진입 → RecordGuide 이어폰 chip border + text = sage `#5C8270` (베이지 위 권고 톤 가독성) / Record stop 버튼 border + bg = vivid red `#D63838` (베이지 위 위험 액션 시각 강도 + 흰 정사각형 stopIcon `colors.textOnAccent` 대비 충분) | 2/2 가독성 OK PASS |
| REQ-009 | Jest hex-lint 회귀 방지 인프라 GREEN — `apps/mobile/src/` 전체 hex 0 | (TEST) `no-raw-hex.test.ts` 통합 it 블록 — collectSourceFiles + HEX_REGEX 매치 → violations.length === 0 | `cd apps/mobile && npm test -- src/__tests__/theme/no-raw-hex.test.ts` → `src/ 하위 .ts/.tsx 파일에 직접 hex 리터럴 0건` PASS |
| REQ-010 | Jest hex-lint 의도적 RED 검증 — 임시 hex 삽입 시 즉시 FAIL + 위치 노출 | (TEST) engineer 가 self-check: 임시로 `src/screens/S01SplashScreen.tsx` 안에 `const _tmp = '#ABCDEF';` 1줄 추가 후 jest 실행. 출력에 `screens/S01SplashScreen.tsx:NN  #ABCDEF` 포함 + FAIL. 임시 추가 제거 후 GREEN 복귀. | `cd apps/mobile && npm test -- src/__tests__/theme/no-raw-hex.test.ts` → FAIL + 메시지에 임시 추가 위치 노출. 임시 제거 후 재실행 → PASS |
| REQ-011 | 자가 검증 3 it 블록 GREEN — SRC_ROOT / regex 동작 / isAllowed 동작 | (TEST) `no-raw-hex.test.ts` 자가 검증 describe 블록 | `cd apps/mobile && npm test -- src/__tests__/theme/no-raw-hex.test.ts -t "자가 검증"` → 3 passed |
| REQ-012 | 개별 task 회귀 테스트 8개 GREEN — 본 task 가 다른 task 분 손대지 않음 (회귀 0) | (TEST) 개별 회귀 테스트 8 suite 모두 GREEN | `cd apps/mobile && npm test -- src/__tests__/theme/` → 9 test suites (tokens + auth-onboarding-no-raw-hex + paywall + settings-deletion + missing-tokens-applied + m1a + m1b + m1c + shared + no-raw-hex) 전체 GREEN |
| REQ-013 | Epic 12 AC-1 최종 충족 — `apps/mobile/src/` 전체 grep 6/3 자리 hex 0 | (MANUAL) `cd apps/mobile && grep -rE "'#[0-9A-Fa-f]{3,6}'\\|\"#[0-9A-Fa-f]{3,6}\"" src/ --include='*.ts' --include='*.tsx' \\| grep -vE '(theme/tokens\\.ts\\|__tests__\\|__mocks__\\|\\.test\\.\\|\\.spec\\.)'` | 0 매치 PASS |
| REQ-014 | Epic 12 AC-5 충족 — 회귀 방지 테스트 GREEN | (TEST) REQ-009 와 동일 | `cd apps/mobile && npm test` → 전체 suite GREEN (no-raw-hex 포함) |
| REQ-015 | 직접 색·폰트·간격 리터럴 사용 금지 (본 task 변경 2 파일 한정) | (TEST) `no-raw-hex.test.ts` REQ-009 와 동일 — RecordGuide / Record 도 src/ 안 일반 파일 → 통합 검증에 포함 | 2/2 파일 hex 0건 PASS |

## 10. 주의사항

### 10.1 DB 영향도

**없음** — 색상 토큰만 변경. DDL/마이그레이션 0. `docs/db-schema.md` 참조 변경 0.

### 10.2 외부 SDK / API / 라이브러리 영향도

- **react-native-purchases (RevenueCat)**: 변경 0
- **AdMob (rewardedAdService)**: 변경 0
- **AudioEngine / expo-audio**: 변경 0
- **AsyncStorage**: 변경 0
- **expo-file-system**: 변경 0
- **react-navigation**: 변경 0
- **jest / jest-expo**: 신규 테스트 파일 추가만 — 설정 변경 0. `jest.config.js` 의 `testMatch` 가 이미 `**/__tests__/**/*.test.ts` 패턴 포함 → 자동 픽업.
- **Node fs/path 모듈**: `apps/mobile/jest.config.js` 의 `testEnvironment: 'node'` 보장 → 표준 모듈 사용 가능.

### 10.3 회귀 위험 + 완화

- **위험 1 (LOW — hex regex `\b` word boundary 동작)**: `/#[0-9A-Fa-f]{3,6}\b/g` 가 8자리 alpha hex (`#5A7AA824`) 를 매치 *X* 보장? `\b` 는 word char (`[A-Za-z0-9_]`) 와 non-word char 경계 → hex 글자 뒤 hex 글자 = boundary 0 → 매치 X. 검증 완료 — `auth-onboarding-no-raw-hex.test.ts` (task 01) 가 동일 regex 사용 + GREEN 확인.
  - **완화**: `no-raw-hex.test.ts` 자가 검증 3 it 중 "tokens.ts hex 정의 포함" it 가 boundary 동작 간접 검증. tokens.ts 의 alpha hex 8자리 (`#5A7AA824` 등) 가 *6자리로 오인식되어 매치* 시 GREEN 카운트 변동 → 즉시 발견.
- **위험 2 (MEDIUM — task 05 머지 후 상태 불일치)**: 본 task 진입 시점에 task 05 가 *미머지* 또는 *부분 머지* 상태면 RecordGuide / Record 의 useTheme/factory 도입 누락 → 본 task engineer 가 *전체 useTheme + factory 도입 + 4 hex 교체* 책임 도입. PR 변경 라인 수 ↑.
  - **완화**: 본 task 진입 전 task 05 머지 상태 확인 의무 (engineer self-check). branch_prefix `chore/epic12-task09-hex-lint` 의 base = task 08 머지 후 main 최신 (= 모든 선행 task 머지 후 상태).
- **위험 3 (MEDIUM — `successHigh` / `destructiveAction` 라이트값 디자이너 합의 필요)**: §3.3.1 라이트 hex 2개가 architect 1차 추정 (디자이너 부재 컨텍스트). 시각 검수 시 베이지 팔레트 위 불일치 가능.
  - **완화**: REQ-008 라이트 캡처에서 디자이너 합의 항목 표시. 합의 결과 다른 hex 결정 시 tokens.ts lightColors 1줄 수정 → 자동 반영. roll-back 비용 LOW. 별도 PR 가능.
- **위험 4 (LOW — `no-raw-hex.test.ts` 의 false positive 가능성)**: 만약 어떤 파일이 *문자열 안 hex* 를 *의도적으로 데이터* 로 사용 (예: 색상 코드 도큐먼트 / mock API response 등) → 본 테스트가 FAIL.
  - **완화**: 본 task 진입 시점 grep `#[0-9A-Fa-f]{3,6}\b` 결과 = src/ 전체 *의도적 hex 데이터 0건* 확인 (architect 직접 검증). 미래 의도적 hex 필요 시 — `ALLOWED_FILES` 또는 `// eslint-disable-line` 같은 *명시 마커* 도입 (별도 PR — 본 task 범위 외).
- **위험 5 (LOW — `#fff` 처리 누락 시 본 task FAIL)**: task 05 가 `#fff` 처리 누락 시 본 task 의 `no-raw-hex.test.ts` 가 즉시 FAIL → 본 task engineer 가 RecordScreen L512 추가 처리 책임 도입. 본 task PR 범위 확장.
  - **완화**: task 05 plan §3.2.3 가 `#fff` 처리 명시 + task 05 회귀 테스트 (`m1a-core-flow-processed-hex-map.test.ts`) 가 `#fff` 0 검증 가정. task 05 머지 시점 = `#fff` 0 보장.
- **위험 6 (LOW — hex-lint 도입 시 jest suite 실행 시간 증가)**: `collectSourceFiles` 가 src/ 전체 walk (~50~70 파일) → readFileSync 동기 read. 시간 영향 측정 필요.
  - **완화**: ms 단위 예상 (Node fs 동기 read = 파일당 ~0.1ms × 70 = ~7ms). 측정 후 영향 클 시 (예: ≥ 1 초) — recursive read 비동기화 또는 캐시 도입 (별도 PR).
- **위험 7 (LOW — `\b` regex 의 underscore 처리)**: `\b` 는 underscore `_` 를 word char 로 간주 → `#FF4444_foo` 같은 hex+underscore 결합 시 매치 X. 실제 코드에 그런 패턴 등장 0건 직접 grep 확인 → 영향 0.
  - **완화**: regex 강도 ↑ 필요 시 lookahead 도입 (예: `(?![A-Fa-f0-9])`) — 별도 PR 검토. 본 task MVP `\b` 채택.

### 10.4 PR 후 시각 회귀 발견 시 rollback 절차

- `git revert <머지 커밋>` 단일 커밋. tokens.ts 2 토큰 + 2 파일 4 매치 교체 + no-raw-hex.test.ts 통째 원복. tokens.test.ts 갱신도 동시 원복.
- 영향 범위 = tokens.ts + RecordGuide + Record + 신규 테스트. task 01~08 처리 분 영향 0.
- 단 *라이트 hex 만 조정* 시 = revert 불필요. tokens.ts lightColors 1~2줄 수정 → 자동 반영.

### 10.5 PR 단위 권장

- **1 PR (Phase 1 + Phase 2 + Phase 3)** — §3.6 옵션 A.
- 커밋 분할:
  1. tokens.ts 2 토큰 정의 + tokens.test.ts assertion 추가 (Phase 1)
  2. RecordGuideScreen #82B090 → colors.successHigh 교체 + TODO 주석 제거 (Phase 2 일부)
  3. RecordScreen #FF4444 → colors.destructiveAction 교체 + TODO 주석 제거 + (조건부) #fff → colors.textOnAccent
  4. no-raw-hex.test.ts 신규 (Phase 3)
  = 총 4 커밋 권장.

### 10.6 개별 task 회귀 테스트 8개 유지 결정 (병존)

§3.4 결정 = 옵션 B (병존). 본 task `no-raw-hex.test.ts` 와 개별 task `*-processed-hex-map.test.ts` 가 *역할 분리*:

| 테스트 | 역할 | 본 task 영향 |
|---|---|---|
| `auth-onboarding-no-raw-hex.test.ts` (task 01) | M0 인증 8 파일 hex 0 + useTheme 채택 | 변경 0 (유지) |
| `paywall-processed-hex-map.test.ts` (task 02) | 결제 3 파일 토큰 매핑 검증 | 변경 0 (유지) |
| `settings-deletion-processed-hex-map.test.ts` (task 03) | 설정/탈퇴 2 파일 매핑 | 변경 0 (유지) |
| `missing-tokens-applied.test.ts` (task 04) | task 02/03 보류 5 파일 처리 검증 | 변경 0 (유지) |
| `m1a-core-flow-processed-hex-map.test.ts` (task 05) | M1 핵심 4 파일 매핑 | 변경 0 (유지) |
| `m1b-play-pending-nav-processed-hex-map.test.ts` (task 06) | M1 재생 5 파일 매핑 | 변경 0 (유지) |
| `m1c-back-nav-hook-processed-hex-map.test.ts` (task 07) | useBackNavigation + 2 컴포넌트 매핑 | 변경 0 (유지) |
| `shared-components-processed-hex-map.test.ts` (task 08) | 공유 6 컴포넌트 + 누적 보류 매핑 | 변경 0 (유지) |
| **`no-raw-hex.test.ts` (task 09 — 신규)** | **앱 전체 1차 방어선 — 미래 PR 차단** | **신규 추가** |

미래 cleanup PR 에서 개별 테스트 hex 0 assertion 부분만 제거하고 positive assertion (토큰 매핑 / useTheme 검증) 만 유지 가능 — 본 task PR 범위 외.

### 10.7 task 05 머지 상태 확인 절차 (engineer self-check)

본 task PR 진입 전 engineer 가:

```bash
cd apps/mobile
# task 05 처리 분 useTheme 채택 확인
grep -E 'useTheme\(' src/screens/RecordGuideScreen.tsx | wc -l  # ≥1 기대
grep -E 'useTheme\(' src/screens/RecordScreen.tsx       | wc -l  # ≥1 기대

# task 05 처리 분 makeStyles factory 확인 (또는 inline + colors)
grep -E '(makeStyles|colors\.)' src/screens/RecordGuideScreen.tsx | wc -l  # ≥3 기대
grep -E '(makeStyles|colors\.)' src/screens/RecordScreen.tsx       | wc -l  # ≥3 기대

# 보류 hex 위치 확인
grep -nE "'#82B090'" src/screens/RecordGuideScreen.tsx   # L302, L310 기대
grep -nE "'#FF4444'" src/screens/RecordScreen.tsx        # L497, L505 기대
```

위 4 grep 결과 = 기대값 일치 시 task 05 머지 후 상태. 불일치 시 본 task §10.7 위험 2 분기 — engineer 가 task 05 미머지 발견 → 본 task 보류 또는 책임 확장 결정.

## 11. 의존성

- **선행 task**: task 08 (`08-shared-components.md`) — 본 task 진입 시 task 08 머지 후 main 상태. tokens.ts = 27 토큰 (15 + 9 + 3). 잔여 hex = 2 고유 / 4 매치.
- **선행 task 05**: RecordGuide / Record 의 useTheme + factory 도입 책임 — 본 task §3.5 / §10.7 명시.
- **후행**: 없음 (Epic 12 마지막 task). 본 task PR 머지 = Epic 12 종료.
- **외부**: 없음.

## 12. 게이트 self-check (architect/module-plan SOP 12 항목)

| # | 항목 | 충족 | 비고 |
|---|---|---|---|
| 1 | 생성/수정 파일 목록 확정 | ✓ | §2.2 — tokens.ts + tokens.test.ts + RecordGuide + Record + no-raw-hex.test.ts |
| 2 | 인터페이스 TypeScript 타입 명시 | ✓ | §4.1 ColorTokens 신규 2 토큰 + §4.2 darkColors/lightColors hex |
| 3 | 의존 모듈 실제 인터페이스 직접 확인 | ✓ | tokens.ts (27 토큰 = 15+9+3) / useTheme.ts / tokens.test.ts (29 키셋 = 27+2) / RecordGuide L302/L310 / Record L497/L505 + L512 모두 read 완료. task 05/08 plan 의 보류/위임 명시 인용. jest.config.js (testMatch + testEnvironment: 'node') read 완료. |
| 4 | 에러 처리 명시 | ✓ | useTheme 항상 valid ColorTokens (변경 0). tokens.test.ts 갱신 시 카운트 mismatch 발견 시 즉시 RED. no-raw-hex.test.ts 의 violations.length > 0 시 throw + 위치 노출. |
| 5 | 페이지 전환·상태 초기화 순서 | N/A | 본 task = 색상 토큰 + 교체 + 회귀 테스트. 화면 동작 변경 0 |
| 6 | DB 영향도 분석 | ✓ | 없음 (§10.1) |
| 7 | Breaking Change 검토 | ✓ | 없음 (§6) — ColorTokens 타입 *추가* 만, 기존 키 변경 0. 외부 export 시그니처 0 변경 |
| 8 | 핵심 로직 의사코드 | ✓ | §5 (Phase 1 5단계 + Phase 2 4단계 + Phase 3 4단계 + 검증 3단계) |
| 9 | TypeScript 타입 정합 | ✓ | ColorTokens 2 신규 키 모두 string (옵셔널 X). useTheme 자동 노출. fs.readdirSync 의 `withFileTypes: true` 옵션 = `Dirent[]` 반환 명시. |
| 10 | import 완전성 | ✓ | tokens.ts 변경, RecordGuide/Record import 변경 0 (task 05 머지 후 useTheme import 존재 가정). no-raw-hex.test.ts 의 `import * as fs from 'fs'` + `import * as path from 'path'` 명시. |
| 11 | 수용 기준 + 메타데이터 | ✓ | §9 표 15 행 (REQ-001 ~ REQ-015) + frontmatter |
| 12 | 모듈 = 테스트 단위 정합 | ✓ | §8 self-check 3 항목 모두 ✓ |

추가 게이트 (epic-12 한정):
- **system-design §8 Option α 정합**: ✓ NN=09, 슬러그 = `regression-test-jest-hex-lint` (system-design impl 목차 표 행과 정확 일치).
- **잔여 보류 hex 일괄 해소**: ✓ §2.0 표 — 4 매치 (`#82B090` ×2 + `#FF4444` ×2) 본 task 머지 시점에 0.
- **다크 회귀 0**: ✓ §3.5 + REQ-002 (다크 hex = 발견 hex 그대로) + REQ-007 (시각 검증).
- **라이트 1차 결정값 근거**: ✓ §3.3.1 (팔레트 정합 + 의도 보존 2 항목 인용).
- **Jest 옵션 A 채택**: ✓ §3.1 (system-design §5 표 인용 + jest.config.js 직접 검증).
- **통합 vs 병존 결정**: ✓ §3.4 (옵션 B 병존 — 5 근거 명시).
- **AC-1 / AC-5 최종 충족**: ✓ REQ-013 + REQ-014 (Epic 12 종료 시점).
- **디자인 토큰 의존성 가드레일**: 본 task = tokens.ts 정의 task → 직접 hex 사용 정당. RecordGuide/Record 적용에서는 hex 0건 강제 (REQ-005/006/015).

---

## 13. 결론 + 권장 다음 단계

본 module-plan 은 system-design §8 Option α 의 마지막 task (NN=09 `regression-test-jest-hex-lint`) 의 본문을 채운 산출물이다. **Phase 1 = `tokens.ts` 에 ColorTokens 신규 2 토큰 (`successHigh` / `destructiveAction`) 추가** + darkColors / lightColors 양쪽 hex 정의 + tokens.test.ts 갱신 (29 키셋). **Phase 2 = RecordGuideScreen / RecordScreen 의 잔여 4 매치 (`#82B090` × 2 + `#FF4444` × 2) 신규 토큰 참조로 일괄 교체** + TODO 주석 제거. **Phase 3 = `__tests__/theme/no-raw-hex.test.ts` 신규 작성 — `apps/mobile/src/` 전체 walk + `/#[0-9A-Fa-f]{3,6}\b/g` regex 검출 + 예외 등재 (tokens.ts / __tests__ / __mocks__ / *.test.* / *.spec.*) + violations 위치 노출**. PR 단위 = 3 Phase 1 PR (옵션 A) 권장. 변경 라인 수 ~80~100. 4 커밋 분할.

토큰 2종 다크 hex = task 05 §3.2.3 발견 hex 그대로 (회귀 0). 라이트 hex = architect 1차 추정 (§3.3.1 베이지 팔레트 위 권고 톤 / 위험 액션 강도 보존). hex-lint 통합 테스트 vs 개별 task 테스트 = **병존 결정 (§3.4 옵션 B)** — 5 근거 (positive assertion 보존 / 역할 분리 / 변경 비용 LOW / CI 시간 미미 / 미래 Epic 호환). Jest 옵션 A 채택 (system-design §5 인용 + `apps/mobile/jest.config.js` 직접 검증).

DB / API / 외부 SDK / navigation / Breaking Change 영향 0. ColorTokens 타입 추가 키만 → 기존 useTheme 호출자 영향 0. **AC-1 (직접 hex 0건) + AC-5 (회귀 방지 테스트 GREEN) = 본 task PR 머지 시점에 동시 충족**. M0 + M1 + 공유 컴포넌트 + 잔여 4 매치 = `apps/mobile/src/` hex 0건. v1 라이트 모드 출시 차단 회귀 = 본 task 머지 후 영구 해소. **본 task PR 머지 = Epic 12 (Theme Drift Fix) 종료 시점**.

12 게이트 + epic-12 추가 8 게이트 모두 통과. **상태 = READY_FOR_IMPL**.

권장 다음 단계 — system-design §8 impl 목차 마지막 행 = task 09. 본 task = Epic 12 마지막 task → 다음 단계는 *impl 진입*. 사용자가 `/impl-loop` (전체 미실행 task 일괄) 또는 `/impl 09-regression-test-jest-hex-lint` (본 task 단독) 호출 시 dcness 표준 루프 (test-engineer → engineer → validator CODE_VALIDATION → pr-reviewer) 진입. 본 task PR 머지 후 CLAUDE.md / backlog.md 의 Epic 12 행을 *완료* 로 갱신 권장. Epic 12 종료 후 후속 Epic 16 (Pencil 매핑 확장) 또는 접근성 Epic (WCAG AA 대비) 후보 — PRD §9 참조.
