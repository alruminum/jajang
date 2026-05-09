---
depth: std
task: 03
slug: m0c-settings-deletion
story: Story 3 (M0 Settings + AccountDeletion 마이그레이션)
github_issue: 240
epic: 12
branch_prefix: chore/epic12-task03-settings-deletion
---

# task 03 — M0 Settings + AccountDeletion hex → ColorTokens 마이그레이션 (S16 / AccountDeletion)

## 1. 목적 (왜)

- **테마 토글 화면 자기모순 해소** (PRD §5 M0 #3): S16SettingsScreen 은 사용자가 라이트 모드를 *선택하는 바로 그 화면* — 이 화면이 라이트 전환 직후에도 다크 hex 그대로 노출되면 *"라이트 선택했는데 설정 화면이 깨짐"* 인식. v1 출시 차단 회귀 (Issue #240).
- **계정 탈퇴 화면 위험 영역 가독성 보장**: AccountDeletionScreen 의 destructive 색상 (`#FF5C5C`/`#FF6B6B`) 변형이 라이트 모드에서 베이지 배경 위에 가독되도록 토큰화 (실제 토큰 정의는 task 04 책임 — 본 task 는 매핑만 확정).
- **다크 회귀 0**: 자장 핵심 페르소나 (다크 사용자) 시각 변화 0 보장.
- **task 01/02 패턴 일관성**: createStyles factory + `useMemo` 동일 패턴 차용. 신규 인프라 0.
- **Option α 정합 (architect+사용자 결정)**: 본 task 의 누락 토큰 후보를 task 04 (신규 token-define) 에 즉시 등재. task 04 머지 시점에서 본 task 의 보류 hex 가 일괄 0 으로 떨어짐.

## 2. 영향 파일 (메인 grep + 본 plan 직접 검증)

| 파일 | hex 수 | useTheme | StyleSheet 패턴 |
|---|---|---|---|
| `apps/mobile/src/screens/S16SettingsScreen.tsx` | 24 | **미채택** (color 측면) | static StyleSheet.create |
| `apps/mobile/src/screens/AccountDeletionScreen.tsx` | 27 | 미채택 | static StyleSheet.create + 인라인 `rgba()` 1건 |
| **합계** | **51** | — | — |

> **prompt 메타정보 정정**: prompt §"S16 부분 채택" 은 **사실 X**. S16 는 `useThemeStore((s) => s.pref / setPref)` 만 호출 (테마 라디오 컨트롤용). `useTheme()` 호출 0회 + `colors.*` 참조 0건. styles.create 안의 24 hex 전량 직접 hex. **양 파일 모두 useTheme 색상 미채택 상태에서 출발**. 직접 grep 으로 확정 (`useTheme(` regex match 0회 in S16, AccountDeletion).
>
> **rgba 별도**: `rgba(0,0,0,0.6)` (AccDel modalOverlay) — 6자리 hex regex 에 안 잡히나 색상 리터럴이므로 본 task 에서 함께 토큰화 대상.

### 2.1 hex 전수 (인용 — 메인 grep 실측)

**S16SettingsScreen** (24):
- L409 `#0D0F1A` (container bg), L417 `#1A1D35` (header borderBottom), L420 `#F5F5F5` (headerTitle), L446 `#F5F5F5` (accountId), L458 `#4A6FFF` (badgePremium bg), L461 `#5A7AA8` (badgeTrial bg), L468 `#FFFFFF` (badgeTextLight), L471 `#12152B` (badgeTextDark), L477 `#1A1D35` (divider), L494 `#E0E2F0` (rowLabel), L498 `#5A7AA8` (rowLabelHighlighted), L502 `#FF5C5C` (rowLabelDestructive), L505 `#4A4E68` (rowLabelMuted), L508 `#4A4E68` (rowSubLabel), L512 `#4A4E68` (rowChevron), L518 `#4A4E68` (version), L531 `#7B80A0` (themeSectionTitle), L546 `#E0E2F0` (themeRowLabel), L554 `#2A2E48` (radioOuter border), L559 `#5A7AA8` (radioOuterSelected border), L565 `#5A7AA8` (radioInner bg), L576 `#2A2E48` (logoutBtn border), L579 `#7B80A0` (logoutText), L93 `#7B80A0` (ActivityIndicator color JSX inline)

**AccountDeletionScreen** (27):
- L291 `#0D0F1A` (container bg), L301 `#1A1D35` (header borderBottom), L308 `#F5F5F5` (backIcon), L312 `#F5F5F5` (headerTitle), L329 `#2A1A0F` (subscriptionBanner bg), L331 `#5A7AA8` (subscriptionBanner border), L337 `#5A7AA8` (subscriptionBannerText), L343 `#5A7AA8` (subscriptionBannerLink), L353 `#F5F5F5` (sectionTitle), L359 `#7B80A0` (sectionSubtitle), L375 `#4A4E68` (radio border), L381 `#5A7AA8` (radioSelected border), L387 `#5A7AA8` (radioDot bg), L390 `#E0E2F0` (reasonLabel), L399 `#1A1D35` (footer borderTop), L402 `#4A6FFF` (nextBtn bg), L408 `#FFFFFF` (nextBtnText), L416 `rgba(0,0,0,0.6)` (modalOverlay bg), L420 `#12152B` (modalSheet bg), L428 `#F5F5F5` (modalTitle), L435 `#B0B4CC` (modalSubtitle), L442 `#1A1D35` (deleteItemList bg), L449 `#E0E2F0` (deleteItem), L454 `#FF6B6B` (irreversibleText), L462 `#FF6B6B` (confirmDeleteBtn bg), L264 `#FFFFFF` (ActivityIndicator color JSX inline), L472 `#FFFFFF` (confirmDeleteText), L483 `#7B80A0` (cancelText)

### 2.2 unique hex set (15종 — 메인 사전과 일치)

`#0D0F1A`, `#12152B`, `#1A1D35`, `#2A1A0F`, `#2A2E48`, `#4A4E68`, `#4A6FFF`, `#5A7AA8`, `#7B80A0`, `#B0B4CC`, `#E0E2F0`, `#F5F5F5`, `#FF5C5C`, `#FF6B6B`, `#FFFFFF` + `rgba(0,0,0,0.6)`

## 3. 결정 근거 (선택 + 버린 대안)

### 3.1 createStyles factory 채택 (양 파일)

system-design §3.1 기준 — S16 styles 항목 23개 (rowLabel/badge/divider/accountRow/themeRow/radio*/logoutBtn 등), AccDel styles 항목 26개. 모두 4 항목 초과 — factory 강제. inline 사용 0. task 01/02 동일 패턴.

### 3.2 hex → token 매핑 분석 (15 unique hex)

#### 3.2.1 task 01 매핑표 그대로 1:1 매핑되는 hex (이슈 없음)

| hex | 매핑 | 등장 위치 |
|---|---|---|
| `#0D0F1A` | `colors.bgPrimary` | S16 container, AccDel container |
| `#12152B` | `colors.bgDeep` | S16 badgeTextDark (Premium 배지 위 짙은 텍스트), AccDel modalSheet bg (Step 2 탈퇴 확인 시트 — bgDeep 의 "더 깊은 표면" 의도 부합) |
| `#2A2E48` | `colors.border` | S16 radioOuter border, S16 logoutBtn border |
| `#5A7AA8` | `colors.accentPrimary` | S16 badgeTrial bg, rowLabelHighlighted, radioOuterSelected/radioInner; AccDel subscriptionBanner border/text/link, radioSelected border, radioDot bg |
| `#7B80A0` | `colors.textSecondary` | S16 ActivityIndicator color (JSX inline), themeSectionTitle, logoutText; AccDel sectionSubtitle, cancelText |

#### 3.2.2 4dp 이내 흡수 결정 (PRD §3.2 허용)

| 발견 hex | 매핑 토큰 | 다크 토큰 hex | 채널 차이 (R/G/B dp) | 결정 |
|---|---|---|---|---|
| `#1A1D35` | `colors.surface` | `#1A1D30` | 0/0/+5 | **흡수** — task 02 §3.2.2 와 동일한 결정. B 채널 5dp (4dp 룰 1dp 초과) — 시각 식별 불가. divider/borderBottom/borderTop/deleteItemList bg 모두 surface 의 "옅은 표면 분리선/카드 배경" 의도 일치. task 02 와 *같은 흡수*를 본 task 가 *반복* — 일관성 ↑. |
| `rgba(0,0,0,0.6)` | `colors.overlay` | `#000000AA (~67%)` | alpha 60% vs 67% (7% 차이) | **흡수** — task 02 §6.3 가 `rgba(0,0,0,0.5)` (17% 차이) 를 흡수한 것 대비 본 case 는 7% 차이로 더 안전. modal underlay 시각 차이 미미. |

#### 3.2.3 누락 토큰 후보 — task 04 (Option α 신규 토큰 정의 task) 일괄 등재

| 발견 hex | 등장 위치 | 가장 가까운 토큰 | 채널 차이 | 후보 토큰명 (task 02 정합) |
|---|---|---|---|---|
| `#F5F5F5` | S16 headerTitle/accountId; AccDel backIcon/headerTitle/sectionTitle/modalTitle (총 6회) | `textPrimary (#EEF0F8)` | +7/+5/-3 | **`textHighlight`** (task 02 와 동일) |
| `#FFFFFF` | S16 badgeTextLight; AccDel nextBtnText/ActivityIndicator/confirmDeleteText (총 4회) | `textPrimary` (다크 `#EEF0F8`) | dark +17/+15/+7 / light: 매우 큼 | **`textOnAccent`** (task 02 의 `onSubscribeCta` 를 일반화한 이름 권장) — accent 위 영구 화이트 |
| `#4A6FFF` | S16 badgePremium bg; AccDel nextBtn bg (총 2회) | `accentPrimary (#5A7AA8)` | -16/-11/+87 | **`interactive`** (task 02 의 `subscribeCta` 를 일반화한 이름 권장) — 결제·CTA·강조 |
| `#4A4E68` | S16 rowLabelMuted/rowSubLabel/rowChevron/version; AccDel radio border (총 5회) | `border (#2A2E48)` / `textSecondary (#7B80A0)` | border: +32/+32/+32 (불가) | **`textMuted`** (task 02 와 동일) |
| `#E0E2F0` | S16 rowLabel/themeRowLabel; AccDel reasonLabel/deleteItem (총 4회) | `textPrimary (#EEF0F8)` | -14/-14/-8 (~12dp avg) | **task 03 신규** — 후보명 `textBodyHigh` 또는 **`textHighlight` 흡수 검토** (`#F5F5F5` 와 색차 21/19/-29 평균 ~23dp — 흡수 X). architect 자율 — 별도 토큰 권장 |
| `#B0B4CC` | AccDel modalSubtitle (1회) | `textSecondary (#7B80A0)` | +53/+52/+44 | **task 03 신규** — 후보명 `textBodyMuted` 또는 modal subtitle 전용. accentSecondary 와도 거리 있음. 별도 토큰 권장 |
| `#2A1A0F` | AccDel subscriptionBanner bg (1회) | `surface (#1A1D30)` / `bgDeep (#12152B)` | surface: +16/-3/-33 / bgDeep: +24/+3/-28 | **task 03 신규** — `destructiveBg` 후보. **위험 영역 (구독 활성 상태에서 탈퇴 차단 배너) 시각 의도** — 갈색/주황 톤 다크 background. 별도 토큰 필수 |
| `#FF5C5C` | S16 rowLabelDestructive (계정 탈퇴 행 텍스트, 1회) | `destructive (#E85A5A)` | +23/+2/+2 | **task 04 결정** — 흡수(R+23 = 4dp 룰 위배지만 destructive 의도 동일) vs 신규 `destructiveHigh` (밝은 destructive 강조). architect 자율. **권장: 흡수** (의도 동일 + 시각 차이 일반 사용자 식별 어려움 — 라이트 모드에서 destructive 라이트값 `#C0392B` 적용 시 "계정 탈퇴 빨강" 의도 보존) |
| `#FF6B6B` | AccDel irreversibleText, confirmDeleteBtn bg (총 2회) | `destructive (#E85A5A)` | +23/+17/+17 | **task 04 결정** — 흡수 또는 신규 `destructiveHigh`. 본 hex 는 *탈퇴 확인 모달의 "되돌릴 수 없어요" 강조 텍스트 + 최종 탈퇴 확인 버튼 배경* — destructive 의도 매우 강함. **본 task 권장**: `destructive` 흡수 (라이트 `#C0392B` 가 "탈퇴 빨강" 보존). architect 회의 자율 — 흡수가 안전한 결정이라 판단되면 §3.2.4 옵션 표 참조 |

#### 3.2.4 destructive 변형 흡수 vs 신규 토큰 — 옵션 분석

`#FF5C5C` / `#FF6B6B` 가 `destructive (#E85A5A)` 와 4dp 초과 (각각 23/17 dp) 이지만 *시각 의도 동일* (탈퇴 빨강). 옵션:

| 옵션 | 본 task 동작 | 라이트 모드 결과 | 위험 |
|---|---|---|---|
| **A. 흡수 (`destructive` 1개 토큰)** | `#FF5C5C` / `#FF6B6B` 모두 `colors.destructive` 로 교체. 다크에서 `#E85A5A` (살짝 어두운 빨강), 라이트에서 `#C0392B` (짙은 빨강 — 베이지 위 가독성 ↑) | 라이트 모드: 탈퇴 행 텍스트, 모달 "되돌릴 수 없어요", 최종 탈퇴 버튼 모두 짙은 빨강 — *탈퇴 위험* 시각 의도 강하게 보존 + 라이트 베이지 위 가독성 우수. 다크 모드: `#FF5C5C`/`#FF6B6B` 가 `#E85A5A` 로 변함 (R-23/-23 dp). 다크 사용자가 식별 가능한지가 핵심 — *육안 식별 어려움* (R 채널 23dp 는 같은 빨강 계열에서 미세 차이) | 다크 사용자 시각 변화 발견 시 task 04 에서 `destructiveHigh` 토큰 추가 후 분리. roll-back 비용 낮음. |
| **B. 신규 `destructiveHigh` 토큰** | `#FF5C5C` / `#FF6B6B` → 신규 `colors.destructiveHigh` (다크 `#FF6B6B` 또는 `#FF5C5C` 중 1개 채택) | 라이트 모드 값 미정 (디자이너 합의 필요) — task 04 결정 요구. AC-1 충족 시점 늦어짐. | task 04 부담 증가. 라이트 값 결정 지연. |
| **C. 분리 — `#FF5C5C` 흡수 + `#FF6B6B` 신규 토큰** | S16 의 `#FF5C5C` 만 흡수, AccDel 의 `#FF6B6B` 만 신규 | 이상한 절충. 권장 X. | — |

**결정 = A (흡수)**. 이유:
- **시각 의도 동일** — 탈퇴/위험/destructive 의도가 양 hex 변형 모두 일치. 토큰 분리 의미 없음.
- **라이트 모드 가독성 우수** — `#C0392B` 짙은 빨강이 베이지 위 강하게 도드라짐 = 탈퇴 위험 시각 의도와 부합.
- **다크 모드 회귀 위험 LOW** — R 채널 23dp 차이는 빨강 계열 안에서 *시각 식별 매우 어려움*. PR 후 시각 검증에서 회귀 발견 시 task 04 에서 `destructiveHigh` 추가로 분리 (roll-back 비용 낮음).
- **task 04 부담 감소** — destructive 변형 신규 토큰 정의 0. task 04 가 다른 누락 토큰 (textHighlight/textMuted/interactive/textOnAccent/textBodyHigh/textBodyMuted/destructiveBg) 정의에 집중 가능.

PRD §3.2 4dp 룰 위배 (R 23dp) 는 architect 판단 — 시각 의도 동일 + 사용 맥락 (destructive) 동일 가드 (PRD §3.2 후반: "사용 맥락이 동일한 경우") 충족. 본 plan §10 위험 항목으로 등재 + Story 5 시각 검증에서 재확인.

#### 3.2.5 본 task 의 작업 전략 = Option α 정합 보류 (task 02 §3.2.4 옵션 D 와 동일)

`destructive` 흡수까지 적용해도 매핑 불가 누락 토큰 7종 (`textHighlight`, `textOnAccent`, `interactive`, `textMuted`, `textBodyHigh` (`#E0E2F0`), `textBodyMuted` (`#B0B4CC`), `destructiveBg` (`#2A1A0F`)) 잔존. **본 task 한정 tokens.ts 수정 X** — system-design §1 의 "본 Epic은 인프라 호출만 — Story 5 한정 토큰 추가" 룰 + Option α (사용자/architect 결정) 에 따라 **task 04 (신규 token-define) 책임으로 이관**.

본 task PR 머지 시점:
- 처리 hex (직접 매핑 5종 + 흡수 2종 + destructive 흡수 2종 = 9 hex 종, 카운트 ~25-28 회 등장) → token 으로 교체 완료.
- 보류 hex (누락 토큰 후보 7종, 카운트 ~23-26 회 등장) → factory 안에서 hex 리터럴 + TODO 주석 유지.
- AC-1 (대상 2 파일 hex 0건) **미충족** — task 04 (token-define) PR 머지 후 task 04-b 또는 본 task 후속 PR 에서 일괄 교체 시점에 충족.

> task 04 (Option α 후 신규 정의된 task 04 = 누락 토큰 정의) 와 **task 04-b** (구 task 04 = 누락 토큰 *적용* — task 02/03 보류 hex 일괄 교체) 의 분할은 본 plan 책임 X — system-design / architect 후속 결정. 본 plan §13 권고로만 명시.

### 3.3 useMemo 캐싱 — task 01/02 일관

`makeStyles(colors)` factory + `useMemo(() => makeStyles(colors), [colors])`. 

**S16 의 서브 컴포넌트 처리** (모듈 스코프에 4개):
- `SettingsRow` (props 받는 일반 컴포넌트)
- `Divider` (props 0)
- `SubscriptionSection` (props: navigation)
- `ThemeSection` (props 0)

이들은 모두 부모 `S16SettingsScreen` 안에서 렌더되며 모듈 스코프 `styles` 를 캡처. factory 도입 시 *부모에서 styles 받아 props 로 전달* 또는 *서브 컴포넌트를 부모 함수 내부로 이동* 둘 중 택1.

**권장 (S16)**: styles props 전달 옵션 — 서브 컴포넌트 4개가 *조금* 비대해서 (특히 `SubscriptionSection`) 부모 내부 이동 시 `S16SettingsScreen` 본문이 너무 길어짐 + 리렌더 비용 증가. styles props 추가가 안정적.

**AccountDeletion 의 서브 함수** (모듈 스코프):
- `showSubscriptionCancelGuide(platform)` — 함수, JSX 반환 X. 변경 0.
- `SUBSCRIPTION_MANAGE_URL` 상수 — 색상 무관. 변경 0.

AccountDeletion 은 단일 컴포넌트 (서브 컴포넌트 없음) → 직접 `useTheme()` + factory 적용. 추가 작업 0.

### 3.4 외부 SDK / API 영향 0

- `accountApi.deleteMyAccount` — 변경 0 (AccDel 호출).
- `revenue-cat.getManagementURL` / `revenueCatLogout` — 변경 0 (S16 호출).
- `dataManagementApi.getVoiceSampleStatus` / `deleteVoiceSample` — 변경 0 (S16 호출).
- `AudioEngine.stopPlayback` — 변경 0 (AccDel 탈퇴 시 호출).
- `AsyncStorage.clear` / `expo-file-system.deleteAsync` — 변경 0 (AccDel 로컬 삭제).
- `react-navigation` — 변경 0.
- 색상만 변환. 결제·계정·삭제·재생 흐름 전부 무관.

### 3.5 S16 의 `useThemeStore` 와 신규 `useTheme()` 공존

S16 는 이미 라인 35 에서 `useAuthStore, useThemeStore` import + 라인 197-198 에서 `useThemeStore((s) => s.pref / setPref)` 사용 (테마 라디오 컨트롤). 본 task 가 `useTheme()` 추가 시 양 hook 공존 — 충돌 0.

```ts
// 기존 (변경 X)
const pref = useThemeStore((s) => s.pref);
const setPref = useThemeStore((s) => s.setPref);

// 신규 (추가)
const { colors } = useTheme();
```

`useTheme()` 내부가 `useThemeStore((s) => s.pref)` 를 구독하므로 양 hook 이 *동일 store 의 다른 selector 를 별도 구독*. Zustand 셀렉터 selector 분리는 정합 (각 hook 이 자기 selector 결과만 비교). 리렌더 횟수 증가 0.

## 4. 생성·수정 파일

### 수정 파일

| 경로 | 변경 내용 |
|---|---|
| `apps/mobile/src/screens/S16SettingsScreen.tsx` | `useTheme()` 호출 + factory 변환 + hex 교체 (24건 중 task 03 처리분 ~13건 + 보류 ~11건) + 서브 컴포넌트 4개 (`SettingsRow`/`Divider`/`SubscriptionSection`/`ThemeSection`) 에 `styles` props 추가 |
| `apps/mobile/src/screens/AccountDeletionScreen.tsx` | `useTheme()` 호출 + factory 변환 + hex 교체 (27건 + rgba 1건 중 task 03 처리분 ~14건 + 보류 ~14건) — 서브 컴포넌트 0 |

### 보류 hex 잔존량 (task 04 token-define 후 일괄 교체)

| 파일 | 처리 hex (대략) | 보류 hex (대략) | 보류 사유 |
|---|---|---|---|
| S16 | ~13 (`#0D0F1A`, `#1A1D35`×2, `#12152B`, `#2A2E48`×2, `#5A7AA8`×4, `#7B80A0`×3, `#FF5C5C`×1) | ~11 (`#F5F5F5`×2, `#4A6FFF`×1, `#FFFFFF`×1, `#4A4E68`×4, `#E0E2F0`×2, 그 외) | textHighlight, textOnAccent, interactive, textMuted, textBodyHigh 미정의 |
| AccDel | ~14 (`#0D0F1A`, `#1A1D35`×3, `#12152B`, `#5A7AA8`×5, `#7B80A0`×2, `#FF6B6B`×2 흡수, `rgba(0,0,0,0.6)`→overlay) | ~14 (`#F5F5F5`×4, `#FFFFFF`×3, `#4A6FFF`×1, `#4A4E68`×1, `#E0E2F0`×2, `#B0B4CC`×1, `#2A1A0F`×1, 그 외) | textHighlight, textOnAccent, interactive, textMuted, textBodyHigh, textBodyMuted, destructiveBg 미정의 |

> 정확 처리/보류 카운트는 engineer 가 매핑표 1행씩 적용하면서 자동 산출. 본 표는 §3.2 매핑 + §2.1 hex 등장 카운트 기반 추정.
>
> **본 task PR grep 결과**: 6자리 hex 잔존량 = 약 23~26건 (보류분만). AC-1 (2 파일 hex 0건) 은 task 04 (token-define) + task 04-b 또는 본 task 후속 PR 머지 시점.

### 생성 파일 (테스트 — `(TEST)` 태그 충족용)

| 경로 | 목적 |
|---|---|
| `apps/mobile/src/__tests__/screens/S16SettingsScreen.theme.test.tsx` | useTheme/themeStore mock dark/light + container/divider 배경 + accentPrimary radioInner assertion (REQ-003/004 검증). 보류 hex 군은 검증 X — 처리 hex 만. |
| `apps/mobile/src/__tests__/screens/AccountDeletionScreen.theme.test.tsx` | useTheme/themeStore mock dark/light + container/modalSheet/destructive 색상 assertion (REQ-005/006). 위험 영역 destructive (`#E85A5A` dark / `#C0392B` light) 양쪽 검증 |
| `apps/mobile/src/__tests__/theme/settings-deletion-processed-hex-map.test.ts` | 본 task 가 처리한 hex 군 (직접 매핑 + 흡수 + destructive 흡수) 이 token 참조로 정확히 치환됐는지 검증. **6자리 hex grep 0건 검증 X** (보류 hex 잔존). 대신 처리 hex 의 inline 잔존 0 + token 참조 ≥1 positive assertion |

> task 02 의 `paywall-processed-hex-map.test.ts` 와 동일 패턴 — 보류 hex 가 있어 grep 0 검증 불가. positive assertion 으로 회귀 방지.

## 5. 인터페이스 (TypeScript)

### 5.1 makeStyles factory 시그니처 (양 파일 공통, task 01/02 패턴)

```ts
import { useMemo } from 'react';
import { useTheme } from '@hooks/useTheme';
import type { ColorTokens } from '@theme/tokens';

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    // …
  });

// 컴포넌트 내부
export default function S16SettingsScreen({ navigation }: S16SettingsScreenProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // … 기존 JSX 동일 (단 서브 컴포넌트 호출부에 styles 전달)
  return (
    <SafeAreaView style={styles.container}>
      <SubscriptionSection navigation={navigation} styles={styles} />
      …
    </SafeAreaView>
  );
}
```

### 5.2 S16 — 서브 컴포넌트에 styles props 추가 (권장 옵션)

```tsx
// SettingsRow
interface SettingsRowProps {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  highlighted?: boolean;
  destructive?: boolean;
  isLoading?: boolean;
  disabled?: boolean;
  // 추가
  styles: ReturnType<typeof makeStyles>;
  colors: ColorTokens;  // ActivityIndicator color JSX inline 용
}

function SettingsRow({
  label, onPress, /* ... */, styles, colors,
}: SettingsRowProps) {
  // …
  return (
    <TouchableOpacity style={[styles.row, /* … */]} onPress={onPress}>
      {/* … */}
      {isLoading ? (
        <ActivityIndicator size="small" color={colors.textSecondary} />
      ) : (
        <Text style={styles.rowChevron}>›</Text>
      )}
    </TouchableOpacity>
  );
}

// Divider
function Divider({ styles }: { styles: ReturnType<typeof makeStyles> }) {
  return <View style={styles.divider} />;
}

// SubscriptionSection / ThemeSection — 동일 패턴 (styles props 추가)
interface SubscriptionSectionProps {
  navigation: NavigationProp<ParamListBase>;
  styles: ReturnType<typeof makeStyles>;
}

interface ThemeSectionProps {
  styles: ReturnType<typeof makeStyles>;
}
```

> `ReturnType<typeof makeStyles>` 헬퍼는 `StyleSheet.NamedStyles<{...}>` 와 호환. TypeScript 검증 필수.

### 5.3 AccountDeletion — 단일 컴포넌트 (props 추가 0)

서브 컴포넌트 없음. `AccountDeletionScreen` 함수 내부에서 직접 `useTheme()` + `useMemo(makeStyles)`. 호출부 변경 0.

```tsx
export default function AccountDeletionScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // … 기존 JSX 그대로 (단 ActivityIndicator color="#FFFFFF" → JSX 인라인 보류 hex 또는 future colors.textOnAccent)
}
```

### 5.4 보류 hex 의 임시 처리 — factory 안에서 hex 리터럴 그대로 + TODO 주석

본 task 에서 누락 토큰 후보 7종 미정의 → 보류 hex 는 factory 안에서도 hex 리터럴 그대로 유지. 코멘트 명시:

```ts
const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    headerTitle: {
      color: '#F5F5F5', // TODO(task 04 token-define): textHighlight 토큰으로 교체
      // …
    },
    badgePremium: {
      backgroundColor: '#4A6FFF', // TODO(task 04 token-define): interactive 토큰으로 교체
    },
    badgeTextLight: {
      color: '#FFFFFF', // TODO(task 04 token-define): textOnAccent 토큰으로 교체
    },
    rowLabel: {
      color: '#E0E2F0', // TODO(task 04 token-define): textBodyHigh 토큰으로 교체
    },
    rowLabelMuted: {
      color: '#4A4E68', // TODO(task 04 token-define): textMuted 토큰으로 교체
    },
    // …
  });
```

> 보류 hex 가 factory 인자 `colors` 와 무관한 상수 → 라이트/다크 분기 X (다크 hex 그대로). 라이트 모드에서 부분 깨짐 잔존. AC-1 미충족 의도된 상태 (Option α 흐름).

### 5.5 destructive 흡수 — JSX inline 도 처리

```tsx
// AccDel L264 — 기존
<ActivityIndicator size="small" color="#FFFFFF" />
// 보류 (task 04 token-define 까지 hex 유지)
<ActivityIndicator size="small" color="#FFFFFF" />  // TODO(task 04): textOnAccent

// S16 L93 — 기존
<ActivityIndicator size="small" color="#7B80A0" />
// 처리
<ActivityIndicator size="small" color={colors.textSecondary} />  // 단 SettingsRow 가 styles props 받으면 colors 도 함께 받아야 함
```

`colors` 도 서브 컴포넌트 props 로 전달 필요 (§5.2 의 `SettingsRowProps.colors` 참조).

## 6. 핵심 로직 (의사코드)

### 6.1 file-by-file 마이그레이션 절차 (양 파일 동일)

```
for each file in [S16, AccDel]:
  1. import { useTheme } from '@hooks/useTheme';  // S16 의 기존 useThemeStore import 와 별도, 추가
  2. import { useMemo } from 'react';  // 이미 있으면 skip
  3. import type { ColorTokens } from '@theme/tokens';
  4. 컴포넌트 함수 내부 첫 줄: const { colors } = useTheme();  // S16 = SubscriptionSection/ThemeSection/메인 모두 추가
  5. const styles = useMemo(() => makeStyles(colors), [colors]);
  6. 기존 const styles = StyleSheet.create({...}) → 파일 하단 const makeStyles = (colors: ColorTokens) => StyleSheet.create({...})
  7. 매핑표 §3.2.1 + §3.2.2 + §3.2.4 (destructive 흡수) hex → colors.<token> 치환
  8. 보류 hex (§3.2.3 누락 토큰 후보 7종) 은 factory 안에서 hex 리터럴 그대로 + TODO 주석
  9. (S16 한정) 서브 컴포넌트 4개에 styles + colors props 추가 + 호출부 4곳 수정
  10. JSX 안 인라인 hex (S16 L93 ActivityIndicator color) → colors.textSecondary 또는 보류 hex 유지
  11. 기존 테스트 통과 확인 (S16 / AccountDeletion 전용 테스트 0개 — 회귀 위험 0)
  12. 신규 테스트 추가 (§4 표 3개)
```

### 6.2 매핑 결정 트리 (각 hex 마다 자동 적용)

```
hex 발견:
├─ §3.2.1 의 5 토큰 정확 일치 → 즉시 colors.<token>
│   (#0D0F1A → bgPrimary, #12152B → bgDeep, #2A2E48 → border,
│    #5A7AA8 → accentPrimary, #7B80A0 → textSecondary)
├─ §3.2.2 4dp 흡수 (#1A1D35 → surface, rgba(0,0,0,0.6) → overlay)
├─ §3.2.4 destructive 흡수 (#FF5C5C, #FF6B6B → destructive)
├─ §3.2.3 누락 토큰 후보 7종 → hex 리터럴 + TODO(task 04) 주석 (보류)
└─ 위 4 분기 외 → SPEC_GAP_FOUND emit + architect 회수
```

### 6.3 rgba 처리 (1건만)

- `rgba(0,0,0,0.6)` (AccDel modalOverlay) → `colors.overlay` (`#000000AA` 다크 = ~67%, `#00000066` 라이트 = ~40%). alpha 차이 7%/20% — modal underlay 시각 차이 미미. 흡수.

## 7. 다른 모듈과의 경계

- **상위 의존**: `@hooks/useTheme`, `@theme/tokens` (ColorTokens 타입). 변경 0.
- **하위 의존**: 없음.
- **graceful 동작**: useTheme 항상 valid ColorTokens 반환. null guard 불필요 (task 01 §7 동일).
- **Breaking Change**: 없음 — Props 시그니처 (S16SettingsScreenProps, SubscriptionSectionProps, SettingsRowProps 등) 가 *내부 추가* (`styles` / `colors`) 만 가짐. **외부 호출자**는 `S16SettingsScreen` 단일 export 만 사용 → 외부 영향 0. AccDel 도 `AccountDeletionScreen` 단일 export — 외부 영향 0.
- **의존 모듈 호출 변경 0**: revenue-cat, dataManagementApi, accountApi, AudioEngine, AsyncStorage, expo-file-system, react-navigation 모두 변경 0.
- **의존 모듈 부재 시 graceful**: useTheme 부재 시 `{ colors: ColorTokens, isDark: boolean }` 반환 보장 (`useTheme.ts` line 19) — null guard 불필요.

## 8. 테스트 환경 영향

- 기존 S16 / AccountDeletion 전용 jest 테스트 **0개** (확인 — `apps/mobile/src/__tests__/screens/` 에 부재). 회귀 위험 0.
- 신규 추가 3 테스트 (§4 표) — useTheme + themeStore mock 패턴은 task 01 의 `S02PrivacyScreen.theme.test.tsx` 또는 `useTheme.test.ts` 차용.
- **S16 의 useThemeStore 기존 사용 영향**: themeStore mock 시 `pref` 와 `setPref` 모두 mock 필요 (라디오 토글 동작). 단 본 테스트는 라디오 토글 동작이 아닌 *컬러 토큰 적용* 검증이 목표 → `pref: 'dark' | 'light'` mock 만으로 충분.
- **revenue-cat / accountApi / dataManagementApi / AudioEngine mock**: 본 테스트가 화면 렌더링만 검증 → mock 자동 (jest.mock 으로 함수 noop). 결제/계정/재생 호출 검증 X.

## 9. 수용 기준

| ID | 내용 | 검증 방법 | 통과 조건 |
|---|---|---|---|
| REQ-001 | S16SettingsScreen, AccountDeletionScreen 양 파일 모두 `useTheme()` 호출 | (TEST) `settings-deletion-processed-hex-map.test.ts` — 각 파일 source read 후 regex `/useTheme\(/` match 1회 이상 | 2/2 PASS |
| REQ-002 | task 01/02 매핑표 §3.2.1 + §3.2.2 + §3.2.4 의 토큰 (`bgPrimary`, `bgDeep`, `border`, `accentPrimary`, `textSecondary`, `surface`, `overlay`, `destructive`) 가 양 파일 내 1회 이상 참조됨 | (TEST) 동일 테스트 — `colors.bgPrimary` / `colors.surface` / `colors.destructive` 등 토큰 참조 grep | 각 파일에서 최소 4개 토큰 참조 확인 |
| REQ-003 | 다크 모드 (pref='dark') 에서 S16SettingsScreen 컨테이너 배경이 `darkColors.bgPrimary` (`#0D0F1A`) | (TEST) `S16SettingsScreen.theme.test.tsx` — useTheme/themeStore mock dark, render, `getByTestId('s16-container').props.style` flatten 후 `backgroundColor === '#0D0F1A'` assertion. testID 추가 필요 | PASS |
| REQ-004 | 라이트 모드 (pref='light') 에서 S16SettingsScreen 컨테이너 배경이 `lightColors.bgPrimary` (`#FBF7F0`) | (TEST) 동일 테스트, light 분기 | `backgroundColor === '#FBF7F0'` PASS |
| REQ-005 | 다크 모드에서 AccountDeletionScreen 컨테이너 배경이 `darkColors.bgPrimary` (`#0D0F1A`) | (TEST) `AccountDeletionScreen.theme.test.tsx` — dark mock + render + flatten | PASS |
| REQ-006 | 라이트 모드에서 AccountDeletionScreen 컨테이너 배경이 `lightColors.bgPrimary` (`#FBF7F0`) | (TEST) 동일 | PASS |
| REQ-007 | destructive 흡수 정합 — S16 rowLabelDestructive 색상이 `colors.destructive` 참조 (다크 `#E85A5A`, 라이트 `#C0392B`) | (TEST) `S16SettingsScreen.theme.test.tsx` 에 "계정 탈퇴" 행 render 후 dark/light 양쪽에서 destructive 색 assertion | 2/2 PASS |
| REQ-008 | destructive 흡수 정합 — AccDel confirmDeleteBtn (최종 탈퇴 버튼) 배경이 `colors.destructive` 참조 (다크 `#E85A5A`, 라이트 `#C0392B`) | (TEST) `AccountDeletionScreen.theme.test.tsx` 에 modal open + 버튼 render 후 dark/light 양쪽 assertion | 2/2 PASS |
| REQ-009 | 본 task 처리 hex 군이 token 참조로 100% 치환됨 — 처리 hex 가 inline hex 로 잔존하지 않음 | (TEST) `settings-deletion-processed-hex-map.test.ts` — 처리 대상 hex 목록 (`#0D0F1A`, `#1A1D35`, `#1A1D30`, `#12152B`, `#2A2E48`, `#5A7AA8`, `#7B80A0`, `#FF5C5C`, `#FF6B6B`) 이 양 파일 source 안에 *factory 본문 외부* 또는 *jsx prop 인라인* 위치에 존재 X. 정규식 `/['"](#0D0F1A|#1A1D35|#1A1D30|#12152B|#2A2E48|#5A7AA8|#7B80A0|#FF5C5C|#FF6B6B)['"]/` match 0건 검증 | 0건 PASS |
| REQ-010 | 보류 hex 군 (`#F5F5F5`, `#FFFFFF`, `#4A6FFF`, `#4A4E68`, `#E0E2F0`, `#B0B4CC`, `#2A1A0F`) 은 본 task 에서 의도적으로 유지됨 — 회귀 방지 grep 에 잡혀도 task 03 PR 머지는 정합 | (MANUAL) PR 본문에 보류 hex 카운트 + 사유 명시 (task 04 token-define 의존). task 04 plan 이 §3.2.3 의 7 후보 토큰을 입력으로 받음 확인 | 명시 OK PASS |
| REQ-011 | 다크 회귀 0 — Epic 12 작업 전·후 시뮬레이터 다크 모드 동일 화면 진입 시 시각 변화 없음 (단 `#FF5C5C`/`#FF6B6B` → `#E85A5A` 흡수 분 R 채널 23dp 변화) | (MANUAL) iOS 시뮬레이터 다크 → S16 진입 (메인탭 → 설정) → S16 의 destructive ("계정 탈퇴" 행) 색 동일 확인 + AccountDeletion 진입 (S16 → 계정 탈퇴) → modal open → "되돌릴 수 없어요" / 최종 탈퇴 버튼 색 동일 확인. Epic 12 이전 캡처와 시각 비교. R 23dp 변화 식별 시 본 plan §10.4 위험 1 등재 확인 | 시각 동일 또는 위험 등재 PASS |
| REQ-012 | 라이트 모드 시각 검증 — 처리 hex 군이 라이트 색으로 전환됨 (보류 hex 는 다크 그대로 = 의도) | (MANUAL) 라이트 모드 진입 → S16 container 배경 `#FBF7F0` 베이지 / divider/header 가 `#1A1D35` (다크) 가 아닌 라이트 surface (`#E8E0D4`) / 라디오 선택 색이 `#3A5A88` (라이트 accentPrimary). 보류 hex 군 (`#F5F5F5` 헤드라인 / `#E0E2F0` 본문 / `#4A6FFF` Premium 배지) 은 다크 색 그대로 노출 — 의도. AccountDeletion 도 동일 검증. PR 본문 라이트 캡처 첨부 | 처리 hex 라이트 전환 + 보류 hex 다크 유지 PASS |
| REQ-013 | revenue-cat / accountApi / dataManagementApi / AudioEngine 호출 흐름 변경 0 | (MANUAL) S16 진입 → 로그아웃 (revenueCatLogout 호출) / 구독 관리 (getManagementURL) / 목소리 샘플 삭제 (deleteVoiceSample) / AccDel 진입 → 탈퇴 사유 선택 → "다음으로" → modal "네, 탈퇴할게요" (deleteMyAccount + stopPlayback + AsyncStorage.clear) 모두 동작 확인 | 모든 호출 정상 PASS |
| REQ-014 | S16 의 `useThemeStore` (기존) + 신규 `useTheme()` 공존 — 라디오 토글 동작 + 색상 적용 동시 GREEN | (MANUAL) S16 진입 → 라디오에서 라이트 선택 → 즉시 화면 색상 라이트로 전환 (useTheme 자동 리렌더) + 설정 화면 자체가 라이트 팔레트로 보임 (자기모순 해소 핵심 검증) | PASS |

## 10. 주의사항

### 10.1 테마 토글 화면 자기모순 해소 — 시각 검증 절차 (REQ-014 최핵심)

| 화면 | 다크 시각 검증 | 라이트 시각 검증 (처리분만) |
|---|---|---|
| S16SettingsScreen | container 검정 + 헤더/divider 진한 남색 + 라디오 회색→파랑 동일 + Premium 배지 파랑 + 계정 탈퇴 행 빨강 동일 | container 베이지 + 헤더/divider **`#E8E0D4`** (라이트 surface) + 라디오 선택 시 **`#3A5A88`** (라이트 accentPrimary) + Premium 배지 **`#4A6FFF` 그대로** (보류 — 라이트 베이지 위 강한 파랑) + 계정 탈퇴 행 **`#C0392B`** (라이트 destructive — 짙은 빨강) |
| AccountDeletionScreen | container 검정 + 헤더/footer 진한 남색 + 구독 배너 갈색 + 라디오 회색→파랑 + modal 검정+`bgDeep` + 최종 탈퇴 빨강 동일 | container 베이지 + 헤더/footer **라이트 surface** + 구독 배너 **`#2A1A0F` 그대로** (보류 — 라이트 베이지 위 갈색 동일 박힘 = 위험 영역 시각 의도 일부 보존) + 라디오 선택 **`#3A5A88`** + modal overlay **`#00000066`** (라이트 overlay 40%) + modal sheet **라이트 bgDeep `#F0EAE0`** + 최종 탈퇴 **`#C0392B`** (라이트 destructive 짙은 빨강) |

> **REQ-014 = "테마 토글 화면 자기모순"** — S16 안에서 라디오로 라이트 선택 → S16 자체가 즉시 라이트로 변환. 본 task 의 가장 중요한 시각 검증. useTheme 자동 리렌더 메커니즘이 정상 동작해야 충족.
>
> **라이트 모드 가독성 저하 의도된 상태**: 보류 hex (`#F5F5F5` 헤드라인, `#E0E2F0` 본문, `#FFFFFF` 배지 텍스트) 가 라이트 베이지/파랑 배경 위에서 옅게 보임. task 04 token-define 에서 `textHighlight` (라이트=짙은 회색) / `textBodyHigh` (라이트=중간 회색) / `textOnAccent` (라이트=`#FFFFFF` 그대로) 토큰 추가로 해소. **task 03 PR 머지 시점에서는 의도된 부분 깨짐 — 출시 차단 완전 해소는 task 04 + 일괄 교체 후**.

### 10.2 DB 영향도

**없음** — 코드 색상 상수만 변경. DDL/마이그레이션 0.

### 10.3 외부 SDK 영향도

- **revenue-cat**: getManagementURL/revenueCatLogout — 변경 0.
- **accountApi**: deleteMyAccount — 변경 0.
- **dataManagementApi**: getVoiceSampleStatus/deleteVoiceSample — 변경 0.
- **AudioEngine**: stopPlayback — 변경 0.
- **AsyncStorage**: clear — 변경 0.
- **expo-file-system**: deleteAsync — 변경 0.
- **react-navigation**: useNavigation/CommonActions — 변경 0.
- **DeleteTracksSheet 컴포넌트**: 본 task 범위 밖 (task 07 처리). S16 가 호출만 함 — 렌더 변경 0.

### 10.4 회귀 위험 + 완화

- **위험 1 (HIGH — destructive 흡수)**: `#FF5C5C` (S16) / `#FF6B6B` (AccDel) 흡수 — 다크 모드에서 R 채널 23/17 dp 차이로 `destructive (#E85A5A)` 적용. 4dp 룰 위배지만 시각 의도 동일 (탈퇴 빨강).
  - **완화**: REQ-011 시각 검증에서 회귀 발견 시 task 04 에서 `destructiveHigh` 토큰 추가 후 분리. roll-back 비용 LOW (해당 줄만 hex 복귀).
- **위험 2 (HIGH — 보류 hex 부분 깨짐)**: 보류 hex 7종이 라이트 모드에서 부분 깨짐 그대로 노출 → 사용자가 "테마 토글 화면 절반만 고쳐졌다" 인식 가능.
  - **완화**: PR 본문 + Story 3 GitHub Issue #240 코멘트에 "본 task 는 출시 차단의 일부만 해소. task 04 token-define 후 일괄 교체로 완전 해소" 명시. **Option α 결정** = task 04 가 task 03 직후 진입.
- **위험 3 (MEDIUM — `#1A1D35` 5dp 흡수)**: task 02 §10.4 위험 2 와 동일. 라이트 모드 surface 가 의도와 다를 가능성.
  - **완화**: REQ-012 시각 검증에서 라이트 divider/header 어색함 확인. 어색 시 task 04 에서 `surfaceMid` 후보 등재 후 분리.
- **위험 4 (MEDIUM — `#4A6FFF` interactive 보류)**: Premium 배지 (`#4A6FFF`) 가 라이트 모드에서도 동일 진한 파랑 → 라이트 베이지 위 매우 도드라짐. 디자인 의도 (Premium 강조) 와 부합 가능 / 위배 가능.
  - **완화**: REQ-012 라이트 캡처에서 디자이너 합의 항목 표시. task 04 token-define 에서 `interactive` 라이트값 결정 (예: `#4A6FFF` 동일 또는 `#3A5A88` 톤다운).
- **위험 5 (MEDIUM — `#2A1A0F` destructiveBg 보류)**: AccDel 구독 배너 갈색 배경이 라이트 모드에서도 갈색 그대로 → 라이트 베이지 위 갈색 = 어색 가능 / "위험 영역" 의도 보존 가능.
  - **완화**: REQ-012 시각 검증 + task 04 token-define 에서 `destructiveBg` 라이트값 결정 (라이트 destructive 와 부합하는 옅은 빨강/주황).
- **위험 6 (LOW — `rgba(0,0,0,0.6)` overlay 흡수)**: alpha 60% → 다크 67% (어두워짐 7%) / 라이트 40% (밝아짐 20%). 라이트 modal underlay 가 의도보다 옅을 가능성.
  - **완화**: REQ-012 라이트 모드 modal 진입 시각 검증. 어색 시 task 04 에서 `overlay60` 후보 등재.
- **위험 7 (LOW — useTheme + useThemeStore 동시 사용)**: S16 가 양 hook 모두 사용 — Zustand store 다중 selector 구독으로 리렌더 횟수 증가 가능.
  - **완화**: §3.5 분석 — selector 분리로 리렌더 ↑ 0. 단 jest 테스트에서 themeStore mock 시 `pref` + `setPref` 모두 mock 필요 (REQ-014 검증).
- **위험 8 (LOW — S16 서브 컴포넌트 styles props)**: 4 컴포넌트 (`SettingsRow`/`Divider`/`SubscriptionSection`/`ThemeSection`) 에 styles + colors props 추가 → 호출부 4곳 수정. props drilling 깊이 1.
  - **완화**: 깊이 1 — 추가 컨텍스트 도입 불필요. props drilling 비용 미미.

### 10.5 PR 후 시각 회귀 발견 시 rollback 절차

- `git revert <머지 커밋>` 단일 커밋. 2 파일 통째 원복.
- 영향 범위 = S16 / AccountDeletion 만. revenue-cat / accountApi / DeleteTracksSheet / Story 1·2 (task 01·02) 영향 0.
- 공유 인프라 변경 X (tokens.ts 수정 0) → 다른 epic / task 영향 0.

### 10.6 PR 단위 권장

- **1 PR (2 파일 — 51 hex)** — task 01/02 패턴 일관 + 1인 개발 + 출시 임박.
- 커밋 분할: 파일별 1 커밋 (S16, AccDel = 2 커밋) + 신규 테스트 1 커밋 + 누락 토큰 후보 등재 (task 04 input 으로 §3.2.3 표 인용 + Story 3 Issue 코멘트) 1 커밋 = 총 4 커밋 권장.

### 10.7 task 04 (Option α 신규 토큰 정의) 의존 명시

본 task PR 머지 후 보류 hex 23~26건 잔존 → **task 04 (token-define) PR 머지 직후 일괄 교체 PR (task 04-b 또는 task 03 후속 PR) 필요**. AC-1 (대상 2 파일 hex 0건) 충족 시점 = 일괄 교체 PR 머지 후. system-design §7 의 "task 08 = 마지막" 순서가 Option α 로 재배치되어 본 task 직후 task 04 (token-define) 가 진입하는 흐름 정합.

## 11. 의존성

- **선행 task**: task 02 (paywall) — factory + useMemo 패턴 + 누락 토큰 후보 (task 02 의 5 후보 = `textHighlight`/`textBody`/`subscribeCta`/`onSubscribeCta`/`textMuted`) 가 본 task 와 일관 유지 핵심. task 02 완료 후 진입.
- **후행 task**: task 04 (Option α 신규 = missing-tokens-define) — 본 task 의 누락 토큰 후보 7종 (task 02 와 5종 겹침 + task 03 신규 2종 + destructiveBg 1종 = 누적 8종 권장 토큰) 을 입력으로 받아 tokens.ts 정의. task 04 머지 후 본 task 보류 hex 일괄 교체 (task 04-b 또는 본 task 후속 PR).
- **연동**: 없음 (task 03 가 다른 task 와 동시 진행 X).
- **외부**: 없음.

## 12. 게이트 self-check (architect/module-plan SOP 12 항목)

| # | 항목 | 충족 | 비고 |
|---|---|---|---|
| 1 | 생성/수정 파일 목록 확정 | ✓ | §4 — 수정 2 파일 + 테스트 3 파일 |
| 2 | 인터페이스 TypeScript 타입 명시 | ✓ | §5 — factory 시그니처 + S16 서브 컴포넌트 props 4종 |
| 3 | 의존 모듈 실제 인터페이스 직접 확인 | ✓ | tokens.ts / useTheme.ts / S16·AccountDeletion source 모두 read 완료. hex 라인 번호 §2.1 인용. **prompt 메타정보 정정**: S16 "useTheme 부분 채택" = 실제 X (직접 grep 으로 확정) |
| 4 | 에러 처리 명시 | ✓ | useTheme 항상 valid ColorTokens. revenue-cat/accountApi 호출 변경 0 (기존 try/catch 유지) |
| 5 | 페이지 전환·상태 초기화 순서 | N/A | 본 task 는 화면 진입 동작 변경 X. logout / 탈퇴 / 라디오 토글 흐름 그대로 |
| 6 | DB 영향도 분석 | ✓ | 없음 (§10.2) |
| 7 | Breaking Change 검토 | ✓ | 없음 (§7) — 외부 export 시그니처 0 변경. 내부 props 추가만 (`styles`/`colors` 서브 컴포넌트). |
| 8 | 핵심 로직 의사코드 | ✓ | §6 |
| 9 | TypeScript 타입 정합 | ✓ | makeStyles 시그니처, useMemo deps, 서브 컴포넌트 styles props 타입 (`ReturnType<typeof makeStyles>`) |
| 10 | import 완전성 | ✓ | useTheme, useMemo, ColorTokens 명시. S16 의 기존 useThemeStore import 와 별도 |
| 11 | 수용 기준 + 메타데이터 | ✓ | §9 표 14 행 + frontmatter |
| 12 | 모듈 = 테스트 단위 정합 | ✓ | factory 단독 단위 테스트 가능, useTheme/themeStore mock 으로 의존 분리, 양 화면 PASS/FAIL 명확 (S16/AccDel 신규 테스트 + processed-hex-map test). **테스트 가능성 미달 0**. |

추가 게이트 (epic-12 한정):
- **누락 토큰 후보 등재 절차 명시**: ✓ §3.2.3 + §13 — task 04 (Option α 신규 토큰 정의) 입력으로 §3.2.3 표 인용. task 02 §3.2.3 와 5종 토큰명 일관 유지.
- **보류 hex 잔존 인지**: ✓ §4 표 — AC-1 (대상 2 파일 hex 0건) 은 task 04 (token-define) + 일괄 교체 PR 시점으로 미룸 명시.
- **destructive 흡수 위험 등재**: ✓ §3.2.4 + §10.4 위험 1 — R 23dp 흡수 결정 + 시각 검증 절차 + roll-back.
- **Option α 정합**: ✓ §3.2.5 + §13 — task 04 (신규 token-define) = 본 task 직후 진입 권고. system-design 후속 갱신 사용자 결정 영역.

---

## 13. 결론 + 권장 다음 단계

본 module-plan 은 S16 / AccountDeletion 의 51 hex 중 **약 25-28건 (~52%) 을 task 01/02 매핑표 + 4dp 흡수 (`#1A1D35` surface, `rgba(0,0,0,0.6)` overlay) + destructive 흡수 (`#FF5C5C`/`#FF6B6B` → `destructive`) 로 처리**, **나머지 23-26건 (~48%) 은 누락 토큰 후보 7종 (`textHighlight`, `textOnAccent`, `interactive`, `textMuted`, `textBodyHigh`, `textBodyMuted`, `destructiveBg`) 으로 식별 + task 04 (Option α 신규 token-define) + 일괄 교체 PR (task 04-b 또는 task 03 후속) 로 보류** 하기로 결정했다.

**task 02 와의 토큰명 일관성 100% 보장**: task 02 의 5 후보 (`textHighlight`/`textBody`/`subscribeCta`/`onSubscribeCta`/`textMuted`) 중 4종은 본 task 가 *동일 hex* 에 *동일 토큰명* 권장 (`textHighlight`, `textOnAccent` ≡ task 02 `onSubscribeCta`, `interactive` ≡ task 02 `subscribeCta`, `textMuted`). task 04 가 양 task 의 누적 후보 표를 입력으로 받아 일관 정의 가능.

**task 03 신규 추가 후보 2종 + 1종**: `textBodyHigh` (`#E0E2F0`), `textBodyMuted` (`#B0B4CC`), `destructiveBg` (`#2A1A0F`). 각각 본 task 의 본문 강조 텍스트 / modal 부제 / 위험 영역 다크 배경 의도. task 04 가 이 3 후보를 추가 정의.

createStyles factory + `useMemo` 패턴은 task 01/02 와 일관, S16 의 4 서브 컴포넌트는 styles + colors props 전달 옵션 채택 (모듈 스코프 유지 + 리렌더 비용 0). AccountDeletion 은 단일 컴포넌트 — 직접 적용. DB / API / SDK / revenue-cat / accountApi / dataManagementApi / AudioEngine / AsyncStorage / expo-file-system / react-navigation 흐름 변경 0, Breaking Change 0 (외부 export 시그니처 무변), 내부 props 추가만. 신규 테스트 3개 (`S16.theme`, `AccountDeletion.theme`, `settings-deletion-processed-hex-map`). 12 게이트 + 추가 4 게이트 모두 통과.

destructive 흡수 (`#FF5C5C`/`#FF6B6B` → `destructive`) 는 4dp 룰 위배 (R 23dp/17dp) 지만 *시각 의도 동일* 가드 충족 + 라이트 모드 가독성 우수 + roll-back 비용 LOW. PR 후 다크 시각 검증에서 회귀 식별 시 task 04 에서 `destructiveHigh` 분리 가능.

**누락 토큰 후보 통합 표 (task 02 + task 03 누적 — task 04 입력)**:

| 후보 토큰 | hex (다크) | 발견 task | 사용 맥락 | task 04 라이트 값 결정 필요 |
|---|---|---|---|---|
| `textHighlight` | `#F5F5F5` | task 02, task 03 | 헤드라인·toastText·고대비 텍스트 | 짙은 회색 (`#1C1A18` 변형 또는 `#2A2826` 등) |
| `textBody` | `#A0A5C0` | task 02 | 결제 본문 | 중간 회색 |
| `textBodyHigh` | `#E0E2F0` | task 03 | S16/AccDel 본문 강조 | 짙은 회색 (textPrimary 보다 옅게) |
| `textBodyMuted` | `#B0B4CC` | task 03 | AccDel modalSubtitle | 중간 회색 (textSecondary 변형) |
| `textOnAccent` | `#FFFFFF` | task 02, task 03 | accent 위 텍스트 (CTA 버튼/배지 텍스트) | `#FFFFFF` 동일 또는 라이트 textPrimary |
| `textMuted` | `#4A4E68` | task 02, task 03 | 약관 dim / 부수 텍스트 / chevron | textSecondary 의 dim 변형 |
| `interactive` | `#4A6FFF` | task 02, task 03 | 결제 CTA / Premium 배지 / 강조 링크 | 디자이너 합의 — 동일 또는 라이트 톤다운 |
| `destructiveBg` | `#2A1A0F` | task 03 | 위험 영역 배경 (구독 활성 배너) | 옅은 빨강/주황 (라이트 destructive 와 부합) |
| `toastBg` | `rgba(30,34,60,0.95)` | task 02 | toast bg | 라이트 surfaceHigh 변형 + alpha |

> task 04 architect 가 위 9 후보를 입력으로 받아 tokens.ts 정의 (다크/라이트 양쪽). 본 plan §13 표 = task 04 의 직접 input.

상태 = **READY_FOR_IMPL**.

권장 다음 단계 — **impl 목차 다음 행 = task 04 (Option α 신규 = missing-tokens-define)**. system-design 의 §2 impl 목차 표 / §7 의존성 그래프가 Option α 로 재정렬되어 task 04 = 신규 token 정의 (구 task 04 = task 04-b 로 강등 또는 task 03 후속 PR 로 흡수) 가 본 task 직후 진입. **architect 의 다음 호출 (impl 목차 행 = task 04 신규)** 또는 **dcness `/impl-loop` 진입 (task 03 단독 구현 → task 04 신규 정의 → task 04-b 일괄 교체 → task 05~ 순차)** 둘 중 사용자 결정. 본 plan 은 양 흐름 모두 호환.
