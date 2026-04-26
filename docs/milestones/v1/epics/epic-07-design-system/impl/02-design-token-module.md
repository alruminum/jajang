---
depth: std
---
# impl-02 — Design Token Module (src/theme/)

**이슈**: #87  
**에픽**: epic-07-design-system  
**선행 impl**: 01-theme-tokens.md (WITHDRAWN) → 이 파일이 재설계 대체본  
**병행 작업**: `docs/bugfix/#87-color-token-swap.md` (기존 파일 hex 교체)와 독립

---

## 결정 근거

### 왜 이 범위인가

| 항목 | 이번 impl | 다음 impl (03) |
|---|---|---|
| `src/theme/tokens.ts` | ✅ | — |
| `src/theme/typography.ts` | ✅ | — |
| `src/theme/spacing.ts` | ✅ | — |
| `src/theme/index.ts` | ✅ | — |
| `src/hooks/useFonts.ts` | ❌ | ✅ |
| `@expo-google-fonts/*` 패키지 추가 | ❌ | ✅ |
| `App.tsx` 수정 (useFonts 마운트) | ❌ | ✅ |

**근거**: 이전 `01-theme-tokens.md` WITHDRAWN 원인은 신규 모듈 + tsconfig alias + expo-google-fonts 의존성을 한 번에 묶어 validator 범위가 초과된 것. 이번 impl은 **pure TypeScript constants 파일 4개**만 신설한다. 새 npm 의존성 없음, 기존 파일 수정 없음, build 설정 변경 없음 — validator FAIL 요소를 모두 제거.

### tsconfig path alias 미도입 이유

`tsconfig.json`의 `paths` 추가는 Jest `moduleNameMapper`, Metro bundler `resolver`, Expo config 세 곳을 동시에 수정해야 정합성이 보장된다. 이 변경은 별도 build-config 에픽으로 분리. 이번 impl에서 screens는 상대 경로 import(`../../theme`)를 사용한다.

### 색상 값 출처

- 기준: `docs/ux-flow.md` § 0. 디자인 가이드 컬러 방향
- 업데이트: Issue #87 "색상 토큰 교체" — `color-accent-primary` amber `#F5C97A` → sage `#82B090` 적용 반영
- Pencil 파일: `design/jajang.pen` (S01~S17, Reusable 컴포넌트 12종)

---

## 생성 파일 목록

| 파일 | 설명 | 의존성 |
|---|---|---|
| `apps/mobile/src/theme/tokens.ts` | 색상 12종 + 파생 투명도 3종, 폰트 패밀리 6종, 폰트 크기 7단계, 레이디어스 4단계 | — |
| `apps/mobile/src/theme/typography.ts` | TextStyle 프리셋 8종 (`displayBold` / `h1`~`h3` / `body` / `caption` / `buttonLabel` / `timerMono`) | tokens.ts |
| `apps/mobile/src/theme/spacing.ts` | 스페이싱 상수 6단계 | — |
| `apps/mobile/src/theme/index.ts` | 배럴 export | tokens, typography, spacing |

> **수정 파일 없음.** 기존 screens/components는 이번 impl에서 건드리지 않는다.  
> 토큰 사용(screens 마이그레이션)은 별도 이슈로 처리.

---

## 인터페이스 정의

### `tokens.ts`

```typescript
// ─── Colors ──────────────────────────────────────────────────────────────────
export const Colors = {
  // 배경 — 깊은 남색 (순수 black 아님)
  bgPrimary:   '#0D0F1A',
  bgDeep:      '#12152B',
  // 서피스 — 카드/시트 배경
  surface:     '#1A1D30',
  surfaceHigh: '#21253E',
  // 엑센트 — 세이지 그린 (수면·자연·평온 무드)
  accentPrimary:   '#82B090',   // Issue #87 색상 토큰 교체 반영
  accentSecondary: '#8BAED4',   // 달빛 블루 (보조 정보)
  // 경계선
  border: '#2A2E48',
  // 텍스트
  textPrimary:   '#EEF0F8',
  textSecondary: '#7B80A0',
  // 시멘틱
  destructive: '#E05252',   // 삭제·경고 (설정 탈퇴 버튼 등)
  // 파생 — 투명도 변형 (Pencil hex alpha 기준)
  accentPrimary14: '#82B09024',   // 약 14% (0x24 = 36/255)
  accentPrimary20: '#82B09033',   // 약 20% (0x33 = 51/255)
  accentPrimary33: '#82B09055',   // 약 33% (0x55 = 85/255)
} as const;

export type ColorKey = keyof typeof Colors;

// ─── Font Family ──────────────────────────────────────────────────────────────
// 폰트 이름은 useFonts (impl-03) 에서 expo-font에 등록 후 유효.
// 등록 전 호출 시 system fallback. 폰트 로딩 완료 전 스플래시 유지 책임은 useFonts.
export const FontFamily = {
  // DM Sans — 제목·헤드라인·버튼 (영문/숫자)
  dmSans:       'DMSans_400Regular',
  dmSansMedium: 'DMSans_500Medium',
  dmSansBold:   'DMSans_700Bold',
  // DM Mono — 타이머·tabular numbers
  dmMono: 'DMMono_400Regular',
  // Noto Sans KR — 한글 본문
  notoSansKR:       'NotoSansKR_300Light',
  notoSansKRMedium: 'NotoSansKR_400Regular',
} as const;

export type FontFamilyKey = keyof typeof FontFamily;

// ─── Font Size (7단계) ────────────────────────────────────────────────────────
export const FontSize = {
  xs:      12,
  sm:      14,
  md:      16,
  lg:      18,
  xl:      22,
  xxl:     28,
  display: 36,
} as const;

export type FontSizeKey = keyof typeof FontSize;

// ─── Border Radius (4단계) ───────────────────────────────────────────────────
export const Radius = {
  sm:   4,
  md:   8,
  lg:   16,   // 카드 r-16 (ux-flow.md UI 패턴)
  pill: 28,   // 버튼 Primary r-28 (pill 형태)
} as const;

export type RadiusKey = keyof typeof Radius;
```

### `spacing.ts`

```typescript
// 스페이싱 (6단계) — 4의 배수 기반
export const Spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
} as const;

export type SpacingKey = keyof typeof Spacing;
```

### `typography.ts`

```typescript
import { TextStyle, FontVariant } from 'react-native';
import { Colors, FontFamily, FontSize } from './tokens';

// 텍스트 스타일 프리셋 — 실제 TextStyle 객체
// 폰트 미로딩 시 fontFamily는 undefined로 fallback (system font 사용)

export const Typography: Record<string, TextStyle> = {
  displayBold: {
    fontFamily: FontFamily.dmSansBold,
    fontSize:   FontSize.display,
    lineHeight: FontSize.display * 1.2,
    color:      Colors.textPrimary,
    letterSpacing: 0,
  },
  h1: {
    fontFamily: FontFamily.dmSansBold,
    fontSize:   FontSize.xxl,
    lineHeight: FontSize.xxl * 1.25,
    color:      Colors.textPrimary,
  },
  h2: {
    fontFamily: FontFamily.dmSansMedium,
    fontSize:   FontSize.xl,
    lineHeight: FontSize.xl * 1.3,
    color:      Colors.textPrimary,
  },
  h3: {
    fontFamily: FontFamily.dmSansMedium,
    fontSize:   FontSize.lg,
    lineHeight: FontSize.lg * 1.35,
    color:      Colors.textPrimary,
  },
  body: {
    fontFamily: FontFamily.notoSansKR,
    fontSize:   FontSize.md,
    lineHeight: FontSize.md * 1.6,
    color:      Colors.textPrimary,
    letterSpacing: 0.2,   // ux-flow.md: 자간 +0.2 (피로한 눈을 위한 여유)
  },
  caption: {
    fontFamily: FontFamily.notoSansKR,
    fontSize:   FontSize.sm,
    lineHeight: FontSize.sm * 1.5,
    color:      Colors.textSecondary,
    letterSpacing: 0.2,
  },
  buttonLabel: {
    fontFamily: FontFamily.dmSansMedium,
    fontSize:   FontSize.md,
    lineHeight: FontSize.md * 1.2,
    color:      Colors.bgPrimary,   // 다크 텍스트 on accentPrimary 배경
    letterSpacing: 0.3,
  },
  timerMono: {
    fontFamily: FontFamily.dmMono,
    fontSize:   FontSize.xl,
    lineHeight: FontSize.xl * 1.2,
    color:      Colors.textPrimary,
    fontVariant: ['tabular-nums'] as FontVariant[],  // ux-flow.md: Tabular numbers — 파형·타이머 숫자 흔들림 방지
  },
};
```

### `index.ts`

```typescript
export * from './tokens';
export * from './typography';
export * from './spacing';
```

---

## 구현 레시피

engineer는 아래 파일을 순서대로 생성한다.

### 1. 디렉터리 + tokens.ts

```bash
mkdir -p apps/mobile/src/theme
```

이후 `apps/mobile/src/theme/tokens.ts` 내용: 위 인터페이스 정의 그대로.

### 2. spacing.ts

`apps/mobile/src/theme/spacing.ts` 내용: 위 인터페이스 정의 그대로.

### 3. typography.ts

`apps/mobile/src/theme/typography.ts` 내용: 위 인터페이스 정의 그대로.

### 4. index.ts

`apps/mobile/src/theme/index.ts` 내용: 배럴 export 3줄.

### 5. (선택) TypeScript 컴파일 확인

```bash
cd apps/mobile
npx tsc --noEmit
```

theme 모듈에서 타입 오류 없음을 확인.  
`fontVariant` 타입: `['tabular-nums'] as FontVariant[]` 캐스팅으로 mutable 타입 보장 (strict 환경 대응).

---

## 검증 기준

| 검증 항목 | 기대 결과 |
|---|---|
| `npx tsc --noEmit` | 오류 0개 |
| `Colors.accentPrimary` 값 | `'#82B090'` (amber 아님) |
| `Radius.pill` 값 | `28` (ux-flow.md 버튼 r-28 일치) |
| `Typography.timerMono.fontVariant` | `['tabular-nums']` |
| 기존 screen 파일 수정 여부 | 0개 (grep 기준) |
| `package.json` 변경 여부 | 없음 |
| `tsconfig.json` 변경 여부 | 없음 |

---

## 주의사항

- **FontFamily 상수는 impl-03 useFonts 완료 후 실제 동작함.** 이번 impl에서는 constants 정의만. 폰트 로딩 없이 screens에서 import해도 `fontFamily` 값이 정의되어 있으므로 런타임 오류 없음 (system fallback).
- **screens 마이그레이션 금지**: 기존 screens에서 theme import로 교체하는 작업은 이번 impl 범위 밖. 토큰 모듈이 안정화된 후 별도 이슈에서 진행.
- **`#82B09022` 패턴**: hex alpha 2자리는 rgba와 동일 의미. 일부 Android 버전에서 8자리 hex color 파싱 이슈 있음. screens 사용 시 `rgba(130, 176, 144, 0.14)` 로 대체 검토 필요. 이번 impl은 상수 정의만이므로 문제 없음 — 사용 시점에 주의.
- **`fontVariant: ['tabular-nums']`**: React Native `TextStyle`에서 iOS 전용. Android는 무시됨. 타이머 화면(S13) 구현 시 Android용 대안(`fontFeatureSettings`) 검토 필요.
