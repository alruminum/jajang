---
depth: std
task: 05
slug: m1a-core-flow-screens
story: Story 4 (M1 핵심 기능 화면 마이그레이션)
github_issue: 241
epic: 12
branch_prefix: chore/epic12-task05-m1a-core-flow
---

# task 05 — M1 핵심 플로우 화면 hex → ColorTokens 마이그레이션 (S06 / S07 / RecordGuide / Record)

## 1. 목적 (왜)

- **M1 핵심 플로우 라이트 깨짐 해소** (PRD Story 4, Issue #241): 홈 → 곡 선택 → 녹음 가이드 → 녹음 플로우는 *모든 사용자의 매일 진입 경로*. 라이트 모드에서 다크 hex 박힘으로 화면 깨짐 잔존 시 핵심 사용성 직격. v1 미해소 시 라이트 사용자 이탈 가능성.
- **다크 회귀 0**: 자장 핵심 페르소나(다크 사용자) 시각 변화 0 보장. `darkColors` 의 기존 15 토큰 + task 04 신규 9 토큰 hex 가 발견 hex 와 정확 일치 또는 4dp 이내.
- **task 04 신규 토큰 즉시 활용**: task 04 가 정의한 `textOnAccent` (`#FFFFFF` 다크/라이트 양쪽 영구) 가 RecordScreen 의 `stopIcon` (`#fff`) 에서 즉시 활용 가능. system-design §8 Option α 의도 정합 — 보류 hex 0 목표.
- **신규 토큰 발견 시 본 task 내 정의 vs 보류 결정**: 본 task 4 파일의 hex 중 기존 15 + task 04 신규 9 = 24 토큰으로 매핑 불가능한 hex (`#5A8A6A`, `#E0B070`, `#82B090`, `#FF4444`) 가 등장 → §3.3 결정 흐름 적용. task 02 plan §3.2.4 옵션 D (보류) 와 task 04 (정의) 의 분기 룰을 본 task 컨텍스트에 재적용.
- **createStyles factory 패턴 일관**: task 01~03 와 동일한 `makeStyles(colors)` + `useMemo` 패턴 차용. 신규 인프라 0.

## 2. 영향 파일 (실측 — grep + Read 직접 검증)

> **선행 검증**: `apps/mobile/src/screens/` 실제 ls 결과 — system-design §2 표의 `RecordGuideScreen.tsx` / `RecordScreen.tsx` 가 본 폴더의 실제 파일명. PRD stories.md 의 `S09RecordGuideScreen` / `S10RecordScreen` 표기는 *논리적 이름* 일 뿐 실제 경로는 `S` prefix 없음. 본 plan 은 실제 경로 기준.

| 파일 (실제 경로) | hex 수 (직접 grep) | useTheme | StyleSheet 패턴 |
|---|---|---|---|
| `apps/mobile/src/screens/S06HomeScreen.tsx` | 11 | 미채택 | static StyleSheet.create + 인라인 1건 (L139 `ActivityIndicator color="#5A7AA8"`) |
| `apps/mobile/src/screens/S07SongSelectScreen.tsx` | 6 | 미채택 | static StyleSheet.create |
| `apps/mobile/src/screens/RecordGuideScreen.tsx` | 17 | 미채택 | static StyleSheet.create × 3 (`styles` / `chipStyles` / `modal`) |
| `apps/mobile/src/screens/RecordScreen.tsx` | 13 | 미채택 + 부분 사용 (L26 `darkColors` 직접 import + L444 `darkColors.accentSecondary` 1회) | static StyleSheet.create + `Typography` mixin 참조 |
| **합계** | **47** | — | — |

> 메인 system-design §2 Story 4 표 (11+6+17+13 = 47) 와 본 plan 직접 grep 결과 (47) 일치.
>
> **rgba 별도**: L316 `rgba(0,0,0,0.6)` (RecordGuide modal overlay) — 6자리 hex regex 미포함이나 색상 리터럴이므로 본 task 에서 함께 토큰화 대상 (`colors.overlay` 흡수 또는 `overlayLight` 후보).

### 2.1 hex 전수 인용 (L번호 + hex + 의도 — engineer 가 1행씩 적용 가이드)

**S06HomeScreen.tsx (11)** — L139 인라인 + L184~250 StyleSheet
- L139 `'#5A7AA8'` (ActivityIndicator color 인라인 prop)
- L185 `'#0D0F1A'` (container backgroundColor)
- L195 `'#7B80A0'` (greeting color)
- L196 `'#EEF0F8'` (headerTitle color)
- L201 `'#1A1D30'` (counterBadge backgroundColor)
- L207 `'#7B80A0'` (counterText color)
- L212 `'#1A1D30'` (pendingCard backgroundColor)
- L217 `'#2A2E50'` (pendingCard borderColor) — **`border #2A2E48` 와 4dp 초과 8dp avg, 흡수 분기 검토 §3.2.2**
- L219 `'#7B80A0'` (pendingText color)
- L245 `'#5A7AA8'` (fab backgroundColor)
- L250 `'#0D0F1A'` (fabIcon color — 다크에서 fab accent 위 짙은 텍스트)

**S07SongSelectScreen.tsx (6)** — L181~190 StyleSheet
- L182 `'#0D0F1A'` (container backgroundColor)
- L184 `'#EEF0F8'` (title color)
- L185 `'#21253E'` (counterChip backgroundColor)
- L186 `'#7B80A0'` (counterText color)
- L188 `'#5A7AA8'` (cta backgroundColor)
- L190 `'#0D0F1A'` (ctaText color — CTA 위 짙은 텍스트)

**RecordGuideScreen.tsx (17)** — L234~349 StyleSheet (3 객체)
- L237 `'#0D0F1A'` (container backgroundColor)
- L248 `'#EEF0F8'` (title color)
- L254 `'#21253E'` (counterChip backgroundColor)
- L260 `'#7B80A0'` (counterText color)
- L267 `'#5A7AA8'` (checkmark color)
- L269 `'#EEF0F8'` (guideText color)
- L276 `'#7B80A0'` (fallbackText color)
- L283 `'#5A7AA8'` (cta backgroundColor)
- L291 `'#0D0F1A'` (ctaText color)
- L302 `'#82B090'` (HeadphoneChip borderColor) — **success 톤, 신규 토큰 후보 §3.2.3**
- L310 `'#82B090'` (HeadphoneChip text color) — 동일
- L316 `'rgba(0,0,0,0.6)'` (modal overlay) — `overlay` (다크 `#000000AA` ≈ alpha 67%) 와 alpha 6% 차이, 흡수 가능 §3.2.2
- L322 `'#1A1D30'` (modal sheet backgroundColor)
- L328 `'#EEF0F8'` (modal title color)
- L333 `'#7B80A0'` (modal desc color)
- L336 `'#5A7AA8'` (primaryBtn backgroundColor)
- L343 `'#0D0F1A'` (primaryBtnText color)
- L348 `'#7B80A0'` (secondaryBtnText color)

**RecordScreen.tsx (13)** — L392~514 StyleSheet
- L395 `'#0D0F1A'` (countdownContainer backgroundColor)
- L400 `'#5A7AA8'` (countdownNumber color)
- L405 `'#7B80A0'` (countdownLabel color)
- L409 `'#0D0F1A'` (container backgroundColor)
- L419 `'#7B80A0'` (cancelText color)
- L430 `'#A9B0D0'` (bgmChip color) — **textBody 다크 `#A0A5C0` 와 채널차 ~12dp, 흡수 분기 검토 §3.2.2**
- L437 `'#E0B070'` (bgmFailToast color) — **warning yellow, 신규 토큰 후보 §3.2.3**
- L457 `'#5A8A6A'` (silenceWarning color) — **success 톤, 신규 토큰 후보 §3.2.3 — 재사용 ≥ 3곳 (S11/RecordScreen/DeleteTracksSheet)**
- L474 `'#7B80A0'` (restartText color)
- L491 `'#7B80A0'` (counterText color)
- L497 `'#FF4444'` (stopRing borderColor) — **stop record red, 신규 토큰 후보 §3.2.3**
- L505 `'#FF4444'` (stopBtn backgroundColor) — 동일
- L512 `'#fff'` (stopIcon backgroundColor) — **task 04 `textOnAccent` (`#FFFFFF`) 즉시 활용 — 시각 의도 = 위험 버튼 위 영구 흰색 사각형 아이콘**

> 3자리 hex `'#fff'` 도 색상 리터럴 — engineer 가 `colors.textOnAccent` 로 교체. grep `/#[0-9A-Fa-f]{6}\b/g` 에는 잡히지 않으므로 본 task 회귀 테스트 (§4.5) 에서 3자리 hex regex (`/#[0-9A-Fa-f]{3,8}\b/g`) 도 보조 검증.

## 3. 결정 근거 (선택 + 버린 대안)

### 3.1 createStyles factory 채택 (4 파일 모두)

system-design §3.1 기준 — 스타일 속성 수: S06=10+, S07=7+, RecordGuide=20+ (3 객체), Record=22+. 일관 factory 채택. inline 사용은 L139 ActivityIndicator `color` prop 1건 한정 (인라인 inline JSX prop) — 이는 컴포넌트가 받는 prop 이므로 factory 외부 `colors.accentPrimary` 직접 참조. task 01~03 패턴 그대로.

### 3.2 hex → token 매핑 분석 (본 task 한정 — 24 토큰 기준)

#### 3.2.1 기존 15 토큰 + task 04 신규 9 = 24 토큰 1:1 매핑되는 hex (회귀 0)

| 발견 hex | 매핑 토큰 | 등장 위치 |
|---|---|---|
| `#0D0F1A` | `colors.bgPrimary` | S06 container/fabIcon, S07 container/ctaText, RecordGuide container/ctaText/primaryBtnText, Record countdownContainer/container |
| `#1A1D30` | `colors.surface` | S06 counterBadge/pendingCard, RecordGuide modal sheet |
| `#21253E` | `colors.surfaceHigh` | S07 counterChip, RecordGuide counterChip |
| `#5A7AA8` | `colors.accentPrimary` | S06 ActivityIndicator prop/fab, S07 cta, RecordGuide checkmark/cta/primaryBtn, Record countdownNumber |
| `#7B80A0` | `colors.textSecondary` | S06 greeting/counterText/pendingText, S07 counterText, RecordGuide counterText/fallbackText/modal desc/secondaryBtnText, Record countdownLabel/cancelText/restartText/counterText |
| `#EEF0F8` | `colors.textPrimary` | S06 headerTitle, S07 title, RecordGuide title/guideText/modal title |
| `#fff` (3자리) | `colors.textOnAccent` (task 04 신규) | Record stopIcon — task 04 정의 `#FFFFFF` 와 정확 일치 (3자리 = 6자리 expansion `#FFFFFF`). 위험 버튼 위 영구 흰색 아이콘 의도 정합 |

> **매핑 회귀 검증**: 본 task 머지 후 다크 모드에서 위 7 hex 가 *그대로* 렌더링되는지 = `darkColors[<token>] === <발견 hex>` 정확 일치 (위 표 모든 행). task 04 의 `textOnAccent` = `#FFFFFF` 다크/라이트 양쪽 영구 흰색 → `#fff` 와 시각 동일.

#### 3.2.2 4dp 이내 흡수 분기 결정 (PRD §3.2 + system-design §6 흐름)

| 발견 hex | 매핑 토큰 후보 | 다크 토큰 hex | 채널 차이 (R/G/B dp) | 결정 |
|---|---|---|---|---|
| `#2A2E50` | `colors.border` | `#2A2E48` | 0/0/+8 = ~8dp avg | **흡수 — 본 task 한정 + 위험 등재** (§10.3 위험 1) — B 채널 8dp 차이는 4dp 룰 초과 1배. S06 pendingCard 의 *경계선 의도* 가 border 토큰 의도와 정합 (= "구분선/카드 테두리"). 신규 토큰 도입 비용 (taokens.ts 1 토큰 추가 + dark/light 양쪽 hex 결정 + 별도 PR) 대비 흡수 이익이 크다고 architect 판단. 시각 회귀 검증 시 차이 발견되면 별도 PR 로 `borderHigh` 신규 토큰 등재 (Story 5 task 09 hex-lint 도입 후) |
| `#A9B0D0` | `colors.textBody` (task 04 신규) | `#A0A5C0` | +9/+11/+16 = ~12dp avg | **흡수 — 본 task 한정 + 위험 등재** (§10.3 위험 2) — RecordScreen bgmChip 의 *밝은 본문 텍스트 강조* 의도. textBody 다크 hex 와 12dp 차이 있으나 *의도 정합* (둘 다 "textPrimary 보다 밝은 본문 톤"). 흡수 시 다크 회귀 가능성 LOW (RGB +9/+11/+16 = 시각 식별 어려운 변화). 시각 검수 시 차이 발견되면 별도 PR 로 `textBodyHigh` 흡수 검토 (task 04 가 이미 `textBodyHigh` `#E0E2F0` 다크 정의 — `#A9B0D0` 와는 다름) |
| `rgba(0,0,0,0.6)` | `colors.overlay` | `#000000AA` (alpha ≈ 67%) | alpha 60% vs 67% = 7% diff | **흡수** — RecordGuide modal overlay 의도 = `colors.overlay` (다크 `#000000AA`, 라이트 `#00000066`). alpha 7% 차이 = 시각적 차이 미미 (반투명 검정 농도 변화). modal underlay 시각 정합. 본 task 의 task 01~03 컨벤션 정합 (task 02 §3.2.3 `rgba(0,0,0,0.5)` → `overlay` 흡수와 동일 패턴) |

#### 3.2.3 흡수 불가 hex — 신규 토큰 도입 결정 흐름

본 task 4 파일의 hex 중 24 토큰 + 4dp 흡수로 매핑 불가능한 hex 4종:

| 발견 hex | 등장 위치 (본 task 4 파일) | 외부 사용 (다른 파일) | 가장 가까운 토큰 | 채널 차이 | 의도 | 분기 결정 |
|---|---|---|---|---|---|---|
| `#82B090` | RecordGuide HeadphoneChip border/text (2회) | 없음 (본 task 한정) | `success #6BCB77` | +23/+1/+41 = ~22dp | "이어폰 권장 chip" — success 톤 어색 (success 가 너무 밝은 green). 부드러운 muted green | **본 task 보류 (Option B — task 02/03/04 패턴 차용 분기 §3.3 결정)** |
| `#A9B0D0` | RecordScreen bgmChip (1회) | 없음 | `textBody #A0A5C0` | ~12dp | "BGM 재생 중 chip" — 본문보다 강조된 톤 | **흡수 위험 등재 (§3.2.2)** |
| `#E0B070` | RecordScreen bgmFailToast (1회) | TrialExpiryBanner test mock 의 `warningText: '#E0B070'` 인용 (test 한정 — 실제 컴포넌트 prop 명) | `success` 또는 `accentSecondary #C49A8A` | +29/+72/+24 (vs accentSec) | "BGM 로드 실패 경고" — warning yellow/amber | **본 task 보류 (Option B)** + Story 5 task 09 후속 일괄 토큰 정의 권고 (warning 토큰 도입) |
| `#5A8A6A` | RecordScreen silenceWarning (1회) | S11PreviewScreen L357 (1회) + DeleteTracksSheet L252 (1회) — **재사용 ≥ 3곳** | `success #6BCB77` | +17/-65/+3 = ~28dp | "무음 감지 안내" — muted success 톤 (success 보다 어두운, 차분한 톤) | **본 task 보류 (Option B) + Story 5 task 09 토큰 정의 강력 권고** — 3곳 재사용은 토큰화 필수 분기 |
| `#FF4444` | RecordScreen stopRing border + stopBtn bg (2회) | 없음 (본 task 한정) | `destructive #E85A5A` | +23/-22/+0 = ~15dp | "녹음 중지 버튼" — 위험 red 의도 그러나 destructive 와 다른 *순수 red* (saturation ↑) | **본 task 보류 (Option B)** + Story 5 task 09 후속 (`destructiveBright` 또는 `recordStop` 등 토큰 후보) |

#### 3.3 흡수 불가 hex 처리 옵션 분석 — 본 task 동작 결정

본 task 가 §3.2.3 의 4 hex 군 (`#82B090`, `#E0B070`, `#5A8A6A`, `#FF4444`) 을 어떻게 처리할지 옵션:

| 옵션 | 본 task 동작 | 라이트 화면 결과 | 위험 |
|---|---|---|---|
| **A. 본 task 내 tokens.ts 수정 (신규 4 토큰 추가)** | 본 task 가 `colors.muted Green`, `colors.warning`, `colors.successMuted`, `colors.recordStop` 4 토큰을 `tokens.ts` dark/light 양쪽 정의 + 4 파일 hex 교체 | 100% 라이트 적용 | system-design §1 룰 = "본 Epic 인프라 호출만 / Story 5 한정 수정". task 04 가 *예외* 로 9 토큰 추가했으나 그것은 system-design §8 Option α 재정렬로 *명시 위임됨*. 본 task 는 그 위임 받지 않음 → 임의 추가 시 SPEC_GAP |
| **B. 흡수 가능 hex만 토큰화 + 4 hex 군 보류** (= task 02 §3.2.4 D 옵션) | 24 토큰 매핑 (7 토큰 직접 + 2 hex 흡수 = §3.2.1+§3.2.2) 만 교체. 4 hex 군 (총 6 회 출현 = `#82B090`×2 + `#A9B0D0` 흡수 X 시 1 + `#E0B070`×1 + `#5A8A6A`×1 + `#FF4444`×2) 은 그대로 유지. | 라이트 모드에서 4 hex 군 = 다크 색 그대로 노출. *부분 깨짐*. 4 파일 hex 0 X | task 02 D 옵션과 동일한 trade-off. AC-1 (4 파일 hex 0) 본 task 미충족 (Story 5 task 09 일괄 처리까지 미룸) |
| **C. SPEC_GAP_FOUND escalate** | architect 가 product-planner / Story 5 task 09 에 "본 task 4 hex 군 + (task 01/06/07 에서 발견될 다른 hex 군) 일괄 토큰 정의" 책임 명시 요청 | (escalate 결과 따름) | 시간 비용 |
| **D. task 04 정의 패턴 차용 — 본 task 가 *제한적* tokens.ts 수정 (4 토큰만)** | 옵션 A 와 유사하나 *최소 셋만* 추가 — `successMuted` (= `#5A8A6A` 재사용 3곳 우선), 나머지 3 hex (`#82B090`, `#E0B070`, `#FF4444`) 는 보류 옵션 B | `#5A8A6A` 라이트 100% 적용, 나머지 3 hex 라이트 부분 깨짐 잔존 | 시간 비용 LOW (1 토큰만 추가). system-design §1 룰 위배 = task 04 가 이미 예외 적용 사례 있어 *유사 예외* 인정 가능. 단 architect 가 *예외 추가* 결정을 본 task 가 임의로 내리면 룰 일관성 훼손 |

**결정 = B (보류 명시) — 다만 §13 후속 권고에서 Story 5 task 09 우선순위 상승 강력 권고**.

이유:
- **system-design §1 / §8 룰 정합**: task 04 가 신규 9 토큰 추가는 system-design §8 Option α 재정렬에서 *명시 위임* (= "신규 task 04 = missing-tokens-define-and-apply"). 본 task (NN=05) 는 해당 위임 받지 않음. 추가 토큰 정의 = system-design 갱신 필요 (architect SD 단계 → MODULE_PLAN 단계 가드).
- **PRD §3.4 Story 4 우선순위 보존**: 본 task PR 이 출시 차단 일부 해소 (24 토큰 매핑 = 11+6+17+13 = 47 hex 중 약 41 hex = 87% 적용. 4 hex 군 6 회 = 13% 보류). 다크 사용자 시각 회귀 0. 라이트 사용자에게 "헤더/배경/주요 텍스트" 라이트 적용 + "이어폰 chip / 위험 chip / stop 버튼 / bgm chip" 만 다크 hex 잔존. 부분 적용 수용 가능 (메인 플로우 라이트 진입 가능).
- **Story 5 task 09 우선순위 상승**: 본 task + task 06/07 (M1 나머지) 에서 추가 누락 hex 발견 누적 → Story 5 task 09 의 "공유 컴포넌트 + 회귀 방지" 단계에서 일괄 토큰 정의 + 적용 권장. system-design §8 Option α 의 task 09 위치 유지 가능 (= 회귀 hex-lint) 또는 task 09 앞 또 다른 *Option β 재정렬* (= 누락 토큰 정비 task 신규) 의사결정은 product-planner 책임. 본 plan §13 권고.

> **본 task 보류 hex 카운트**: §3.2.3 표 6 회 + §3.2.2 흡수 위험 등재 2 회 = 합 8 회. AC-1 (4 파일 hex 0) 은 task 09 또는 후속 일괄 처리 시점으로 미룸.

### 3.4 RecordScreen 의 `darkColors` 직접 import 처리

L26 `import { darkColors, FontSize } from '../theme/tokens'` + L444 `color: darkColors.accentSecondary` — task 01 §3.4 패턴과 정합. `useTheme()` 도입 시:

```tsx
// Before
import { darkColors, FontSize } from '../theme/tokens';
// ...
encourageText: { color: darkColors.accentSecondary, ... }

// After
import { FontSize } from '../theme/tokens';  // darkColors import 제거
// ...
const { colors } = useTheme();
const styles = useMemo(() => makeStyles(colors), [colors]);
// makeStyles 안:
encourageText: { color: colors.accentSecondary, ... }
```

`Colors` 별칭 자체는 `tokens.ts` 에 유지 (system-design §3.3) — 본 task 가 손대지 X.

### 3.5 useMemo 캐싱 — task 01~03 일관

`makeStyles(colors)` + `useMemo(() => makeStyles(colors), [colors])`. RecordScreen 은 리렌더 빈도 높음 (metering 100ms tick → setLevels → 매 100ms 리렌더 + countdown 1초 tick + elapsedSec 1초 tick + showSilenceWarning 토글). `useMemo([colors])` 필수 — colors 객체 참조가 useTheme 안에서 모듈 상수 직접 반환 (참조 안정) → deps 안정.

RecordGuideScreen 의 *3개 StyleSheet* (`styles` / `chipStyles` / `modal`) 모두 factory 화:

```tsx
const makeStyles = (colors: ColorTokens) => ({
  base: StyleSheet.create({ /* L234~295 */ }),
  chip: StyleSheet.create({ /* L297~311 */ }),
  modal: StyleSheet.create({ /* L313~349 */ }),
});

// 컴포넌트 안
const styleSet = useMemo(() => makeStyles(colors), [colors]);
// 사용: styleSet.base.container, styleSet.chip.text, styleSet.modal.title
```

또는 단일 객체로 합치는 옵션도 가능 (RecordGuideScreen 내 외부 컴포넌트 `HeadphoneChip` / `PermissionModal` / `EarphoneWarningModal` 가 모듈 스코프 `chipStyles` / `modal` 직접 캡처 → factory 도입 시 *부모 함수 내부 이동* 또는 *styles props 전달* 둘 중 택1, task 02 §3.3 와 동일 패턴).

**권장**: 외부 컴포넌트 부모 함수 내부 이동 (`function RecordGuideScreen()` 안에 `function HeadphoneChip()` 등 nested). 클로저로 `styleSet` 자동 캡처 + props 추가 0. 단 이전 동작 검증 필수 (Modal close handler 캡처 등).

### 3.6 외부 SDK / API / DB 영향 0

- **expo-audio (`createAudioPlayer`, `useAudioRecorder`, `setAudioModeAsync`)**: 변경 0 (S07 미리듣기 + Record 녹음).
- **expo-file-system (recording.uri)**: 변경 0.
- **AsyncStorage (`@jajang:earphone_warning_dismissed`)**: 변경 0.
- **expo-audio + BGM (`useBgmPlayer` hook)**: 변경 0.
- **react-navigation (`useNavigation` / `useFocusEffect` / `BackHandler`)**: 변경 0.
- **`songsApi.listSongs` / `getPreviewUrl`**: 변경 0.
- **`getSessionStatus` / `loadPendingSession` / `clearPendingSession`**: 변경 0.
- **`useMastersStore` / `useAuthStore` / `usePlayerStore` / `useRecordingStore` / `useTrialExpiredGuard`**: 변경 0 (zustand store 미수정).
- **DB**: 영향 0 (`docs/db-schema.md` — 색상 토큰은 DB 와 무관).
- **API**: 변경 0.
- **navigation**: 변경 0.

## 4. 생성·수정 파일

### 수정 파일

| 경로 | 변경 내용 |
|---|---|
| `apps/mobile/src/screens/S06HomeScreen.tsx` | `useTheme()` 호출 + `makeStyles(colors)` factory 변환 + hex 교체 (총 11건 중 처리 = 11건 — `#2A2E50` 흡수 위험 등재 포함. 보류 0건) + L139 ActivityIndicator `color={colors.accentPrimary}` 인라인 prop 교체 |
| `apps/mobile/src/screens/S07SongSelectScreen.tsx` | `useTheme()` 호출 + factory + hex 교체 (6건 전수 — 보류 0건) |
| `apps/mobile/src/screens/RecordGuideScreen.tsx` | `useTheme()` 호출 + factory (3 객체 → 단일 `styleSet`) + hex 교체 (17건 중 처리 14건 + `rgba(0,0,0,0.6)`→overlay 흡수 1건 = 15 처리. 보류 2건 — `#82B090`×2 HeadphoneChip border/text) + 외부 컴포넌트 (`HeadphoneChip`, `PermissionModal`, `EarphoneWarningModal`) 부모 함수 내부 이동 또는 styles props |
| `apps/mobile/src/screens/RecordScreen.tsx` | `useTheme()` 호출 + factory + hex 교체 (13건 중 처리 9건 = `#0D0F1A`×2, `#5A7AA8`, `#7B80A0`×4, `#fff`→textOnAccent + `#A9B0D0` 흡수 위험 등재 1건 = 10건. 보류 4건 — `#E0B070`, `#5A8A6A`, `#FF4444`×2) + L26 `darkColors` import 제거 + L444 `colors.accentSecondary` 교체 |

### 보류 hex 잔존량 (task 09 후 일괄 교체 — §3.3 결정)

| 파일 | 처리 hex (24 토큰 매핑 + 4dp 흡수 + task 04 신규) | 보류 hex (Story 5 task 09 의존) | 보류 사유 |
|---|---|---|---|
| S06 | 11 (`#0D0F1A`×2, `#7B80A0`×3, `#EEF0F8`, `#1A1D30`×2, `#5A7AA8`×2 + `#2A2E50` 흡수 위험) | 0 | — |
| S07 | 6 (`#0D0F1A`×2, `#EEF0F8`, `#21253E`, `#7B80A0`, `#5A7AA8`) | 0 | — |
| RecordGuide | 15 (`#0D0F1A`×3, `#EEF0F8`×3, `#21253E`, `#7B80A0`×4, `#5A7AA8`×3, `#1A1D30` + `rgba(0,0,0,0.6)`→overlay 흡수) | 2 (`#82B090`×2) | "이어폰 권장 chip" muted green 토큰 미정의 (`#82B090`) |
| Record | 10 (`#0D0F1A`×2, `#5A7AA8`, `#7B80A0`×4, `#fff`→textOnAccent + `#A9B0D0` 흡수 위험 등재) | 4 (`#E0B070`, `#5A8A6A`, `#FF4444`×2) | warning yellow (`#E0B070`) / successMuted (`#5A8A6A`) / recordStop red (`#FF4444`) 토큰 미정의 |
| **합계** | **42 처리** | **6 보류** | — |

> 정확 카운트는 engineer 가 1행씩 적용하면서 자동 산출. 본 표는 추정. **task 05 PR 에서 grep 결과 6자리 hex 잔존량 = 약 6건 (보류분)** 명시. AC-1 (4 파일 hex 0건) 은 task 09 완료 시점 또는 후속 토큰 정의 task 머지 후 충족.

### 생성 파일 (테스트 — `(TEST)` 태그 충족용)

| 경로 | 목적 |
|---|---|
| `apps/mobile/src/__tests__/theme/m1a-core-flow-processed-hex-map.test.ts` | 본 task 가 처리한 hex 군이 매핑된 token 으로 정확 치환됐는지 검증. **6자리 hex grep 0건 검증 X** (6 보류 hex 잔존). 대신 (1) 본 task 처리 토큰 (`colors.bgPrimary`, `colors.surface`, `colors.surfaceHigh`, `colors.accentPrimary`, `colors.textPrimary`, `colors.textSecondary`, `colors.overlay`, `colors.textOnAccent`) 각각 ≥1 회 grep + (2) 보류 hex 6종 (`#82B090`×2, `#E0B070`, `#5A8A6A`, `#FF4444`×2) 만 잔존 + 그 외 hex 0건 — positive + negative assertion 혼합. 회귀 발견 시 잔존 hex 목록 + 매핑 추정 출력 |
| `apps/mobile/src/__tests__/screens/S06HomeScreen.theme.test.tsx` | useTheme dark/light mock + container backgroundColor / headerTitle color / fab backgroundColor 3 assertion (REQ-005 검증) |
| `apps/mobile/src/__tests__/screens/RecordGuideScreen.theme.test.tsx` | useTheme dark/light mock + container backgroundColor / title color / cta backgroundColor 3 assertion + modal overlay (overlay 토큰) 검증 (REQ-006) |

> task 02/03 의 `paywall-processed-hex-map.test.ts` / `settings-deletion-processed-hex-map.test.ts` 와 동일 패턴 — 보류 hex 가 있어 *grep 0 검증 불가* → "처리 토큰 들어갔는가" positive assertion + "보류 hex 만 잔존" negative assertion 으로 회귀 방지.

## 5. 인터페이스 (TypeScript)

### 5.1 makeStyles factory 시그니처 (4 파일 공통, task 01~03 패턴)

```ts
import { useMemo } from 'react';
import { useTheme } from '@hooks/useTheme';
import type { ColorTokens } from '@theme/tokens';
import { StyleSheet } from 'react-native';

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    // ...
  });

export default function S06HomeScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // ... 기존 JSX 동일 (단 인라인 ActivityIndicator color="#5A7AA8" → color={colors.accentPrimary})
}
```

### 5.2 RecordGuideScreen — 3 StyleSheet 통합 패턴

```ts
const makeStyles = (colors: ColorTokens) => ({
  base: StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary, paddingHorizontal: 20, paddingTop: 24 },
    title:     { color: colors.textPrimary, fontSize: 22, fontFamily: 'NotoSansKR-Regular', flex: 1 },
    // ... (L234~295 base styles)
  }),
  chip: StyleSheet.create({
    container: { /* L298~308 — 보류 hex 잔존: borderColor '#82B090' */ },
    icon:      { fontSize: 14, marginRight: 6 },
    text:      { color: '#82B090', fontSize: 13, fontFamily: 'NotoSansKR-Regular' },  // 보류
  }),
  modal: StyleSheet.create({
    overlay:     { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 24 },
    sheet:       { backgroundColor: colors.surface, borderRadius: 20, padding: 24, width: '100%' },
    title:       { color: colors.textPrimary, fontSize: 18, fontFamily: 'NotoSansKR-Regular', marginBottom: 12 },
    desc:        { color: colors.textSecondary, fontSize: 14, lineHeight: 22, marginBottom: 24 },
    primaryBtn:  { height: 52, backgroundColor: colors.accentPrimary, borderRadius: 26, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    primaryBtnText: { color: colors.bgPrimary, fontSize: 16, fontFamily: 'NotoSansKR-Regular' },
    secondaryBtn:   { height: 44, justifyContent: 'center', alignItems: 'center' },
    secondaryBtnText: { color: colors.textSecondary, fontSize: 15 },
  }),
});

// 컴포넌트 안 (외부 컴포넌트 부모 내부 이동 — HeadphoneChip / PermissionModal / EarphoneWarningModal):
export function RecordGuideScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styleSet = useMemo(() => makeStyles(colors), [colors]);

  // ...

  function HeadphoneChip() {
    return (
      <View style={styleSet.chip.container}>
        <Text style={styleSet.chip.icon}>🎧</Text>
        <Text style={styleSet.chip.text}>이어폰을 끼면 더 또렷하게 담겨요</Text>
      </View>
    );
  }
  // ... (PermissionModal, EarphoneWarningModal 동일)
}
```

> 또는 `makeStyles` 가 *flat* 객체 반환 + 키 prefix (`base_container`, `chip_text`, `modal_overlay`) — engineer 재량. 위 nested 가 가독성 우위.

### 5.3 RecordScreen — `darkColors` import 제거 + factory 도입

```tsx
// Before (L26):
import { darkColors, FontSize } from '../theme/tokens';
// Before (L444):
encourageText: {
  color: darkColors.accentSecondary,
  fontSize: 13, textAlign: 'center', marginTop: 8, marginBottom: 8,
},

// After:
import { FontSize } from '../theme/tokens';  // darkColors 제거
import type { ColorTokens } from '../theme/tokens';
import { useTheme } from '@hooks/useTheme';
import { useMemo } from 'react';

// makeStyles factory:
const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    countdownContainer: { flex: 1, backgroundColor: colors.bgPrimary, justifyContent: 'center', alignItems: 'center' },
    countdownNumber:    { color: colors.accentPrimary, fontSize: 96, fontVariant: ['tabular-nums'], fontFamily: 'NotoSansKR-Regular' },
    countdownLabel:     { color: colors.textSecondary, fontSize: 16, marginTop: 12 },
    // ...
    encourageText:      { color: colors.accentSecondary, fontSize: 13, textAlign: 'center', marginTop: 8, marginBottom: 8 },
    // ...
    bgmChip:            { color: colors.textBody, fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 8 },  // §3.2.2 흡수
    bgmFailToast:       { color: '#E0B070', fontSize: 13, ... },  // 보류
    silenceWarning:     { color: '#5A8A6A', fontSize: 14, ... },  // 보류
    stopRing:           { width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderColor: '#FF4444', ... },  // 보류
    stopBtn:            { width: 72, height: 72, borderRadius: 36, backgroundColor: '#FF4444', ... },  // 보류
    stopIcon:           { width: 26, height: 26, backgroundColor: colors.textOnAccent, borderRadius: 4 },  // task 04 신규
  });

// 컴포넌트 안:
export function RecordScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // ... 기존 useEffect / handlers 변경 0
}
```

### 5.4 hex → token 교체 매핑 (engineer 검색·치환 가이드)

| 발견 hex (3·6자리 + rgba) | 신규 토큰 참조 | 비고 |
|---|---|---|
| `'#0D0F1A'` | `colors.bgPrimary` | — |
| `'#1A1D30'` | `colors.surface` | — |
| `'#21253E'` | `colors.surfaceHigh` | — |
| `'#5A7AA8'` | `colors.accentPrimary` | L139 인라인 prop 도 포함 |
| `'#7B80A0'` | `colors.textSecondary` | — |
| `'#EEF0F8'` | `colors.textPrimary` | — |
| `'#2A2E50'` | `colors.border` | §3.2.2 흡수 위험 |
| `'#A9B0D0'` | `colors.textBody` | §3.2.2 흡수 위험 |
| `'#fff'` (3자리) | `colors.textOnAccent` | task 04 신규 |
| `'rgba(0,0,0,0.6)'` | `colors.overlay` | §3.2.2 alpha 흡수 |
| `'#82B090'` | (보류 — Story 5 task 09) | 본 task 처리 X |
| `'#E0B070'` | (보류) | 본 task 처리 X |
| `'#5A8A6A'` | (보류) | 본 task 처리 X |
| `'#FF4444'` | (보류) | 본 task 처리 X |

### 5.5 m1a-core-flow-processed-hex-map.test.ts (신규 회귀 테스트)

```ts
/**
 * task 05 m1a-core-flow-screens
 *
 * 4 대상 파일 (S06/S07/RecordGuide/Record) 에서:
 * (1) 본 task 가 처리한 토큰 8종 (bgPrimary, surface, surfaceHigh, accentPrimary,
 *     textPrimary, textSecondary, overlay, textOnAccent) 참조 ≥1 회 (각 파일별 *해당하는 토큰만*)
 * (2) 보류 hex 4종 (#82B090, #E0B070, #5A8A6A, #FF4444) 만 잔존
 *     + 그 외 6자리 hex = 0건 (= 처리 hex 7종 + 흡수 hex 2종 = 0건)
 *
 * Story 5 task 09 (전수 hex-lint) 머지 전까지의 1차 회귀 방지선.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '..', '..');

const TARGET_FILES = [
  { label: 'S06HomeScreen', rel: 'screens/S06HomeScreen.tsx',
    expectedTokens: ['colors.bgPrimary', 'colors.surface', 'colors.accentPrimary',
                     'colors.textPrimary', 'colors.textSecondary', 'colors.border'] },
  { label: 'S07SongSelectScreen', rel: 'screens/S07SongSelectScreen.tsx',
    expectedTokens: ['colors.bgPrimary', 'colors.surfaceHigh', 'colors.accentPrimary',
                     'colors.textPrimary', 'colors.textSecondary'] },
  { label: 'RecordGuideScreen', rel: 'screens/RecordGuideScreen.tsx',
    expectedTokens: ['colors.bgPrimary', 'colors.surface', 'colors.surfaceHigh',
                     'colors.accentPrimary', 'colors.textPrimary', 'colors.textSecondary',
                     'colors.overlay'] },
  { label: 'RecordScreen', rel: 'screens/RecordScreen.tsx',
    expectedTokens: ['colors.bgPrimary', 'colors.accentPrimary', 'colors.accentSecondary',
                     'colors.textSecondary', 'colors.textBody', 'colors.textOnAccent'] },
];

// 본 task 가 *처리* 한 hex (= 토큰화 완료) — grep 결과 0건이어야 함
const REPLACED_HEX = [
  '#0D0F1A', '#1A1D30', '#21253E', '#5A7AA8', '#7B80A0', '#EEF0F8',
  '#2A2E50', '#A9B0D0',  // 흡수 위험 등재 — 본 task 처리 완료
  '#fff', '#FFFFFF',     // textOnAccent — 3자리/6자리 모두 grep
];
const REPLACED_RGBA = 'rgba(0,0,0,0.6)';

// 본 task 가 *보류* 한 hex — grep 결과 잔존 허용 (Story 5 task 09 처리 대기)
const ALLOWED_HEX = ['#82B090', '#E0B070', '#5A8A6A', '#FF4444'];

describe('task 05 m1a-core-flow — 4 파일 처리 토큰 참조 ≥1', () => {
  for (const { label, rel, expectedTokens } of TARGET_FILES) {
    it(`${label}: 본 task 처리 토큰 ${expectedTokens.length}종 모두 ≥1 회 참조`, () => {
      const src = fs.readFileSync(path.join(SRC_ROOT, rel), 'utf-8');
      const missing = expectedTokens.filter((tok) => !src.includes(tok));
      expect(missing).toEqual([]);
    });
  }
});

describe('task 05 m1a-core-flow — 4 파일 처리 hex 잔존 0', () => {
  for (const { label, rel } of TARGET_FILES) {
    it(`${label}: 처리 hex 8종 + rgba 0건`, () => {
      const src = fs.readFileSync(path.join(SRC_ROOT, rel), 'utf-8');
      for (const hex of REPLACED_HEX) {
        // hex 가 ' 또는 " 로 wrap 된 형태만 검사
        const re = new RegExp(`['"]${hex.replace('#', '#')}['"]`, 'g');
        const matches = src.match(re);
        expect(matches).toBeNull();
      }
      expect(src.includes(`'${REPLACED_RGBA}'`)).toBe(false);
      expect(src.includes(`"${REPLACED_RGBA}"`)).toBe(false);
    });
  }
});

describe('task 05 m1a-core-flow — 4 파일 보류 hex 만 잔존 + 그 외 6자리 hex 0건', () => {
  // 보류 4 hex 외 6자리 hex 잔존 시 즉시 FAIL (Story 5 task 09 가 일괄 처리 전까지 1차 방어선)
  for (const { label, rel } of TARGET_FILES) {
    it(`${label}: 6자리 hex 중 보류 4종 외 0건`, () => {
      const src = fs.readFileSync(path.join(SRC_ROOT, rel), 'utf-8');
      const allHex = src.match(/#[0-9A-Fa-f]{6}\b/g) ?? [];
      const unexpected = allHex.filter((hex) => !ALLOWED_HEX.includes(hex.toUpperCase()) && !ALLOWED_HEX.includes(hex));
      // 보류 hex (대소문자 양쪽 고려) 외 잔존 시 잔존 목록 출력
      expect(unexpected).toEqual([]);
    });
  }
});
```

## 6. 핵심 로직 (의사코드)

### 6.1 4 파일 마이그레이션 절차 (engineer 1 파일씩 적용)

```
for each file in [S06HomeScreen, S07SongSelectScreen, RecordGuideScreen, RecordScreen]:
  1. import 변경:
     - + import { useMemo } from 'react'
     - + import { useTheme } from '@hooks/useTheme' (alias 활용)
     - + import type { ColorTokens } from '@theme/tokens'
     - (RecordScreen 만) - import { darkColors, FontSize } from '../theme/tokens'
                          + import { FontSize } from '../theme/tokens'
  2. StyleSheet.create 본문 → makeStyles(colors) factory 변환
     - module-level StyleSheet.create({...}) 을 함수 외부 `const makeStyles = (colors) => StyleSheet.create({...})` 로 이동
     - (RecordGuideScreen) `styles` / `chipStyles` / `modal` 3 객체 → `{ base, chip, modal }` 단일 factory 반환 (5.2)
  3. 컴포넌트 함수 안 최상단:
     - const { colors } = useTheme();
     - const styles = useMemo(() => makeStyles(colors), [colors]);
     - (RecordGuideScreen) const styleSet = useMemo(() => makeStyles(colors), [colors]);
  4. 외부 컴포넌트 부모 내부화 (RecordGuideScreen 한정):
     - HeadphoneChip / PermissionModal / EarphoneWarningModal → 부모 함수 안 nested function
     - styleSet.chip.* / styleSet.modal.* 캡처
  5. hex 교체 (5.4 매핑 표 1행씩):
     - 처리 hex 12종 (3자리 #fff 포함, rgba 포함) → colors.<token>
     - 보류 hex 4종 (#82B090, #E0B070, #5A8A6A, #FF4444) → 그대로 유지 + TODO 주석 추가
  6. 인라인 prop 교체:
     - S06 L139 ActivityIndicator color="#5A7AA8" → color={colors.accentPrimary}
     - RecordGuide L316 inline rgba(...) → 이미 factory 안 → colors.overlay
  7. 파일 grep 자가 검증:
     - 6자리 hex grep → 보류 4종만 잔존 + 그 외 0건
     - colors.<token> 참조 → expectedTokens (5.5) 모두 ≥1
  8. TODO 주석 추가 (보류 hex 옆):
     - // TODO(task 09 token-define): #82B090 → mutedGreen 토큰 정의 후 colors.mutedGreen 교체
     - // TODO(task 09): #E0B070 → warning, #5A8A6A → successMuted, #FF4444 → recordStop
```

### 6.2 검증 절차

```
1. jest run:
   - 신규 m1a-core-flow-processed-hex-map.test.ts GREEN (3 describe — 처리 토큰 ≥1 + 처리 hex 0 + 보류 외 0)
   - 신규 S06HomeScreen.theme.test.tsx GREEN (REQ-005)
   - 신규 RecordGuideScreen.theme.test.tsx GREEN (REQ-006)
   - 기존 useTheme.test.ts / tokens.test.ts / task 01~04 회귀 테스트 모두 GREEN
2. TypeScript: pnpm tsc --noEmit (또는 npx tsc -p apps/mobile) — 타입 에러 0
3. 시각 검증 (manual — REQ-008/009):
   - 다크 모드: 홈 → 곡 선택 → 가이드 → 녹음 진입. Epic 12 작업 전 캡처와 동일 (회귀 0). 보류 4 hex (이어폰 chip 녹색 / bgm chip 옅은 파란/silence 톤다운 녹색 / stop 버튼 빨강) 동일 노출.
   - 라이트 모드: 동일 플로우. 헤더/배경/주요 텍스트 = 라이트 팔레트. 보류 4 hex = 다크 hex 그대로 (= 부분 깨짐 — 의도된 미해소 / §3.3 D 옵션).
4. metering hot-loop 성능 회귀 (LOW): RecordScreen 100ms tick 리렌더에서 makeStyles 재계산 0 보장 (useMemo deps = [colors], colors 참조 안정) — REQ-010
```

### 6.3 RecordScreen 외부 컴포넌트화 검토 (factory 캐싱 정합)

RecordScreen 의 `WaveformVisualizer` 호출부 `<WaveformVisualizer mode="realtime" levels={levels} />` 가 `color` prop 미전달 → WaveformVisualizer 기본값 `#5A7AA8` 사용 (system-design §3.4). 본 task 는 RecordScreen 만 손대므로 WaveformVisualizer 변경 X. 대신 RecordScreen 에서 *명시 전달* 권장:

```tsx
<WaveformVisualizer mode="realtime" levels={levels} color={colors.accentPrimary} />
```

이렇게 하면 RecordScreen 의 metering 파형이 라이트 모드에서 `#3A5A88` (accentPrimary light) 로 렌더링 — 라이트 적용 1 hex 추가 처리. WaveformVisualizer 의 *기본값* `#5A7AA8` 변경은 task 06 (WaveformVisualizer 책임) 으로 위임. 본 task 가 명시 전달만 추가.

**결정 = 본 task 의 RecordScreen 변경에 `color={colors.accentPrimary}` 명시 전달 *추가*** — system-design §3.4 ("호출부에서 `colors.accentPrimary` 를 명시 전달") 정합.

## 7. 다른 모듈과의 경계

- **상위 의존**: `@theme/tokens` (변경 0 — 본 task 가 손대지 X), `@hooks/useTheme` (변경 0), `@store/auth-store` / `@store/player-store` / `@store/recordingSlice` / `@store/mastersSlice` (변경 0 — zustand store 직접 호출만), `@navigation/types` (변경 0).
- **하위 의존 (본 task 가 변경)**: 4 화면 파일. 본 task 는 *교체* 만 — Props/렌더 동작/navigation 변경 0.
- **외부 컴포넌트 import** (RecordGuide 가 import):
  - `@components/LyricsBox` (LyricsBox.tsx) — 본 task 가 손대지 X. task 06 책임.
  - `@components/SongListItem` (S07 가 import) — 본 task 가 손대지 X. Story 5 task 08 책임.
  - `@components/WaveformVisualizer` (Record 가 import) — 본 task 가 *호출만 변경* (color prop 명시 전달). 컴포넌트 자체 변경은 task 06.
  - `@components/MasterAudioCard` / `EmptyMastersState` / `JustArrivedMasterCard` / `MiniPlayer` / `TrialBadge` / `TrialExpiryBanner` (S06 가 import) — 모두 손대지 X. Story 5 task 08 책임.
- **graceful 동작**: useTheme 부재 시 ColorTokens 반환 보장 (`useTheme.ts` 기존 동작) — 영향 0. 본 task 의 신규 9 토큰 (task 04 정의) 은 ColorTokens 타입 *필수* (옵셔널 X) → 자동 노출.
- **Breaking Change 검토**:
  - 4 화면 파일 export / props 시그니처 / navigation 변경 0
  - RecordScreen 의 `<WaveformVisualizer color={colors.accentPrimary} />` 명시 전달 → 호출 변경 1 건 (props 추가만, 시그니처 변경 X)
  - 외부 컴포넌트 부모 내부화 (RecordGuide) — 외부에 export 되지 않은 *내부 helper function* 이므로 외부 영향 0
  - **Breaking Change = 없음**.
- **역방향 cascade**: 불필요 (단방향 — 화면이 tokens/useTheme/store 를 import).
- **DIP interface**: 불필요.

## 8. 테스트 환경 영향

- 기존 jest 테스트 영향 0 — 본 task 의 4 화면 파일 변경이 직접 import 되는 테스트:
  - `S06HomeScreen` 호출 테스트 = 없음 (현재 jest 트리에서 S06 단위 테스트 부재 — 통합 검증은 본 task 신규 `.theme.test.tsx` 추가)
  - `S07SongSelectScreen` 호출 테스트 = `apps/mobile/src/__tests__/screens/` 폴더에 S07 관련 미존재 (확인 필요 시 jest config testMatch 로 자동 검출됨)
  - `RecordGuideScreen` 호출 테스트 = 없음
  - `RecordScreen` 호출 테스트 = 없음 (recording 인테그레이션은 zustand store + useBgmPlayer 의 별도 테스트 — 본 task 가 손대지 X)
- 신규 테스트 3 파일 (`m1a-core-flow-processed-hex-map.test.ts` + `S06HomeScreen.theme.test.tsx` + `RecordGuideScreen.theme.test.tsx`) — 회귀 방지 1차 방어선
- jest 설정 변경 0 (jest.config.js / setupFilesAfterEach 변경 0).

## 9. 모듈 = 테스트 단위 정합 (self-check)

1. **테스트 단위 정합**:
   - 4 화면 각각 useTheme 도입 → useTheme mock 으로 dark/light 렌더 후 `getByTestId` 또는 `find by style` 로 backgroundColor/color assertion (REQ-005/006). 명확 PASS/FAIL.
   - hex 교체 자체 → `m1a-core-flow-processed-hex-map.test.ts` fs.readFileSync + grep 으로 정확한 통과 조건 (REQ-002/003/004). 명확 PASS/FAIL.
   - 변경 이유 단일 (= "M1 핵심 플로우 4 화면 hex → token 마이그레이션") — SRP 충족.
2. **의존성 묶음 정합**:
   - 의존 = `@theme/tokens` + `@hooks/useTheme` + 4 zustand store (모두 변경 0). 단방향. 역방향 cascade 0. DIP 불필요.
   - 단독 lifecycle = 4 화면 각각 독립 진입 가능 (이미 그렇게 동작) → 본 task 변경 후도 동일 보장.
   - 다른 모듈 부재 시 graceful = useTheme 부재 → 다크 회귀 (= 기존 동작 보존). store 부재 → 기존 zustand selector 동작 보존 (변경 0).
3. **테스트 가능성 ✓** — 모듈 분할/통합 권유 0. 본 task 는 4 화면 한 batch 가 적정 (PR 변경 라인 수 ~150~200, 리뷰 적정).

## 10. 수용 기준

| ID | 내용 | 검증 방법 | 통과 조건 |
|---|---|---|---|
| REQ-001 | 4 대상 파일 모두 `useTheme(` 호출 1회 이상 포함 | (TEST) `m1a-core-flow-processed-hex-map.test.ts` 추가 it 블록 + 또는 `_setup.ts` 의 jest auto include | `pnpm --filter mobile test src/__tests__/theme/m1a-core-flow-processed-hex-map.test.ts -t "useTheme"` → 4/4 PASS |
| REQ-002 | 4 대상 파일에 본 task 처리 토큰 (`colors.bgPrimary` / `colors.surface` / `colors.surfaceHigh` / `colors.accentPrimary` / `colors.textPrimary` / `colors.textSecondary` / `colors.overlay` / `colors.textOnAccent` / `colors.textBody` / `colors.border` / `colors.accentSecondary` 중 각 파일별 expectedTokens) ≥1 회 참조 | (TEST) `m1a-core-flow-processed-hex-map.test.ts` describe "처리 토큰 참조 ≥1" | `pnpm --filter mobile test src/__tests__/theme/m1a-core-flow-processed-hex-map.test.ts -t "처리 토큰 참조"` → 4/4 PASS |
| REQ-003 | 4 대상 파일에 본 task 처리 hex (12종 + rgba) 0건 잔존 (`#0D0F1A` / `#1A1D30` / `#21253E` / `#5A7AA8` / `#7B80A0` / `#EEF0F8` / `#2A2E50` / `#A9B0D0` / `#fff` / `#FFFFFF` / `rgba(0,0,0,0.6)`) | (TEST) `m1a-core-flow-processed-hex-map.test.ts` describe "처리 hex 잔존 0" | `pnpm --filter mobile test src/__tests__/theme/m1a-core-flow-processed-hex-map.test.ts -t "처리 hex 잔존 0"` → 4/4 PASS |
| REQ-004 | 4 대상 파일에 보류 hex 4종 (`#82B090` / `#E0B070` / `#5A8A6A` / `#FF4444`) 외 6자리 hex 0건 잔존 | (TEST) `m1a-core-flow-processed-hex-map.test.ts` describe "보류 외 0건" | `pnpm --filter mobile test src/__tests__/theme/m1a-core-flow-processed-hex-map.test.ts -t "보류 hex 만 잔존"` → 4/4 PASS |
| REQ-005 | S06HomeScreen 라이트 모드 mock 진입 시 container backgroundColor = `lightColors.bgPrimary (#FBF7F0)` + 다크 모드 mock 진입 시 = `darkColors.bgPrimary (#0D0F1A)` | (TEST) `S06HomeScreen.theme.test.tsx` — useTheme mock × 2 (light/dark) + render + flatten backgroundColor assertion | `pnpm --filter mobile test src/__tests__/screens/S06HomeScreen.theme.test.tsx` → 2/2 PASS (light + dark) |
| REQ-006 | RecordGuideScreen 라이트 모드 mock 진입 시 container backgroundColor + modal overlay = `lightColors.overlay (#00000066)` / 다크 모드 = `darkColors.overlay (#000000AA)` | (TEST) `RecordGuideScreen.theme.test.tsx` — useTheme mock × 2 + render + modal open + assertion | `pnpm --filter mobile test src/__tests__/screens/RecordGuideScreen.theme.test.tsx` → 2/2 PASS |
| REQ-007 | tokens.ts 의 기존 15 + task 04 신규 9 = 24 토큰 dark/light hex 변경 X (회귀 0) | (TEST) `tokens.test.ts` REQUIRED_KEYS 24 + darkColors/lightColors hex assertion 모두 GREEN | `pnpm --filter mobile test src/__tests__/theme/tokens.test.ts` → 48+ PASS (기존 30 + task 04 신규 18) |
| REQ-008 | 다크 모드 4 화면 시각 회귀 0 — Epic 12 작업 전 캡처와 동일 | (MANUAL) iOS 시뮬레이터 다크 → S06 홈 → S07 곡 선택 → RecordGuide → Record 카운트다운 → Record 녹음 5 화면 진입 + Epic 12 이전 캡처 비교 | 5/5 동일 PASS (보류 4 hex 영역도 동일 노출) |
| REQ-009 | 라이트 모드 4 화면 부분 적용 시각 검증 — 헤더/배경/주요 텍스트 = 라이트 팔레트 + 보류 4 hex = 다크 hex 그대로 (의도된 미해소) | (MANUAL) iOS 시뮬레이터 라이트 → 동일 5 화면 진입 + 헤더 `bgPrimary #FBF7F0` + 본문 `textPrimary #1C1A18` 적용 확인 + HeadphoneChip / bgmChip / silenceWarning / stop 버튼 = 다크 hex 그대로 (= Story 5 task 09 후속 처리 대기) | 5/5 부분 적용 PASS + 4 보류 영역 다크 잔존 확인 |
| REQ-010 | RecordScreen metering 100ms tick 리렌더 성능 회귀 0 — `makeStyles(colors)` 재계산 안 됨 (`useMemo([colors])` 적용 후) | (MANUAL) DevTools React Profiler 또는 `console.log('makeStyles called')` 임시 삽입 후 30초 녹음 → 호출 횟수 ≤ 2 (initial + theme toggle 1 회) | 호출 횟수 ≤ 2 PASS |
| REQ-011 | 4 화면 navigation 동작 변경 0 — 홈 → 곡 선택 → 가이드 → 녹음 → preview 흐름 정상 + earphone modal / permission modal / cancel alert 동작 정상 | (MANUAL) iOS 시뮬레이터 → 풀 플로우 1회 + earphone modal `이어폰 없이 진행` + permission denied → 설정 가기 + cancel → SongSelect 복귀 | 풀 플로우 PASS |
| REQ-012 | RecordScreen `darkColors.accentSecondary` 직접 참조 제거 — `useTheme()` 으로 전환 | (TEST) `m1a-core-flow-processed-hex-map.test.ts` 추가 it `RecordScreen 에 'darkColors.' substring 0건` | `grep -c 'darkColors\.' RecordScreen.tsx` = 0 PASS (test 안에서 `expect(src.includes('darkColors.')).toBe(false)`) |
| REQ-013 | 직접 색·폰트·간격 리터럴 사용 금지 (보류 4 hex 제외 — 4 파일 한정) | (TEST) REQ-003 + REQ-004 동일 — `m1a-core-flow-processed-hex-map.test.ts` 통합 검증 | 0건 PASS (보류 외 0) |

## 11. 주의사항

### 11.1 DB 영향도

**없음** — 색상 토큰만 변경. DDL/마이그레이션 0. `docs/db-schema.md` 참조 변경 0.

### 11.2 외부 SDK / API 영향도

- **expo-audio**: 변경 0 (S07 미리듣기 / Record 녹음 / setAudioModeAsync).
- **AsyncStorage**: 변경 0 (earphone warning key).
- **react-navigation**: 변경 0.
- **songsApi / sessionApi**: 변경 0.
- **zustand store (auth/player/masters/recording/theme)**: 변경 0.
- **useBgmPlayer / useTrialExpiredGuard**: 변경 0.

### 11.3 회귀 위험 + 완화

- **위험 1 (MEDIUM — `#2A2E50` → `border` 흡수 8dp 차이)**: S06 pendingCard borderColor. 다크 모드 시각 회귀 가능성 (RGB +0/+0/+8 = 시각 식별 어려운 변화, 그러나 4dp 룰 초과). 라이트 모드는 border 라이트 hex `#C8BEB0` 적용 — 신규 라이트 경계 시각 검수 필요.
  - **완화**: REQ-008 다크 캡처 비교 + REQ-009 라이트 캡처 검수. 차이 발견 시 별도 PR 로 `borderHigh` 토큰 등재 (Story 5 task 09 또는 후속 토큰 정의 task).
- **위험 2 (MEDIUM — `#A9B0D0` → `textBody` 흡수 12dp 차이)**: RecordScreen bgmChip. 다크 시각 회귀 (RGB +9/+11/+16 = textBody 다크 `#A0A5C0` 와 ~12dp). 라이트 모드는 textBody 라이트 `#3D352E` 적용.
  - **완화**: REQ-008 다크 캡처 비교. 차이 발견 시 별도 PR 로 `textBodyBright` 토큰 등재 또는 `textPrimary` 흡수 검토.
- **위험 3 (HIGH — 보류 4 hex 라이트 모드 부분 깨짐)**: HeadphoneChip / bgmFailToast / silenceWarning / stop 버튼이 라이트 모드에서 다크 hex 그대로 노출.
  - **완화**: §3.3 D 옵션 의도 — Story 5 task 09 후속 일괄 처리. PR description 에 *명시* 권장 ("본 task 는 부분 적용 — 보류 4 hex Story 5 task 09 후속 처리"). product-planner / 사용자에게 후속 우선순위 결정 요청.
- **위험 4 (LOW — RecordGuideScreen 외부 컴포넌트 부모 내부화 시 state 캡처 누락)**: HeadphoneChip / PermissionModal / EarphoneWarningModal 를 부모 함수 내부 이동 시 클로저 캡처 누락 가능성 (state setters 등).
  - **완화**: engineer 가 변경 후 jest snapshot + RecordGuideScreen 단위 테스트 (REQ-006 + REQ-011 manual 플로우) 로 modal close / permission grant 정상 동작 확인.
- **위험 5 (LOW — RecordScreen metering hot-loop useMemo deps 안정성)**: `useMemo([colors])` deps 가 매 렌더 새 객체 시 재계산 → 성능 회귀.
  - **완화**: `useTheme()` 이 `darkColors`/`lightColors` 모듈 상수 *직접 반환* (`useTheme.ts` L19) → 참조 안정. deps `[colors]` 안정. REQ-010 manual 검증.
- **위험 6 (LOW — `rgba(0,0,0,0.6)` → `overlay` 흡수 alpha 7% 차이)**: RecordGuide modal underlay. 다크 모드 alpha 67% → 60% = 시각적으로 modal 뒤가 *살짝 더 밝아짐*. 라이트 모드 alpha 40% → 60% = 살짝 더 어두워짐.
  - **완화**: REQ-006 jest assertion + REQ-008/009 manual 시각 검수. 차이 발견 시 별도 PR 로 `overlayMedium` 토큰 등재.
- **위험 7 (LOW — `#fff` 3자리 grep 정합)**: RecordScreen stopIcon `'#fff'` 가 6자리 hex regex 에 잡히지 않음 → 기존 task 01 `auth-onboarding-no-raw-hex.test.ts` 의 `HEX_6_REGEX = /#[0-9A-Fa-f]{6}\b/g` 는 매치 안 함.
  - **완화**: 본 task 신규 `m1a-core-flow-processed-hex-map.test.ts` 에서 `#fff` / `#FFFFFF` 양쪽 모두 REPLACED_HEX 에 명시 (5.5). Story 5 task 09 hex-lint 에서도 3자리 hex 검출 추가 권고 (architect 후속 task 09 결정 책임).

### 11.4 PR 후 시각 회귀 발견 시 rollback 절차

- `git revert <머지 커밋>` 단일 커밋. 4 화면 통째 원복. 신규 테스트 3 파일 동시 원복.
- 영향 범위 = 4 화면 + 신규 3 테스트. 다른 task / 다른 화면 영향 0.
- *일부 hex 흡수 결정만* 조정 시 = revert 불필요. 본 plan §3.2.2 의 흡수 결정을 별도 토큰 도입으로 전환 (별도 PR — tokens.ts 1 토큰 추가 + 1 파일 1줄 수정).

### 11.5 PR 단위 권장

- **1 PR (4 화면 + 신규 테스트 3)** — system-design §2 Story 4 표 한 batch 그대로.
- 커밋 분할:
  1. S06HomeScreen.tsx useTheme + factory + hex 교체
  2. S06HomeScreen.theme.test.tsx 신규
  3. S07SongSelectScreen.tsx useTheme + factory + hex 교체
  4. RecordGuideScreen.tsx useTheme + factory + 외부 컴포넌트 부모 내부화 + hex 교체
  5. RecordGuideScreen.theme.test.tsx 신규
  6. RecordScreen.tsx useTheme + factory + darkColors import 제거 + hex 교체 + WaveformVisualizer color prop 명시
  7. m1a-core-flow-processed-hex-map.test.ts 신규
  = 총 7 커밋 권장.

### 11.6 보류 hex TODO 주석 컨벤션 (task 02/03 정합)

```tsx
// RecordGuideScreen chipStyles:
container: {
  // TODO(task 09 token-define): #82B090 → mutedGreen or successMuted 토큰 정의 후 colors.<token> 교체
  borderColor: '#82B090',
},
text: {
  // TODO(task 09 token-define): #82B090 동일
  color: '#82B090',
  fontSize: 13, fontFamily: 'NotoSansKR-Regular',
},

// RecordScreen styles:
bgmFailToast: {
  // TODO(task 09): #E0B070 → warning 토큰 정의 필요
  color: '#E0B070', ...
},
silenceWarning: {
  // TODO(task 09): #5A8A6A → successMuted 토큰 정의 필요 (재사용 3곳 — S11/Record/DeleteTracksSheet)
  color: '#5A8A6A', ...
},
stopRing: {
  // TODO(task 09): #FF4444 → recordStop or destructiveBright 토큰 정의 필요
  borderColor: '#FF4444', ...
},
stopBtn: {
  // TODO(task 09): #FF4444 동일
  backgroundColor: '#FF4444', ...
},
```

> task 02/03 머지 후 task 04 가 TODO 주석 모두 제거 (task 04 plan §10.7) 한 패턴을 본 task 도 따름 — Story 5 task 09 후속이 본 task TODO 주석 모두 제거 책임.

### 11.7 디자인 토큰 의존성 가드레일

본 task = UI 컴포넌트 impl. `docs/design.md` 의 `components` 섹션이 4 화면 정의 미존재 (확인 — 시안 없음, dual-mode). master rule 디자인 토큰 의존성:

- 본 task 의 모든 색은 `colors.<token>` 형식 — hex 직접 사용 = 보류 4 hex 만 (의도된 미해소, TODO 주석 명시)
- 폰트/간격 직접 리터럴 = 본 plan §5 factory 본문에 *기존* 폰트/간격 (`fontSize: 22`, `paddingHorizontal: 20`) 그대로 유지. 본 task 가 *색상* 한정 마이그레이션 — 폰트/간격은 별도 epic 책임 (epic-12 PRD 명시 = "직접 hex 색상값" 한정)
- 본 task `## 수용 기준` REQ-013 = 보류 4 hex 외 색 리터럴 0건 강제

### 11.8 task 09 (hex-lint) 와의 관계

본 task 의 `m1a-core-flow-processed-hex-map.test.ts` = **4 대상 파일 한정** 회귀 방지선. task 09 (`09-regression-test-jest-hex-lint.md`) = **앱 전체 hex-lint** 도입 책임. 본 task PR 머지 시점에서는 다른 파일 (task 01~04 처리 분 / 미처리 M1 task 06/07 / Story 5 컴포넌트) 의 hex 잔존 검증 X. task 09 머지 시점에서 통합 회귀 방지선 완성.

> task 09 architect 가 본 task 의 `m1a-core-flow-processed-hex-map.test.ts` + 보류 4 hex 토큰 정의 + 4 hex 교체를 한 batch 로 통합 또는 별도 처리할지 결정. 본 task 는 그 결정을 *제약하지 X*.

## 12. 의존성

- **선행 task**: task 04 (missing-tokens-define-and-apply) — task 04 머지 후 본 task 진입. 본 task 의 4 화면 hex 중 `colors.textOnAccent` (= `#FFFFFF` 다크/라이트 영구) 활용은 task 04 가 ColorTokens 타입에 추가한 직후. task 04 부재 시 `colors.textOnAccent` TypeScript 컴파일 에러.
- **후행 task**: task 06 (m1b-play-pending-nav) — 본 task 와 *병렬 가능* (system-design §7 의존성 그래프 = "task 05, 06 병렬 가능"). 단 1인 개발 컨텍스트에서 순차 권장.
- **후행 task 09**: hex-lint 회귀 테스트 — 본 task 의 `m1a-core-flow-processed-hex-map.test.ts` 통합 또는 별도 유지 + 보류 4 hex 토큰 정의 + 4 화면 교체 후속.
- **외부**: 없음.

## 13. 게이트 self-check (architect/module-plan SOP 12 항목)

| # | 항목 | 충족 | 비고 |
|---|---|---|---|
| 1 | 생성/수정 파일 목록 확정 | ✓ | §4 — 4 화면 + 신규 3 테스트 |
| 2 | 인터페이스 TypeScript 타입 명시 | ✓ | §5.1~5.4 (makeStyles factory 시그니처 + RecordGuide nested factory + RecordScreen darkColors 제거 + 매핑 표) |
| 3 | 의존 모듈 실제 인터페이스 직접 확인 | ✓ | tokens.ts 15 토큰 + task 04 신규 9 토큰 + useTheme.ts + 4 화면 hex 잔존 (11+6+17+13=47 직접 grep + L번호 인용 §2.1) 모두 read 완료 |
| 4 | 에러 처리 명시 | ✓ | useTheme 항상 valid ColorTokens (변경 0) / earphone modal cancel / permission denied → 설정 가기 / cancel alert → SongSelect 복귀 — 모든 기존 에러 처리 변경 0. 본 task 신규 에러 처리 0 |
| 5 | 페이지 전환·상태 초기화 순서 | ✓ | S07 useFocusEffect cleanup (preview player remove) / Record cleanup (loop timer / interval / failToast timer) — 모두 기존 동작 보존, 본 task 변경 X. RecordGuide → Record navigation 시 `route.params.songKey` 전달 변경 0 |
| 6 | DB 영향도 분석 | ✓ | 없음 (§11.1) |
| 7 | Breaking Change 검토 | ✓ | 없음 (§7) — Props/export/navigation 변경 0. WaveformVisualizer color prop 명시 전달은 *추가* (기본값 사용 → 명시 전달) — 시그니처 변경 0 |
| 8 | 핵심 로직 의사코드 | ✓ | §6 (4 파일 마이그레이션 8단계 + 검증 4단계 + WaveformVisualizer color prop 결정) |
| 9 | TypeScript 타입 정합 | ✓ | ColorTokens 24 토큰 string (옵셔널 X). useTheme `{ colors, isDark }` 반환 + `useMemo` deps `[colors]` 안정. `makeStyles` 시그니처 `(colors: ColorTokens) => ReturnType<typeof StyleSheet.create>` 명시 |
| 10 | import 완전성 | ✓ | useTheme alias `@hooks/useTheme` (jest moduleNameMapper L31 정합) / `useMemo` from 'react' / `ColorTokens` type-only import / RecordScreen 의 darkColors import 제거 명시 (§5.3) |
| 11 | 수용 기준 + 메타데이터 | ✓ | §10 표 13 행 (REQ-001 ~ REQ-013) + frontmatter (depth/task/slug/story/issue/epic/branch_prefix) |
| 12 | 모듈 = 테스트 단위 정합 | ✓ | §9 self-check 3 항목 모두 ✓ |

추가 게이트 (epic-12 한정):
- **system-design §8 Option α 정합**: ✓ NN=05, 슬러그 = `m1a-core-flow-screens` (system-design impl 목차 표 행과 정확 일치). 의존 = task 04.
- **다크 회귀 0**: ✓ §3.2.1 (24 토큰 1:1 매핑 = 다크 hex 정확 일치) + §3.2.2 흡수 위험 등재 + REQ-008 시각 검증.
- **task 02/03/04 패턴 정합**: ✓ createStyles factory + useMemo + 보류 hex TODO 주석 + processed-hex-map.test.ts 패턴 모두 task 02/03 와 일치.
- **신규 토큰 도입 분기 룰**: ✓ §3.3 D 옵션 채택 — task 04 가 명시 위임받은 토큰 정의 책임을 본 task 가 임의 확장 X. system-design 갱신 트리거 = §13 후속 권고.

---

## 14. 결론 + 권장 다음 단계

본 module-plan 은 system-design §8 Option α 재정렬 NN=05 (`m1a-core-flow-screens`) 의 본문을 채운 산출물이다. M1 핵심 플로우 4 화면 (S06HomeScreen 11 hex / S07SongSelectScreen 6 hex / RecordGuideScreen 17 hex / RecordScreen 13 hex = 총 47 hex) 에 `useTheme()` + `makeStyles(colors)` factory 패턴을 적용 + 기존 15 + task 04 신규 9 = 24 토큰으로 매핑.

**처리 hex 42 (87%)**: 7 토큰 직접 매핑 (`bgPrimary`, `surface`, `surfaceHigh`, `accentPrimary`, `textPrimary`, `textSecondary`, `textOnAccent`) + 4dp 흡수 위험 등재 2 종 (`#2A2E50→border`, `#A9B0D0→textBody`) + alpha 흡수 1 종 (`rgba(0,0,0,0.6)→overlay`) + RecordScreen `darkColors.accentSecondary` 참조 → `colors.accentSecondary` 변환.

**보류 hex 6 (13%)**: 4 신규 색상 영역 (`#82B090` 이어폰 chip / `#E0B070` BGM 실패 warning / `#5A8A6A` silence muted success — 재사용 3곳 / `#FF4444` 녹음 중지 red) — system-design §1 룰 ("본 Epic 인프라 호출만 / Story 5 한정 수정") + task 04 의 명시 위임 받지 않은 본 task 가 임의 토큰 추가 X. §3.3 D 옵션 채택 (= task 02 §3.2.4 D 옵션 정합) — Story 5 task 09 후속 일괄 처리.

다크 회귀 0 보장 (24 토큰 매핑 + 흡수 위험 등재 + REQ-007/008). 라이트 모드는 부분 적용 (헤더/배경/주요 텍스트 = 라이트 팔레트 / 보류 4 영역 = 다크 잔존). DB / API / 외부 SDK / navigation / Breaking Change 영향 0.

신규 테스트 3 파일 (`m1a-core-flow-processed-hex-map.test.ts` + `S06HomeScreen.theme.test.tsx` + `RecordGuideScreen.theme.test.tsx`) — 회귀 방지 1차 방어선. AC-1 (4 파일 hex 0) = 본 task 머지 시점 *미충족* (Story 5 task 09 후속까지 미룸). PR 단위 = 1 PR (4 화면 + 신규 테스트), 7 커밋 분할.

12 게이트 + epic-12 추가 4 게이트 모두 통과. **상태 = READY_FOR_IMPL**.

권장 다음 단계 — system-design §8 impl 목차의 다음 행 = task 06 (`06-m1b-play-pending-nav.md`) MODULE_PLAN 호출. task 06 도 본 task 와 유사한 *신규 색상 hex 발견 가능성* 높음 (S11Preview / S13Play 의 gradient hex 등 PRD §5 의 `gradientStart` / `gradientEnd` 후보 + RecordModeScreen / MainNavigator hex). task 06/07 plan 작성 후 누적 누락 토큰 카운트 ≥ 5 이면 architect 가 **Option β 재정렬 제안** 권고 — Story 5 task 09 위치를 task 09 로 유지하되 그 앞에 *2차 missing-tokens-define-and-apply* task (= task 04 패턴 차용) 신규 도입 검토. 본 task 의 보류 4 hex + task 06/07 의 추가 발견분을 그 신규 task 에서 일괄 처리하면 AC-1 가 task 09 (hex-lint) 도입 이전에 충족 가능. 의사결정은 product-planner 책임 — 본 task 머지 후 SD 갱신 트리거.
