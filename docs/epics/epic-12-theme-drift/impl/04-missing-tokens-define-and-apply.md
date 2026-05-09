---
depth: std
task: 04
slug: missing-tokens-define-and-apply
story: Story 5 (분할) — 누락 토큰 정의 + task 02/03 보류분 일괄 교체
github_issue: TBD (Epic 12 Story 5 분할 — Option α 신규 task)
epic: 12
branch_prefix: feat/epic12-task04-missing-tokens
---

# task 04 — 누락 토큰 정의 + task 02/03 보류 hex 일괄 적용

## 1. 목적 (왜)

- **task 02 + task 03 의 라이트 모드 부분 깨짐 일괄 해소**: task 02 / task 03 의 PR 머지 시점에서는 보류 hex 군 (~16건 task 02 + ~26건 task 03) 이 다크 hex 리터럴로 그대로 남는다 (Option α 흐름). 본 task 가 신규 토큰 정의 (`tokens.ts`) + 5 파일 일괄 교체로 AC-1 (대상 5 파일 hex 0건) 을 *본 task PR 머지 시점*에 충족시킨다.
- **system-design §8 Option α 정합**: `## impl 목차` 표 NN=04, 슬러그 = `missing-tokens-define-and-apply`. 의존 = task 03. 후행 task 05~07 (M1) 가 신규 토큰 즉시 활용 가능하게 만든다.
- **출시 차단 회귀 완전 해소** (PRD §5 M0): M0 화면 (S14/S15/S16/S17/AccountDeletion) 라이트 모드 노출 깨짐 = 본 task 머지 시점에 0. v1 차단 해소.
- **Story 5 분할 정합**: 구 Story 5 = `[누락 토큰 정의 + 적용] + [hex-lint 회귀 테스트]` 이중 책임. Option α 로 누락 토큰 정의·적용을 본 task (04) 로 분리. hex-lint 는 task 09 (구 task 08) 책임.
- **token SSOT 보존**: `apps/mobile/src/theme/tokens.ts` 의 ColorTokens 타입 + darkColors / lightColors 양쪽 hex 를 한 곳에서 일관 관리. 컴포넌트 어디에도 hex 상수 산재 X.

## 2. 영향 파일

### 인프라 (정의 = Phase 1)

| 경로 | 변경 내용 |
|---|---|
| `apps/mobile/src/theme/tokens.ts` | ColorTokens 타입 9 토큰 추가 + darkColors / lightColors 9 토큰 hex 정의 (총 24 토큰) |
| `apps/mobile/src/__tests__/theme/tokens.test.ts` | `REQUIRED_KEYS` 배열에 9 신규 토큰 추가 + dark/light 양쪽 hex assertion 9×2 = 18 it 블록 추가 + 키셋 카운트 15 → 24 |

### 적용 = Phase 2 (task 02/03 보류 hex 5 파일 일괄 교체)

| 경로 | task 02/03 처리 후 보류 hex (대략) | task 04 교체 후 |
|---|---|---|
| `apps/mobile/src/screens/S14UpgradeSheet.tsx` | 5 hex (`#F5F5F5`×2, `#A0A5C0`, `#4A6FFF`, `#FFFFFF`, `rgba(30,34,60,0.95)`) | 0 hex (모두 토큰) |
| `apps/mobile/src/screens/S15SubscribeScreen.tsx` | 12 hex (`#F5F5F5`×4, `#A0A5C0`×2, `#4A6FFF`×2, `#FFFFFF`, `#4A4E68`×2, `rgba(30,34,60,0.95)`) | 0 hex |
| `apps/mobile/src/screens/S17TrialExpiredScreen.tsx` | 4 hex (`#A0A5C0`×2, `#4A6FFF`, `#FFFFFF`) | 0 hex |
| `apps/mobile/src/screens/S16SettingsScreen.tsx` | 10 hex (`#F5F5F5`×2, `#4A6FFF`, `#FFFFFF`, `#4A4E68`×4, `#E0E2F0`×2) | 0 hex |
| `apps/mobile/src/screens/AccountDeletionScreen.tsx` | 13 hex (`#F5F5F5`×4, `#FFFFFF`×3, `#4A6FFF`, `#4A4E68`, `#E0E2F0`×2, `#B0B4CC`, `#2A1A0F`) | 0 hex |
| **합계** | ~44 hex 리터럴 + 2 rgba | **0 (5 파일 grep 클린)** |

> 카운트는 task 02 / task 03 plan 의 "보류 hex" 섹션 인용 + 본 task architect 직접 grep 검증 (메인 worktree 5 파일 grep `#F5F5F5|#A0A5C0|#4A6FFF|#FFFFFF|#4A4E68|#E0E2F0|#B0B4CC|#2A1A0F` = 44 매치 + rgba `(30, 34, 60, 0.95)` 2 매치). engineer 가 1행씩 적용하면서 자동 소거.

### 테스트 (회귀 검증 — 신규)

| 경로 | 목적 |
|---|---|
| `apps/mobile/src/__tests__/theme/missing-tokens-applied.test.ts` | 5 파일 source read 후 (1) 누락 토큰 후보 hex 9종 + 2 rgba 가 *factory 본문 외부 또는 인라인* 위치에 0건 (2) 신규 토큰 9종 (`colors.<신규>`) 참조 ≥1 회 — positive assertion. task 09 (hex-lint) 도입 전까지의 1차 회귀 방지선. |

## 3. 결정 근거 (선택 + 버린 대안)

### 3.1 신규 토큰 9종 = task 03 §13 통합 표 그대로 채택

task 03 plan §13 의 누락 토큰 후보 통합 표 (task 02 + task 03 누적) 9종을 본 task 가 그대로 채택. 토큰명 재설계 X — 양 task 가 *동일 토큰명* 으로 보류 주석 (`TODO(task 04 token-define): textHighlight ...`) 을 박아둔 상태이므로, 토큰명을 바꾸면 task 02/03 의 주석/코멘트 일괄 수정 필요 → 변경 라인 수 폭증 + 회귀 위험.

| 후보 토큰 | 다크 hex | 라이트 hex (본 task 결정) | 사용 맥락 |
|---|---|---|---|
| `textHighlight` | `#F5F5F5` | `#0F0E0D` (textPrimary `#1C1A18` 보다 *더 짙은* 헤드라인 — 강조 의도 보존) | 헤드라인·toastText·고대비 텍스트 |
| `textBody` | `#A0A5C0` | `#3D352E` (라이트 본문 톤다운 갈색 — 베이지 배경 위 가독성 ↑) | 결제 본문 |
| `textBodyHigh` | `#E0E2F0` | `#2C2A26` (textPrimary 와 textBody 사이 — 본문 강조 톤) | S16 / AccDel 본문 강조 |
| `textBodyMuted` | `#B0B4CC` | `#5A4F45` (textSecondary `#6B6055` 보다 옅은 — modal 부제) | AccDel modalSubtitle |
| `textOnAccent` | `#FFFFFF` | `#FFFFFF` (라이트 모드에서도 accent 위 영구 흰색 — `#3A5A88` `#4A6FFF` 등 진한 파랑 위) | accent 위 텍스트 (CTA 버튼·배지 텍스트) |
| `textMuted` | `#4A4E68` | `#8A8278` (라이트 textSecondary 보다 옅은 — 약관·chevron) | 약관 dim / 부수 텍스트 / chevron / version |
| `interactive` | `#4A6FFF` | `#3A5FE0` (라이트 베이지 배경 위 의도적 *진한* 파랑 유지 — 결제 CTA·Premium 강조 의도 보존) | 결제 CTA / Premium 배지 / 강조 링크 |
| `destructiveBg` | `#2A1A0F` | `#F4E8DC` (라이트 위험 영역 = 옅은 베이지/주황 — destructive `#C0392B` 텍스트와 결합 시 위험 시각 보존) | 위험 영역 배경 (구독 활성 배너) |
| `toastBg` | `rgba(30,34,60,0.95)` | `rgba(220,212,200,0.95)` (라이트 surface 와 비슷 + alpha 95% — toast 의도 보존) | toast bg |

#### 3.1.1 라이트 hex 결정 근거 (팔레트 정합)

라이트 팔레트 베이스: `bgPrimary #FBF7F0` (베이지) / `textPrimary #1C1A18` (짙은 갈색) / `accentPrimary #3A5A88` (진한 남색) / `destructive #C0392B` (짙은 빨강) / `border #C8BEB0` (옅은 베이지) — 따뜻한 베이지 + 짙은 갈색 + 진한 남색 무드.

- **`textHighlight` light = `#0F0E0D`** — textPrimary 보다 *더 짙은* 갈색-블랙. 헤드라인은 본문 (textPrimary) 보다 강조. 다크의 `#F5F5F5` (textPrimary `#EEF0F8` 보다 흰색에 가까운) 의도 보존.
- **`textBody` light = `#3D352E`** — textPrimary 보다 *조금 옅은* 갈색. 결제 본문이 textPrimary 보다 약하게 보여야 함 (다크의 `#A0A5C0` 가 textPrimary 보다 옅은 의도).
- **`textBodyHigh` light = `#2C2A26`** — textPrimary 와 textBody 사이. S16/AccDel 의 *행 라벨* 이 헤드라인보다는 약하지만 본문보다는 강조되는 톤.
- **`textBodyMuted` light = `#5A4F45`** — textSecondary `#6B6055` 보다 옅음 → modal 부제 dim 의도 (`#B0B4CC` 다크가 textSecondary `#7B80A0` 보다 옅었음 정합).
- **`textOnAccent` light = `#FFFFFF`** — `interactive #3A5FE0` / `accentPrimary #3A5A88` 위에 항상 흰색. 라이트에서도 accent 가 진한 파랑이라 흰색 텍스트 가독성 충분.
- **`textMuted` light = `#8A8278`** — textSecondary 보다 옅은 회색 (`#4A4E68` 다크 = textSecondary `#7B80A0` 보다 옅었음 정합).
- **`interactive` light = `#3A5FE0`** — `accentPrimary #3A5A88` 보다 채도 ↑ 진한 파랑. 결제·Premium 강조 의도 보존. accentPrimary 와 차별화 + 라이트 베이지 위 *눈에 띄는* 시각.
- **`destructiveBg` light = `#F4E8DC`** — 베이지 + 살짝 주황 톤. 구독 배너 ("구독 해지 후 탈퇴 가능") 의 위험 시각 = destructive (`#C0392B`) 텍스트가 그 위에 박혀야 함. 어두운 베이지 위 짙은 빨강 = 위험 영역 시각 보존.
- **`toastBg` light = `rgba(220,212,200,0.95)`** — 라이트 surface (`#E8E0D4`) 와 비슷한 hex (RGB 차이 작음) + alpha 95%. toast 가 라이트 모드에서도 어두운 배경 위가 아닌 surfaceHigh 톤으로 떠 있음.

#### 3.1.2 토큰명 흡수 검토 — 모두 *별도 토큰 유지* 결정

대안 검토: `textHighlight` 와 `textPrimary` 흡수 (다크 채널 차이 +7/+5/-3 = ~5dp avg) 가능?
- 흡수 시 다크 모드에서 헤드라인 (S14/S15/S17/S16/AccDel 의 `headline`) 이 textPrimary `#EEF0F8` 로 변경 → R-7/G-5/B+3 = ~5dp 변화. 시각 식별 어려움 가능 *그러나*:
- task 02/03 의 작업자가 *의도적으로* `#F5F5F5` 를 *headline 강조* 로 박았음. textPrimary 와 차별 의도가 코드에 명시. 흡수 = 의도 손실 위험.
- 본 task 의 비용 (토큰 1 추가) 이 의도 손실 위험보다 작음 → **별도 토큰 유지**.

`textBodyHigh` 와 `textHighlight` 흡수 가능? 다크 채널 차이 21/19/29 = ~23dp avg → **불가**, 별도 유지.

`textBody` 와 `textBodyHigh` 흡수 가능? 다크 `#A0A5C0` vs `#E0E2F0` 채널 차이 64/61/48 = ~58dp avg → **불가**.

`textOnAccent` 와 `textPrimary` 흡수 가능? 다크 `#FFFFFF` vs `#EEF0F8` ~17dp → 라이트 `#FFFFFF` vs `#1C1A18` 매우 큼 → **불가** (라이트에서 accent 위 흰색이 textPrimary 짙은 갈색이 되면 가독성 0). 별도 유지.

→ 9 토큰 모두 별도 유지가 안전한 결정.

### 3.2 토큰 명명 컨벤션 — 의미 기반 (semantic) 유지

기존 ColorTokens (`bgPrimary`, `textPrimary`, `accentPrimary`, `destructive`, `success`, `overlay` …) = 의미 기반. 본 task 신규 토큰도 동일 컨벤션 채택:
- `textHighlight` / `textBody` / `textBodyHigh` / `textBodyMuted` / `textOnAccent` / `textMuted` = text* 계열 일관
- `interactive` = 의미 기반 (CTA·강조·결제 등 *상호작용* 의도) — `subscribeCta` 처럼 도메인 한정 X
- `destructiveBg` = `destructive` 와 정합 (배경 변형)
- `toastBg` = 컴포넌트 한정 토큰 (이번엔 toast 만 사용 — 다른 컴포넌트가 같은 hex 쓰면 토큰 일반화 검토)

### 3.3 다크 회귀 0 — 핵심 전략

darkColors[<신규>] = task 02/03 발견 hex *그대로*. 시각 변화 0 보장. 본 task 가 darkColors 의 기존 15 토큰을 *변경 X*. tokens.test.ts 의 기존 darkColors hex assertion 18개 (toBe 정확 일치) 모두 그대로 유지 — 회귀 발견 즉시 빨간 신호.

### 3.4 라이트 모드 색 결정 — 디자이너 부재 컨텍스트 처리

epic-12 PRD §3.2 = "라이트 색은 디자이너 합의 필요 — 미정 시 architect 추정". 본 task 는 디자이너 부재 컨텍스트 → architect 가 §3.1.1 의 "팔레트 의도 + 코드 SSOT 기반 추정" 으로 1차 결정. 추후 디자인 검수 시 별도 PR 로 조정 가능.

각 라이트 hex 결정의 *변경 비용 LOW*: tokens.ts 의 lightColors 객체 1줄 수정 → 5 파일 자동 반영. roll-back 비용 0.

### 3.5 PR 단위 — Phase 1 + Phase 2 1 PR 권장 (architect 결정)

**옵션 A (권장): Phase 1 + Phase 2 = 1 PR**
- 정의 (tokens.ts) + 적용 (5 파일 교체) 일체화
- task 02/03 의 "보류 hex" 가 *본 task 머지 시점에 0 으로 떨어짐*
- AC-1 (5 파일 hex 0건) 본 PR 머지 즉시 충족
- PR 변경 라인 수 ~80~100 라인 (tokens.ts 30 + 5 파일 50~70) — 1 PR 적정

**옵션 B: Phase 1 (tokens.ts) + Phase 2 (5 파일) 분할 = 2 PR**
- Phase 1 머지 시점에서 신규 토큰 정의 *되었지만 사용처 0* → dead code 잠시 발생
- Phase 2 머지까지 보류 hex 잔존 → AC-1 미충족 시점 연장
- 분할 이점 = 리뷰 부담 감소 *그러나* 본 task 변경량 자체가 크지 않음

**결정 = 옵션 A**. 단 engineer 가 PR 변경 라인 수 폭증 (예: tokens.test.ts 추가 assertion + 5 파일 교체 + missing-tokens-applied.test.ts 신규) 으로 리뷰 부담 호소 시 분할 가능. branch_prefix 그대로 유지 (`feat/epic12-task04-missing-tokens` 머지 후 `feat/epic12-task04-missing-tokens-apply` 신규).

### 3.6 외부 SDK / API / DB 영향 0

- **외부 SDK**: revenue-cat / accountApi / dataManagementApi / AudioEngine / AsyncStorage / expo-file-system / react-navigation / react-native-purchases / rewardedAdService / AdMob — 변경 0.
- **DB**: 영향 0 (`docs/db-schema.md` 참조 — 색상 토큰은 DB 와 무관).
- **API**: 변경 0.
- **navigation**: 변경 0.
- **테스트 환경**: jest 설정 변경 0. tokens.test.ts 갱신 + missing-tokens-applied.test.ts 신규 추가만.

## 4. 인터페이스 (TypeScript)

### 4.1 ColorTokens 타입 확장 (tokens.ts)

```ts
export type ColorTokens = {
  // ─── 기존 15 (변경 X) ───
  accentPrimary:    string;
  accentSecondary:  string;
  bgPrimary:        string;
  bgDeep:           string;
  surface:          string;
  surfaceHigh:      string;
  textPrimary:      string;
  textSecondary:    string;
  border:           string;
  destructive:      string;
  success:          string;
  overlay:          string;
  accentPrimary14:  string;
  accentPrimary20:  string;
  accentPrimary33:  string;
  // ─── 신규 9 (task 04 epic-12) ───
  textHighlight:    string;  // 헤드라인·toastText·고대비 텍스트
  textBody:         string;  // 결제 본문
  textBodyHigh:     string;  // S16/AccDel 본문 강조
  textBodyMuted:    string;  // AccDel modalSubtitle
  textOnAccent:     string;  // accent 위 영구 화이트 텍스트
  textMuted:        string;  // 약관 dim / chevron / version
  interactive:      string;  // 결제 CTA / Premium 배지 / 강조 링크
  destructiveBg:    string;  // 위험 영역 배경
  toastBg:          string;  // toast bg (rgba 포함 가능)
};
```

### 4.2 darkColors / lightColors 9 토큰 추가

```ts
export const darkColors: ColorTokens = {
  // ─── 기존 15 (변경 X) ───
  // ... (변경 0)
  // ─── 신규 9 (다크 = task 02/03 발견 hex 그대로) ───
  textHighlight:    '#F5F5F5',
  textBody:         '#A0A5C0',
  textBodyHigh:     '#E0E2F0',
  textBodyMuted:    '#B0B4CC',
  textOnAccent:     '#FFFFFF',
  textMuted:        '#4A4E68',
  interactive:      '#4A6FFF',
  destructiveBg:    '#2A1A0F',
  toastBg:          'rgba(30, 34, 60, 0.95)',
};

export const lightColors: ColorTokens = {
  // ─── 기존 15 (변경 X) ───
  // ... (변경 0)
  // ─── 신규 9 (라이트 = architect 1차 결정 — §3.1.1 근거) ───
  textHighlight:    '#0F0E0D',
  textBody:         '#3D352E',
  textBodyHigh:     '#2C2A26',
  textBodyMuted:    '#5A4F45',
  textOnAccent:     '#FFFFFF',
  textMuted:        '#8A8278',
  interactive:      '#3A5FE0',
  destructiveBg:    '#F4E8DC',
  toastBg:          'rgba(220, 212, 200, 0.95)',
};
```

> `toastBg` 만 `rgba(...)` 포함 — RN StyleSheet 에서 `rgba()` string 정합 (jest snapshot 도 정합).

### 4.3 5 파일 교체 매핑 (engineer 의 검색·치환 가이드)

| 발견 hex | 신규 토큰 참조 |
|---|---|
| `'#F5F5F5'` | `colors.textHighlight` |
| `'#A0A5C0'` | `colors.textBody` |
| `'#E0E2F0'` | `colors.textBodyHigh` |
| `'#B0B4CC'` | `colors.textBodyMuted` |
| `'#FFFFFF'` (5 파일 한정 — task 02/03 보류 hex 군) | `colors.textOnAccent` |
| `'#4A4E68'` | `colors.textMuted` |
| `'#4A6FFF'` | `colors.interactive` |
| `'#2A1A0F'` | `colors.destructiveBg` |
| `'rgba(30, 34, 60, 0.95)'` | `colors.toastBg` |

> **주의**: `'#FFFFFF'` 는 본 task 5 파일 외 다른 파일 (task 01 처리 분 / 다른 컴포넌트) 에서 다른 의도로 사용 중일 수 있음 → 본 task 의 grep 범위는 5 대상 파일 한정. 5 파일 *외* 의 `#FFFFFF` 는 본 task 가 손대지 X.

### 4.4 tokens.test.ts 갱신

```ts
const REQUIRED_KEYS: (keyof ColorTokens)[] = [
  // ─── 기존 15 (변경 X) ───
  'accentPrimary', 'accentSecondary', 'bgPrimary', 'bgDeep',
  'surface', 'surfaceHigh', 'textPrimary', 'textSecondary',
  'border', 'destructive', 'success', 'overlay',
  'accentPrimary14', 'accentPrimary20', 'accentPrimary33',
  // ─── 신규 9 (task 04) ───
  'textHighlight', 'textBody', 'textBodyHigh', 'textBodyMuted',
  'textOnAccent', 'textMuted', 'interactive', 'destructiveBg',
  'toastBg',
];

// 키셋 카운트 변경: 15개 → 24개
it('ColorTokens 필수 키 24개를 모두 포함한다', () => {
  for (const key of REQUIRED_KEYS) {
    expect(darkColors).toHaveProperty(key);
  }
});

// darkColors 신규 9 토큰 정확 hex assertion
describe('darkColors — 신규 토큰 hex 값 (task 04 missing-tokens)', () => {
  it('textHighlight: #F5F5F5', () => expect(darkColors.textHighlight).toBe('#F5F5F5'));
  it('textBody: #A0A5C0', () => expect(darkColors.textBody).toBe('#A0A5C0'));
  it('textBodyHigh: #E0E2F0', () => expect(darkColors.textBodyHigh).toBe('#E0E2F0'));
  it('textBodyMuted: #B0B4CC', () => expect(darkColors.textBodyMuted).toBe('#B0B4CC'));
  it('textOnAccent: #FFFFFF', () => expect(darkColors.textOnAccent).toBe('#FFFFFF'));
  it('textMuted: #4A4E68', () => expect(darkColors.textMuted).toBe('#4A4E68'));
  it('interactive: #4A6FFF', () => expect(darkColors.interactive).toBe('#4A6FFF'));
  it('destructiveBg: #2A1A0F', () => expect(darkColors.destructiveBg).toBe('#2A1A0F'));
  it('toastBg: rgba(30, 34, 60, 0.95)', () =>
    expect(darkColors.toastBg).toBe('rgba(30, 34, 60, 0.95)'));
});

// lightColors 신규 9 토큰 정확 hex assertion (architect 1차 결정값)
describe('lightColors — 신규 토큰 hex 값 (task 04 missing-tokens)', () => {
  it('textHighlight: #0F0E0D', () => expect(lightColors.textHighlight).toBe('#0F0E0D'));
  it('textBody: #3D352E', () => expect(lightColors.textBody).toBe('#3D352E'));
  it('textBodyHigh: #2C2A26', () => expect(lightColors.textBodyHigh).toBe('#2C2A26'));
  it('textBodyMuted: #5A4F45', () => expect(lightColors.textBodyMuted).toBe('#5A4F45'));
  it('textOnAccent: #FFFFFF', () => expect(lightColors.textOnAccent).toBe('#FFFFFF'));
  it('textMuted: #8A8278', () => expect(lightColors.textMuted).toBe('#8A8278'));
  it('interactive: #3A5FE0', () => expect(lightColors.interactive).toBe('#3A5FE0'));
  it('destructiveBg: #F4E8DC', () => expect(lightColors.destructiveBg).toBe('#F4E8DC'));
  it('toastBg: rgba(220, 212, 200, 0.95)', () =>
    expect(lightColors.toastBg).toBe('rgba(220, 212, 200, 0.95)'));
});
```

> 기존 18 darkColors hex it + 18 lightColors hex it 그대로 유지 (변경 X).

### 4.5 missing-tokens-applied.test.ts (신규 회귀 테스트)

```ts
/**
 * task 04 missing-tokens-define-and-apply
 *
 * 5 대상 파일 (S14/S15/S16/S17/AccDel) 에서:
 * (1) 본 task 가 토큰화한 9 hex 가 *factory 본문 외부 또는 인라인* 위치에 0건
 * (2) 신규 토큰 9종 (`colors.textHighlight` 등) 참조 ≥1 회
 *
 * task 09 (hex-lint 회귀 테스트) 도입 전까지의 1차 회귀 방지선.
 */
import * as fs from 'fs';
import * as path from 'path';

const TARGET_FILES = [
  'src/screens/S14UpgradeSheet.tsx',
  'src/screens/S15SubscribeScreen.tsx',
  'src/screens/S17TrialExpiredScreen.tsx',
  'src/screens/S16SettingsScreen.tsx',
  'src/screens/AccountDeletionScreen.tsx',
];

const REPLACED_HEX_LITERALS = [
  '#F5F5F5', '#A0A5C0', '#E0E2F0', '#B0B4CC',
  '#FFFFFF', '#4A4E68', '#4A6FFF', '#2A1A0F',
];
const REPLACED_RGBA = 'rgba(30, 34, 60, 0.95)';

const NEW_TOKEN_REFS = [
  'colors.textHighlight', 'colors.textBody', 'colors.textBodyHigh',
  'colors.textBodyMuted', 'colors.textOnAccent', 'colors.textMuted',
  'colors.interactive', 'colors.destructiveBg', 'colors.toastBg',
];

describe('task 04 missing-tokens — 5 대상 파일 hex 잔존 0', () => {
  for (const rel of TARGET_FILES) {
    it(`${rel}: 처리 hex 9종 + rgba 0건`, () => {
      const abs = path.resolve(__dirname, '../../', rel);
      const src = fs.readFileSync(abs, 'utf-8');
      for (const hex of REPLACED_HEX_LITERALS) {
        // hex 가 ' 또는 " 로 wrap 된 형태만 검사 (주석/문자열 안 의도된 해시는 제외)
        const re = new RegExp(`['"]${hex.replace('#', '#')}['"]`, 'g');
        const matches = src.match(re);
        expect(matches).toBeNull();
      }
      // rgba 도 동일
      expect(src.includes(`'${REPLACED_RGBA}'`)).toBe(false);
      expect(src.includes(`"${REPLACED_RGBA}"`)).toBe(false);
    });
  }
});

describe('task 04 missing-tokens — 5 대상 파일 신규 토큰 참조 ≥1', () => {
  for (const rel of TARGET_FILES) {
    it(`${rel}: 신규 토큰 9종 중 ≥1 참조`, () => {
      const abs = path.resolve(__dirname, '../../', rel);
      const src = fs.readFileSync(abs, 'utf-8');
      const found = NEW_TOKEN_REFS.filter((tok) => src.includes(tok));
      expect(found.length).toBeGreaterThanOrEqual(1);
    });
  }
});
```

> 위 테스트가 실패하면 = 5 파일 중 어디선가 보류 hex 가 잔존 → engineer 가 그 파일 1행씩 재검토. 회귀 방지 1차 방어선.

## 5. 핵심 로직 (의사코드)

### 5.1 Phase 1 — tokens.ts 갱신 (단일 파일)

```
1. ColorTokens 타입에 신규 9 토큰 추가 (4.1 인용 그대로)
2. darkColors 객체에 신규 9 토큰 hex 추가 (4.2 darkColors 인용)
   ── task 02/03 발견 hex 그대로 (다크 회귀 0)
3. lightColors 객체에 신규 9 토큰 hex 추가 (4.2 lightColors 인용)
   ── architect 1차 결정값 (§3.1.1 근거)
4. tokens.test.ts 갱신:
   ── REQUIRED_KEYS 9개 추가 (총 24)
   ── '15개' 문자열 → '24개' 갱신
   ── darkColors / lightColors 신규 9 토큰 hex assertion 18 it 추가
5. jest 실행 → tokens.test.ts GREEN 확인
```

### 5.2 Phase 2 — 5 파일 일괄 hex 교체

```
for each file in [S14, S15, S17, S16, AccDel]:
  1. 파일 읽기 — task 02/03 머지 후 상태 (factory + useTheme + 보류 hex 잔존)
  2. factory 안 보류 hex 1행씩 검색·치환 (4.3 매핑 표):
     - '#F5F5F5'  → colors.textHighlight
     - '#A0A5C0'  → colors.textBody
     - '#E0E2F0'  → colors.textBodyHigh
     - '#B0B4CC'  → colors.textBodyMuted
     - '#FFFFFF'  → colors.textOnAccent  (5 대상 파일 한정 — 다른 파일은 손대지 X)
     - '#4A4E68'  → colors.textMuted
     - '#4A6FFF'  → colors.interactive
     - '#2A1A0F'  → colors.destructiveBg
     - 'rgba(30, 34, 60, 0.95)' → colors.toastBg
  3. JSX 인라인 hex 도 동일 (예: AccDel L264 ActivityIndicator color="#FFFFFF" → color={colors.textOnAccent})
  4. TODO(task 04) 주석 *모두 제거* — 보류가 해소됨
  5. file-by-file grep — 위 9 hex + rgba 가 0건 확인 (정규식 `/['"](#F5F5F5|#A0A5C0|...)['"]/`)
  6. 신규 토큰 참조 ≥1 grep 확인
```

### 5.3 검증 절차

```
1. jest run:
   - tokens.test.ts (기존 + 신규 it 모두 GREEN)
   - missing-tokens-applied.test.ts (신규 — 5 파일 hex 0 + 토큰 ≥1 GREEN)
   - 기존 task 01/02/03 테스트 (paywall-processed-hex-map / settings-deletion-processed-hex-map / S15.theme / S17.theme / S16.theme / AccountDeletion.theme) 모두 GREEN 회귀 0
2. 시각 검증 (manual — REQ-008/009/010):
   - 다크 모드: S14/S15/S16/S17/AccDel 진입 → Epic 12 작업 전 캡처와 동일 (회귀 0)
   - 라이트 모드: 5 화면 진입 → §3.1.1 라이트 결정값이 베이지 팔레트 위 가독성 OK
```

## 6. 다른 모듈과의 경계

- **상위 의존**: `@theme/tokens` (변경 = 본 task 책임), `@hooks/useTheme` (변경 0).
- **하위 의존 (Phase 2 적용 대상)**: 5 화면 파일. 본 task 가 *교체만* — Props/렌더 동작 변경 0.
- **graceful 동작**: 본 task 의 신규 토큰 9종은 ColorTokens 타입 *필수* (옵셔널 X) → useTheme 호출자 모두 자동 노출. 부재 graceful 불필요.
- **Breaking Change 검토**:
  - ColorTokens 타입 확장 → 기존 useTheme 호출자가 *새 키 9개에 무지한 경우*에도 영향 0 (TypeScript = 추가 키 접근 시점에만 검사). 호출 변경 0.
  - tokens.ts 의 기존 15 토큰 hex 변경 0 → Story 1~3 (task 01/02/03) 처리 분 시각 회귀 0.
  - 5 화면 파일 props 시그니처 / export / navigation 변경 0.
  - **Breaking Change = 없음**.
- **역방향 cascade 필요 시 DIP interface**: 불필요 (단방향 — 화면이 tokens.ts 를 import).
- **의존 부재 graceful**: useTheme 부재 시 ColorTokens 반환 보장 (`useTheme.ts` 기존 동작) — 영향 0.

## 7. 테스트 환경 영향

- 기존 jest 테스트 영향 0 (tokens.test.ts 만 갱신, 다른 테스트는 ColorTokens 의 *추가* 키만 인지).
- 신규 테스트 1개 (`missing-tokens-applied.test.ts`) — 회귀 방지 1차 방어선. fs.readFileSync 기반 source 파싱 (jest 표준).
- task 09 (hex-lint) 도입 후 본 테스트가 부분 중복 → task 09 head 에서 통합 결정 (architect MODULE_PLAN task 09 책임).

## 8. 모듈 = 테스트 단위 정합 (self-check)

1. **테스트 단위 정합**:
   - tokens.ts 갱신 → tokens.test.ts 의 키셋 + hex assertion 으로 명확 PASS/FAIL.
   - 5 파일 교체 → missing-tokens-applied.test.ts 의 hex grep + 토큰 참조 grep 으로 명확 PASS/FAIL.
   - 변경 이유 단일 (= "누락 토큰 정의 + task 02/03 보류 적용") — SRP 충족.
2. **의존성 묶음 정합**:
   - 의존 = `@theme/tokens` (단일). 단방향. 역방향 cascade 0. DIP 불필요.
   - 단독 lifecycle = tokens.ts 만 갱신 시 → ColorTokens 신규 키 9개가 *unused* 로 잠시 존재. dead code 잠시 발생. Phase 2 1초 후 적용 시 dead code 0. 옵션 A (1 PR) 머지 시 dead code 잔존 0.
3. **테스트 가능성 ✓** — 모듈 분할/통합 권유 0.

## 9. 수용 기준

| ID | 내용 | 검증 방법 | 통과 조건 |
|---|---|---|---|
| REQ-001 | ColorTokens 타입에 신규 9 토큰 (`textHighlight`, `textBody`, `textBodyHigh`, `textBodyMuted`, `textOnAccent`, `textMuted`, `interactive`, `destructiveBg`, `toastBg`) 추가 | (TEST) `tokens.test.ts` REQUIRED_KEYS 24개 키셋 검증 | dark/light 모두 24개 키 존재 PASS |
| REQ-002 | darkColors 신규 9 토큰 hex = task 02/03 발견 hex 그대로 (다크 회귀 0) | (TEST) `tokens.test.ts` darkColors 신규 9 it 블록 — `darkColors.textHighlight === '#F5F5F5'` 등 9 assertion | 9/9 PASS |
| REQ-003 | lightColors 신규 9 토큰 hex = §3.1.1 architect 결정값 | (TEST) `tokens.test.ts` lightColors 신규 9 it 블록 — `lightColors.textHighlight === '#0F0E0D'` 등 9 assertion | 9/9 PASS |
| REQ-004 | tokens.ts 의 기존 15 토큰 dark/light hex 변경 X (회귀 0) | (TEST) `tokens.test.ts` 기존 it 블록 (darkColors 12 hex + lightColors 12 hex + 파생 6 = 30) 모두 GREEN | 30/30 PASS |
| REQ-005 | 5 대상 파일 (S14/S15/S17/S16/AccDel) 에 처리 hex 9종 + rgba 가 *문자열 리터럴* 위치에 0건 | (TEST) `missing-tokens-applied.test.ts` — `/['"](#F5F5F5\|#A0A5C0\|#E0E2F0\|#B0B4CC\|#FFFFFF\|#4A4E68\|#4A6FFF\|#2A1A0F)['"]/g` match 0 + rgba string 0 | 5/5 파일 0건 PASS |
| REQ-006 | 5 대상 파일에 신규 토큰 참조 (`colors.<신규>`) ≥1 회 | (TEST) 동일 — 9 토큰 중 1개 이상 grep 매치 | 5/5 PASS |
| REQ-007 | 다크 모드 5 화면 시각 회귀 0 — Epic 12 작업 전 캡처와 동일 | (MANUAL) iOS 시뮬레이터 다크 → S14 (S15 → 구독하기) / S15 (S16 → 구독 관리) / S17 (trial 만료 mock) / S16 (메인탭 설정) / AccDel (S16 → 계정 탈퇴) 5 화면 진입 + Epic 12 이전 캡처 비교 | 5/5 동일 PASS |
| REQ-008 | 라이트 모드 5 화면 hex 0 시각 검증 — 헤드라인 `#0F0E0D`, 본문 `#3D352E` 등 라이트 결정값 적용 + 베이지 팔레트 위 가독성 OK | (MANUAL) 라이트 모드 진입 → S14 sheet headline 짙은 갈색 / S15 container 베이지 + planCard 카드 라이트 surface + 헤드라인 짙은 갈색 + 구독 버튼 진한 파랑 (`#3A5FE0`) + 흰 텍스트 / S17 동일 / S16 헤더 라이트 + Premium 배지 진한 파랑 + chevron `#8A8278` / AccDel 구독 배너 옅은 베이지 (`#F4E8DC`) + 빨강 텍스트 + modal 라이트 bgDeep + 최종 탈퇴 짙은 빨강 + 흰 텍스트 | 5/5 가독성 OK PASS |
| REQ-009 | 라이트 모드에서 *결제 / 구독 / 탈퇴 / 설정 토글* 흐름 변경 0 — REQ-007/008 캡처 도중 흐름 검증 | (MANUAL) 라이트 모드 S15 → 월간 카드 선택 → 구독 시작하기 (revenue-cat purchasePackage mock 호출) / S16 → 라디오 light 선택 → 즉시 라이트 전환 / AccDel → 사유 선택 → 다음 → modal → 네 탈퇴 (deleteMyAccount mock) | 모든 흐름 정상 PASS |
| REQ-010 | task 02/03 의 보류 hex 잔존 0 — task 02 plan §10.1 + task 03 plan §10.1 의 *처리 후 라이트 가독성 저하* 항목들이 본 task PR 머지 시점에 모두 해소 | (MANUAL) task 02/03 의 §10.1 라이트 캡처 비교 항목 (`#F5F5F5 그대로` / `#A0A5C0 그대로` / `#4A6FFF 그대로` / `#E0E2F0 그대로` / `#B0B4CC 그대로` / `#2A1A0F 그대로`) 가 모두 *해소된 상태* (라이트 결정값으로 전환) 캡처 | 6/6 해소 PASS |
| REQ-011 | tokens.test.ts 의 기존 useTheme.test.ts 회귀 0 — 신규 토큰 추가가 useTheme 호출 동작 변경 X | (TEST) `useTheme.test.ts` 30 it 모두 GREEN | 30/30 PASS |
| REQ-012 | 직접 색·폰트·간격 리터럴 사용 금지 (5 대상 파일 한정) | (TEST) `missing-tokens-applied.test.ts` REQ-005 와 동일 | 0건 PASS |

## 10. 주의사항

### 10.1 DB 영향도

**없음** — 색상 토큰만 변경. DDL/마이그레이션 0. `docs/db-schema.md` 참조 변경 0.

### 10.2 외부 SDK 영향도

- **react-native-purchases (RevenueCat)**: 변경 0.
- **AdMob (rewardedAdService)**: 변경 0.
- **AudioEngine**: 변경 0.
- **AsyncStorage**: 변경 0.
- **expo-file-system**: 변경 0.
- **react-navigation**: 변경 0.
- **accountApi / dataManagementApi**: 변경 0.

### 10.3 회귀 위험 + 완화

- **위험 1 (HIGH — 라이트 hex 결정 1차 추정)**: §3.1.1 라이트 hex 9개가 architect 1차 추정 (디자이너 부재 컨텍스트). 시각 검수 시 `textBody #3D352E` 등이 베이지 팔레트와 불일치할 가능성.
  - **완화**: REQ-008 라이트 캡처에서 디자이너 합의 항목 표시. 합의 결과 다른 hex 결정 시 tokens.ts lightColors 1줄 수정 → 5 파일 자동 반영. roll-back 비용 LOW. 별도 PR 가능.
- **위험 2 (MEDIUM — `interactive` 라이트값 디자이너 합의 필요)**: `#3A5FE0` 진한 파랑이 라이트 베이지 위 도드라짐 (의도) 또는 어색 (위배) 가능. accentPrimary `#3A5A88` 와 차별화 필요.
  - **완화**: REQ-008 라이트 캡처 + S15 구독 버튼 / S16 Premium 배지 시각 비교. 어색 시 `#3A5A88` 동일 흡수 또는 다른 hex 검토 (별도 PR).
- **위험 3 (MEDIUM — `destructiveBg` 라이트값 의도 보존)**: `#F4E8DC` (옅은 베이지/주황) 가 *위험 영역 시각* 보존? destructive 텍스트 `#C0392B` 와 결합 시 가독성 OK 인지.
  - **완화**: REQ-008 AccDel 구독 배너 시각 검증. 어색 시 `#FCE6D8` (살짝 더 주황) 또는 `#FFEBE0` 등 검토.
- **위험 4 (LOW — `toastBg` 라이트값 alpha 95%)**: `rgba(220, 212, 200, 0.95)` 가 라이트 surface (`#E8E0D4`) 와 *너무 비슷* → toast 가 배경에 묻혀 안 보일 가능성.
  - **완화**: REQ-008 toast 진입 시각 검증 (S14/S15 결제 후 토스트). 어색 시 alpha ↑ (0.98) 또는 hex 더 어둡게.
- **위험 5 (LOW — `textOnAccent` 라이트=`#FFFFFF` 결정)**: 라이트 모드에서 accent 위 흰 텍스트 = 라이트 베이지 배경 위 진한 파랑 위 흰색. 가독성 OK 인지.
  - **완화**: §3.1.1 `interactive #3A5FE0` 가 충분히 진한 파랑이라 흰 텍스트 가독성 보장 — 디자이너 검수 시 재확인.
- **위험 6 (MEDIUM — 5 파일 일괄 교체 PR 충돌)**: task 02/03 머지와 본 task PR 작성 사이에 다른 PR 이 같은 파일 수정 시 머지 충돌.
  - **완화**: task 02/03 머지 직후 본 task 진입 권장. branch_prefix `feat/epic12-task04-missing-tokens` 의 base = task 03 머지 후 main 최신.
- **위험 7 (LOW — missing-tokens-applied.test.ts 의 fs.readFileSync 경로 정합)**: `path.resolve(__dirname, '../../', rel)` 가 jest 환경에서 절대 경로 정합 보장.
  - **완화**: jest 표준 패턴. 기존 `auth-onboarding-no-raw-hex.test.ts` (task 01) 가 동일 패턴 사용 시 그 패턴 차용.

### 10.4 PR 후 시각 회귀 발견 시 rollback 절차

- `git revert <머지 커밋>` 단일 커밋. tokens.ts 9 토큰 + 5 파일 교체 통째 원복. tokens.test.ts 갱신 + missing-tokens-applied.test.ts 신규도 동시 원복.
- 영향 범위 = tokens.ts + 5 화면. task 01/05~09 영향 0 (task 01 처리 분은 본 task 가 손대지 X).
- 단 *일부 라이트 hex 만* 조정 시 = revert 불필요. tokens.ts lightColors 1줄 수정 → 5 파일 자동 반영.

### 10.5 PR 단위 권장

- **1 PR (Phase 1 + Phase 2)** — §3.5 옵션 A.
- 커밋 분할:
  1. tokens.ts 9 토큰 정의 (Phase 1)
  2. tokens.test.ts 9 토큰 assertion 추가
  3. S14 보류 hex 교체 + TODO 주석 제거
  4. S15 동일
  5. S17 동일
  6. S16 동일
  7. AccountDeletion 동일
  8. missing-tokens-applied.test.ts 신규
  = 총 8 커밋 권장.

### 10.6 task 09 (hex-lint) 와의 관계

본 task 의 `missing-tokens-applied.test.ts` = **5 대상 파일 한정** 회귀 방지선. task 09 (`09-regression-test-jest-hex-lint.md`) = **앱 전체 hex-lint** 도입 책임. 본 task PR 머지 시점에서는 5 파일 외 다른 파일 (예: task 01 처리 분, M1 task 05~07 미처리 분) 의 hex 잔존 검증 X. task 09 머지 시점에서 통합 회귀 방지선 완성.

> task 09 architect 가 본 task 의 `missing-tokens-applied.test.ts` 를 제거 또는 흡수 결정. 본 task 는 그 결정을 *제약하지 X*.

### 10.7 task 02/03 의 TODO 주석 모두 제거

본 task 의 Phase 2 작업자 (engineer) 는 5 파일 안 `// TODO(task 04 token-define)` / `// TODO(task 04)` 주석 *모두 제거*. 보류가 해소되었으므로 주석이 의미 잃음. grep `TODO\(task 04` = 0건 확인 권장 (REQ 외 self-check).

## 11. 의존성

- **선행 task**: task 03 (settings-deletion) — task 02 + task 03 머지 후 본 task 진입. 본 task 의 *5 파일* 모두 task 02/03 의 처리 분 (factory + useTheme) 위에 hex 만 토큰 교체.
- **후행 task**: task 05 (m1a-core-flow-screens) — task 04 의 신규 9 토큰을 *즉시 활용* 가능. task 05~07 가 신규 hex 발견 시 본 task 가 정의한 토큰 재사용.
- **후행 task 09**: hex-lint 회귀 테스트 — 본 task 의 `missing-tokens-applied.test.ts` 통합 또는 별도 유지.
- **외부**: 없음.

## 12. 게이트 self-check (architect/module-plan SOP 12 항목)

| # | 항목 | 충족 | 비고 |
|---|---|---|---|
| 1 | 생성/수정 파일 목록 확정 | ✓ | §2 — tokens.ts + tokens.test.ts + 5 화면 + missing-tokens-applied.test.ts |
| 2 | 인터페이스 TypeScript 타입 명시 | ✓ | §4.1 ColorTokens 신규 9 토큰 + §4.2 darkColors/lightColors hex |
| 3 | 의존 모듈 실제 인터페이스 직접 확인 | ✓ | tokens.ts (15 토큰) / useTheme.ts / tokens.test.ts (30 it) / 5 화면 hex 잔존 (44+2 매치) 모두 read 완료. task 02/03 plan 의 보류 hex 카운트 인용 |
| 4 | 에러 처리 명시 | ✓ | useTheme 항상 valid ColorTokens (변경 0). tokens.test.ts 갱신 시 카운트 mismatch 발견 시 즉시 RED |
| 5 | 페이지 전환·상태 초기화 순서 | N/A | 본 task = 색상 토큰 + 교체. 화면 동작 변경 0 |
| 6 | DB 영향도 분석 | ✓ | 없음 (§10.1) |
| 7 | Breaking Change 검토 | ✓ | 없음 (§6) — ColorTokens 타입 *추가* 만, 기존 키 변경 0. 외부 export 시그니처 0 변경 |
| 8 | 핵심 로직 의사코드 | ✓ | §5 (Phase 1 5단계 + Phase 2 6단계 + 검증 2단계) |
| 9 | TypeScript 타입 정합 | ✓ | ColorTokens 9 신규 키 모두 string (옵셔널 X). useTheme 자동 노출 |
| 10 | import 완전성 | ✓ | tokens.ts 변경, 5 파일 import 변경 0 (이미 useTheme + ColorTokens import 됨 — task 02/03 처리 분). missing-tokens-applied.test.ts 의 fs/path import 명시 |
| 11 | 수용 기준 + 메타데이터 | ✓ | §9 표 12 행 (REQ-001 ~ REQ-012) + frontmatter |
| 12 | 모듈 = 테스트 단위 정합 | ✓ | §8 self-check 3 항목 모두 ✓ |

추가 게이트 (epic-12 한정):
- **system-design §8 Option α 정합**: ✓ NN=04, 슬러그 = `missing-tokens-define-and-apply` (system-design impl 목차 표 행과 정확 일치).
- **task 02/03 보류 hex 일괄 해소**: ✓ §2 표 — 5 파일 hex 0 보장.
- **다크 회귀 0**: ✓ §3.3 + REQ-002 (다크 hex = 발견 hex 그대로) + REQ-007 (시각 검증).
- **라이트 1차 결정값 근거**: ✓ §3.1.1 (팔레트 정합 + 의도 보존 9 항목 인용).
- **디자인 토큰 의존성 가드레일**: 본 task = tokens.ts 정의 task → 직접 hex 사용 정당. 5 파일 적용에서는 hex 0건 강제 (REQ-005/012).

---

## 13. 결론 + 권장 다음 단계

본 module-plan 은 system-design §8 Option α 재정렬에 따라 신규 task 04 (`missing-tokens-define-and-apply`) 의 본문을 채운 산출물이다. **Phase 1 = `tokens.ts` 에 ColorTokens 신규 9 토큰 (textHighlight, textBody, textBodyHigh, textBodyMuted, textOnAccent, textMuted, interactive, destructiveBg, toastBg) 추가 + darkColors / lightColors 양쪽 hex 정의** + tokens.test.ts 갱신. **Phase 2 = task 02/03 머지 후 잔존하는 5 대상 파일 (S14/S15/S17/S16/AccDel) 의 보류 hex 약 44 hex 리터럴 + 2 rgba 를 신규 9 토큰 참조로 일괄 교체** + 회귀 방지 `missing-tokens-applied.test.ts` 신규.

토큰 9종은 task 02 §3.2.3 + task 03 §13 의 통합 표를 그대로 채택 (재설계 X — task 02/03 의 TODO 주석 정합). 다크 hex = 발견 hex 그대로 (회귀 0). 라이트 hex = architect 1차 추정 (§3.1.1 팔레트 정합 + 의도 보존 근거). PR 단위 = Phase 1 + Phase 2 = 1 PR (옵션 A) 권장. 변경 라인 수 ~80~100. 8 커밋 분할.

DB / API / 외부 SDK / navigation / Breaking Change 영향 0. ColorTokens 타입 추가 키만 → 기존 useTheme 호출자 영향 0. AC-1 (5 대상 파일 hex 0건) = 본 task PR 머지 시점에 충족 — task 02/03 의 부분 깨짐 *모두 해소*. M0 화면 (S14/S15/S16/S17/AccDel) 라이트 모드 출시 차단 회귀 = 본 task 머지 후 제거.

12 게이트 + epic-12 추가 5 게이트 모두 통과. **상태 = READY_FOR_IMPL**.

권장 다음 단계 — system-design §8 impl 목차의 다음 행 = task 05 (`05-m1a-core-flow-screens.md`) MODULE_PLAN 호출. 본 task 가 정의한 신규 9 토큰을 task 05~07 (M1 핵심 플로우) 가 *즉시 활용* 가능. 만약 본 task 머지 후 시각 검수에서 라이트 hex 9개 중 일부 조정 필요 발견 시 = 별도 *디자이너 합의 PR* 로 tokens.ts lightColors 1~9줄 수정 (본 plan §10.3 위험 1~5 완화 절차) — task 05 진입을 막지 않음.
