---
depth: std
design: required
---
# impl-04 — useTheme user override + S16 테마 토글 (Issue #113)

**이슈**: #113  
**에픽**: epic-07-design-system  
**선행 impl**: 03-app-usetheme-migration.md (Pattern A/B/C 버그 수정 완료 전제)

---

## 결정 근거

### 1. persist 미들웨어 패턴 통일

`auth-store` / `subscriptionSlice` / `generationSlice` 모두 `zustand/middleware` `persist` + `createJSONStorage(() => AsyncStorage)` 패턴을 사용한다.  
`theme-store.ts`도 동일 패턴으로 신설 — 신규 의존성 없음 (`@react-native-async-storage/async-storage` 이미 `package.json` `^2.0.0`).

**대안 검토**: `AsyncStorage.getItem/setItem` 직접 호출 + `useEffect` 동기화 → 비동기 초기화 시 flickering(시스템 모드 → pref 모드 전환 시 1프레임 깜빡임) 발생 가능. persist 미들웨어는 hydration을 단일 경로로 처리해 flickering 없음.

### 2. `useTheme` 반환 인터페이스 불변

현재 `{ colors: ColorTokens; isDark: boolean }` — 32개 화면/컴포넌트에서 사용 중.  
이번 impl에서 인터페이스 변경 없음. `useThemeStore`는 훅 내부에서만 소비.  
**결과**: 모든 기존 호출처가 수정 없이 user pref 반영 혜택을 즉시 받음.

### 3. NavigationContainer `theme` prop 동적화

`App.tsx`에 현재 컴포넌트 외부에 정적 `AppTheme` 상수가 정의되어 있다. user pref 변경 시 NavContainer background/card 색이 바뀌지 않는 문제가 생김.  
**수정**: `App()` 함수 내에서 `useTheme()`로 `isDark`를 읽어 `navTheme`를 동적 계산. `APP_DARK_NAV_THEME` / `APP_LIGHT_NAV_THEME` 두 상수 객체를 모듈 수준에서 정의하고 `isDark`로 선택 — 리렌더마다 새 객체 생성 방지.

### 4. S16 ThemeSection 위치 결정

UX Flow S16 와이어프레임 기준 — "알림 설정" 행 다음, "데이터 관리" 섹션 전에 삽입.  
이슈 #113 본문: "기존 다른 설정 항목들 사이 적절한 위치에 배치 (디자이너 결정 따름 — 캔버스 S16 노드 dtn23 참조)".  
현재 design-handoff.md 미제공 → UX Flow 위계 기준으로 배치. Pencil 캔버스 dtn23은 design 루프에서 확인 필요.

---

## ⚠️ SPEC_GAP_RESOLVED — PLAN_VALIDATION_FAIL 보강 (2026-04-27)

이전 impl 실행 시 아래 5개 항목이 누락/미완료 처리되었다. 강화된 지시 사항을 확인하고 구현한다.

| fail_id | 파일 | 실패 원인 | 보강 위치 |
|---|---|---|---|
| 1 | `store/theme-store.ts` | 파일 미생성 | §인터페이스 정의 > theme-store.ts |
| 2 | `hooks/useTheme.ts` | L1-7 import·분기 미적용 | §인터페이스 정의 > useTheme.ts |
| 3 | `S16SettingsScreen.tsx` | ThemeSection/ThemeRadioRow 미삽입 | §S16 ThemeSection 의사코드 |
| 4 | `App.tsx` | 정적 AppTheme 유지, useTheme() 미호출 | §App.tsx 변경 |
| 5 | `store/index.ts` | **파일 목록 누락** → re-export 미추가 | §store/index.ts 배럴 export |

---

## 생성/수정 파일 목록

| 파일 | 유형 | 비고 |
|---|---|---|
| `apps/mobile/src/store/theme-store.ts` | **신규 생성** | ThemePref persist store — 파일 없음, 전체 내용 작성 |
| `apps/mobile/src/hooks/useTheme.ts` | **수정** | L1-7 import 추가 + pref 3-way 분기 교체 |
| `apps/mobile/src/screens/S16SettingsScreen.tsx` | **수정** | ThemeSection/ThemeRadioRow 컴포넌트 + 삽입 위치 Divider |
| `apps/mobile/App.tsx` | **수정** | 정적 AppTheme 상수 삭제 + navTheme 동적화 |
| `apps/mobile/src/store/index.ts` | **수정** | useThemeStore · ThemePref re-export 추가 |

---

## 인터페이스 정의

### `theme-store.ts` ← **[fail_id 1] 신규 생성 필수**

> **engineer 지시**: `apps/mobile/src/store/theme-store.ts` 파일이 존재하지 않는다.  
> 아래 전체 내용을 그대로 신규 파일로 생성한다.

```typescript
// apps/mobile/src/store/theme-store.ts  ← 신규 파일 전체 내용

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemePref = 'system' | 'dark' | 'light';

interface ThemeState {
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      pref: 'system',
      setPref: (pref) => set({ pref }),
    }),
    {
      name: 'jajang.themePref',          // AsyncStorage key
      storage: createJSONStorage(() => AsyncStorage),
      // persist 이유: 앱 재시작 후에도 user pref 유지
    },
  ),
);
```

### `useTheme.ts` (수정 후) ← **[fail_id 2] L1-7 전체 교체 필수**

> **engineer 지시**: `apps/mobile/src/hooks/useTheme.ts` 파일을 열어 **파일 전체를 아래 내용으로 교체**한다.  
> 핵심 변경: L1-7 import 블록에 `useThemeStore` import 추가 + 함수 본문에 pref 3-way 분기 삽입.

```typescript
// apps/mobile/src/hooks/useTheme.ts  ← 파일 전체 교체

import { useColorScheme } from 'react-native';
import { useThemeStore } from '../store/theme-store';           // ← 신규 (L2)
import { darkColors, lightColors, ColorTokens } from '../theme/tokens';

export function useTheme(): { colors: ColorTokens; isDark: boolean } {
  const pref = useThemeStore((s) => s.pref);                   // ← 신규 (L6)
  const scheme = useColorScheme();

  const isDark =
    pref === 'dark'   ? true  :                                // ← 신규 3-way 분기
    pref === 'light'  ? false :
    scheme !== 'light';   // pref === 'system' → OS 추종, null/undefined → dark 취급 (앱 다크 퍼스트)

  return { colors: isDark ? darkColors : lightColors, isDark };
}
```

> **하위 호환 보증**: 반환 타입 `{ colors: ColorTokens; isDark: boolean }` 불변.  
> 기존 32개 호출처 수정 불필요.

### `App.tsx` 변경 (navTheme 동적화) ← **[fail_id 4] 정적 AppTheme 삭제 + 동적화 필수**

> **engineer 지시 (3단계)**:  
> 1. `App.tsx`에서 `const AppTheme = { ... }` 정적 상수 정의 줄을 **찾아 삭제**한다.  
> 2. 아래 두 상수(`APP_DARK_NAV_THEME`, `APP_LIGHT_NAV_THEME`)를 **모듈 수준(import 블록 아래)**에 추가한다.  
> 3. `export default function App()` 함수 내부 첫 줄에 `const { isDark } = useTheme()` 추가 후 `theme={AppTheme}` → `theme={navTheme}` 교체한다.

```typescript
// ── Step 1: 삭제 대상 ────────────────────────────────────────────────────────
// 기존 App.tsx 어딘가에 있는 정적 상수 (형태 다를 수 있음):
//   const AppTheme = { ... };          ← 이 줄 전체 삭제
// ────────────────────────────────────────────────────────────────────────────

// ── Step 2: import 블록에 추가 ────────────────────────────────────────────────
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
// (기존에 이미 있으면 DarkTheme, DefaultTheme 만 추가)
import { useTheme } from './src/hooks/useTheme';   // 또는 기존 @hooks alias 사용
import { darkColors, lightColors } from './src/theme/tokens';

// ── Step 3: 모듈 수준 상수 추가 (import 블록 직후, function App 위) ─────────
const APP_DARK_NAV_THEME = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: darkColors.bgPrimary,      // '#0D0F1A'
    card:       darkColors.surface,        // '#1A1D30'
    text:       darkColors.textPrimary,    // '#EEF0F8'
    border:     darkColors.border,         // '#2A2E48'
  },
};

const APP_LIGHT_NAV_THEME = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: lightColors.bgPrimary,     // '#FBF7F0'
    card:       lightColors.surface,       // '#E8E0D4'
    text:       lightColors.textPrimary,   // '#1C1A18'
    border:     lightColors.border,        // '#C8BEB0'
  },
};

// ── Step 4: App 컴포넌트 내부 (L53-64 범위) ──────────────────────────────────
export default function App() {
  const { isDark } = useTheme();          // ← 신규: 함수 첫 줄에 추가
  const navTheme = isDark ? APP_DARK_NAV_THEME : APP_LIGHT_NAV_THEME;

  // ... 기존 로직 유지 (hooks, state, effects 등) ...

  return (
    // ...
    <NavigationContainer ref={navigationRef} theme={navTheme}>
    {/* ↑ 기존 theme={AppTheme} 을 theme={navTheme} 으로 교체 */}
      {/* ... */}
    </NavigationContainer>
  );
}
```

---

## S16 ThemeSection 의사코드 ← **[fail_id 3] ThemeSection/ThemeRadioRow 삽입 필수**

> **engineer 지시 (3단계)**:  
> 1. `S16SettingsScreen.tsx` 파일 상단 import 블록에 `useThemeStore`, `ThemePref` import 추가.  
> 2. 파일 내 **`ThemeRadioRow`** + **`ThemeSection`** 함수 컴포넌트를 추가한다 (`S16SettingsScreen` 함수 선언 바로 위).  
> 3. `S16SettingsScreen` render 내부에서 "알림 설정" Divider 이후, "데이터 관리" 섹션 이전에 `<ThemeSection />` + `<Divider />` 삽입.

```tsx
// apps/mobile/src/screens/S16SettingsScreen.tsx
// ── Step 1: import 추가 (기존 import 블록 끝에 추가) ─────────────────────────
import { useThemeStore, ThemePref } from '@store/theme-store';
// (기존 @store alias 없으면: '../store/theme-store')

// ── Step 2: S16SettingsScreen 함수 선언 바로 위에 두 컴포넌트 추가 ───────────

// ─── ThemeRadioRow 서브컴포넌트 ──────────────────────────────────────────────

interface ThemeRadioRowProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

function ThemeRadioRow({ label, selected, onPress }: ThemeRadioRowProps) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]}>
        {label}
      </Text>
      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected && <View style={styles.radioInner} />}
      </View>
    </TouchableOpacity>
  );
}

// ─── ThemeSection ─────────────────────────────────────────────────────────────

function ThemeSection() {
  const { pref, setPref } = useThemeStore();

  const OPTIONS: { value: ThemePref; label: string }[] = [
    { value: 'system', label: '시스템 설정 따라가기' },
    { value: 'dark',   label: '다크 모드' },
    { value: 'light',  label: '라이트 모드' },
  ];

  return (
    <View>
      <Text style={styles.sectionHeader}>테마</Text>
      {OPTIONS.map(({ value, label }) => (
        <ThemeRadioRow
          key={value}
          label={label}
          selected={pref === value}
          onPress={() => setPref(value)}
        />
      ))}
    </View>
  );
}

// ── Step 3: S16SettingsScreen render 내 삽입 위치 ────────────────────────────
//
// 현재 렌더 순서:
//   SubscriptionSection → Divider → 알림 설정 → Divider → 데이터 관리 → ...
//
// 수정 후 렌더 순서:
//   SubscriptionSection → Divider → 알림 설정 → Divider → ThemeSection → Divider → 데이터 관리 → ...
//
// 즉: 기존 "알림 설정" 뒤 <Divider /> 다음 줄에 아래 두 줄 삽입:
//   <ThemeSection />
//   <Divider />
```

### 스타일 추가 (StyleSheet)

```typescript
// styles 추가 항목
sectionHeader: {
  color: '#7B80A0',    // textSecondary — 섹션 레이블 (colors 토큰 아직 미적용 — 이 화면은 이번 PR에서 StyleSheet.create 기반 유지)
  fontSize: 12,
  fontWeight: '600',
  letterSpacing: 0.8,
  paddingHorizontal: 20,
  paddingTop: 16,
  paddingBottom: 4,
  textTransform: 'uppercase',
},
rowLabelSelected: {
  color: '#5A7AA8',    // accentPrimary
  fontWeight: '600',
},
radioOuter: {
  width: 20,
  height: 20,
  borderRadius: 10,
  borderWidth: 2,
  borderColor: '#2A2E48',    // border
  justifyContent: 'center',
  alignItems: 'center',
},
radioOuterSelected: {
  borderColor: '#5A7AA8',    // accentPrimary
},
radioInner: {
  width: 10,
  height: 10,
  borderRadius: 5,
  backgroundColor: '#5A7AA8',
},
```

> **hex literal 주의**: S16SettingsScreen.tsx는 이미 hex literal로 작성된 StyleSheet 패턴.  
> 이번 impl에서도 동일 패턴 유지. useTheme 기반 동적 스타일 전환은 후속 마이그레이션 이슈 범위.

---

## store/index.ts 배럴 export 추가 ← **[fail_id 5] 파일 목록 누락 항목 — 반드시 처리**

> **engineer 지시**: `apps/mobile/src/store/index.ts` 파일 끝에 아래 두 줄을 추가한다.  
> (기존 export 줄은 건드리지 않는다.)

```typescript
// apps/mobile/src/store/index.ts — 기존 내용 유지, 아래 두 줄 추가

// ... (기존 export 줄들 유지) ...
export { useAuthStore } from './auth-store';
export { usePlayerStore } from './player-store';
export { useSubscriptionStore, getCurrentMonthKey } from './subscriptionSlice';
// ↓ 신규 추가 두 줄
export { useThemeStore } from './theme-store';
export type { ThemePref } from './theme-store';
```

> **확인**: 위 두 줄 추가 후 `S16SettingsScreen.tsx`에서 `@store/theme-store` 대신  
> `@store` (index.ts 배럴)로 import 가능 → `import { useThemeStore, ThemePref } from '@store'`

---

## 구현 순서 (engineer 권고) — SPEC_GAP 보강 후 순서

1. **[fail_id 1]** `store/theme-store.ts` 신규 생성 (§인터페이스 정의 > theme-store.ts 전체 내용)
2. **[fail_id 5]** `store/index.ts` 배럴 export 두 줄 추가 (§store/index.ts 배럴 export)
3. `npx tsc --noEmit` → 오류 0개 확인
4. **[fail_id 2]** `hooks/useTheme.ts` 파일 전체 교체 (§인터페이스 정의 > useTheme.ts)
5. `npx vitest run` → 기존 테스트 회귀 없음 확인
6. **[fail_id 3]** `S16SettingsScreen.tsx` import + 컴포넌트 추가 + 삽입 위치 적용 (§S16 ThemeSection)
7. **[fail_id 4]** `App.tsx` 정적 AppTheme 삭제 → 모듈 상수 추가 → 함수 내 useTheme + navTheme 적용
8. 검증 시나리오 수동 확인 (§검증 기준 테이블)

---

## 검증 기준

| 시나리오 | 기대 결과 |
|---|---|
| "시스템 설정 따라가기" 선택 → OS 다크 모드 전환 | 앱 색상 즉시 다크 전환 |
| "시스템 설정 따라가기" 선택 → OS 라이트 모드 전환 | 앱 색상 즉시 라이트 전환 |
| "다크 모드" 선택 → OS 라이트 모드 전환 | 앱 색상 다크 유지 |
| "라이트 모드" 선택 → OS 다크 모드 전환 | 앱 색상 라이트 유지 |
| 설정 선택 후 앱 강제 종료 + 재시작 | 마지막 설정 유지 (AsyncStorage persist) |
| NavigationContainer header/tab bar 배경 | isDark 따라 `#0D0F1A` / `#FBF7F0` 적용 |
| 라디오 선택 시 접근성 | `accessibilityRole="radio"` + `accessibilityState.selected` 정상 |
| `npx tsc --noEmit` | 오류 0개 |
| `npx vitest run` | 기존 테스트 회귀 없음 |

---

## 주의사항

### 모듈 경계

- `theme-store.ts`는 `@store` 배럴(index.ts) 통해 export. S16, App 모두 이 경로 사용.
- `hooks/useTheme.ts` 는 `agent-boundary` 훅이 `hooks/` 경로 `Read`를 차단할 수 있음.  
  engineer는 `Grep` 도구로 파일 내용 확인 후 수정.
- `App.tsx`에서 `useTheme()`를 호출할 때, `App` 컴포넌트는 최상위이므로 Provider 없이 zustand store에 직접 접근 가능 — 정상 동작.

### persist hydration 타이밍

zustand persist는 AsyncStorage에서 hydrate되기 전 짧은 시간 동안 초기값(`pref: 'system'`)을 반환한다.  
이 경우 `useColorScheme()`이 fallback으로 동작 — 시각적 깜빡임 없이 자연스러운 전환.  
별도 hydration loading state 처리는 이번 impl 범위 밖 (tradeoff 수용).

### S16 hex literal 패턴

S16SettingsScreen.tsx는 현재 hex literal 직접 사용 패턴(useTheme 미마이그레이션 상태, impl-03 이후 별도 이슈).  
이번 impl의 ThemeSection 스타일도 동일 hex literal 패턴 유지.  
라이트 모드 전환 시 S16 배경/텍스트 색은 이 이슈 범위 밖 — 후속 hex literal 마이그레이션(Batch 2~5) 에서 처리.

### 화면 마이그레이션 범위 외

이슈 #113 제약: "화면 hex 마이그레이션은 본 이슈 범위 외 (별도 batch로 분할 진행)".  
이번 impl은 **인프라(store + 훅) + S16 토글 UI** 만 다룬다. 32개 화면 마이그레이션 착수 금지.

### App.tsx import 경로

`useTheme` import 경로는 `App.tsx` 위치(`apps/mobile/App.tsx`)에서 상대 경로 `'./src/hooks/useTheme'` 또는 tsconfig alias가 있다면 `@hooks/useTheme`. 기존 App.tsx의 다른 src import 패턴 확인 후 통일.

---

## Design Ref

design-handoff.md 미제공.  
- **참조 노드**: Pencil 캔버스 S16 frame `dtn23` — 테마 섹션 레이아웃 확인 필요 (design 루프에서 검증).  
- **UX Flow 참조**: `docs/ux-flow.md` S16 설정 화면 와이어프레임 + §0 디자인 가이드.  
- **디자인 토큰**: `darkColors.accentPrimary = '#5A7AA8'`, `lightColors.accentPrimary = '#3A5A88'`.  
- **UI 패턴**: 라디오 버튼 — 우측 원형 인디케이터, 선택 시 accentPrimary border + 내부 filled dot.
