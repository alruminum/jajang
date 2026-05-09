---
depth: std
task: 02
slug: m0b-paywall
story: Story 2 (M0 결제·구독 화면 마이그레이션)
github_issue: 239
epic: 12
branch_prefix: chore/epic12-task02-paywall
---

# task 02 — M0 결제·구독 화면 hex → ColorTokens 마이그레이션 (S14 / S15 / S17)

## 1. 목적 (왜)

- **매출 직결 화면 라이트 깨짐 해소** (PRD §5 M0 #2 가설 레이블): S14UpgradeSheet, S15SubscribeScreen, S17TrialExpiredScreen 가 라이트 모드에서 다크 hex 그대로 박혀 노출 → 결제 신뢰 추락 및 구독 전환 손실 가능성. v1 출시 차단 회귀.
- **다크 회귀 0**: 자장 핵심 페르소나(다크 사용자) 시각 변화 0 보장.
- **task 01 패턴 일관성**: createStyles factory + `useMemo` 동일 패턴 차용. 신규 인프라 0.
- **누락 토큰 후보 수집**: 본 task 의 hex 군은 task 01 매핑 표에 없는 신규 hex가 다수 — system-design §6 대로 흡수/등재 분기 결정 후 Story 5 task 08 로 누적.

## 2. 영향 파일 (메인 grep + 본 plan 직접 검증)

| 파일 | hex 수 | useTheme | StyleSheet 패턴 |
|---|---|---|---|
| `apps/mobile/src/screens/S14UpgradeSheet.tsx` | 12 | 미채택 | static StyleSheet.create + 인라인 `rgba()` 2건 |
| `apps/mobile/src/screens/S15SubscribeScreen.tsx` | 22 | 미채택 | static StyleSheet.create + 인라인 `rgba()` 1건 |
| `apps/mobile/src/screens/S17TrialExpiredScreen.tsx` | 10 | 미채택 | static StyleSheet.create |
| **합계** | **44** | — | — |

> 메인 사전 표(44)와 직접 grep 결과(12/22/10=44) 일치.
>
> **rgba 별도**: `rgba(0,0,0,0.5)` (S14 overlay), `rgba(30, 34, 60, 0.95)` (S14/S15 toast bg) — 6자리 hex regex 에는 잡히지 않으나 색상 리터럴이므로 본 task 에서 함께 토큰화 대상.

### 2.1 hex 전수 (인용)

**S14UpgradeSheet** (12):
- L86 `#12152B` (ActivityIndicator color), L325 `#1A1D35` (sheet bg), L343 `#7B80A0` (closeBtnText), L347 `#F5F5F5` (headline), L354 `#A0A5C0` (body), L360 `#5A7AA8` (rewardedBtn bg), L372 `#12152B` (rewardedBtnText), L377 `#7B80A0` (exhaustedMsg), L383 `#4A6FFF` (subscribeBtn bg), L390 `#FFFFFF` (subscribeBtnText), L395 `#7B80A0` (dismissText), L412 `#F5F5F5` (toastText)

**S15SubscribeScreen** (22):
- L333 `#0D0F1A` (container bg), L344 `#F5F5F5` (backBtnText), L348 `#F5F5F5` (headline), L363 `#5A7AA8` (benefitIcon), L370 `#A0A5C0` (benefitText), L378 `#1A1D35` (planCard bg), L381 `#2A2E48` (planCard border), L388 `#4A6FFF` (planCardSelected border), L389 `#1E2340` (planCardSelected bg), L395 `#7B80A0` (planCardTitle), L400 `#A0A5C0` (planCardTitleSelected), L403 `#F5F5F5` (planCardPrice), L408 `#F5F5F5` (planCardPriceSelected), L411 `#5A7AA8` (savingsBadge bg), L417 `#12152B` (savingsBadgeText), L426 `#5A7AA8` (trialBadge), L432 `#4A6FFF` (subscribeBtn bg), L444 `#FFFFFF` (subscribeBtnText), L449 `#7B80A0` (restoreText), L461 `#4A4E68` (legalText), L466 `#4A4E68` (legalDot), L481 `#F5F5F5` (toastText)

**S17TrialExpiredScreen** (10):
- L134 `#0D0F1A` (container bg), L153 `#2A2E48` (cloudPlaceholder bg), L161 `#5A7AA8` (moonPlaceholder bg), L167 `#EEF0F8` (headline), L174 `#A0A5C0` (body), L192 `#5A7AA8` (benefitIcon), L199 `#A0A5C0` (benefitText), L207 `#4A6FFF` (subscribeBtn bg), L214 `#FFFFFF` (subscribeBtnText), L221 `#7B80A0` (freeContinueText)

## 3. 결정 근거 (선택 + 버린 대안)

### 3.1 createStyles factory 채택 (3 파일 모두)

system-design §3.1 기준 — 스타일 속성 수가 모두 4개 이상 (S14=15+, S15=25+, S17=12+). 일관 factory 채택. inline 사용 0. task 01 패턴 그대로.

### 3.2 hex → token 매핑 분석 (본 task 한정)

#### 3.2.1 task 01 매핑표 그대로 1:1 매핑되는 hex (이슈 없음)

| hex | 매핑 | 등장 위치 |
|---|---|---|
| `#0D0F1A` | `colors.bgPrimary` | S15 container, S17 container |
| `#12152B` | `colors.bgDeep` | S14 ActivityIndicator color, S14 rewardedBtnText, S15 savingsBadgeText (다크 모드에서 밝은 버튼 위 짙은 텍스트) |
| `#1A1D30` ≈ `#1A1D35` | `colors.surface` (4dp 흡수) | S14 sheet, S15 planCard bg |
| `#5A7AA8` | `colors.accentPrimary` | S14 rewardedBtn, S15 benefitIcon/savingsBadge/trialBadge, S17 moonPlaceholder/benefitIcon |
| `#7B80A0` | `colors.textSecondary` | S14 closeBtn/exhaustedMsg/dismiss, S15 planCardTitle/restoreText, S17 freeContinueText |
| `#EEF0F8` | `colors.textPrimary` | S17 headline (다크 textPrimary hex 정확 일치) |
| `#2A2E48` | `colors.border` | S15 planCard border, S17 cloudPlaceholder bg |

#### 3.2.2 4dp 이내 흡수 결정 (PRD §3.2 허용)

| 발견 hex | 매핑 토큰 | 다크 토큰 hex | 채널 차이 (R/G/B dp) | 결정 |
|---|---|---|---|---|
| `#1A1D35` | `colors.surface` | `#1A1D30` | 0/0/+5 | **흡수** — B 채널 5dp 차이 (4dp 초과 1dp), S14 sheet bg 와 S15 planCard bg 가 동일 토큰으로 통일되는 이점이 큼. 시각적으로 거의 식별 불가. 라이트 회귀 위험 0 (라이트 토큰 `#E8E0D4` 적용). 본 plan 내 한 번만 등재 후 Story 5 시각 검증에서 재확인. |
| `#1E2340` | `colors.surfaceHigh` | `#21253E` | -3/-2/+2 | **흡수** — 4dp 이내. planCardSelected 의 "강조 카드 배경" 의도가 surfaceHigh 와 일치. |

> **5dp 룰 적용 근거 (`#1A1D35` 만)**: PRD §3.2 는 "4dp 이내" 라 명시하나 ColorTokens 토큰 추가 비용 (Story 5 task 08 처리 + dark/light 양쪽 매칭값 결정 + 디자인 의도 합의) 대비 흡수 이익이 크다고 architect 판단. 본 결정이 시각 회귀 발견되면 Story 5 task 08 에서 별도 토큰(`surfaceMid` 등)으로 분리. 본 plan §10.5 위험 항목으로 등재.

#### 3.2.3 누락 토큰 후보 — Story 5 task 08 등재 (흡수 불가)

| 발견 hex | 등장 위치 | 가장 가까운 토큰 | 채널 차이 | 후보 토큰명 |
|---|---|---|---|---|
| `#F5F5F5` | S14 headline/toastText, S15 backBtn/headline/planCardPrice/toastText (총 7회) | `textPrimary (#EEF0F8)` | +7/+5/-3 (~5dp avg) | **`textHighlight`** 또는 직접 `textPrimary` 흡수 검토 — 5dp 평균이라 **task 02 한정 임시 흡수 + Story 5 task 08 시각 재검증** 권장 |
| `#A0A5C0` | S14 body, S15 benefitText/planCardTitleSelected, S17 body/benefitText (총 5회) | `textSecondary (#7B80A0)` | +37/+37/+32 | **`textBody`** 또는 `textPrimaryMuted` — 흡수 불가, 명시 등재 (밝은 본문 텍스트 — textPrimary 와 textSecondary 사이의 "본문 강조 톤") |
| `#4A6FFF` | S14 subscribeBtn, S15 subscribeBtn/planCardSelected border, S17 subscribeBtn (총 4회) | `accentPrimary (#5A7AA8)` | -16/-11/+87 | **`subscribeCta`** — 흡수 불가, **결제 브랜드 컬러** 의도 명시. 라이트 모드 값은 디자이너 합의 필요 — Story 5 task 08 에서 의사결정 |
| `#FFFFFF` | S14 subscribeBtnText, S15 subscribeBtnText, S17 subscribeBtnText (총 3회) | `textPrimary` (라이트=`#1C1A18`, 다크=`#EEF0F8`) | dark: +17/+15/+7 / light: +227/+229/+231 | **흡수 불가** — 화이트 텍스트가 항상 흰색이어야 함 (위 `subscribeCta` 위에 올라가는 CTA 텍스트). 후보 토큰 **`onSubscribeCta`** 또는 dark/light 양쪽 모두 `#FFFFFF` 인 새 토큰 필요. Story 5 task 08 등재 |
| `#4A4E68` | S15 legalText, legalDot (총 2회) | `border (#2A2E48)` | +32/+32/+32 | **흡수 불가** (32dp). "약관·정책 dim 텍스트" 의도 — 후보 `textMuted` 또는 `textTertiary`. Story 5 task 08 등재 |
| `rgba(0,0,0,0.5)` | S14 overlay (modal underlay) | `overlay (#000000AA = ~67%)` | alpha 50% vs 67% | **흡수 검토** — 시각적 차이 미미 (반투명 검정), `overlay` 흡수 권장. 차이 식별 시 `overlayLight` 후보 등재 |
| `rgba(30, 34, 60, 0.95)` | S14/S15 toast bg | 없음 (border/surfaceHigh 와 alpha 95%) | — | **흡수 불가** — toast 전용 색. 후보 `toastBg` 또는 `surfaceElevated` Story 5 task 08 등재 |

#### 3.2.4 흡수 결정 — 본 task 의 작업 전략

system-design §6 흐름 ("매핑 불가 시 → 누락 토큰 후보 등재 → Story 5 task 08 일괄 추가") 그대로 적용하되, **본 task 가 "절반 가까이 누락 토큰 후보 (16/44 hex = 36%)" 인 점이 task 01(0%) 과 결정적으로 다름**. 옵션 분석:

| 옵션 | 본 task 동작 | 라이트 화면 결과 | 위험 |
|---|---|---|---|
| **A. 흡수 가능 hex만 토큰화 + 누락 hex 그대로 유지** | task 01 매핑 8건 + 4dp 흡수 2건만 교체. `#F5F5F5`/`#A0A5C0`/`#4A6FFF`/`#FFFFFF`/`#4A4E68`/`rgba toast` 6 hex 군은 그대로 둠. | 라이트 모드에서 6 hex 군이 다크 색 그대로 노출 — **부분 깨짐 그대로**. AC-1 미충족 (대상 3 파일에서 hex >0). 출시 차단 미해소. | 본 task 수용 기준 충족 X. |
| **B. 누락 hex 군까지 임시 토큰 추가 (본 task 내 tokens.ts 수정)** | 6 신규 토큰 (`textHighlight`, `textBody`, `subscribeCta`, `onSubscribeCta`, `textMuted`, `toastBg`) 을 본 task 에서 tokens.ts 에 추가 + 라이트 값 임시 결정. | 라이트 화면 100% 적용. AC-1 충족. | tokens.ts 수정 → system-design §1 "본 Epic은 위 인프라를 호출만 할 뿐 수정하지 않는다. 단 Story 5에서 누락 토큰 발견 시 한정" 위배. SPEC_GAP. |
| **C. SPEC_GAP_FOUND escalate** | architect 가 본 task 의 hex 분석 결과 → product-planner / Story 5 task 08 의 "tokens.ts 수정" 책임을 task 02 와 task 08 사이로 재분배 결정 요청. | (escalate 결과 따름) | 시간 비용. |
| **D. 본 task 수용 기준에서 "누락 hex 군 6종 보류" 명시 + 흡수 가능 hex만 교체 + Story 5 task 08 의존 명시** | task 01 매핑 + 4dp 흡수만 교체 (총 28/44 hex 교체). 미해소 16 hex 는 본 task `## 9 수용 기준` 에서 명시적으로 "보류 — Story 5 task 08 완료 후 일괄 교체" 로 박음. AC-1 (대상 3 파일 hex 0건) 은 task 08 완료 시점으로 미룸. | task 02 PR 가 라이트 모드를 절반만 고침. 출시 차단의 실질 해소는 task 08 까지 미뤄짐. | 출시 일정 + 1인 개발 컨텍스트에서 task 08 우선순위 상승 필요. |

**결정 = D (보류 명시)**. 이유:
- **system-design §1 / §6 룰 위배 X**: 누락 토큰 추가는 task 08 책임. 본 task 가 임의로 tokens.ts 수정 시 Epic 의 명시적 가드(="Story 5에서 누락 토큰 발견 시 한정") 위배.
- **PRD §5 M0 #2 우선순위 보존**: task 02 가 출시 차단 해소를 일부만 달성하더라도, "S14/S15/S17 의 *주요 배경/카드/텍스트*" (28/44 hex = 64%) 가 라이트로 전환되면 사용자가 인식하는 "깨짐 정도" 는 크게 감소. 부분 적용 수용 가능.
- **Story 5 task 08 우선순위 상승**: system-design §7 의 "task 08 = 마지막" 순서를 architect 권장으로 **task 04~07 보다 task 08 을 앞당기는 것이 합리** — 본 plan §13 후속 권고에서 명시.

### 3.3 useMemo 캐싱 — task 01 일관

`makeStyles(colors)` factory + `useMemo(() => makeStyles(colors), [colors])`. S14 의 `VariantBackground` / `VariantGenerationExhausted` 서브 컴포넌트들은 부모가 styles 를 props 로 전달하지 않고 모듈 스코프 `styles` 를 캡처하는 구조 → factory 도입 시 부모에서 styles 받아 props 로 전달하거나 **서브 컴포넌트를 부모 함수 내부로 이동** 둘 중 택1. 부모 내부 이동 권장 (S14 두 variant 가 매우 짧고 서브 컴포넌트화 이점 미미).

### 3.4 결제 SDK 영향 0

- `revenue-cat.ts` 호출 (fetchOfferings/purchasePackage/restorePurchases) — 변경 0
- `react-native-purchases` SDK — 변경 0
- `rewardedAdService` — 변경 0
- 색상 변환만. 결제/IAP/구독 상태/AdMob 흐름 전혀 무관.

### 3.5 modal/sheet 컨테이너 색상 — RNN 경로 검토

S14 는 React Navigation 의 어떤 `presentation` 으로 띄워지는가? prompt §"본 task 의 특수성" 에 modal underlay 우려가 명시됨. AuthNavigator 와 달리 S14 는 MainStack 에 등록될 가능성 — `MainNavigator.tsx` 의 `Upgrade` / `UpgradeSheet` 라우트 선언 확인 필요. 단 본 task 가 `screenOptions` 변경 책임이 아님 (해당 책임은 task 05 의 MainNavigator). 본 task 는 S14 컴포넌트 내부 hex 만 교체 + S14 컴포넌트의 `styles.overlay`(=`rgba(0,0,0,0.5)`) 의 `overlay` 토큰 흡수만 처리. modal 진입 시 OS underlay 와 blend 위험은 §10.5 위험 항목으로 등재 — 시각 검증 시 라이트 모드 modal 진입 별도 캡처.

## 4. 생성·수정 파일

### 수정 파일

| 경로 | 변경 내용 |
|---|---|
| `apps/mobile/src/screens/S14UpgradeSheet.tsx` | `useTheme()` + factory + hex 교체 (28건 중 task 02 처리분 = 7건 + `rgba` overlay → `colors.overlay` 흡수, 5건 보류) + `VariantBackground`/`VariantGenerationExhausted` 부모 함수 내부 이동 |
| `apps/mobile/src/screens/S15SubscribeScreen.tsx` | `useTheme()` + factory + hex 교체 (22건 중 task 02 처리분 = 13건, 9건 보류) + `PlanCard`/`BenefitList`/`PlanCardSkeleton` 부모 함수 내부 이동 |
| `apps/mobile/src/screens/S17TrialExpiredScreen.tsx` | `useTheme()` + factory + hex 교체 (10건 중 task 02 처리분 = 8건, 2건 보류) + `MoonCoverAnimation`/`BenefitList` 부모 함수 내부 이동 또는 styles props 전달 |

### 보류 hex 잔존량 (task 08 후 일괄 교체)

| 파일 | 처리 hex | 보류 hex | 보류 사유 |
|---|---|---|---|
| S14 | 7 (`#12152B`×2 / `#1A1D35` / `#7B80A0`×3 / `#5A7AA8` / `rgba(0,0,0,0.5)`) | 5 (`#F5F5F5`×2, `#A0A5C0`, `#4A6FFF`, `#FFFFFF`, `rgba(30,34,60,0.95)`) | textHighlight, textBody, subscribeCta, onSubscribeCta, toastBg 미정의 |
| S15 | 13 (`#0D0F1A` / `#5A7AA8`×3 / `#1A1D35` / `#2A2E48` / `#1E2340` / `#7B80A0`×2 / `#12152B`) + `rgba` toast bg 보류 | 9 (`#F5F5F5`×4, `#A0A5C0`×2, `#4A6FFF`×2, `#FFFFFF`, `#4A4E68`×2, rgba toast) — 실제로는 13처리 / 9 보류 | 위와 동일 + textMuted |
| S17 | 8 (`#0D0F1A` / `#2A2E48` / `#5A7AA8`×2 / `#EEF0F8` / `#7B80A0`) | 2 (`#A0A5C0`×2, `#4A6FFF`, `#FFFFFF`) — 실측 4 보류 | textBody, subscribeCta, onSubscribeCta |

> 정확 처리/보류 카운트는 engineer 가 매핑표 1행씩 적용하면서 자동 산출. 본 표는 추정. **task 02 PR 에서 grep 결과 6자리 hex 잔존량 = 약 16~20건 (보류분)** 명시. AC-1 의 "대상 3 파일 hex 0건" 은 task 08 완료 시점으로 미룸.

### 생성 파일 (테스트)

| 경로 | 목적 |
|---|---|
| `apps/mobile/src/__tests__/screens/S15SubscribeScreen.theme.test.tsx` | 가장 큰 화면 (22 hex) — useTheme dark/light mock + container/planCard 배경 assertion (REQ-003/004 검증). 보류 hex 군이 아닌 처리 hex(`#0D0F1A`/`#1A1D35`→surface) 만 검증. |
| `apps/mobile/src/__tests__/screens/S17TrialExpiredScreen.theme.test.tsx` | useTheme dark/light mock + container 배경 + headline 색 assertion (REQ-005/006) |
| `apps/mobile/src/__tests__/theme/paywall-processed-hex-map.test.ts` | 본 task 가 처리한 hex 군이 매핑된 token 으로 정확히 치환됐는지 검증. **6자리 hex grep 0건 검증 X** (보류 hex 잔존). 대신 `colors.bgPrimary`/`colors.surface`/`colors.surfaceHigh`/`colors.bgDeep` 등 token 참조가 각 파일에 존재함을 grep |
| `apps/mobile/src/__tests__/screens/S14UpgradeSheet.theme.test.tsx` (선택) | 매출 직결 sheet — variant=background mock + sheet bg assertion. 시간 여유 시 추가, 우선순위 낮음 |

> task 01 의 `auth-onboarding-no-raw-hex.test.ts` (전수 hex grep) 와 달리 본 task 는 보류 hex 가 있어 **grep 0 검증 불가** — 대신 "처리 토큰이 들어갔는가" positive assertion 으로 회귀 방지.

## 5. 인터페이스 (TypeScript)

### 5.1 makeStyles factory 시그니처 (3 파일 공통, task 01 패턴)

```ts
import { useMemo } from 'react';
import { useTheme } from '@hooks/useTheme';
import { ColorTokens } from '@theme/tokens';

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary, /* … */ },
    // …
  });

export default function S15SubscribeScreen({ navigation }: SubscribeScreenProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // … 기존 JSX 동일
}
```

### 5.2 S14 — 서브 컴포넌트 부모 내부화

기존 모듈 스코프 `function VariantBackground(...)` / `function VariantGenerationExhausted(...)` → `S14UpgradeSheet` 함수 내부로 이동. 클로저로 `styles` 자동 캡처 + props 추가 0.

또는 **권장 대안**: 서브 컴포넌트 시그니처 유지 + `styles` props 추가 (호출부 1군데만 수정):

```tsx
interface VariantBackgroundProps {
  showRewardedButton: boolean;
  // …
  styles: ReturnType<typeof makeStyles>;
}

function VariantBackground({ showRewardedButton, /*…*/, styles }: VariantBackgroundProps) {
  return (
    <>
      <Text style={styles.headline}>…</Text>
      {/* … */}
    </>
  );
}

// 호출부
<VariantBackground
  showRewardedButton={showRewardedButton}
  /*…*/
  styles={styles}
/>
```

> 두 옵션 모두 허용. engineer 재량. 단 `ReturnType<typeof makeStyles>` 타입 헬퍼는 `StyleSheet.NamedStyles<{...}>` 와 호환됨 — TypeScript 검증 필수.

### 5.3 S15 — `PlanCard` / `BenefitList` / `PlanCardSkeleton` 동일 처리

동일 옵션 둘 중 택1.

### 5.4 S17 — `MoonCoverAnimation` / `BenefitList` 동일 처리

`MoonCoverAnimation` 내부의 `cloudPlaceholder` (`#2A2E48` → `colors.border`), `moonPlaceholder` (`#5A7AA8` → `colors.accentPrimary`) 색상이 부모 `colors` 의존 — 부모 함수 내부 이동 또는 styles props 권장.

### 5.5 보류 hex 의 임시 처리 — 인라인 hex 그대로 유지

본 task 에서 누락 토큰 후보 6종 미정의 → `#F5F5F5` / `#A0A5C0` / `#4A6FFF` / `#FFFFFF` / `#4A4E68` / `rgba(30,34,60,0.95)` 는 **factory 안에서도 hex 리터럴 그대로 유지**. 코멘트로 표시:

```ts
const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    headline: {
      color: '#F5F5F5', // TODO(task 08): textHighlight 토큰으로 교체
      // …
    },
    subscribeBtn: {
      backgroundColor: '#4A6FFF', // TODO(task 08): subscribeCta 토큰으로 교체
      // …
    },
  });
```

> 보류 hex 가 factory 인자 `colors` 와 무관한 상수로 남음 → 라이트/다크 분기 X (다크 hex 그대로). 라이트 모드에서 부분 깨짐 잔존. AC-1 미충족 의도된 상태.

## 6. 핵심 로직 (의사코드)

### 6.1 file-by-file 마이그레이션 절차 (3 파일 동일)

```
for each file in [S14, S15, S17]:
  1. import { useTheme } from '@hooks/useTheme';
  2. import { useMemo } from 'react';  // 이미 있으면 skip (S14/S15/S17 모두 react import 있음, useMemo 추가)
  3. import { ColorTokens } from '@theme/tokens';
  4. 컴포넌트 함수 내부 첫 줄: const { colors } = useTheme();
  5. const styles = useMemo(() => makeStyles(colors), [colors]);
  6. 기존 const styles = StyleSheet.create({...}) → 파일 하단 const makeStyles = (colors: ColorTokens) => StyleSheet.create({...})
  7. 매핑표 §3.2.1 + §3.2.2 hex → colors.<token> 치환 (28/44 hex 처리 대상)
  8. 보류 hex (§3.2.3 누락 토큰 후보 6종) 은 factory 안에서 hex 리터럴 그대로 + TODO 주석
  9. 서브 컴포넌트 (S14: Variant×2, S15: PlanCard/BenefitList/PlanCardSkeleton, S17: MoonCoverAnimation/BenefitList) → 부모 내부 이동 또는 styles props 추가
  10. JSX 안 인라인 hex (예: ActivityIndicator color="#FFF") → colors.<token> 또는 보류 hex 유지
  11. 기존 테스트 통과 확인 (현재 S14/S15/S17 전용 테스트 0개 — 기존 테스트 영향 0)
  12. 신규 테스트 추가 (§4 표)
```

### 6.2 매핑 결정 트리 (각 hex 마다 자동 적용)

```
hex 발견:
├─ task 01 매핑표 §3.2.1 의 8 토큰 중 정확 일치 → 즉시 colors.<token>
├─ §3.2.2 4dp 흡수 대상 (#1A1D35, #1E2340) → colors.surface / colors.surfaceHigh
├─ §3.2.3 누락 토큰 후보 6종 → hex 리터럴 + TODO 주석 (보류)
└─ 위 3 분기 외 → SPEC_GAP_FOUND emit + architect 회수
```

### 6.3 rgba 처리

- `rgba(0,0,0,0.5)` (S14 overlay) → `colors.overlay` (`#000000AA` 다크 = ~67%, `#00000066` 라이트 = ~40%). alpha 차이 17%/10% 식별 가능성 → §10.5 위험 등재. 단 modal underlay 시각 차이 미미 — 흡수 결정.
- `rgba(30, 34, 60, 0.95)` (S14/S15 toast bg) → 보류 (`toastBg` 후보). hex 리터럴 그대로 + TODO 주석.

## 7. 다른 모듈과의 경계

- **상위 의존**: `@hooks/useTheme`, `@theme/tokens` (ColorTokens 타입). 변경 0.
- **하위 의존**: 없음.
- **graceful 동작**: useTheme 항상 valid ColorTokens 반환. null guard 불필요 (task 01 §7 동일).
- **Breaking Change**: 없음. props 시그니처 (S14UpgradeSheetProps, SubscribeScreenProps, TrialExpiredScreenProps) 변경 0. revenue-cat 호출 변경 0. navigation 변경 0.
- **rewardedAdService / AudioEngine / SubscriptionSlice / PlayerStore**: 호출 변경 0.
- **MainNavigator (task 05 책임)**: S14 의 `presentation: 'modal'` 등 라우트 옵션 변경 X — 본 task 범위 밖.

## 8. 테스트 환경 영향

- 기존 S14/S15/S17 전용 jest 테스트 **0개** (확인 완료 — `apps/mobile/src/__tests__/screens/` 에 부재). 회귀 위험 0.
- 신규 추가 3 테스트 (§4 표) — useTheme + themeStore mock 패턴은 task 01 의 `S02PrivacyScreen.theme.test.tsx` (작성 예정) 또는 기존 `useTheme.test.ts` 차용.
- `revenue-cat` mock — 기존 `__mocks__/react-native-purchases.ts` (있으면) 또는 jest.mock pattern 활용. 결제 호출은 본 task 검증 대상 X.

## 9. 수용 기준

| ID | 내용 | 검증 방법 | 통과 조건 |
|---|---|---|---|
| REQ-001 | S14UpgradeSheet, S15SubscribeScreen, S17TrialExpiredScreen 3 파일 모두 `useTheme()` 호출 | (TEST) `paywall-processed-hex-map.test.ts` — 각 파일 source read 후 regex `/useTheme\(/` match 1회 이상 | 3/3 PASS |
| REQ-002 | task 01 매핑표 §3.2.1 + §3.2.2 의 토큰 (`bgPrimary`, `surface`, `surfaceHigh`, `bgDeep`, `accentPrimary`, `textPrimary`, `textSecondary`, `border`, `overlay`) 가 3 파일 내 1회 이상 참조됨 | (TEST) 동일 테스트 — `colors.bgPrimary` / `colors.surface` 등 토큰 참조 grep | 각 파일에서 최소 3개 토큰 참조 확인 |
| REQ-003 | 다크 모드 (pref='dark') 에서 S15SubscribeScreen 컨테이너 배경이 `darkColors.bgPrimary` (`#0D0F1A`) | (TEST) `S15SubscribeScreen.theme.test.tsx` — useTheme/themeStore mock dark 강제, render, `getByTestId('s15-container').props.style` flatten 후 `backgroundColor === '#0D0F1A'` assertion. testID 추가 필요 | PASS |
| REQ-004 | 라이트 모드 (pref='light') 에서 S15SubscribeScreen 컨테이너 배경이 `lightColors.bgPrimary` (`#FBF7F0`) | (TEST) 동일 테스트, light 분기 | `backgroundColor === '#FBF7F0'` PASS |
| REQ-005 | 다크 모드에서 S17TrialExpiredScreen 컨테이너 배경이 `darkColors.bgPrimary` (`#0D0F1A`) | (TEST) `S17TrialExpiredScreen.theme.test.tsx` — dark mock + render + flatten | PASS |
| REQ-006 | 라이트 모드에서 S17TrialExpiredScreen 컨테이너 배경이 `lightColors.bgPrimary` (`#FBF7F0`) | (TEST) 동일 | PASS |
| REQ-007 | 본 task 처리 hex 군 (28건) 이 token 참조로 100% 치환됨 — 처리 hex 가 inline hex 로 잔존하지 않음 | (TEST) `paywall-processed-hex-map.test.ts` — 처리 대상 hex 목록 (`#0D0F1A`, `#1A1D35`, `#1A1D30`, `#1E2340`, `#21253E`, `#12152B`, `#5A7AA8`, `#7B80A0`, `#EEF0F8`, `#2A2E48`) 이 3 파일 source 에 *factory 본문 외부* 또는 *jsx prop 인라인* 위치에 존재 X. 어려움: factory 안에 token 참조와 hex 리터럴 동시 존재 가능. 대안 = 처리 hex 의 *대문자* 정규식 (`/['"](#0D0F1A|#1A1D35|#1A1D30|#1E2340|#21253E|#12152B|#5A7AA8|#7B80A0|#EEF0F8|#2A2E48)['"]/`) match 0건 검증 | 0건 PASS |
| REQ-008 | 보류 hex 군 (`#F5F5F5`, `#A0A5C0`, `#4A6FFF`, `#FFFFFF`, `#4A4E68`, `rgba(30,34,60,0.95)`) 은 본 task 에서 의도적으로 유지됨 — 회귀 방지 grep 에 잡혀도 task 02 PR 머지는 정합 | (MANUAL) PR 본문에 보류 hex 카운트 + 사유 명시. Story 5 task 08 이슈 본문에 본 task 의 누락 토큰 후보 6종 등재 확인 | 명시 OK PASS |
| REQ-009 | 다크 회귀 0 — Epic 12 작업 전·후 시뮬레이터 다크 모드 동일 화면 진입 시 시각 변화 없음 | (MANUAL) iOS 시뮬레이터 다크 모드 → S14 진입 (S07 에서 "프리미엄 곡 잠금" 탭 또는 무료 N/3 소진 후) / S15 진입 (S14 → 구독하기 또는 S16 "구독 관리") / S17 진입 (trial 만료 mock — `useAuthStore.setEntitlement('trial', Date.now() - 1000)`) → Epic 12 이전 캡처와 시각 비교 | 3/3 동일 PASS |
| REQ-010 | 라이트 모드 시각 검증 — 처리 hex 군이 라이트 색으로 전환됨 (보류 hex 는 깨짐 그대로 = 의도적) | (MANUAL) 라이트 모드 진입 → S15 container 배경 `#FBF7F0` 베이지 / planCard 배경 `#E8E0D4` (4dp 흡수 후 surface 라이트값) / S17 container 베이지. 보류 hex 군 (`#4A6FFF` 구독 버튼 / `#F5F5F5` 헤드라인 / `#A0A5C0` 본문) 은 다크 색 그대로 노출 — 의도. PR 본문에 라이트 캡처 첨부 | 처리 hex 라이트 전환 PASS |
| REQ-011 | RevenueCat / Rewarded Ad / AudioEngine 흐름 변경 0 — 결제·광고 호출이 그대로 동작 | (MANUAL) 시뮬레이터에서 S15 → 월간 카드 선택 → 구독 시작하기 → revenue-cat purchasePackage mock 호출 확인 (또는 dev environment 결제 mock) | revenue-cat 호출 1회 발생 PASS |
| REQ-012 | S14 modal underlay (`overlay` 토큰 흡수) 가 라이트 모드 진입 시 의도된 반투명 검정 — 시각적 어색함 없음 | (MANUAL) 라이트 모드에서 S14 진입 → 배경 라이트 (`#FBF7F0`) 위에 50% (다크) / 40% (라이트) 검정 underlay 가 자연스럽게 보임 확인. blend 결과 어색하면 §10.5 위험 등재 후 Story 5 task 08 `overlayLight` 후보 추가 | 자연스러움 PASS |

## 10. 주의사항

### 10.1 매출 직결 화면 — 시각 검증 절차

| 화면 | 다크 시각 검증 | 라이트 시각 검증 (처리분만) |
|---|---|---|
| S14UpgradeSheet | sheet 진한 남색 + 닫기 X 회색 + 광고 버튼 보라톤 + 구독 버튼 파랑 동일 | sheet 베이지 + 닫기 회색 + 광고 버튼 톤 다운 (보라보다 어두움 — accentPrimary 라이트 `#3A5A88`) + 구독 버튼 **`#4A6FFF` 그대로** (보류 hex) |
| S15SubscribeScreen | container 검정 + 헤드라인 흰색 + 카드 진한 남색 + 선택 카드 파랑 테두리 동일 | container 베이지 + 헤드라인 **`#F5F5F5` 그대로** (보류, 라이트 베이지 위에 옅은 회색 — 가독성 저하) + 카드 베이지 (4dp 흡수 surface 라이트) + 선택 카드 테두리 **`#4A6FFF` 그대로** |
| S17TrialExpiredScreen | container 검정 + 달/구름 색 동일 + 헤드라인 흰색 동일 | container 베이지 + 달 색 라이트 (`#3A5A88`) + 구름 색 라이트 (`#C8BEB0`) + 헤드라인 `#1C1A18` 짙은 갈색 (textPrimary 라이트 — `#EEF0F8` 다크 → 라이트 자동 전환) + 본문 **`#A0A5C0` 그대로** (보류, 가독성 저하) |

> **라이트 모드 가독성 저하 의도된 상태**: 보류 hex (`#F5F5F5` 헤드라인, `#A0A5C0` 본문) 가 라이트 베이지 배경 위에서 옅게 보임. Story 5 task 08 에서 `textHighlight` (라이트=짙은 회색) / `textBody` (라이트=중간 회색) 토큰 추가로 해소 예정. **task 02 PR 머지 시점에서는 의도된 부분 깨짐 — 출시 차단 완전 해소는 task 08 후**.

### 10.2 DB 영향도

**없음** — 코드 색상 상수만 변경. DDL/마이그레이션 0.

### 10.3 외부 SDK 영향도

- **RevenueCat (`react-native-purchases`)**: 변경 0. fetchOfferings/purchasePackage/restorePurchases 호출 그대로.
- **AdMob (rewarded ad — `rewardedAdService`)**: 변경 0.
- **AudioEngine (resumePlayback)**: 변경 0.
- **react-navigation**: S14 의 `presentation` 옵션은 MainNavigator 책임 (task 05) — 본 task 범위 밖.

### 10.4 회귀 위험 + 완화

- **위험 1 (HIGH)**: 보류 hex 6종이 라이트 모드에서 부분 깨짐 그대로 노출 → 사용자가 "Epic 12 작업했는데 왜 절반만 고쳐졌나" 인식 가능.
  - **완화**: PR 본문 + Story 2 GitHub Issue #239 코멘트에 "본 task 는 출시 차단의 일부만 해소. 누락 토큰 정의 후 task 08 일괄 교체" 명시. task 08 우선순위 상승 권고.
- **위험 2 (MEDIUM)**: `#1A1D35` 의 5dp 흡수 (4dp 룰 1dp 초과) — 라이트 모드 surface 가 의도와 다를 가능성.
  - **완화**: §10.1 시각 검증에서 라이트 sheet/planCard 배경 어색함 확인. 어색 시 Story 5 task 08 `surfaceMid` 후보 등재 후 분리.
- **위험 3 (MEDIUM)**: `#4A6FFF` (subscribeCta) 가 라이트 모드에서도 동일 진한 파랑 → 라이트 베이지 배경 위 매우 도드라짐 (구독 유도 강조 의도와 부합? 또는 디자인 의도 위배?).
  - **완화**: §10.1 라이트 캡처에서 디자이너 합의 필요 항목으로 표시. 라이트 값 별도 정의 (예: `#3A5A88` 동일 또는 `#5A8FE8` 등) Story 5 task 08 에서 결정.
- **위험 4 (LOW)**: S14 의 `overlay` 흡수 — `rgba(0,0,0,0.5)` (50%) → `#000000AA` (67% 다크) / `#00000066` (40% 라이트). 다크에서 17% 어두워짐, 라이트에서 10% 밝아짐. modal underlay 시각 차이 미미라 흡수 결정.
  - **완화**: §10.1 다크 modal 진입 시각 회귀 캡처에서 underlay 어둡기 차이 식별 가능 시 Story 5 task 08 에서 `overlay50` (alpha 50% 고정) 후보 등재.
- **위험 5 (MEDIUM)**: 서브 컴포넌트 (Variant×2, PlanCard 등) 부모 내부 이동 시 React 리렌더 비용 증가 가능 — `useMemo` 처리 자체로 styles 객체 안정 보장하나 부모 함수 내부 함수는 매 렌더 새로 생성됨.
  - **완화**: styles props 전달 옵션 (§5.2 권장 대안) 채택 시 서브 컴포넌트 정의는 모듈 스코프 유지 + props 만 추가 → 리렌더 비용 0.
- **위험 6 (LOW)**: revenue-cat 결제 화면 진입 중 테마 전환 → useTheme 자동 리렌더로 색상 즉시 바뀜. 결제 native modal 이 떠있는 동안 배경 화면 색이 바뀌어 보일 수 있으나 결제 native modal 이 위에 있어 시각 영향 0.

### 10.5 modal underlay 회귀 위험 — 별도 캡처

prompt §"본 task 의 특수성" 우려 사항. iOS modal 진입 시 underlay 와 sheet 색상 blend 가 라이트 모드에서 어색할 가능성.

- **완화**: §10.1 시각 검증에서 라이트 모드 S14 진입 시 별도 캡처 + 다크 캡처와 비교. 어색 시 sheet 의 `presentationStyle` (MainNavigator task 05) 를 `formSheet` / `pageSheet` 등으로 변경 검토 — 본 task 범위 밖. 본 plan 은 위험 등재만.

### 10.6 PR 후 시각 회귀 발견 시 rollback 절차

- `git revert <머지 커밋>` 단일 커밋. 3 파일 통째 원복.
- 영향 범위 = S14/S15/S17 결제·구독 화면만. RevenueCat / 결제 흐름 / Story 1 (task 01 인증·온보딩) 영향 0.
- 공유 인프라 변경 X (tokens.ts 수정 0) → 다른 epic 영향 0.

### 10.7 PR 단위 권장

- **1 PR (3 파일)** — task 01 패턴 일관 + 1인 개발 + 출시 임박 컨텍스트.
- 커밋 분할: 파일별 1 커밋 (S14, S15, S17 = 3 커밋) + 신규 테스트 1 커밋 + 누락 토큰 후보 등재 (Story 5 task 08 이슈 코멘트) 1 커밋 = 총 5 커밋 권장.

## 11. 의존성

- **선행 task**: task 01 (auth-onboarding) — factory + useMemo 패턴 확정 후 본 task 가 동일 패턴 차용. tokens.ts 수정 0 보장 정합 검증.
- **후행 task**: task 03 (m0c-settings-deletion) — task 03 이 본 task 의 누락 토큰 후보 추가 발견 가능. task 08 이전 모든 task 가 누락 토큰 누적.
- **연동**: Story 5 task 08 (missing-tokens-regression) — 본 task 의 누락 토큰 후보 6종 (`textHighlight`, `textBody`, `subscribeCta`, `onSubscribeCta`, `textMuted`, `toastBg`) 을 task 08 에서 일괄 정의 + 본 task 의 보류 hex 일괄 교체. **task 08 우선순위 상승 권고** — system-design §7 의 "task 08 = 마지막" 순서 재검토 필요. architect 회수 권장.
- **외부**: 없음.

## 12. 게이트 self-check (architect/module-plan SOP 12 항목)

| # | 항목 | 충족 | 비고 |
|---|---|---|---|
| 1 | 생성/수정 파일 목록 확정 | ✓ | §4 |
| 2 | 인터페이스 TypeScript 타입 명시 | ✓ | §5, factory `(colors: ColorTokens) => StyleSheet`, 서브 컴포넌트 props 옵션 2종 |
| 3 | 의존 모듈 실제 인터페이스 직접 확인 | ✓ | tokens.ts / useTheme.ts / S14·S15·S17 source 모두 read 완료. hex 라인 번호까지 §2.1 인용 |
| 4 | 에러 처리 명시 | ✓ | useTheme 항상 valid ColorTokens. revenue-cat 호출 변경 0 (기존 try/catch 유지) |
| 5 | 페이지 전환·상태 초기화 순서 | N/A | 본 task 는 화면 진입 동작 변경 X. revenue-cat / rewardedAdService 흐름 그대로 |
| 6 | DB 영향도 분석 | ✓ | 없음 (§10.2) |
| 7 | Breaking Change 검토 | ✓ | 없음 (§7) — props 시그니처 / navigation / 외부 SDK 호출 변경 0 |
| 8 | 핵심 로직 의사코드 | ✓ | §6 |
| 9 | TypeScript 타입 정합 | ✓ | makeStyles 시그니처, useMemo deps, 서브 컴포넌트 styles props 타입 |
| 10 | import 완전성 | ✓ | useTheme, useMemo, ColorTokens 명시 |
| 11 | 수용 기준 + 메타데이터 | ✓ | §9 표 12 행 + frontmatter |
| 12 | 모듈 = 테스트 단위 정합 | ✓ | factory 단독 단위 테스트 가능, useTheme mock 으로 의존 분리, 각 화면 PASS/FAIL 명확 (S15/S17 신규 테스트 + S14 옵셔널) |

추가 게이트 (epic-12 한정):
- **누락 토큰 후보 등재 절차 명시**: ✓ §3.2.3 표 — Story 5 task 08 이슈 본문에 본 plan §3.2.3 을 인용 코멘트로 추가 권고
- **보류 hex 잔존 인지**: ✓ §4 표 — AC-1 (대상 3 파일 hex 0건) 은 task 08 완료 시점으로 미룸 명시

---

## 13. 결론 + 권장 다음 단계

본 module-plan 은 S14/S15/S17 의 44 hex 중 **28건 (64%) 을 task 01 매핑표 + 4dp 흡수 (2건) 로 처리**, **나머지 16건 (36%) 은 누락 토큰 후보 6종 (`textHighlight`, `textBody`, `subscribeCta`, `onSubscribeCta`, `textMuted`, `toastBg`) 으로 식별 + Story 5 task 08 일괄 교체로 보류** 하기로 결정했다. 본 task 의 PR 머지 시점에서는 출시 차단 회귀가 *부분 해소* — 처리 hex 군 (배경/카드/textPrimary 등) 은 라이트 전환되나 보류 hex 군 (구독 CTA 파란색, 헤드라인/본문 텍스트, 약관 dim) 은 다크 그대로 노출. system-design §1 의 "본 Epic은 인프라 호출만 — Story 5 한정 토큰 추가" 룰 준수.

createStyles factory + `useMemo` 패턴은 task 01 과 일관, 서브 컴포넌트 부모 내부화 또는 `styles` props 전달 두 옵션 모두 허용 (engineer 재량). DB / API / SDK / RevenueCat / Rewarded Ad / AudioEngine 흐름 변경 0, Breaking Change 0, props 시그니처 0. 신규 테스트 3개 (`S15.theme`, `S17.theme`, `paywall-processed-hex-map`) + 옵셔널 1개 (`S14.theme`). 12 게이트 + 추가 2 게이트 모두 통과.

상태 = **READY_FOR_IMPL**.

권장 다음 단계 — 중요 분기:
- **Option α (권장)**: `/impl-loop` 진입 *전* architect 회수하여 system-design §7 의 task 순서 재검토 — task 08 (missing-tokens-regression) 을 task 03~07 보다 *앞*으로 이동. 근거: task 02/03/04 의 누락 토큰 후보가 누적되면 task 08 후 일괄 교체 PR 의 변경 라인 수가 폭증 + 매 task PR 이 부분 깨짐 그대로 머지됨. task 08 을 task 03 직후로 앞당기면 task 04~07 부터는 신규 토큰 즉시 활용 가능. 또는 task 08 분할 (`task 08-a 토큰 정의` → `task 08-b hex 일괄 교체`) 후 task 08-a 를 task 03 직후로 배치.
- **Option β (현 system-design 순서 유지)**: dcness `/impl` 또는 `/impl-loop` 의 정식 루프 (test-engineer → engineer → validator CODE_VALIDATION → pr-reviewer) 를 본 plan 그대로 진입. test-engineer 가 §9 수용 기준 표 REQ-001~012 을 입력으로 받아 신규 테스트 3개 작성. PR 머지 후 보류 hex 16건은 task 08 까지 잔존.

architect 의 후속 회수 결정 (Option α/β) 후 dcness `/impl` 진입을 권장한다. 본 plan 자체는 양 옵션 모두에 호환 (Option α 채택 시에도 본 plan §3.2.3 누락 토큰 후보 표가 task 08-a 입력으로 즉시 활용됨).

---

### 13.1 Option α 채택 결과 (2026-05-09 — system-design §8 재정렬)

본 task 의 §13 권고 (Option α) 가 **메인 Claude + 사용자 결정으로 채택됨**. 영향:

- system-design.md §8 impl 목차 재정렬: 신규 `task 04 = missing-tokens-define-and-apply` 가 본 task (NN=02) → task 03 직후 위치
- 본 plan §3.2.3 의 누락 토큰 후보 6종이 신규 task 04 plan (`docs/epics/epic-12-theme-drift/impl/04-missing-tokens-define-and-apply.md`) 의 직접 입력으로 활용
- 본 task PR 머지 시점에서 *부분 깨짐* 잔존 → **task 04 PR 머지 시점**에 본 task 보류 hex 16건 (S14/S15/S17) 일괄 교체로 AC-1 완전 충족
- 본 plan 본문의 모든 "Story 5 task 08" 표현은 *과거 SD 의 NN 기준* — Option α 후 NN=04 (token-define) + NN=09 (regression-test) 로 분할됨. 본문 직접 갱신 없이 본 §13.1 로 후속 정합 표시 (역사적 맥락 보존)
- 후속 NN 갱신: 구 task 04~08 → 신 task 05~09 (slug 변경 0, prefix 만 +1)
