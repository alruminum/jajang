---
depth: std
---

# impl: #99 다크/라이트 듀얼 테마 + Midnight Indigo accent 마이그레이션

## 변경 파일 목록 (mobile src/theme 한정 — API 파일 제외)

| 파일 | 유형 | 변경 내용 |
|---|---|---|
| `apps/mobile/src/theme/tokens.ts` | 수정 | `Colors` → `darkColors` + `lightColors` 분리; 12 토큰 값 교체; 파생 투명도 토큰 양분; `Colors` 별칭 유지 |
| `apps/mobile/src/theme/typography.ts` | 수정 | `Colors` → `darkColors` 참조 교체; `getTypography(colors)` 팩토리 추가 |
| `apps/mobile/src/theme/index.ts` | 수정 | `useTheme` re-export 추가 |
| `apps/mobile/src/hooks/useTheme.ts` | 신규 | `useColorScheme` 기반 `useTheme()` 훅 |

> **절대 포함 금지**: `apps/api/**`, `.gitignore`, `security.py` 등 API·인프라 파일

---

## 핵심 결정

### 결정 1 — React Native dark/light 분기 구조

**채택**: `darkColors` + `lightColors` 두 const 객체 분리 → `useTheme()` 훅에서 `useColorScheme()` 결과로 선택 반환.

**기각 대안**: 단일 `Colors` 객체 + `useColorScheme` 인라인 분기  
→ 기각 이유: 단일 객체에 if 분기를 넣으면 모듈 초기화 시점에 scheme이 고정되어 hot-reload·테스트에서 theme 전환이 불가. 

**기각 대안**: CSS custom properties 매핑  
→ 기각 이유: React Native(Expo Bare)는 CSS 런타임 미지원. StyleSheet는 정적 객체. CSS variable은 웹 전용 개념이므로 적용 불가.

**하위 호환**: 기존 `Colors` 를 삭제하지 않고 `darkColors` 별칭으로 유지.  
현재 `Colors`를 직접 참조하는 파일은 `typography.ts` 뿐 (grep 확인: screens/components에서 `Colors` import 없음). 단계적 마이그레이션 부담 없음.

### 결정 2 — typography.ts 처리 방식

`Typography` 는 현재 모듈 최상위 정적 객체다. 정적 초기화 시점에는 color scheme이 결정되지 않으므로 `darkColors` 를 기본값으로 사용한다 (앱은 다크 퍼스트 디자인).

테마 반응 타이포를 원하는 화면은 `getTypography(colors)` 팩토리 함수를 쓴다. 기존 `Typography` 직접 사용은 유지(파괴적 변경 없음).

### 결정 3 — 파생 투명도 토큰

`accentPrimary{14|20|33}` 는 `accentPrimary` hex + alpha suffix 패턴이다.  
dark/light 각각 신규 hex에 동일 alpha suffix 적용:

| 토큰 | dark | light |
|---|---|---|
| `accentPrimary14` | `#5A7AA824` | `#3A5A8824` |
| `accentPrimary20` | `#5A7AA833` | `#3A5A8833` |
| `accentPrimary33` | `#5A7AA855` | `#3A5A8855` |

alpha suffix 기준 — 기존 주석 그대로 (0x24≈14%, 0x33≈20%, 0x55≈33%).

---

## 토큰 전체 매핑

이슈 #99 본문 토큰 테이블 → 코드 키 매핑:

| 디자인 토큰 | 코드 키 | dark | light |
|---|---|---|---|
| color-accent-primary | `accentPrimary` | `#5A7AA8` | `#3A5A88` |
| color-accent-secondary | `accentSecondary` | `#C49A8A` | `#9A6858` |
| color-bg-primary | `bgPrimary` | `#0D0F1A` | `#FBF7F0` |
| color-bg-secondary | `bgDeep` | `#12152B` | `#F0EAE0` |
| color-surface-1 | `surface` | `#1A1D30` | `#E8E0D4` |
| color-surface-2 | `surfaceHigh` | `#21253E` | `#DDD4C6` |
| color-text-primary | `textPrimary` | `#EEF0F8` | `#1C1A18` |
| color-text-secondary | `textSecondary` | `#7B80A0` | `#6B6055` |
| color-border | `border` | `#2A2E48` | `#C8BEB0` |
| color-error | `destructive` | `#E85A5A` | `#C0392B` |
| color-success | `success` (신규) | `#6BCB77` | `#2E8B44` |
| color-overlay | `overlay` (신규) | `#000000AA` | `#00000066` |

> `destructive` 다크값이 `#E85A5A`로 기존 `#E05252`에서 소폭 변경됨 (디자인 확정값).

---

## 구현 상세

### tokens.ts 구조

```ts
// 토큰 타입 — dark/light 공통 키셋
export type ColorTokens = {
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
  // 파생 투명도
  accentPrimary14:  string;
  accentPrimary20:  string;
  accentPrimary33:  string;
};

export const darkColors: ColorTokens = {
  accentPrimary:    '#5A7AA8',
  accentSecondary:  '#C49A8A',
  bgPrimary:        '#0D0F1A',
  bgDeep:           '#12152B',
  surface:          '#1A1D30',
  surfaceHigh:      '#21253E',
  textPrimary:      '#EEF0F8',
  textSecondary:    '#7B80A0',
  border:           '#2A2E48',
  destructive:      '#E85A5A',
  success:          '#6BCB77',
  overlay:          '#000000AA',
  accentPrimary14:  '#5A7AA824',
  accentPrimary20:  '#5A7AA833',
  accentPrimary33:  '#5A7AA855',
};

export const lightColors: ColorTokens = {
  accentPrimary:    '#3A5A88',
  accentSecondary:  '#9A6858',
  bgPrimary:        '#FBF7F0',
  bgDeep:           '#F0EAE0',
  surface:          '#E8E0D4',
  surfaceHigh:      '#DDD4C6',
  textPrimary:      '#1C1A18',
  textSecondary:    '#6B6055',
  border:           '#C8BEB0',
  destructive:      '#C0392B',
  success:          '#2E8B44',
  overlay:          '#00000066',
  accentPrimary14:  '#3A5A8824',
  accentPrimary20:  '#3A5A8833',
  accentPrimary33:  '#3A5A8855',
};

// 하위 호환 별칭 — 기존 Colors 참조 코드 무중단
export const Colors = darkColors;
export type ColorKey = keyof ColorTokens;
```

### hooks/useTheme.ts

```ts
import { useColorScheme } from 'react-native';
import { darkColors, lightColors, ColorTokens } from '../theme/tokens';

export function useTheme(): { colors: ColorTokens; isDark: boolean } {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';   // null/undefined → dark 취급 (앱 다크 퍼스트)
  return { colors: isDark ? darkColors : lightColors, isDark };
}
```

### typography.ts 변경 요점

```ts
import { darkColors as Colors, ColorTokens } from './tokens';
// ... 기존 Typography 정적 객체 유지 ...

// 신규: 테마 반응 팩토리 (useTheme 결과 colors를 주입)
export function getTypography(colors: ColorTokens): typeof Typography {
  return {
    ...Typography,
    displayBold:  { ...Typography.displayBold,  color: colors.textPrimary },
    h1:           { ...Typography.h1,           color: colors.textPrimary },
    h2:           { ...Typography.h2,           color: colors.textPrimary },
    h3:           { ...Typography.h3,           color: colors.textPrimary },
    body:         { ...Typography.body,         color: colors.textPrimary },
    caption:      { ...Typography.caption,      color: colors.textSecondary },
    buttonLabel:  { ...Typography.buttonLabel,  color: colors.bgPrimary },
    timerMono:    { ...Typography.timerMono,    color: colors.textPrimary },
  };
}
```

### index.ts 추가 re-export

```ts
export * from './tokens';
export * from './typography';
export * from './spacing';
// 신규
export { useTheme } from '../hooks/useTheme';
export type { ColorTokens } from './tokens';
```

---

## 주의사항

1. **`src/theme/index.ts`에서 `hooks/` re-export**: `../hooks/useTheme` 경로 정확도 확인. hooks 폴더와 theme 폴더가 같은 depth(`src/`)에 있음.
2. **`Colors` 별칭 삭제 금지**: 현재는 theme 파일 내부에서만 사용되지만, 미래 screens 작성 시 `Colors.xxx` 패턴을 쓸 수 있으므로 유지. 단, 신규 화면은 `useTheme().colors.xxx` 패턴 권장.
3. **`Typography` 정적 객체 유지**: `getTypography()` 추가는 기존 호출 코드를 깨지 않음. 화면에서 `useTheme()` 없이 `Typography.h1` 접근 시 다크 색상 반환 — 라이트 모드 미지원 허용 (MVP 범위).
4. **`success` / `overlay` 신규 키**: `ColorKey` 타입 자동 확장. 기존 코드에서 이 키를 참조하는 곳 없으므로 breaking change 없음.
5. **API 파일 수정 금지**: 이전 시도에서 `apps/api/` 파일이 실수로 포함됨. 이번 구현은 `apps/mobile/src/theme/` 및 `apps/mobile/src/hooks/` 만 수정.
