---
depth: std
design: required
---

# impl #113 — useTheme 확장: user override + S16 설정 토글

**Issue**: [#113](https://github.com/alruminum/jajang/issues/113)  
**Scope**: `apps/mobile/src/`  
**작성일**: 2026-04-27

---

## 구현 파일 목록

| 순서 | 파일 | 조작 | 설명 |
|------|------|------|------|
| 1 | `src/store/theme-store.ts` | 신설 | ThemePref Zustand store + AsyncStorage persist |
| 2 | `src/store/index.ts` | 수정 | `useThemeStore` re-export 추가 |
| 3 | `src/hooks/useTheme.ts` | 수정 | ThemePref 3-way 분기 로직 추가 |
| 4 | `src/screens/S16SettingsScreen.tsx` | 수정 | ThemeSection 컴포넌트 삽입 |
| 5 | `App.tsx` | 수정 | NavigationContainer theme prop 동적 연결 |
| 6 | `src/__tests__/useTheme.test.ts` | 수정 | useThemeStore mock 추가 + pref 분기 케이스 추가 |

---

## 1. `src/store/theme-store.ts` (신설)

### 타입 정의

```typescript
export type ThemePref = 'system' | 'dark' | 'light';

interface ThemeState {
  pref: ThemePref;
}

interface ThemeActions {
  setPref: (p: ThemePref) => void;
}
```

### 구현 패턴

`auth-store.ts`와 동일한 `create<State & Actions>()(persist(...))` 패턴 준수.

```typescript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const useThemeStore = create<ThemeState & ThemeActions>()(
  persist(
    (set) => ({
      pref: 'system',          // 초기값: OS 추종
      setPref: (p) => set({ pref: p }),
    }),
    {
      name: 'jajang.themePref',                         // AsyncStorage key (이슈 스펙 정확히 따름)
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
```

**결정 근거**:
- persist key `'jajang.themePref'` — 이슈 스펙 명시값 사용
- `partialize` 불필요 — state 전체(pref 단일 필드)가 persist 대상
- 초기값 `'system'` — 앱 다크 퍼스트 정책 유지, 신규 설치 유저가 설정 전까지 OS 추종

---

## 2. `src/store/index.ts` (수정)

```typescript
// 추가할 한 줄
export { useThemeStore } from './theme-store';
export type { ThemePref } from './theme-store';
```

---

## 3. `src/hooks/useTheme.ts` (수정)

### 현재 구현

```typescript
import { useColorScheme } from 'react-native';
import { darkColors, lightColors, ColorTokens } from '../theme/tokens';

export function useTheme(): { colors: ColorTokens; isDark: boolean } {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';   // null/undefined → dark 취급
  return { colors: isDark ? darkColors : lightColors, isDark };
}
```

### 변경 후 구현

```typescript
import { useColorScheme } from 'react-native';
import { darkColors, lightColors, ColorTokens } from '../theme/tokens';
import { useThemeStore } from '../store/theme-store';

export function useTheme(): { colors: ColorTokens; isDark: boolean } {
  const pref = useThemeStore((s) => s.pref);
  const scheme = useColorScheme();

  let isDark: boolean;
  if (pref === 'dark') {
    isDark = true;
  } else if (pref === 'light') {
    isDark = false;
  } else {
    // pref === 'system' → OS 추종 (기존 로직 유지)
    isDark = scheme !== 'light';  // null/undefined → dark 취급 (다크 퍼스트 정책)
  }

  return { colors: isDark ? darkColors : lightColors, isDark };
}
```

**결정 근거**:
- 반환 시그니처 `{ colors, isDark }` 유지 — 기존 소비자 코드 무변경
- `pref='system'` 분기에서 기존 `scheme !== 'light'` 로직 그대로 보존 — 다크 퍼스트 폴백 정책 유지
- `useThemeStore`를 selector로 구독 — `pref` 변경 시 해당 컴포넌트만 리렌더

### 기존 테스트 영향

`src/__tests__/useTheme.test.ts`의 모든 기존 케이스는 `pref='system'`(기본값) 상태에서 `useColorScheme` mock으로 동작하는 시나리오. `useThemeStore`를 mock 추가하지 않으면 AsyncStorage 의존성으로 인해 테스트가 실패할 수 있음.

→ **테스트 수정 필수** (파일 6 참조)

---

## 4. `src/screens/S16SettingsScreen.tsx` (수정)

### 추가할 ThemeSection 컴포넌트

S16 와이어프레임의 "알림 설정" 행(s16notifRow) 아래, "데이터 관리" 섹션(s16div3) 위에 삽입.

```typescript
// ─── ThemeSection (S16 테마 토글) ───────────────────────────────────────────

import { useThemeStore } from '@store';
import type { ThemePref } from '@store';

const THEME_OPTIONS: { label: string; value: ThemePref }[] = [
  { label: '시스템 설정 따라가기', value: 'system' },
  { label: '다크 모드', value: 'dark' },
  { label: '라이트 모드', value: 'light' },
];

function ThemeSection() {
  const pref = useThemeStore((s) => s.pref);
  const setPref = useThemeStore((s) => s.setPref);

  return (
    <View>
      <View style={styles.themeSectionHeader}>
        <Text style={styles.themeSectionTitle}>테마</Text>
      </View>
      {THEME_OPTIONS.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          style={styles.themeRow}
          onPress={() => setPref(opt.value)}
          accessibilityLabel={opt.label}
          accessibilityRole="radio"
          accessibilityState={{ checked: pref === opt.value }}
        >
          {/* 라디오 인디케이터 */}
          <View
            style={[
              styles.radioOuter,
              pref === opt.value && styles.radioOuterSelected,
            ]}
          >
            {pref === opt.value && <View style={styles.radioInner} />}
          </View>
          <Text style={styles.themeRowLabel}>{opt.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
```

### 기존 렌더 트리 수정

```typescript
{/* 알림 */}
<SettingsRow
  label="알림 설정"
  onPress={() => Linking.openSettings()}
  accessibilityLabel="알림 설정"
/>

<Divider />   // ← 기존 s16div3 위치

{/* 🆕 테마 섹션 — 알림과 데이터 관리 사이 삽입 */}
<ThemeSection />

<Divider />

{/* 데이터 관리 */}
{hasSampleDeleted ? ( ... ) : ( ... )}
```

### 추가 스타일 (StyleSheet 추가)

```typescript
// 테마 섹션
themeSectionHeader: {
  paddingHorizontal: 20,
  paddingTop: 16,
  paddingBottom: 8,
},
themeSectionTitle: {
  color: '#7B80A0',   // textSecondary
  fontSize: 13,
  fontWeight: '600',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
},
themeRow: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: 20,
  paddingVertical: 14,
  gap: 12,
},
themeRowLabel: {
  color: '#E0E2F0',   // 기존 rowLabel 색과 동일
  fontSize: 15,
},
radioOuter: {
  width: 20,
  height: 20,
  borderRadius: 10,
  borderWidth: 2,
  borderColor: '#2A2E48',   // border 토큰
  alignItems: 'center',
  justifyContent: 'center',
},
radioOuterSelected: {
  borderColor: '#5A7AA8',   // accentPrimary
},
radioInner: {
  width: 10,
  height: 10,
  borderRadius: 5,
  backgroundColor: '#5A7AA8',   // accentPrimary
},
```

**주의**: S16SettingsScreen.tsx에 useThemeStore 의존성 추가됨. 기존 `@store` 배럴 import로 접근 가능 (store/index.ts 수정 후).

---

## 5. `App.tsx` (수정)

### 현재 상태

`AppTheme`이 정적 DarkTheme 확장으로 고정됨. 사용자가 'light'를 선택해도 NavigationContainer 테마는 변경되지 않아 헤더/탭바 등 내비게이션 크롬 색상이 불일치.

### 변경 계획

```typescript
import { NavigationContainer, DarkTheme, DefaultTheme, createNavigationContainerRef } from '@react-navigation/native';
import { useTheme } from '@hooks/useTheme';    // 경로 확인 필요

// App 컴포넌트 내부:
function AppContent() {
  const { isDark } = useTheme();

  const navTheme = isDark
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: '#0D0F1A' } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: '#FBF7F0' } };

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      {/* ... */}
    </NavigationContainer>
  );
}
```

**주의**: `useTheme()`은 hook이므로 `NavigationContainer` 바깥의 컴포넌트 내에서 호출해야 함. 현재 App.tsx 구조에서 `AppContent` 래퍼 함수 분리가 필요할 수 있음. 실제 App.tsx 구조 확인 후 최소 변경으로 적용.

**결정 근거**: 내비게이션 크롬(헤더 배경, 상태바 스타일)이 앱 색상과 일치해야 라이트 모드 사용자 경험이 일관됨. `NavigationContainer.theme` 연동은 이슈 범위 내('App.tsx 필요 시'로 명시).

---

## 6. `src/__tests__/useTheme.test.ts` (수정)

### 수정 내용

`useThemeStore` mock 추가 후 기존 테스트 케이스가 `pref='system'` 상태에서 동작하도록 보장.

```typescript
// 추가할 mock (vi.mock 블록)
vi.mock('../store/theme-store', () => ({
  useThemeStore: vi.fn((selector) =>
    selector({ pref: 'system', setPref: vi.fn() })
  ),
}));

// 또는 zustand/middleware mock 방식으로 전체 mock:
// vi.mock('zustand/middleware') + createStore mock
```

### 추가할 테스트 케이스

```
describe('useTheme — ThemePref override') {
  it("pref='dark' → isDark=true (OS scheme='light'이어도)")
  it("pref='dark' → colors === darkColors")
  it("pref='light' → isDark=false (OS scheme='dark'이어도)")
  it("pref='light' → colors === lightColors")
  it("pref='system' + scheme='dark' → isDark=true (기존 동작 유지)")
  it("pref='system' + scheme='light' → isDark=false (기존 동작 유지)")
}
```

---

## 핵심 결정 근거

| 결정 | 대안 | 채택 이유 |
|------|------|----------|
| Zustand persist (AsyncStorage) | Context + AsyncStorage 직접 | 기존 스토어 패턴(auth-store) 일관성. selector 구독 → 필요한 컴포넌트만 리렌더 |
| `useTheme` 반환 시그니처 유지 | ThemePref 추가 반환 | 기존 소비자 코드(30+ 화면) 수정 없음. pref는 S16에서만 필요 |
| ThemeSection을 S16 내 함수 컴포넌트로 분리 | 인라인 직접 작성 | 알림 섹션/구독 섹션과 동일한 구조적 패턴 유지. 후속 재사용 가능 |
| NavigationContainer theme 동적 연결 | 정적 DarkTheme 유지 | 라이트 모드 선택 시 내비게이션 크롬 색상 일치 필수 |
| `pref='system'` 폴백 로직 `scheme !== 'light'` 유지 | `scheme === 'dark'` | null/undefined → dark 다크 퍼스트 정책은 이슈 범위 외 변경 |

---

## 주의사항 / 모듈 경계

- `theme-store.ts`는 `auth-store.ts`와 무관 — 교차 의존 없음
- `useTheme`은 `src/hooks/`에 위치. 에이전트 바운더리 훅이 `hooks/` 경로를 차단하나 **소스 코드 훅**(src/hooks/)과 **하네스 훅**은 다름 — engineer는 정상 접근 가능
- 기존 `useColorScheme` 직접 호출하는 코드 (typography.ts, index.ts)는 색상 결정 로직이 아니므로 **이번 범위 외** (이슈 명시: "useColorScheme 직접 호출 부분 있다면 useTheme으로 교체")
- `S16SettingsScreen.tsx`의 하드코딩 hex 색상 교체는 이슈 범위 외 ("화면 hex 마이그레이션은 별도 batch")
- `App.tsx`에서 `useTheme()` 호출 위치가 `NavigationContainer` 외부여야 함 (hook 규칙) — 실제 파일 구조 확인 후 래퍼 분리 여부 결정

---

## 검증 체크리스트

```
□ 시뮬레이터: "시스템 설정 따라가기" → OS 다크/라이트 토글 시 앱 색상 변경
□ 시뮬레이터: "다크 모드" → OS와 무관하게 다크 유지
□ 시뮬레이터: "라이트 모드" → OS와 무관하게 라이트 유지
□ 앱 재시작 후 마지막 선택 유지 (AsyncStorage 영속)
□ npx vitest run — 기존 useTheme 테스트 케이스 전부 PASS
□ npx vitest run — 신규 ThemePref override 케이스 PASS
```

---

## Design Ref

**캔버스 노드**: S16 설정 화면 — `dtn23` (design/jajang.pen)

| 노드 ID | 이름 | 역할 |
|---------|------|------|
| `dtn23` | S16 설정 | 화면 전체 프레임 (390×844) |
| `Etyv7` | s16notifRow | 알림 설정 행 — **ThemeSection 삽입 위치 직후** |
| `Bs1us` | s16div3 | 알림↔데이터 구분선 — ThemeSection이 이 위치를 대체 |
| `brG3I` | content | 전체 레이아웃 컨테이너 (vertical, gap=0) |

**디자인 토큰 (ThemeSection 적용)**:
- 섹션 타이틀: `textSecondary (#7B80A0)`, fontSize 13, uppercase
- 라디오 선택 컬러: `accentPrimary (#5A7AA8)`
- 라디오 미선택 border: `border (#2A2E48)`
- 행 레이블: `#E0E2F0`, fontSize 15 (기존 rowLabel과 동일)
- 터치 타겟: minHeight 48dp (야간 큰 터치 타겟 정책)

> **참고**: 캔버스 dtn23에 테마 섹션 노드가 아직 추가되지 않음. 위 디자인 토큰은 기존 S16 패턴과 UX flow 가이드라인(`r-16 카드`, `낮은 밀도`, `accentPrimary 선택 강조`)에서 파생. 디자이너 시안 업데이트 시 토큰 값 재확인 필요.
