---
depth: std
design: required
---
# impl-03 — Font Loading (useFonts.ts + App.tsx 통합)

**이슈**: #87  
**에픽**: epic-07-design-system  
**선행 impl**: 02-design-token-module.md (FontFamily 상수 정의 완료)  

---

## ⚠️ PLAN_VALIDATION_FAIL — 재실행 필수 항목 (4개 전부 미구현)

> impl-02(FontFamily 상수)는 완료됨. 아래 4개 파일은 **impl-03 범위**이며 별도로 구현해야 한다.

| 파일 | 작업 | 상태 |
|---|---|---|
| `apps/mobile/package.json` | `expo-font`, `expo-splash-screen`, `@expo-google-fonts/dm-sans`, `@expo-google-fonts/dm-mono`, `@expo-google-fonts/noto-sans-kr` 추가 | ❌ 미구현 |
| `apps/mobile/app.json` | `splash.backgroundColor: "#0D0F1A"` + `plugins`에 `"expo-splash-screen"` 추가 | ❌ 미구현 |
| `apps/mobile/src/hooks/useFonts.ts` | 신규 생성 (expo-font + 6개 폰트 로딩 훅) | ❌ 미구현 |
| `apps/mobile/App.tsx` | `SplashScreen.preventAutoHideAsync()` 모듈레벨 호출 + `useFonts` 통합 + `AppTheme` 색상 교체(`#F5C97A` → `Colors.accentPrimary`) | ❌ 미구현 |

**구현 순서**: package.json(패키지 설치) → app.json → useFonts.ts 신규 생성 → App.tsx 수정 → prebuild

---

## 결정 근거

### 왜 이번 범위인가

| 항목 | 이번 impl | 후행 impl |
|---|---|---|
| `src/hooks/useFonts.ts` | ✅ | — |
| `@expo-google-fonts/*` 패키지 추가 | ✅ | — |
| `App.tsx` SplashScreen 통합 | ✅ | — |
| `App.tsx` AppTheme 색상 수정 | ✅ | — |
| screen 비주얼 폴리시 (토큰 마이그레이션) | ❌ | impl-04+ |

**근거**: impl-02에서 `FontFamily` 상수를 정의했지만 폰트 파일이 로딩되지 않으면 모든 화면에서 시스템 폰트 fallback 상태다. 이번 impl은 **폰트 로딩 인프라**를 확립한다. 이후 screen 마이그레이션은 폰트가 올바르게 로딩된 환경을 전제로 한다.

### 핵심 결정 3개

#### 결정 1 — expo-splash-screen으로 FOUC 방지

**문제**: `useFonts` 로딩 전에 React tree가 렌더되면 시스템 폰트가 잠깐 노출된다(FOUC).  
**선택**: `SplashScreen.preventAutoHideAsync()` (모듈 레벨) → 폰트 로딩 완료 후 `SplashScreen.hideAsync()`.  
**대안 A**: `useFonts` 완료 전 `return null` → 짧지만 빈 화면 flash 가능성.  
**대안 B**: SplashScreen 없이 그냥 렌더 → 시스템 폰트 → 커스텀 폰트 jump 보임.  
**채택 근거**: SplashScreen 방식이 표준이며 네이티브 splash가 부드럽게 연결됨. `fontError` 발생 시에도 SplashScreen을 닫아 앱 런칭을 차단하지 않는다.

#### 결정 2 — App.tsx AppTheme 색상 수정 포함

**문제**: `App.tsx`의 `AppTheme`에 `primary: '#F5C97A'`와 `notification: '#F5C97A'`가 하드코딩됨 — issue #87 색상 교체(amber → sage)가 미완성 상태.  
**선택**: App.tsx 수정 시 `Colors.accentPrimary`로 교체.  
**근거**: 어차피 App.tsx를 useFonts 통합으로 수정해야 하므로 동일 파일의 관련 수정을 묶는다. 별도 PR을 추가하지 않음.  
**주의**: `Colors` import는 `./src/theme` 상대경로 사용 (`@theme` alias 미존재 — impl-02 참조).

#### 결정 3 — 번들 로딩 (@expo-google-fonts 패키지)

**선택**: `@expo-google-fonts/dm-sans`, `@expo-google-fonts/dm-mono`, `@expo-google-fonts/noto-sans-kr` 패키지의 폰트 에셋을 번들 임포트.  
**대안**: 폰트 파일을 `assets/fonts/`에 수동 복사.  
**채택 근거**: `@expo-google-fonts` 패키지는 폰트 파일을 npm bundle에 포함하므로 네트워크 없이 동작. SIL Open Font License — 상업 배포 허용. `npx expo install`로 expo 호환 버전 자동 결정.

---

## 생성 / 수정 파일 목록

| 파일 | 작업 | 설명 |
|---|---|---|
| `apps/mobile/src/hooks/useFonts.ts` | NEW | expo-font 멀티 패밀리 훅 |
| `apps/mobile/App.tsx` | MODIFY | SplashScreen 통합 + useFonts 마운트 + AppTheme 색상 수정 |
| `apps/mobile/package.json` | MODIFY | expo-font, expo-splash-screen, @expo-google-fonts 3종 추가 |
| `apps/mobile/app.json` | MODIFY | splash.backgroundColor 추가 |

> **기존 screen 파일 수정 없음.** screen 비주얼 폴리시(토큰 마이그레이션)는 impl-04+에서 진행.

---

## 인터페이스 정의

### `useFonts.ts`

```typescript
// apps/mobile/src/hooks/useFonts.ts

import { useFonts as useExpoFonts } from 'expo-font';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import { DMMono_400Regular } from '@expo-google-fonts/dm-mono';
import {
  NotoSansKR_300Light,
  NotoSansKR_400Regular,
} from '@expo-google-fonts/noto-sans-kr';

/**
 * 앱 전체 폰트 로딩 훅.
 * 반환: [loaded, error]
 * - loaded=true 또는 error!=null → SplashScreen 해제 가능
 * - 모든 폰트는 @expo-google-fonts 패키지에서 번들 로딩 (네트워크 불필요)
 *
 * 로딩하는 폰트 (tokens.ts FontFamily 상수와 1:1 대응):
 *   DMSans_400Regular    → FontFamily.dmSans
 *   DMSans_500Medium     → FontFamily.dmSansMedium
 *   DMSans_700Bold       → FontFamily.dmSansBold
 *   DMMono_400Regular    → FontFamily.dmMono
 *   NotoSansKR_300Light  → FontFamily.notoSansKRLight
 *   NotoSansKR_400Regular→ FontFamily.notoSansKR
 */
export function useFonts(): [boolean, Error | null] {
  const [loaded, error] = useExpoFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
    DMMono_400Regular,
    NotoSansKR_300Light,
    NotoSansKR_400Regular,
  });
  return [loaded, error];
}
```

**주의**: `useFonts`를 `expo-font`에서 `useExpoFonts`로 alias import — 같은 이름 충돌 방지.

### `App.tsx` 변경 diff (의사코드)

```diff
 import React, { useEffect } from 'react';
+import * as SplashScreen from 'expo-splash-screen';
 import { StatusBar } from 'expo-status-bar';
 ...
+import { useFonts } from '@hooks/useFonts';
+import { Colors } from './src/theme';

+// 네이티브 스플래시를 폰트 로딩 완료 전까지 유지
+SplashScreen.preventAutoHideAsync();

 const AppTheme = {
   ...DarkTheme,
   colors: {
     ...DarkTheme.colors,
-    primary: '#F5C97A',
+    primary: Colors.accentPrimary,    // #82B090 (issue #87 색상 교체 완결)
     background: '#0D0F1A',
     card: '#12152B',
     text: '#EEF0F8',
     border: '#2A2E48',
-    notification: '#F5C97A',
+    notification: Colors.accentPrimary,
   },
 };

 export default function App() {
+  const [fontsLoaded, fontError] = useFonts();
   useEntitlementSync();

+  useEffect(() => {
+    if (fontsLoaded || fontError) {
+      // 폰트 에러 시에도 SplashScreen을 닫아 앱 런칭을 차단하지 않음
+      // fontError → 시스템 폰트 fallback으로 계속 동작
+      SplashScreen.hideAsync().catch(() => {});
+    }
+  }, [fontsLoaded, fontError]);

+  // 폰트 로딩 전: 네이티브 SplashScreen이 유지되므로 null 반환 안전
+  if (!fontsLoaded && !fontError) {
+    return null;
+  }

   useEffect(() => {
     initializeAdMob().catch(console.warn);
   }, []);

   return (
     ...
   );
 }
```

**중요**: `fontsLoaded` 체크 후 `return null` 위치는 `useEntitlementSync()` 아래가 아닌 위여야 하면 안 된다 — `useFonts()`와 다른 훅 호출 순서는 **항상 고정** (React 훅 규칙: 조건부 return은 모든 훅 호출 후). 실제 구현 시 engineer는 모든 훅 호출 완료 후 `if (!fontsLoaded && !fontError) return null;` 배치.

### `app.json` 변경

```diff
   "expo": {
     ...
+    "splash": {
+      "backgroundColor": "#0D0F1A"
+    },
     "plugins": [
       "expo-secure-store",
-      "expo-web-browser"
+      "expo-web-browser",
+      "expo-splash-screen"
     ]
   }
```

---

## 구현 레시피

engineer는 아래 순서로 진행한다.

### 1. 패키지 설치

```bash
cd apps/mobile
npx expo install expo-font expo-splash-screen \
  @expo-google-fonts/dm-sans \
  @expo-google-fonts/dm-mono \
  @expo-google-fonts/noto-sans-kr
```

`npx expo install`은 현재 SDK(55)와 호환되는 버전을 자동 선택한다. `npm install`/`yarn add` 직접 사용 금지.

### 2. app.json 수정

위 diff 내용 반영 (`splash.backgroundColor` + `expo-splash-screen` 플러그인 추가).

### 3. `apps/mobile/src/hooks/useFonts.ts` 생성

위 인터페이스 정의 그대로 작성.

### 4. `apps/mobile/App.tsx` 수정

위 diff 내용 반영 (3군데 추가: import, preventAutoHide 모듈레벨, 컴포넌트 내부 로직).

**훅 호출 순서 주의**: `useEffect`, `if(!fontsLoaded) return null` 전에 모든 훅 호출 완료.

```typescript
// 올바른 순서
export default function App() {
  const [fontsLoaded, fontError] = useFonts();
  useEntitlementSync();

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    initializeAdMob().catch(console.warn);
  }, []);

  if (!fontsLoaded && !fontError) {
    return null;  // ← 모든 훅 호출 완료 후에만 조건부 return
  }

  return (
    <SafeAreaProvider>
      ...
    </SafeAreaProvider>
  );
}
```

### 5. prebuild (Bare workflow 필수)

```bash
npx expo prebuild --clean
```

`expo-splash-screen`의 native linking이 iOS/Android에 반영됨. 기존 `ios/`, `android/` 수정.

---

## 검증 기준

| 검증 항목 | 기대 결과 |
|---|---|
| `npx tsc --noEmit` (apps/mobile) | 타입 오류 0개 |
| iOS 시뮬레이터 앱 기동 | 스플래시 유지 → 폰트 로딩 완료 → 스플래시 해제 → S01 스플래시 화면 진입 |
| 헤딩 텍스트 폰트 | DM Sans (Round sans-serif, 시스템 폰트와 육안 구별 가능) |
| 한글 본문 텍스트 | Noto Sans KR Light (얇고 가독성 높은 형태) |
| 타이머 숫자 | DM Mono (tabular, 고정폭) |
| `AppTheme.colors.primary` | `'#82B090'` (amber 아님) |
| `package.json` `expo-font` 존재 | ✅ |
| `package.json` `@expo-google-fonts/dm-sans` 존재 | ✅ |
| 폰트 에러 시 앱 런칭 차단 여부 | 차단 없음 — 시스템 폰트 fallback |

---

## 주의사항

- **`SplashScreen.preventAutoHideAsync()` 위치**: 모듈 최상단(컴포넌트 정의 밖). `App.tsx` 내부 `useEffect`에서 호출하면 너무 늦어 SplashScreen이 자동으로 닫힐 수 있음.
- **`@expo-google-fonts` 내부 `useFonts` 충돌**: 각 `@expo-google-fonts/xx` 패키지도 자체 `useFonts`를 export한다. `expo-font`의 `useFonts`를 직접 사용하고 alias 처리(`useExpoFonts`)로 충돌 방지.
- **`return null` 앞 모든 훅 완료 필수**: `useEntitlementSync()`, `useEffect()` 모두 `if (!fontsLoaded)` 조건부 return 앞에 위치해야 함. 순서 위반 시 React 훅 규칙 위반 오류.
- **`Colors` import 경로**: `App.tsx` 기준 `'./src/theme'` (상대경로). `@theme` alias 미등록 상태 (별도 build-config 에픽 예정). screens는 `'../../theme'` 사용 유지.
- **Android 8자리 hex alpha 주의**: `Colors.accentPrimary14`(`#82B09024`) 등 8자리 hex는 App.tsx AppTheme에서 사용하지 않음 — 이번 impl 범위 밖. 향후 screen 마이그레이션(impl-04+)에서 Android 호환 `rgba()` 변환 검토 필요.
- **prebuild 필수**: expo-splash-screen은 Bare workflow에서 native module이므로 `npx expo prebuild` 없이는 빌드 오류 발생.
