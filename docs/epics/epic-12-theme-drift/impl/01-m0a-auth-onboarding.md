---
depth: std
task: 01
slug: m0a-auth-onboarding
story: Story 1 (M0 인증·온보딩 화면 마이그레이션)
github_issue: 238
epic: 12
branch_prefix: chore/epic12-task01-auth-onboarding
---

# task 01 — M0 인증·온보딩 화면 hex → ColorTokens 마이그레이션

## 1. 목적 (왜)

- **출시 차단 회귀 해소**: 라이트 모드 사용자가 앱 첫 진입(스플래시 → 개인정보 → 온보딩 → 회원가입 → 로그인)에서 다크 hex 박힘으로 화면이 깨져 보이는 v1 출시 차단 이슈(Issue #238) 해결.
- **다크 회귀 0**: 다크 사용자(자장 핵심 페르소나) 시각 변화 0 보장.
- **인프라 재사용**: 기존 `useTheme()` + `ColorTokens(15 토큰)` 호출만 추가, 신규 인프라 0.

## 2. 영향 파일 (실측 = 메인 사전 grep + 본 module-plan 직접 검증)

| 파일 | hex 수 | useTheme | StyleSheet 패턴 |
|---|---|---|---|
| `apps/mobile/src/screens/S01SplashScreen.tsx` | 1 | 미채택 | static StyleSheet.create |
| `apps/mobile/src/screens/S02PrivacyScreen.tsx` | 18 | 미채택 | static StyleSheet.create |
| `apps/mobile/src/screens/S03OnboardingScreen.tsx` | 10 | 미채택 | static StyleSheet.create |
| `apps/mobile/src/screens/S04SignupScreen.tsx` | 16 | 미채택 | static StyleSheet.create |
| `apps/mobile/src/screens/S05LoginScreen.tsx` | 15 | 미채택 | static StyleSheet.create |
| `apps/mobile/src/screens/LegalScreen.tsx` | 8 | 미채택 | static StyleSheet.create |
| `apps/mobile/src/components/SocialAuthButtons.tsx` | 4 | 미채택 | static StyleSheet.create |
| `apps/mobile/src/navigation/AuthNavigator.tsx` | 1 | 미채택 | inline screenOptions |
| **합계** | **73** | — | — |

> 메인 사전 표에는 S02 17/Social 5/총 74로 적혀 있었으나 직접 grep 결과 S02=18, Social=4, 총 73. 본 plan 은 73 기준으로 작업.

## 3. 결정 근거 (선택 + 버린 대안)

### 3.1 createStyles factory 채택 (vs inline style 만)

system-design §3.1/§3.2 기준: 스타일 속성 4개 이상 = factory, 3개 이하 = inline.

| 파일 | 채택 패턴 | 이유 |
|---|---|---|
| S01SplashScreen | factory `makeStyles(colors)` | container `backgroundColor` 1개지만 컴포넌트 일관성 + 향후 light placeholder logo 대비 |
| S02 ~ S05, Legal, SocialAuth | factory `makeStyles(colors)` | 스타일 항목 8~30개 — factory 강제 |
| AuthNavigator | inline `screenOptions={{ contentStyle: { backgroundColor: colors.bgPrimary } }}` | 스타일 1개, 함수 컴포넌트 안에서 직접 |

**버린 대안**:
- **A) hex 만 그대로 두고 lightColors 도 같은 hex 로 정의** → 라이트 사용자에게 다크 그대로 노출. 본 epic 의 근본 목표 위배.
- **B) `Colors`(=darkColors 별칭) 직접 import 유지** → 다크 고정. 라이트 모드 비반응. 폐기.
- **C) StyleSheet 외부에서 매 렌더 새 객체 생성 (`{...colors}` 직접 spread)** → React.memo 비교 깨짐 + 메모리 누수 위험. factory + `useMemo` 권장.

### 3.2 `useMemo` 캐싱 — engineer 재량 (가이드만 명시)

`makeStyles(colors)` 가 매 렌더 호출되면 새 StyleSheet 객체. 인증 플로우 화면은 리렌더 빈도 낮음(폼 입력/슬라이드 페이지) → `useMemo(() => makeStyles(colors), [colors])` 권장하나 강제 X. `colors` 객체 참조가 `useTheme()` 안에서 hook 호출당 새로 만들어지지 *않음* (`darkColors`/`lightColors` 모듈 상수 직접 반환) → `[colors]` deps 안정.

### 3.3 `#E05F5F` 흡수 처리 (S04/S05 errorText / inputError border)

매핑 분석:
- `#E05F5F` (S04 line 194/195, S05 line 184) — input 에러 색상
- `darkColors.destructive` = `#E85A5A`
- 시각 차이: R 채널 8, G 채널 5, B 채널 0 → 약 4dp 이내 (PRD §3.2 흡수 기준 충족)
- **결정**: `colors.destructive` 로 흡수. 누락 토큰 후보 등재 X.

### 3.4 hex → token 매핑표 (본 task 한정 — 8 파일 73건 전수)

| 발견 hex | 매핑 token | 비고 |
|---|---|---|
| `#0D0F1A` | `colors.bgPrimary` | 배경, primaryBtnText / checkmark / appleBtnText 색상 (다크에서는 텍스트가 짙은 배경) |
| `#1A1D30` | `colors.surface` | 카드, input, nextBtn, googleBtn 배경 |
| `#5A7AA8` | `colors.accentPrimary` | 강조 텍스트, primary 버튼 배경, 활성 dot, 체크박스 |
| `#7B80A0` | `colors.textSecondary` | 보조 텍스트, placeholder, 화살표, secondary 텍스트 |
| `#EEF0F8` | `colors.textPrimary` | 일반 텍스트, appleBtn 배경 (애플 가이드라인) |
| `#2A2E48` | `colors.border` | 테두리, divider, 비활성 버튼 배경, 비활성 dot |
| `#C49A8A` | `colors.accentSecondary` | 링크 텍스트 (S02 line 124) |
| `#E05F5F` | `colors.destructive` | 에러 텍스트·테두리 (4dp 이내 흡수) |

> `appleBtnText: '#0D0F1A'` (애플 가이드라인 — 흰 버튼 위 검정 텍스트) 는 다크에서는 `bgPrimary` (`#0D0F1A`), 라이트에서는 `bgPrimary` (`#FBF7F0`) 로 변환. 라이트 모드에서 흰 버튼(`#EEF0F8` = textPrimary 라이트값 `#1C1A18`?) 배경+텍스트 대비를 시각 검증해야 함 → §6 시각 검증 항목.
>
> **주의 — Apple 버튼 가이드라인 충돌**: 라이트 모드에서 `appleBtn.backgroundColor = colors.textPrimary (#1C1A18, 거의 검정)` + `appleBtnText.color = colors.bgPrimary (#FBF7F0, 거의 흰색)` 가 됨. 이는 *검은 배경 + 흰 텍스트* 라이트 모드 Apple 버튼이며, Apple HIG 이 라이트 모드에서도 허용하는 디자인(black-on-white 또는 white-on-black 모두 가능). 시각 검증 시 라이트 모드 Apple 버튼이 화면 가운데 검정으로 도드라지더라도 가이드라인 위배 X. 의도와 어긋나면 누락 토큰(`socialApple` = 항상 검정 등) 후보 등재 — 본 task 범위 밖, Story 5 task 08 처리.

## 4. 생성·수정 파일

### 수정 파일

| 경로 | 변경 내용 |
|---|---|
| `apps/mobile/src/screens/S01SplashScreen.tsx` | `useTheme()` 호출 + `makeStyles(colors)` factory 변환 + hex 1건 교체 |
| `apps/mobile/src/screens/S02PrivacyScreen.tsx` | `useTheme()` 호출 + factory + hex 18건 교체 |
| `apps/mobile/src/screens/S03OnboardingScreen.tsx` | `useTheme()` 호출 + factory + hex 10건 교체 |
| `apps/mobile/src/screens/S04SignupScreen.tsx` | `useTheme()` 호출 + factory + hex 16건 교체 (`#E05F5F` 2건 → `destructive` 흡수) |
| `apps/mobile/src/screens/S05LoginScreen.tsx` | `useTheme()` 호출 + factory + hex 15건 교체 (`#E05F5F` 1건 → `destructive` 흡수) |
| `apps/mobile/src/screens/LegalScreen.tsx` | `useTheme()` 호출 + factory + hex 8건 교체 (`BROWSER_OPTIONS` 의 `toolbarColor`/`controlsColor` 도 `useMemo` 로 colors 의존 변환) |
| `apps/mobile/src/components/SocialAuthButtons.tsx` | `useTheme()` 호출 + factory + hex 4건 교체 |
| `apps/mobile/src/navigation/AuthNavigator.tsx` | `useTheme()` 호출 + `screenOptions` inline `colors.bgPrimary` 적용 |

### 생성 파일 (테스트 — `(TEST)` 태그 충족용)

| 경로 | 목적 |
|---|---|
| `apps/mobile/src/__tests__/screens/S02PrivacyScreen.theme.test.tsx` | dark/light 양쪽 useTheme mock 으로 배경 backgroundColor assertion + hex 0건 grep |
| `apps/mobile/src/__tests__/components/SocialAuthButtons.theme.test.tsx` | 동일 패턴 |
| `apps/mobile/src/__tests__/theme/auth-onboarding-no-raw-hex.test.ts` | 본 task 8 파일 한정 hex grep — Story 5 의 전수 hex-lint 와 별도. 본 task 종료 시점 자체 검증 |

> 기존 `S04SignupScreen.test.tsx`, `S05LoginScreen.test.tsx`, `S01SplashScreen.test.tsx`, `LegalScreen.test.tsx` 는 *수정 없이 통과* 가 정합 (useTheme 추가가 외부 동작 변화 없음). 통과 안되면 useTheme/themeStore mock 추가 — 기존 `useTheme.test.ts` 패턴 그대로 차용.

## 5. 인터페이스 (TypeScript)

### 5.1 makeStyles factory 시그니처 (8 파일 공통 패턴)

```ts
import { ColorTokens } from '../theme/tokens';

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    // ...
  });

// 컴포넌트 내부
export default function S02PrivacyScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // ... 기존 JSX 동일
}
```

### 5.2 LegalScreen — `BROWSER_OPTIONS` 동적화

기존:
```ts
const BROWSER_OPTIONS = {
  presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
  toolbarColor: '#0D0F1A',
  controlsColor: '#5A7AA8',
} as const;
```

변경:
```ts
import { useMemo } from 'react';

export function LegalScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const browserOptions = useMemo(() => ({
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
    toolbarColor: colors.bgPrimary,
    controlsColor: colors.accentPrimary,
  }), [colors]);
  // ... openBrowserAsync(url, browserOptions)
}
```

> `BROWSER_OPTIONS` 모듈 상수 → 컴포넌트 내부 `useMemo` 로 이동. `as const` 제거 (런타임 객체이므로 불필요). 기존 LegalScreen 테스트의 `WebBrowser.openBrowserAsync` mock assertion 영향 검증 필요 — assertion 이 두 번째 인자를 strict 비교하면 deps 가 달라지므로 `expect.objectContaining` 으로 완화 권고.

### 5.3 AuthNavigator — `screenOptions` 함수 형태 또는 인라인

선택지 A (인라인 — 권장):
```tsx
export default function AuthNavigator() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bgPrimary },
        animation: 'slide_from_right',
      }}
    >
      {/* ... */}
    </Stack.Navigator>
  );
}
```

테마 변경 시 Navigator 가 적절히 리렌더하는지 검증(useTheme 이 Zustand store 구독 → 자동 리렌더 보장).

## 6. 핵심 로직 (의사코드)

### 6.1 file-by-file 마이그레이션 절차 (engineer 가 8 파일 동일 흐름 반복)

```
for each file in [S01, S02, S03, S04, S05, Legal, SocialAuth, AuthNav]:
  1. import { useTheme } from '@hooks/useTheme';
  2. import { useMemo } from 'react';  // 이미 있으면 skip
  3. 컴포넌트 함수 내부 첫 줄에 const { colors } = useTheme();
  4. 기존 const styles = StyleSheet.create({...}) → 파일 하단 const makeStyles = (colors: ColorTokens) => StyleSheet.create({...})
  5. 컴포넌트 안에서 const styles = useMemo(() => makeStyles(colors), [colors]);
  6. StyleSheet 본문 내 hex 리터럴 전수 → 매핑표(§3.4)에 따라 colors.<token> 치환
  7. 컴포넌트 JSX 안에 hex 리터럴(예: TextInput placeholderTextColor='#7B80A0') → colors.textSecondary inline
  8. import { ColorTokens } from '../theme/tokens';  // factory 인자 타입
  9. 빌드 + 기존 테스트 통과 확인
  10. 다음 파일
```

### 6.2 hex 그대로 유지하는 *예외* (있는지 검증)

- 본 8 파일에는 *예외 없음* — 모든 hex 가 매핑표 8 토큰 중 하나로 1:1 흡수.
- 누락 토큰 후보: 0건. (만약 engineer 가 작업 중 매핑 불가 hex 발견 시 → SPEC_GAP 으로 architect 회수 + Story 5 task 08 누락 토큰 표 등재)

## 7. 다른 모듈과의 경계

- **상위 의존**: `@hooks/useTheme`, `@store/theme-store`(간접), `theme/tokens`. 모두 기존 인프라, 변경 X.
- **하위 의존**: 없음 (본 task 가 하위 인프라 변화 유발 X).
- **graceful 동작**: `useTheme()` 은 항상 valid `ColorTokens` 반환 (다크 fallback 보장 — `useTheme.ts` line 13~16). null guard 불필요.
- **Breaking Change**: 없음 — `Colors` 별칭은 tokens.ts 에서 유지, AuthStackParamList 변경 X, props 시그니처 변경 X.

## 8. 주의사항

### 8.1 다크 회귀 0 — 시각 검증 절차 (PR 후 1인 개발자 수동)

| 화면 | 다크 모드 검증 | 라이트 모드 검증 |
|---|---|---|
| S01 Splash | logo 가운데 + 배경 `#0D0F1A` 동일 | 배경 `#FBF7F0` + logo 가시성 (logo PNG 가 라이트 배경에서도 가독되는지) |
| S02 Privacy | 카드 진한 남색 + 텍스트 흰색 동일 | 카드 베이지 + 텍스트 짙은 갈색 |
| S03 Onboarding | 슬라이드 emoji + 텍스트 동일 | 라이트 배경 + dot 색상 가시성 |
| S04 Signup | input 진한 남색 + 에러 빨강 동일 | input 베이지 + placeholder 가독성 |
| S05 Login | 동일 | 동일 |
| LegalScreen | row 구분선 + 화살표 동일 | row 베이지 배경 + 짙은 텍스트 |
| SocialAuthButtons | Apple 흰 / Google 진한 남색 | Apple 검정 / Google 베이지 (§3.4 주의 항목 참조) |
| AuthNavigator | screen 전환 배경 무시 가능 | screen 전환 동안 라이트 배경 노출 |

> S01 logo PNG 가 라이트 배경에서 가독성 떨어지면 → 본 task 범위 밖(에셋 변경). 우선 시각 회귀로 기록만.

### 8.2 DB 영향도

**없음** — 코드 색상 상수만 변경. DDL/마이그레이션 0.

### 8.3 외부 SDK 영향도

- `expo-web-browser`(LegalScreen): `BROWSER_OPTIONS` 객체 생성 위치 변경. SDK 동작 변화 0.
- `@invertase/react-native-apple-authentication`, `@react-native-google-signin/google-signin`: 변경 0.
- `@react-navigation/native-stack`: `screenOptions.contentStyle.backgroundColor` 동적 — Navigator 가 useTheme 변경 시 리렌더하므로 정상 반응.

### 8.4 회귀 위험 + 완화

- **위험 1**: S04/S05 의 `#E05F5F` → `destructive(#E85A5A)` 흡수 — 다크 모드 색상이 미세하게(R+8) 진해짐. 4dp 이내라 육안 식별 어려움이나 "엄격 다크 회귀 0" 정의 위배 우려.
  - **완화**: PRD §3.2 가 4dp 이내 흡수를 명시 허용. 시각 회귀 발견 시 `errorAccent` 누락 토큰 후보로 Story 5 task 08 등재.
- **위험 2**: `useMemo` 누락 → 매 렌더 새 StyleSheet → 메모리 / 성능 미세 저하.
  - **완화**: 본 plan §5 에서 `useMemo` 강제 권장. engineer 가 빠뜨리지 않도록 인터페이스 코드 스니펫에 직접 명시.
- **위험 3**: 기존 테스트 (S01/S04/S05/LegalScreen) 의 useTheme 미mock → `useColorScheme` undefined → 다크 fallback 으로 통과 가능하나 themeStore 의 AsyncStorage persist 에러 발생 가능.
  - **완화**: 기존 테스트가 통과하지 못하면 `useTheme` mock 추가 (jest.mock pattern, useTheme.test.ts §line 14~22 차용).
- **위험 4**: PR 단위 — 8 파일 73 hex 한 PR 인지 분할인지.
  - **권장**: 1 PR. file-by-file 커밋 8개 (chunked review). 큰 차이 없으면 합쳐서.

### 8.5 PR 후 시각 회귀 발견 시 rollback 절차

- `git revert <머지 커밋>` 단일 커밋. 8 파일 통째 원복. 영향 범위 = 인증 플로우 화면만.
- 공유 인프라(useTheme/tokens.ts) 변경 X 라 다른 epic 영향 0.

## 9. 수용 기준

| ID | 내용 | 검증 방법 | 통과 조건 |
|---|---|---|---|
| REQ-001 | S01·S02·S03·S04·S05·LegalScreen·SocialAuthButtons·AuthNavigator 8 파일 모두 `useTheme()` 호출 | (TEST) AST grep — 각 파일에서 `useTheme(` 호출 1회 이상 | 8/8 PASS |
| REQ-002 | 본 task 대상 8 파일 내 6자리 hex 리터럴 0건 | (TEST) `apps/mobile/src/__tests__/theme/auth-onboarding-no-raw-hex.test.ts` 가 `fs.readFileSync` + regex `#[0-9A-Fa-f]{6}` 으로 8 파일 검사 | 0건 PASS |
| REQ-003 | 다크 모드 (useThemeStore pref='dark') 에서 S02PrivacyScreen 컨테이너 배경이 `darkColors.bgPrimary` (`#0D0F1A`) | (TEST) `S02PrivacyScreen.theme.test.tsx` — useTheme/themeStore mock 으로 dark 강제, render 후 `getByTestId('s02-container').props.style` flatten 후 `backgroundColor === '#0D0F1A'` assertion. testID 추가 필요 |
| REQ-004 | 라이트 모드 (pref='light') 에서 S02PrivacyScreen 컨테이너 배경이 `lightColors.bgPrimary` (`#FBF7F0`) | (TEST) 동일 테스트 파일, light 분기 | `backgroundColor === '#FBF7F0'` PASS |
| REQ-005 | 다크 모드에서 SocialAuthButtons 의 googleBtn 배경이 `darkColors.surface` (`#1A1D30`) | (TEST) `SocialAuthButtons.theme.test.tsx` — dark mock + render + style flatten | PASS |
| REQ-006 | 라이트 모드에서 SocialAuthButtons 의 googleBtn 배경이 `lightColors.surface` (`#E8E0D4`) | (TEST) 동일 | PASS |
| REQ-007 | 기존 4 테스트 (`S01SplashScreen.test.tsx`, `S04SignupScreen.test.tsx`, `S05LoginScreen.test.tsx`, `LegalScreen.test.tsx`) 가 useTheme 추가 후에도 통과 | (TEST) `npm test -- S01SplashScreen S04SignupScreen S05LoginScreen LegalScreen` | 4/4 GREEN. 실패 시 useTheme/themeStore mock 추가 후 재통과 |
| REQ-008 | LegalScreen 의 `expo-web-browser.openBrowserAsync` 두 번째 인자가 `toolbarColor: colors.bgPrimary`, `controlsColor: colors.accentPrimary` 로 동적 생성됨 (다크 시 `#0D0F1A`/`#5A7AA8`, 라이트 시 `#FBF7F0`/`#3A5A88`) | (TEST) `LegalScreen.test.tsx` 의 `openBrowserAsync` mock assertion 을 dark/light 양쪽으로 분리 + `expect.objectContaining({ toolbarColor: <expected hex> })` | 양쪽 PASS |
| REQ-009 | `colors.destructive` 흡수가 다크 시각 회귀 4dp 이내 (`#E05F5F` → `#E85A5A`) | (MANUAL) 시뮬레이터 다크 모드에서 S04 가입 시도 후 잘못된 비밀번호로 에러 노출, Epic 12 이전 스크린샷과 픽셀 비교 (육안). 4dp 초과 차이면 `errorAccent` 누락 토큰 후보 등재 후 Story 5 처리 | 육안 동일 PASS |
| REQ-010 | AuthNavigator 의 `screenOptions.contentStyle.backgroundColor` 가 `useTheme().colors.bgPrimary` 와 일치 | (TEST) AuthNavigator render → screen prop 추출은 react-navigation 내부라 어려움 → 대안: navigation 모듈 상단에 `useTheme()` 호출 1회 + `colors.bgPrimary` 직접 변수 export 후 unit assertion | PASS (테스트 어렵다고 판단되면 (MANUAL) 로 변경, 시뮬레이터 라이트 모드에서 화면 전환 시 배경 베이지 확인) |
| REQ-011 | 1인 개발자 수동 시각 검증 — §8.1 표 7 행 PASS | (MANUAL) 시뮬레이터 다크/라이트 각 진입 + 캡처 비교. Apple 버튼 §3.4 주의 사항 별도 시각 확인 | 7/7 OK PASS (S01 logo 라이트 가독성 별도 기록) |

## 10. 테스트 영향 (수정 가능성)

### 10.1 수정 안 해도 통과할 가능성 높은 테스트

- `useTheme.test.ts` — 변경 없음.
- `S04SignupScreen.test.tsx`, `S05LoginScreen.test.tsx`, `LegalScreen.test.tsx`, `S01SplashScreen.test.tsx` — useTheme/themeStore mock 의 store fallback (Zustand persist) 이 jest 환경에서 어떻게 동작하는지에 따라 통과/실패. 실패 시 위 useTheme.test.ts 패턴 차용.

### 10.2 신규 테스트 (위 §4 표)

- `S02PrivacyScreen.theme.test.tsx` — REQ-003/004
- `SocialAuthButtons.theme.test.tsx` — REQ-005/006
- `theme/auth-onboarding-no-raw-hex.test.ts` — REQ-002 (REQ-001 도 같이 검증 가능)

> S03/Legal/AuthNav 의 light/dark 배경 assertion 도 추가하면 더 단단하지만 본 task 는 **대표 1 화면(S02) + 1 컴포넌트(SocialAuth) 만 light/dark assertion**, 나머지는 hex 0건 grep + 기존 통과 테스트로 회귀 방어. 1인 개발 + Story 1 의 PR 분량 고려.

## 11. 의존성

- 선행 task: 없음 (Epic 12 첫 task).
- 후행 task: task 02 (M0-B 결제·구독). 본 task 가 useTheme 패턴 정착 → 이후 task 들이 동일 패턴 반복.
- 외부: 없음.

## 12. 게이트 self-check (architect/module-plan SOP 12 항목)

| # | 항목 | 충족 여부 | 비고 |
|---|---|---|---|
| 1 | 생성/수정 파일 목록 확정 | ✓ | §4 |
| 2 | 인터페이스 TypeScript 타입 명시 | ✓ | §5, factory `(colors: ColorTokens) => StyleSheet` |
| 3 | 의존 모듈 실제 인터페이스 직접 확인 | ✓ | tokens.ts / useTheme.ts / 8 영향 파일 모두 read 완료 |
| 4 | 에러 처리 명시 | ✓ | useTheme 항상 valid ColorTokens 반환 — null guard 불필요 |
| 5 | 페이지 전환·상태 초기화 순서 | N/A | 본 task 는 화면 진입 동작 변경 X |
| 6 | DB 영향도 분석 | ✓ | 없음 (§8.2) |
| 7 | Breaking Change 검토 | ✓ | 없음 (§7) |
| 8 | 핵심 로직 의사코드 | ✓ | §6 |
| 9 | TypeScript 타입 정합 | ✓ | makeStyles 시그니처, useMemo deps |
| 10 | import 완전성 | ✓ | useTheme, useMemo, ColorTokens 모두 명시 |
| 11 | 수용 기준 + 메타데이터 | ✓ | §9 표 + frontmatter |
| 12 | 모듈 = 테스트 단위 정합 | ✓ | factory 단독 단위 테스트 가능, useTheme mock 으로 의존 분리, 각 화면 PASS/FAIL 명확 |

---

## 결론 + 권장 다음 단계

본 module-plan 은 8 파일 73 hex 의 ColorTokens 매핑을 100% 1:1 또는 4dp 이내 흡수로 확정했고, 누락 토큰 후보 0 건 — 즉 본 task 안에서 tokens.ts 수정 0. createStyles factory + useMemo 패턴, 8 파일 동일 흐름, 시각 검증 절차, 신규 3 테스트 + 기존 4 테스트 호환성, DB 영향 0, Breaking Change 0 모두 명시. 12 게이트 self-check 통과.

상태 = `READY_FOR_IMPL`. 다음 단계로 dcness `/impl` 또는 `/impl-loop` 의 정식 루프 (test-engineer → engineer → validator CODE_VALIDATION → pr-reviewer) 진입을 권장한다. test-engineer 가 §9 수용 기준 표의 REQ-001~011 을 첫 입력으로 받아 신규 3 테스트 파일과 기존 테스트 호환성 보강을 진행하면 된다.
