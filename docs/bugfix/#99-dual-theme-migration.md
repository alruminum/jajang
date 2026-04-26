---
depth: std
design: required
---
# impl — #99 다크/라이트 듀얼 테마 + Midnight Indigo accent 코드 마이그레이션

**이슈**: #99  
**레이블**: v01, feat  
**선행 impl**: `docs/milestones/v1/epics/epic-07-design-system/impl/02-design-token-module.md` (tokens.ts 구조 확립)

---

## depth 판정 근거

| 기준 | 판정 |
|---|---|
| 새 로직 구조 신설 (ThemeContext, useTheme hook) | → std |
| `S08RecordModeScreen.test.tsx` L244, L258 — `borderColor === '#82B090'` assertion 변경 | → std (simple 금지) |
| 보안·결제·인증 | 해당 없음 |

---

## 결정 근거

### 왜 ThemeContext 패턴인가

React Native에는 CSS custom properties가 없다. 대응 패턴은 3가지:

| 옵션 | 장점 | 단점 | 결정 |
|---|---|---|---|
| A. `ThemeContext` + `useColorScheme()` | 표준 RN 패턴, 컴포넌트 격리, 테스트 mock 용이 | 모든 스타일을 dynamic으로 변환해야 함 | **✅ 채택** |
| B. `Appearance.addChangeListener` 전역 | 단순 | Context 없이 전역 상태 → 테스트 불가 | ❌ |
| C. 조건부 ternary inline | 빠름 | 가독성 최악, 관리 불가 | ❌ |

### 스타일 마이그레이션 패턴 — createStyles factory

`StyleSheet.create`는 hook 내부 직접 호출 불가 → `useMemo`로 래핑:

```typescript
// ❌ Before (정적 하드코딩)
const styles = StyleSheet.create({
  btn: { backgroundColor: '#82B090' },
});

// ✅ After (테마 동적)
function createStyles(c: JajangTheme['colors']) {
  return StyleSheet.create({
    btn: { backgroundColor: c.accentPrimary },
  });
}

// 컴포넌트 내부
const { colors } = useTheme();
const styles = useMemo(() => createStyles(colors), [colors]);
```

### 테스트 환경 기본 테마

`useColorScheme()`은 Jest 환경에서 `null`을 반환 → `ThemeProvider` 내부에서 `null` → `dark`로 처리.  
따라서 테스트에서 `theme.colors.accentPrimary === '#5A7AA8'` (다크 기본값).

### App.tsx 네이밍 충돌

`App.tsx`의 `const AppTheme = { ...DarkTheme }` 이 `@react-navigation/native`의 `DarkTheme`을 re-spread하고 있음.  
`themes.ts`에서 `JajangTheme`을 타입명으로, `DarkJajangTheme`/`LightJajangTheme`을 const명으로 사용해 충돌 방지.

---

## 신설 파일

### 1. `apps/mobile/src/theme/themes.ts` (NEW)

```typescript
// ─── Dual-mode theme tokens ───────────────────────────────────────────────────
// 출처: Issue #99 Pencil design sync (Midnight Indigo accent)
// Dark mode default; Light mode 추후 시스템 테마에 따라 자동 전환

export const DarkJajangTheme = {
  colors: {
    // ── 배경 ──
    bgPrimary:   '#0D0F1A',   // color-bg-primary
    bgSecondary: '#12152B',   // color-bg-secondary (구 bgDeep)
    // ── 서피스 ──
    surface1:    '#1A1D30',   // color-surface-1 (구 surface)
    surface2:    '#21253E',   // color-surface-2 (구 surfaceHigh)
    // ── 액센트 — Midnight Indigo (구 Sage Mist #82B090 폐기) ──
    accentPrimary:   '#5A7AA8',   // color-accent-primary dark
    accentSecondary: '#C49A8A',   // color-accent-secondary dark (구 달빛 블루 #8BAED4 폐기)
    // ── 텍스트 ──
    textPrimary:   '#EEF0F8',   // color-text-primary
    textSecondary: '#7B80A0',   // color-text-secondary
    // ── 경계 ──
    border: '#2A2E48',   // color-border
    // ── 시멘틱 ──
    error:   '#E85A5A',   // color-error (구 destructive #E05252)
    success: '#6BCB77',   // color-success (신규)
    overlay: '#000000AA', // color-overlay (신규)
    // ── 파생 (alpha variants) ──
    accentPrimary14: '#5A7AA824',
    accentPrimary20: '#5A7AA833',
    accentPrimary33: '#5A7AA855',
  },
} as const;

export const LightJajangTheme = {
  colors: {
    bgPrimary:   '#FBF7F0',
    bgSecondary: '#F0EAE0',
    surface1:    '#E8E0D4',
    surface2:    '#DDD4C6',
    accentPrimary:   '#3A5A88',
    accentSecondary: '#9A6858',
    textPrimary:   '#1C1A18',
    textSecondary: '#6B6055',
    border: '#C8BEB0',
    error:   '#C0392B',
    success: '#2E8B44',
    overlay: '#00000066',
    accentPrimary14: '#3A5A8824',
    accentPrimary20: '#3A5A8833',
    accentPrimary33: '#3A5A8855',
  },
} as const;

/** 컴포넌트 useTheme()가 반환하는 타입 */
export type JajangTheme = typeof DarkJajangTheme;
```

---

### 2. `apps/mobile/src/theme/ThemeContext.tsx` (NEW)

```typescript
import React, { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';
import { DarkJajangTheme, LightJajangTheme, JajangTheme } from './themes';

const ThemeContext = createContext<JajangTheme>(DarkJajangTheme);

/**
 * ThemeProvider — App.tsx SafeAreaProvider 바로 안쪽에 마운트.
 * useColorScheme()이 null(Jest/미감지)이면 dark를 기본으로 사용.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const theme = scheme === 'light' ? LightJajangTheme : DarkJajangTheme;
  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
}

/** 컴포넌트에서 `const { colors } = useTheme();` 패턴으로 사용 */
export function useTheme(): JajangTheme {
  return useContext(ThemeContext);
}
```

---

## 수정 파일 목록

### 3. `apps/mobile/src/theme/tokens.ts` (MODIFY)

기존 `Colors` 객체를 **다크 기본값으로 업데이트** (하위 코드 호환). 키 이름 변경:

| 구 키 | 신 키 | 신 값(dark) |
|---|---|---|
| `bgPrimary` | `bgPrimary` | `#0D0F1A` (유지) |
| `bgDeep` | `bgSecondary` | `#12152B` |
| `surface` | `surface1` | `#1A1D30` |
| `surfaceHigh` | `surface2` | `#21253E` |
| `accentPrimary` | `accentPrimary` | `#5A7AA8` ← 변경 |
| `accentSecondary` | `accentSecondary` | `#C49A8A` ← 변경 |
| `border` | `border` | `#2A2E48` (유지) |
| `textPrimary` | `textPrimary` | `#EEF0F8` (유지) |
| `textSecondary` | `textSecondary` | `#7B80A0` (유지) |
| `destructive` | `error` | `#E85A5A` ← 변경 |
| `accentPrimary14` | `accentPrimary14` | `#5A7AA824` ← 변경 |
| `accentPrimary20` | `accentPrimary20` | `#5A7AA833` ← 변경 |
| `accentPrimary33` | `accentPrimary33` | `#5A7AA855` ← 변경 |
| (신규) `success` | `success` | `#6BCB77` |
| (신규) `overlay` | `overlay` | `#000000AA` |

> **주의**: `typography.ts`가 `Colors.textPrimary`, `Colors.bgPrimary` 등을 import 중.  
> 키 rename 후 `typography.ts` import도 함께 수정 (`bgDeep` → `bgSecondary`, `surface` → `surface1`, `destructive` → `error`).  
> `typography.ts`에서 실제 사용하는 키: `textPrimary`, `textSecondary`, `bgPrimary` — 이 셋은 키 이름 유지이므로 `typography.ts` 수정 불필요.

---

### 4. `apps/mobile/src/theme/index.ts` (MODIFY)

```typescript
export * from './tokens';
export * from './typography';
export * from './spacing';
export * from './themes';       // ← 추가
export * from './ThemeContext'; // ← 추가
```

---

### 5. `apps/mobile/App.tsx` (MODIFY)

```typescript
// 변경 1: import 추가
import { ThemeProvider } from '@theme/ThemeContext';

// 변경 2: 기존 AppTheme const 이름 변경 (App.tsx 내부 변수이며 @react-nav DarkTheme과 충돌 방지)
// Before: const AppTheme = { ...DarkTheme, colors: { primary: '#F5C97A', ... } }
// After:
const NavTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary:      '#5A7AA8',   // 구 amber #F5C97A → Midnight Indigo
    background:   '#0D0F1A',
    card:         '#12152B',
    text:         '#EEF0F8',
    border:       '#2A2E48',
    notification: '#5A7AA8',   // 구 #F5C97A
  },
};

// 변경 3: JSX — ThemeProvider 마운트
// <SafeAreaProvider> 바로 안쪽, <NavigationContainer> 바깥쪽
return (
  <SafeAreaProvider>
    <ThemeProvider>                           {/* ← 추가 */}
      <StatusBar style="auto" backgroundColor="transparent" />  {/* style="auto"로 변경 */}
      <SessionExpiredListener />
      <NavigationContainer ref={navigationRef} theme={NavTheme}>
        <RootNavigator />
      </NavigationContainer>
    </ThemeProvider>                          {/* ← 추가 */}
  </SafeAreaProvider>
);
```

> `StatusBar style="light"` → `"auto"`: 라이트 모드에서 status bar 자동 반전.

---

### 6. 화면 + 컴포넌트 hex 마이그레이션 (일괄)

아래 **hex → 토큰 매핑표**를 기준으로 engineer가 각 파일에 적용한다.

#### 폐기 hex → 토큰 매핑표

| 하드코딩 hex | 대체 토큰 | 비고 |
|---|---|---|
| `#82B090` | `colors.accentPrimary` | Midnight Indigo dark `#5A7AA8` |
| `#82B09024` | `colors.accentPrimary14` | |
| `#82B09033` | `colors.accentPrimary20` | |
| `#82B09055` | `colors.accentPrimary33` | |
| `#8BAED4` | `colors.accentSecondary` | Dusty Terracotta dark `#C49A8A` |
| `#5A8A6A` | `colors.accentPrimary` | 구 Sage 파생 → Midnight Indigo로 통합 |
| `#0D0F1A` | `colors.bgPrimary` | 값 동일, 라이트 대응 위해 토큰화 |
| `#12152B` | `colors.bgSecondary` | |
| `#1A1D30` | `colors.surface1` | |
| `#21253E` | `colors.surface2` | |
| `#EEF0F8` | `colors.textPrimary` | |
| `#7B80A0` | `colors.textSecondary` | |
| `#2A2E48` | `colors.border` | |
| `#E05252` / `#E85A5A` | `colors.error` | 기존 `destructive` 키 대체 |
| `#FF4444` | `colors.error` | RecordScreen 정지 버튼 (빨간 계열) |

#### 마이그레이션 대상 파일 (grep 확인 완료)

**Screens:**

| 파일 | 교체 hex |
|---|---|
| `src/screens/S02PrivacyScreen.tsx` | `#82B090` × 5, `#8BAED4` × 1 |
| `src/screens/S03OnboardingScreen.tsx` | `#82B090` × 3 |
| `src/screens/S04SignupScreen.tsx` | `#82B090` × 2 |
| `src/screens/S05LoginScreen.tsx` | `#82B090` × 1 |
| `src/screens/S06HomeScreen.tsx` | `#82B090` × 3, `#8BAED4` × 1 |
| `src/screens/S07SongSelectScreen.tsx` | `#82B090` × 1 |
| `src/screens/S10RecordScreen.tsx` | `#82B090` × 1, `#5A8A6A` × 1 |
| `src/screens/S11PreviewScreen.tsx` | `#82B090` × 2, `#8BAED4` × 3, `#5A8A6A` × 1 |
| `src/screens/S12GeneratingScreen.tsx` | `#82B090` × 2, `#8BAED4` × 1 |
| `src/screens/S13PlayScreen.tsx` | `#82B090` × 2 |
| `src/screens/S14UpgradeSheet.tsx` | `#82B090` × 1 |
| `src/screens/S15SubscribeScreen.tsx` | `#82B090` × 3 |
| `src/screens/S16SettingsScreen.tsx` | `#82B090` × 2 |
| `src/screens/S17TrialExpiredScreen.tsx` | `#82B090` × 2 |
| `src/screens/AccountDeletionScreen.tsx` | `#82B090` × 5 |
| `src/screens/LegalScreen.tsx` | `#82B090` × 1 |
| `src/screens/RecordGuideScreen.tsx` | `#82B090` × 4 |
| `src/screens/RecordModeScreen.tsx` | `#82B090` × 2 |
| `src/screens/RecordScreen.tsx` | `#82B090` × 1, `#5A8A6A` × 1 |

**Components:**

| 파일 | 교체 hex |
|---|---|
| `src/components/CompletedTrackCard.tsx` | `#82B090` × 1, `#8BAED4` × 1 |
| `src/components/DeleteTracksSheet.tsx` | `#5A8A6A` × 1 |
| `src/components/EmptyTrackState.tsx` | `#82B090` × 1 |
| `src/components/MiniPlayer.tsx` | `#82B090` × 1 |
| `src/components/SongListItem.tsx` | `#82B090` × 2, `#8BAED4` × 1 |
| `src/components/TimerBottomSheet.tsx` | `#82B090` × 1 |
| `src/components/TrackCard.tsx` | `#82B090` × 1, `#8BAED4` × 1 |
| `src/components/TrialBadge.tsx` | `#82B090` × 1 |
| `src/components/TrialExpiryBanner.tsx` | `#82B090` × 1 |
| `src/components/VolumeSlider.tsx` | `#82B090` × 2 |
| `src/components/WaveformVisualizer.tsx` | `#82B090` × 2 (prop default 포함) |

**Navigation / Hooks:**

| 파일 | 교체 hex |
|---|---|
| `src/navigation/MainNavigator.tsx` | `#82B090` × 1 (tabBarActiveTintColor) |
| `src/hooks/useBackNavigation.tsx` | `#82B090` × 1 (backgroundColor) |

#### WaveformVisualizer 특이 케이스

처리 포인트 **2곳** — 둘 다 교체 필수:

**① prop default 하드코딩 (L1~상단 시그니처)**
```typescript
// Before — 기본 prop에 하드코딩
function WaveformVisualizer({ color = '#82B090', ... })

// After — 기본값 제거, 호출부에서 theme 주입
function WaveformVisualizer({ color, ... })
// 호출부 (S10RecordScreen 등):
//   const { colors } = useTheme();
//   <WaveformVisualizer color={colors.accentPrimary} ... />
```

**② 재생 완료 구간 내부 하드코딩 (L60 부근)**
```typescript
// Before — prop과 무관한 내부 하드코딩
const barColor = isPlayed ? '#82B090' : color;

// After — prop color로 통일 (재생 완료/미재생 모두 동일 accent 사용)
const barColor = color;
```

> **근거**: 재생 완료 구간을 별도 accent로 구분하는 디자인 의도가 PRD/ui-spec에 없음.  
> `color` prop이 이미 `colors.accentPrimary`를 받으므로 `isPlayed` 분기를 그대로 유지해야 하는 경우라면,  
> `isPlayed ? color : colors.textSecondary` 패턴으로 변경해 하드코딩을 완전히 제거.  
> 호출부 컨텍스트 확인 후 engineer가 최종 결정. 어느 방향이든 `'#82B090'` 리터럴 잔존 금지.

> **검증**: `grep -r "#82B090" apps/mobile/src` → 0건 기준. L60 패치 누락 시 기준 미충족.

#### MainNavigator 특이 케이스

`tabBarActiveTintColor`는 정적 옵션 객체에 있음. Hook 사용 불가 위치.  
해결: `screenOptions`를 함수형으로 변경:

```typescript
// Before
screenOptions: { tabBarActiveTintColor: '#82B090' }

// After — 정적 상수 직접 참조 (DarkJajangTheme import)
import { DarkJajangTheme } from '@theme/themes';
screenOptions: { tabBarActiveTintColor: DarkJajangTheme.colors.accentPrimary }
// ※ Tab bar는 현재 다크 전용. 라이트 대응 시 Tab.Navigator를 함수 컴포넌트로 래핑 필요.
```

---

### 7. `apps/mobile/src/__tests__/screens/S08RecordModeScreen.test.tsx` (MODIFY)

**기존 assertion (L244, L258):**
```typescript
(s: any) => s && typeof s === 'object' && s.borderColor === '#82B090'
```

**변경 후:**
```typescript
import { DarkJajangTheme } from '../../theme/themes';
// ...
(s: any) => s && typeof s === 'object' && s.borderColor === DarkJajangTheme.colors.accentPrimary
```

> **이유**: `useColorScheme()` → Jest 환경에서 `null` → ThemeProvider가 `DarkJajangTheme`을 기본 사용.  
> 리터럴 `'#5A7AA8'`보다 상수 참조가 향후 변경에 강건.

---

## 구현 순서 (engineer 권고)

```
0. babel.config.js + tsconfig.json — @theme 별칭 등록 (선행 필수)
1. src/theme/themes.ts        — 신설 (토큰 정의)
2. src/theme/ThemeContext.tsx  — 신설 (Provider + hook)
3. src/theme/tokens.ts         — 수정 (값/키 업데이트)
4. src/theme/index.ts          — 수정 (export 추가)
5. App.tsx                     — 수정 (ThemeProvider 마운트, NavTheme)
6. components/* (11개)         — 수정 (createStyles 패턴 적용)
7. screens/* (19개)            — 수정 (createStyles 패턴 적용)
8. navigation/*, hooks/*       — 수정
9. S08RecordModeScreen.test.tsx — 수정 (assertion 업데이트)
10. npx tsc --noEmit + npx vitest run 검증
```

### 0단계 — `@theme` 별칭 등록

`babel.config.js`:
```js
// module-resolver 플러그인에 alias 추가
alias: {
  '@theme': './src/theme',
  // ... 기존 alias 유지
}
```

`tsconfig.json` (또는 `tsconfig.paths.json`):
```json
"paths": {
  "@theme/*": ["src/theme/*"]
}
```

> 이 단계가 누락되면 `import { ThemeProvider } from '@theme/ThemeContext'` 가 전체 파일에서 resolve 실패 → TypeScript + Metro 빌드 모두 실패. 1단계 진입 전 반드시 선행.

---

## 검증 기준

| 검증 항목 | 기대 결과 |
|---|---|
| `grep -r "#82B090" apps/mobile/src` | 0건 |
| `grep -r "#8BAED4" apps/mobile/src` | 0건 |
| `grep -r "#5A8A6A" apps/mobile/src` | 0건 |
| `npx tsc --noEmit` | 오류 0개 |
| `npx vitest run` | 기존 + 수정된 S08RecordModeScreen 테스트 모두 PASS |
| `DarkJajangTheme.colors.accentPrimary` | `'#5A7AA8'` |
| `LightJajangTheme.colors.accentPrimary` | `'#3A5A88'` |
| `useColorScheme()=null` 시 적용 테마 | DarkJajangTheme (다크 기본) |

---

## 주의사항

- **`typography.ts` import 확인**: `Colors` 키 rename 중 `textPrimary`, `textSecondary`, `bgPrimary`는 이름 유지. `typography.ts` 수정 불필요. 그러나 `surface` → `surface1`, `bgDeep` → `bgSecondary`, `destructive` → `error` rename이 있으므로 **전체 파일 grep으로 구 키 사용 여부 재확인** 필수.
- **8자리 hex (alpha)**: `#5A7AA824` 등 Android에서 파싱 이슈 가능. 기존 주석(`#82B09024` Android 이슈)과 동일. 사용 시 `rgba()` 대체 검토 필요.
- **`RecordScreen.tsx` vs `S10RecordScreen.tsx`**: 두 파일 모두 존재하며 동일한 hex를 포함. 양쪽 모두 수정.
- **`colors.error` 충돌**: `@react-navigation`의 NavigationTheme에도 `colors` 키가 있음. `NavTheme`(NavigationContainer용)과 `JajangTheme`(useTheme용)은 **분리된 객체**이므로 충돌 없음.
- **`StatusBar style="auto"`**: 라이트 모드 전환 시 status bar 아이콘이 자동으로 반전되어야 하므로 `"light"` 고정에서 `"auto"`로 변경. 다크 고정이 필요한 특정 화면은 해당 Screen에서 `<StatusBar style="light" />` 개별 선언.
