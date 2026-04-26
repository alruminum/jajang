---
depth: std
design: required
---
# impl-03 — useTheme 훅 마이그레이션 (이슈 #107)

**이슈**: #107  
**에픽**: epic-07-design-system  
**선행 impl**: `02-design-token-module.md` (PR #87) → `bugfix/#99-dual-theme-migration.md` (PR #106, useTheme 인프라 완료)  
**목적**: 32개 화면·컴포넌트에 박힌 옛 hex 리터럴을 `useTheme()` 토큰으로 전환. 듀얼 다크/라이트 테마 실제 동작.

---

## 결정 근거

### 결정 1 — useMemo 의존 배열 `[colors]`

**채택**: `useMemo(() => StyleSheet.create({...}), [colors])`

**근거**: `colors` 객체는 `useTheme()` → `useColorScheme()` 변화 시에만 교체된다. 동일 scheme에서는 `darkColors` / `lightColors` 상수 참조가 바뀌지 않으므로 useMemo는 재계산하지 않는다. 함수 컴포넌트 리렌더 시마다 `StyleSheet.create`가 호출되는 기존 패턴 대비 성능 동등 이상.

**기각 대안**: `StyleSheet.create`를 컴포넌트 외부에 유지하고 inline style로 색상만 주입  
→ 기각: StyleSheet 외부 객체 유지 + inline 분리로 코드 복잡도 증가. 스타일 응집이 깨짐. useMemo 패턴이 더 명확.

**기각 대안**: 색상 관련 prop만 inline style, 나머지 StyleSheet 유지  
→ 기각: 파일마다 색상 추출 기준이 달라 일관성 없음. 이번 impl의 목적은 전사 일관 패턴 확립.

### 결정 2 — MainNavigator.tsx `screenOptions` 처리

**채택**: `useTheme`를 `HomeTabs()` 함수 바디와 `MainNavigator()` 함수 바디에서 각각 호출. `screenOptions`는 hook 호출 이후 변수로 분리 후 JSX에 주입.

```tsx
// HomeTabs 함수 내부
function HomeTabs() {
  const { colors } = useTheme();
  const tabBarScreenOptions = useMemo(() => ({
    headerShown: false,
    tabBarStyle: { backgroundColor: colors.bgDeep, borderTopColor: colors.border },
    tabBarActiveTintColor: colors.accentPrimary,
    tabBarInactiveTintColor: colors.textSecondary,
  }), [colors]);

  return (
    <Tab.Navigator screenOptions={tabBarScreenOptions}>
      ...
    </Tab.Navigator>
  );
}

// MainNavigator 함수 내부
export default function MainNavigator() {
  const { colors } = useTheme();
  const stackScreenOptions = useMemo(() => ({
    headerShown: false,
    contentStyle: { backgroundColor: colors.bgPrimary },
  }), [colors]);

  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      ...
    </Stack.Navigator>
  );
}
```

**근거**: React Navigation의 `screenOptions`는 객체 또는 콜백 모두 허용. 훅 제약(컴포넌트 함수 바디 최상위 호출)을 지키면서 테마 반응 가능. `bgDeep` (`#12152B`)을 탭바 배경에 사용 — 기존 `#12152B` 매핑.

### 결정 3 — S08RecordModeScreen 테스트 assertion 수정

현재 테스트:
```ts
const hasActiveStyle = styleArray.some(
  (s: any) => s && typeof s === 'object' && s.borderColor === '#82B090'
)
```

문제: 마이그레이션 후 `RecordModeScreen`은 `colors.accentPrimary`(`'#5A7AA8'`)를 borderColor로 사용. 기존 assertion은 FAIL.

**채택**: `vi.mock('@hooks/useTheme')` 추가 + `mockColors.accentPrimary`로 assertion 교체.

```ts
// @theme/ alias는 tsconfig/babel.config.js에 미정의 → 상대 경로 필수
import { darkColors } from '../../theme/tokens';

const mockColors = darkColors;

vi.mock('@hooks/useTheme', () => ({
  useTheme: () => ({ colors: mockColors, isDark: true }),
}));

// assertion 수정
const hasActiveStyle = styleArray.some(
  (s: any) => s && typeof s === 'object' && s.borderColor === mockColors.accentPrimary
)
```

**근거**: 
- mock을 통해 테스트가 실제 `useColorScheme` 환경에 무관하게 결정론적으로 동작
- assertion을 harded-coded hex(`#82B090`) 대신 `mockColors.accentPrimary`로 교체 → 이후 토큰 값 변경 시 단일 상수만 바꾸면 됨
- `darkColors` import로 테스트가 "dark 테마에서 accentPrimary 색상이 border에 적용됨"을 명시적으로 검증

---

## hex → 토큰 키 매핑 (전체)

| 옛 hex | 토큰 키 | 비고 |
|--------|---------|------|
| `#82B090`, `#82b090` | `colors.accentPrimary` | Sage → Midnight Indigo 변경 |
| `#82B09022`, `#82B09024` | `colors.accentPrimary14` | alpha 14% |
| `#82B09033` | `colors.accentPrimary20` | alpha 20% |
| `#82B09055` | `colors.accentPrimary33` | alpha 33% |
| `#8BAED4`, `#8baed4` | `colors.accentPrimary` | ~~accentSecondary~~ → **accentPrimary 정정**. `accentSecondary = #C49A8A`(terracotta 계열)와 색상 계열 불일치. `#8BAED4`는 steel-blue 계열 → `accentPrimary(#5A7AA8)`와 동계. |
| `#0D0F1A` | `colors.bgPrimary` | 주 배경 |
| `#12152B` | `colors.bgDeep` | 탭바 배경 |
| `#1A1D30` | `colors.surface` | 카드/시트 |
| `#21253E` | `colors.surfaceHigh` | 높은 서피스 |
| `#252940` | `colors.surfaceHigh` | MiniPlayer 플레이버튼 배경 — surfaceHigh 근사값으로 처리 |
| `#EEF0F8` | `colors.textPrimary` | 주 텍스트 |
| `#7B80A0` | `colors.textSecondary` | 보조 텍스트 |
| `#2A2E48` | `colors.border` | 경계선 |
| `#E85A5A`, `#E05252` | `colors.destructive` | 에러/삭제 |

> **`#252940`**: tokens.ts에 정의 없음. `surfaceHigh(#21253E)`와 유사한 밝은 서피스 색조. `colors.surfaceHigh`로 매핑. 픽셀 단위 차이는 허용 (토큰 우선 원칙).

### 신규 확정 매핑 (전수 조사 후 추가)

| 옛 hex | 토큰 키 | 비고 |
|--------|---------|------|
| `#1A1D2E`, `#1A1D35` | `colors.surface` | `surface(#1A1D30)` ±2~5 hex 근사값. 동일 surface 역할. |
| `#F5F5F5`, `#E0E2F0` | `colors.textPrimary` | `textPrimary(#EEF0F8)` 밝은 근사값. 동일 역할. |
| `#FFFFFF` | `colors.textPrimary` | 버튼 텍스트용 순백. 유색 버튼 배경 위에서 `#EEF0F8`과 시각차 무시 수준. |
| `#B0B4CC` | `colors.textSecondary` | `textPrimary`~`textSecondary` 중간 톤. 세목/부제목 역할 → `textSecondary` 근사. |
| `#2D3050`, `#4A4E68` | `colors.border` | `border(#2A2E48)` 계열 근사값. 구분선·라디오 테두리 역할. |
| `#3A3D58` | `colors.surfaceHigh` | 핸들바 배경. `border`보다 밝고 `surfaceHigh(#21253E)`와 동계. |
| `#FF6B6B` | `colors.destructive` | `destructive(#E85A5A)` 계열 밝은 변형. 에러/삭제 역할 동일. |
| `#4A6FFF` | `colors.accentPrimary` | **[디자인 변경 주의]** AccountDeletionScreen `nextBtn` 배경. cobalt-blue → Midnight Indigo `accentPrimary(#5A7AA8)`. 시각 변화 있음 — designer 리뷰 권장. |
| `#2A1A0F`, `#2A1A1A` | `colors.surface` | 경고/에러 배너 배경. 토큰 없음 → `surface` 대체. 배너 의미는 border·text color로 전달. |
| `#5A8A6A` | `colors.success` | muted sage green. `success(#6BCB77)`보다 어두움. 토큰 없음 → `success` 근사. 시각 변화 있음 (밝아짐). |
| `rgba(0,0,0,0.5)`, `rgba(0,0,0,0.6)` | `colors.overlay` | `overlay = #000000AA(≈67%)`. 불투명도 차이(50%·60% → 67%) 수용. |
| `#1E2140` | `colors.surface` | `useBackNavigation` 확인 다이얼로그 배경. `surface(#1A1D30)` 대비 약간 밝음(±17 hex). 동일 surface 역할 → surface 근사. |
| `#0D0F1A` (텍스트 용도) | `colors.bgPrimary` | `useBackNavigation` confirmBtn 텍스트. accent 배경 위 반전 텍스트로 사용. 라이트 모드에서 `bgPrimary = #FBF7F0` — 밝은 텍스트로 여전히 유효. |

---

## 수정 파일 목록 (37개)

### 컴포넌트 (13개)

| 파일 | hex 보유 주요 속성 |
|------|------------------|
| `apps/mobile/src/components/AlbumArtRotating.tsx` | backgroundColor, borderColor 등 |
| `apps/mobile/src/components/CompletedTrackCard.tsx` | surface, accent, text 계열 |
| `apps/mobile/src/components/DeleteTracksSheet.tsx` | surface, text, destructive |
| `apps/mobile/src/components/EmptyTrackState.tsx` | accent, text 계열 |
| `apps/mobile/src/components/MiniPlayer.tsx` | surface, accent, text + `#252940` |
| `apps/mobile/src/components/SocialAuthButtons.tsx` | surface, border, text |
| `apps/mobile/src/components/SongListItem.tsx` | accent, text, surface |
| `apps/mobile/src/components/TimerBottomSheet.tsx` | surface, accent, text |
| `apps/mobile/src/components/TrackCard.tsx` | surface, accent, text |
| `apps/mobile/src/components/TrialBadge.tsx` | accentPrimary14/20/33, accent, text |
| `apps/mobile/src/components/TrialExpiryBanner.tsx` | accent, text, surface |
| `apps/mobile/src/components/VolumeSlider.tsx` | accent, surface, text |
| `apps/mobile/src/components/WaveformVisualizer.tsx` | accent (파형 바 색상) |

### 화면 (20개)

| 파일 | 비고 |
|------|------|
| `apps/mobile/src/screens/S01SplashScreen.tsx` | bgPrimary, accent |
| `apps/mobile/src/screens/S02PrivacyScreen.tsx` | accent, surface, text, bgPrimary (외부 `StyleSheet.create` → useMemo 이관 필수. 특수처리 섹션 참조) |
| `apps/mobile/src/screens/S03OnboardingScreen.tsx` | accent, surface, text |
| `apps/mobile/src/screens/S04SignupScreen.tsx` | accent, surface, text, destructive |
| `apps/mobile/src/screens/S05LoginScreen.tsx` | accent, surface, text, destructive |
| `apps/mobile/src/screens/S06HomeScreen.tsx` | accent, surface, text, bgPrimary |
| `apps/mobile/src/screens/S07SongSelectScreen.tsx` | accent, surface, text |
| `apps/mobile/src/screens/S10RecordScreen.tsx` | accent(파형/버튼), bgPrimary, text |
| `apps/mobile/src/screens/S11PreviewScreen.tsx` | accent, surface, destructive, text |
| `apps/mobile/src/screens/S12GeneratingScreen.tsx` | bgPrimary, accent, text |
| `apps/mobile/src/screens/S13PlayScreen.tsx` | bgPrimary, accent, surface, text |
| `apps/mobile/src/screens/S14UpgradeSheet.tsx` | accent, surface, text |
| `apps/mobile/src/screens/S15SubscribeScreen.tsx` | accent, surface, text |
| `apps/mobile/src/screens/S16SettingsScreen.tsx` | accent, surface, text, destructive |
| `apps/mobile/src/screens/S17TrialExpiredScreen.tsx` | accent, surface, text |
| `apps/mobile/src/screens/RecordScreen.tsx` | accent, bgPrimary (레거시 파일) |
| `apps/mobile/src/screens/RecordModeScreen.tsx` | accent(card border), surface, text |
| `apps/mobile/src/screens/RecordGuideScreen.tsx` | accent, surface, text |
| `apps/mobile/src/screens/LegalScreen.tsx` | bgPrimary, text |
| `apps/mobile/src/screens/AccountDeletionScreen.tsx` | destructive, text, bgPrimary |

### 네비게이션 (2개)

| 파일 | 처리 방식 |
|------|----------|
| `apps/mobile/src/navigation/MainNavigator.tsx` | `HomeTabs()` + `MainNavigator()` 함수 내부에서 `useTheme` + useMemo (결정 2 참조) |
| `apps/mobile/src/navigation/AuthNavigator.tsx` | 동일 패턴 — 함수 바디에서 useTheme |

### 훅 (1개)

| 파일 | 처리 방식 |
|------|----------|
| `apps/mobile/src/hooks/useBackNavigation.tsx` | 훅이지만 내부 `StyleSheet.create` 포함 → `useMemo` 패턴 적용 필수. `useTheme` 훅 최상위 호출 후 styles useMemo로 감싸기. |

### 테스트 (1개)

| 파일 | 처리 방식 |
|------|----------|
| `apps/mobile/src/__tests__/screens/S08RecordModeScreen.test.tsx` | `vi.mock('@hooks/useTheme')` + assertion 교체 (결정 3 참조) |

---

## 공통 마이그레이션 패턴

### Before (현재 패턴)

```tsx
import { StyleSheet } from 'react-native';

export default function MyScreen() {
  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#0D0F1A' },
  btn:       { backgroundColor: '#82B090' },
  text:      { color: '#EEF0F8' },
  subText:   { color: '#7B80A0' },
});
```

### After (마이그레이션 패턴)

```tsx
import { StyleSheet } from 'react-native';
import { useMemo } from 'react';
import { useTheme } from '@hooks/useTheme';    // 또는 상대 경로

export default function MyScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => StyleSheet.create({
    container: { backgroundColor: colors.bgPrimary },
    btn:       { backgroundColor: colors.accentPrimary },
    text:      { color: colors.textPrimary },
    subText:   { color: colors.textSecondary },
  }), [colors]);

  return <View style={styles.container} />;
}
```

> **import 경로**: 파일 위치에 따라 상대 경로 또는 alias 사용.  
> - `apps/mobile/src/screens/*.tsx` → `'../hooks/useTheme'` (상대) 또는 `'@hooks/useTheme'` (alias 설정 여부 확인 후)  
> - `apps/mobile/src/components/*.tsx` → `'../hooks/useTheme'`  
> - `apps/mobile/src/navigation/*.tsx` → `'../hooks/useTheme'`  
> - 현재 tsconfig alias 설정 여부: `docs/milestones/v1/epics/epic-07-design-system/impl/02-design-token-module.md` 주의사항 — alias 미도입 가능성. `@hooks/` alias 동작 확인 후 상대 경로 fallback.

---

## 파일별 특수 처리

### WaveformVisualizer.tsx

파형 바 `Animated.View`에 `backgroundColor: '#82B090'` 사용. `waveformStyles`가 `StyleSheet.create` 외부에 선언된 경우 컴포넌트 내부 `useMemo`로 이동.

```tsx
export default function WaveformVisualizer({ ... }) {
  const { colors } = useTheme();
  const styles = useMemo(() => StyleSheet.create({
    bar: { backgroundColor: colors.accentPrimary, ... },
  }), [colors]);
  ...
}
```

### MiniPlayer.tsx

`waveformStyles`와 `styles` 두 StyleSheet가 별도 존재 (파일 확인). 둘 다 useMemo로 통합하거나 각각 별도 useMemo로 처리. `#252940` → `colors.surfaceHigh`.

```tsx
export default function MiniPlayer() {
  const { colors } = useTheme();
  const { isPlaying, currentSongKey } = usePlayerStore();

  const styles = useMemo(() => StyleSheet.create({
    container:    { backgroundColor: colors.surface, borderTopColor: colors.border },
    bar:          { flexDirection: 'row', alignItems: 'center', ... },
    songName:     { color: colors.textPrimary, ... },
    status:       { color: colors.textSecondary, ... },
    playButton:   { backgroundColor: colors.surfaceHigh, ... },
    playButtonText: { color: colors.textPrimary, ... },
  }), [colors]);

  const waveStyles = useMemo(() => StyleSheet.create({
    bar: { backgroundColor: colors.accentPrimary, ... },
  }), [colors]);
  ...
}
```

### MainNavigator.tsx

```tsx
// 변경 전: HomeTabs 외부 정적 screenOptions
// 변경 후:

function HomeTabs() {
  const { colors } = useTheme();
  const tabOptions = useMemo(() => ({
    headerShown: false,
    tabBarStyle: {
      backgroundColor: colors.bgDeep,
      borderTopColor:  colors.border,
    },
    tabBarActiveTintColor:   colors.accentPrimary,
    tabBarInactiveTintColor: colors.textSecondary,
  }), [colors]);

  return (
    <Tab.Navigator screenOptions={tabOptions}>
      <Tab.Screen name="Home" component={S06HomeScreen} options={{ title: '홈' }} />
      <Tab.Screen name="Settings" component={S16SettingsScreen} options={{ title: '설정' }} />
    </Tab.Navigator>
  );
}

export default function MainNavigator() {
  const { colors } = useTheme();
  const stackOptions = useMemo(() => ({
    headerShown: false,
    contentStyle: { backgroundColor: colors.bgPrimary },
  }), [colors]);

  return (
    <Stack.Navigator screenOptions={stackOptions}>
      {/* ... */}
    </Stack.Navigator>
  );
}
```

### AccountDeletionScreen.tsx — 미매핑 hex 처리

실제 파일에서 확인된 모든 hex:

| 원본 hex | 적용 토큰 | 위치 / 비고 |
|----------|----------|------------|
| `#0D0F1A` | `colors.bgPrimary` | container 배경 |
| `#1A1D35` | `colors.surface` | header border, footer border, deleteItemList 배경 (±5 hex 근사) |
| `#F5F5F5` | `colors.textPrimary` | backIcon, headerTitle, modalTitle 등 (밝은 off-white 근사) |
| `#2A1A0F` | `colors.surface` | subscriptionBanner 배경 (토큰 없는 amber 계열 → surface 중립 대체. border·text로 배너 구분 유지) |
| `#82B090` | `colors.accentPrimary` | subscriptionBanner border·text, radioSelected·radioDot |
| `#7B80A0` | `colors.textSecondary` | sectionSubtitle, cancelText |
| `#4A4E68` | `colors.border` | radio 미선택 테두리 (border 계열 근사) |
| `#E0E2F0` | `colors.textPrimary` | reasonLabel (밝은 off-white 근사) |
| `#4A6FFF` | `colors.accentPrimary` | **[디자인 변경]** nextBtn 배경. cobalt blue → Midnight Indigo blue. 시각 변화 있음. |
| `#FFFFFF` | `colors.textPrimary` | nextBtnText, confirmDeleteText, ActivityIndicator color (유색 배경 위 순백 → off-white 근사. 시각차 무시 수준) |
| `rgba(0,0,0,0.6)` | `colors.overlay` | modalOverlay 배경 |
| `#12152B` | `colors.bgDeep` | modalSheet 배경 |
| `#B0B4CC` | `colors.textSecondary` | modalSubtitle (중간 톤 → textSecondary 근사) |
| `#FF6B6B` | `colors.destructive` | irreversibleText, confirmDeleteBtn 배경 (destructive 계열 밝은 변형) |

```tsx
export default function AccountDeletionScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => StyleSheet.create({
    container:             { backgroundColor: colors.bgPrimary },
    header:                { borderBottomColor: colors.surface },
    backIcon:              { color: colors.textPrimary },
    headerTitle:           { color: colors.textPrimary },
    subscriptionBanner:    { backgroundColor: colors.surface, borderColor: colors.accentPrimary },
    subscriptionBannerText: { color: colors.accentPrimary },
    subscriptionBannerLink: { color: colors.accentPrimary },
    sectionTitle:          { color: colors.textPrimary },
    sectionSubtitle:       { color: colors.textSecondary },
    radio:                 { borderColor: colors.border },
    radioSelected:         { borderColor: colors.accentPrimary },
    radioDot:              { backgroundColor: colors.accentPrimary },
    reasonLabel:           { color: colors.textPrimary },
    footer:                { borderTopColor: colors.surface },
    nextBtn:               { backgroundColor: colors.accentPrimary },
    nextBtnText:           { color: colors.textPrimary },
    modalOverlay:          { backgroundColor: colors.overlay },
    modalSheet:            { backgroundColor: colors.bgDeep },
    modalTitle:            { color: colors.textPrimary },
    modalSubtitle:         { color: colors.textSecondary },
    deleteItemList:        { backgroundColor: colors.surface },
    deleteItem:            { color: colors.textPrimary },
    irreversibleText:      { color: colors.destructive },
    confirmDeleteBtn:      { backgroundColor: colors.destructive },
    confirmDeleteText:     { color: colors.textPrimary },
    cancelText:            { color: colors.textSecondary },
  }), [colors]);
  // ActivityIndicator color prop: 인라인 -> colors.textPrimary
  // <ActivityIndicator size="small" color={colors.textPrimary} />
  ...
}
```

> **주의**: `nextBtn` (`#4A6FFF` → `accentPrimary`) 시각 변화가 가장 큼. engineer가 구현 후 시각 확인 필수.

---

### S11PreviewScreen.tsx — 미매핑 hex 처리

| 원본 hex | 적용 토큰 | 위치 / 비고 |
|----------|----------|------------|
| `#0D0F1A` | `colors.bgPrimary` | container 배경 |
| `#EEF0F8` | `colors.textPrimary` | title |
| `#1A1D30` | `colors.surface` | waveformCard 배경 |
| `#8BAED4` | `colors.accentPrimary` | playIcon color, secondaryBtnText color. **steel-blue → accentPrimary(#5A7AA8) 정정** |
| `#7B80A0` | `colors.textSecondary` | timecode |
| `#2A1A1A` | `colors.surface` | errorBanner 배경 (토큰 없는 dark red-brown → surface 중립 대체. errorText로 에러 의미 전달) |
| `#FF6B6B` | `colors.destructive` | errorText |
| `#21253E` | `colors.surfaceHigh` | exhaustedBanner 배경 |
| `#5A8A6A` | `colors.success` | exhaustedText **[디자인 변경]** muted sage → success(#6BCB77). 밝아짐. |
| `#82B090` | `colors.accentPrimary` | ActivityIndicator color, primaryBtn 배경 |

`WaveformVisualizer` `color` prop 처리:

```tsx
// 변경 전
<WaveformVisualizer
  mode="static"
  levels={recordingLevels}
  color="#8BAED4"
  playbackPosition={playbackPosition}
/>

// 변경 후
const { colors } = useTheme();
...
<WaveformVisualizer
  mode="static"
  levels={recordingLevels}
  color={colors.accentPrimary}   // #8BAED4 → accentPrimary
  playbackPosition={playbackPosition}
/>
```

---

### TimerBottomSheet.tsx — 미매핑 hex 처리

| 원본 hex | 적용 토큰 | 위치 / 비고 |
|----------|----------|------------|
| `rgba(0,0,0,0.5)` | `colors.overlay` | backdrop 배경 |
| `#1A1D2E` | `colors.surface` | sheet 배경 (surface 근사값) |
| `#EEF0F8` | `colors.textPrimary` | title, optionLabel |
| `#2D3050` | `colors.border` | option borderBottomColor (border 계열 근사) |
| `#82B090` | `colors.accentPrimary` | clearLabel |

```tsx
export default function TimerBottomSheet({ visible, currentEndsAt, onClose }: TimerBottomSheetProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => StyleSheet.create({
    backdrop:     { backgroundColor: colors.overlay },
    sheet:        { backgroundColor: colors.surface },
    title:        { color: colors.textPrimary },
    option:       { borderBottomColor: colors.border },
    optionLabel:  { color: colors.textPrimary },
    clearOption:  {},
    clearLabel:   { color: colors.accentPrimary },
  }), [colors]);
  ...
}
```

---

### DeleteTracksSheet.tsx — 미매핑 hex 처리

| 원본 hex | 적용 토큰 | 위치 / 비고 |
|----------|----------|------------|
| `rgba(0,0,0,0.5)` | `colors.overlay` | backdrop 배경 |
| `#1A1D2E` | `colors.surface` | sheet 배경 (surface 근사값) |
| `#3A3D58` | `colors.surfaceHigh` | handle bar 배경 (토큰 없는 mid-purple → surfaceHigh 근사) |
| `#EEF0F8` | `colors.textPrimary` | title, trackName |
| `#2A2E48` | `colors.border` | row borderBottomColor |
| `#5A8A6A` | `colors.success` | deleteBtn 텍스트 **[디자인 변경]** muted sage → success(#6BCB77). 밝아짐. |
| `#7B80A0` | `colors.textSecondary` | emptyText |
| `#21253E` | `colors.surfaceHigh` | deleteAllBtn 배경 |
| `#FF6B6B` | `colors.destructive` | deleteAllText |

```tsx
export function DeleteTracksSheet({ tracks, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => StyleSheet.create({
    backdrop:      { backgroundColor: colors.overlay },
    sheet:         { backgroundColor: colors.surface },
    handle:        { backgroundColor: colors.surfaceHigh },
    title:         { color: colors.textPrimary },
    row:           { borderBottomColor: colors.border },
    trackName:     { color: colors.textPrimary },
    deleteBtn:     { color: colors.success },
    emptyText:     { color: colors.textSecondary },
    deleteAllBtn:  { backgroundColor: colors.surfaceHigh },
    deleteAllText: { color: colors.destructive },
  }), [colors]);
  ...
}
```

---

### useBackNavigation.tsx — 훅 내부 StyleSheet

훅이지만 컴포넌트 수준 JSX(Modal + styles)를 포함하므로 `useMemo` 패턴 동일 적용.

실제 파일 hex 전체:

| 원본 hex | 적용 토큰 | 위치 |
|----------|----------|------|
| `rgba(0,0,0,0.6)` | `colors.overlay` | overlay 배경 |
| `#1E2140` | `colors.surface` | dialog 배경 (surface 근사) |
| `#EEF0F8` | `colors.textPrimary` | dialogTitle, cancelText |
| `#7B80A0` | `colors.textSecondary` | dialogBody, cancelBtn borderColor |
| `#82B090` | `colors.accentPrimary` | confirmBtn backgroundColor |
| `#0D0F1A` | `colors.bgPrimary` | confirmText (accent 배경 위 반전 텍스트) |

```tsx
export function useBackNavigation({ entitlement, isPlaying }: UseBackNavigationParams) {
  const { colors } = useTheme();
  // ... (기존 로직) ...

  const styles = useMemo(() => StyleSheet.create({
    overlay:      { backgroundColor: colors.overlay, ... },
    dialog:       { backgroundColor: colors.surface, ... },
    dialogTitle:  { color: colors.textPrimary, ... },
    dialogBody:   { color: colors.textSecondary, ... },
    cancelBtn:    { borderColor: colors.textSecondary, ... },
    cancelText:   { color: colors.textPrimary, ... },
    confirmBtn:   { backgroundColor: colors.accentPrimary, ... },
    confirmText:  { color: colors.bgPrimary, ... },  // accent 배경 위 반전 텍스트
  }), [colors]);

  const confirmDialog = ( /* 기존 JSX — styles 참조만 교체 */ );
  return { handleBack, confirmDialog };
}
```

> **주의**: `useBackNavigation`는 훅 내부에서 `StyleSheet`를 사용하므로 `useMemo`를 훅 바디 최상위에서 호출해야 React 훅 규칙(조건부 호출 금지)을 지킨다.

---

### S02PrivacyScreen.tsx — 외부 StyleSheet → useMemo 이관

**[Critical 수정]** 기존 계획의 "이미 토큰화 완료" 선언은 사실과 다름. 실제 파일(line 113)에 `StyleSheet.create` 외부 정의가 잔존하며, 아래 hex가 마이그레이션 대상임.

| 원본 hex | 적용 토큰 | 위치 (line) |
|----------|----------|------------|
| `#82B090` | `colors.accentPrimary` | 116 (title), 120 (bullet), 130 (checkboxChecked x2), 135 (primaryBtn) |
| `#8BAED4` | `colors.accentPrimary` | 124 (link) — steel-blue → accentPrimary 정정 (매핑 테이블 일치) |
| `#0D0F1A` | `colors.bgPrimary` | 114 (container), 131 (checkmark), 139 (primaryBtnText — accent 배경 위 반전 텍스트) |
| `#1A1D30` | `colors.surface` | 118 (card) |
| `#7B80A0` | `colors.textSecondary` | 117 (subtitle), 123 (itemDesc), 128 (checkbox borderColor), 140 (primaryBtnTextDisabled), 142 (secondaryBtnText) |
| `#EEF0F8` | `colors.textPrimary` | 122 (itemTitle), 132 (checkLabel) |
| `#2A2E48` | `colors.border` | 138 (primaryBtnDisabled backgroundColor) |

```tsx
export default function S02PrivacyScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => StyleSheet.create({
    container:              { flex: 1, backgroundColor: colors.bgPrimary },
    scroll:                 { padding: 24, paddingBottom: 8 },
    title:                  { fontSize: 22, fontWeight: '600', color: colors.accentPrimary, marginBottom: 8 },
    subtitle:               { fontSize: 14, color: colors.textSecondary, marginBottom: 24, lineHeight: 20 },
    card:                   { backgroundColor: colors.surface, borderRadius: 16, padding: 20, marginBottom: 16 },
    row:                    { flexDirection: 'row', marginBottom: 14 },
    bullet:                 { color: colors.accentPrimary, marginRight: 8, marginTop: 2 },
    rowContent:             { flex: 1 },
    itemTitle:              { color: colors.textPrimary, fontSize: 14, fontWeight: '500', marginBottom: 2 },
    itemDesc:               { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
    link:                   { color: colors.accentPrimary, fontSize: 13, marginBottom: 24 },
    checkRow:               { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    checkbox:               {
      width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
      borderColor: colors.textSecondary, marginRight: 12, alignItems: 'center', justifyContent: 'center',
    },
    checkboxChecked:        { backgroundColor: colors.accentPrimary, borderColor: colors.accentPrimary },
    checkmark:              { color: colors.bgPrimary, fontSize: 13, fontWeight: '700' },
    checkLabel:             { color: colors.textPrimary, fontSize: 14, flex: 1 },
    footer:                 { padding: 24, paddingTop: 8 },
    primaryBtn:             {
      backgroundColor: colors.accentPrimary, height: 56, borderRadius: 28,
      alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    },
    primaryBtnDisabled:     { backgroundColor: colors.border },
    primaryBtnText:         { color: colors.bgPrimary, fontSize: 16, fontWeight: '600' },
    primaryBtnTextDisabled: { color: colors.textSecondary },
    secondaryBtn:           { alignItems: 'center', padding: 12 },
    secondaryBtnText:       { color: colors.textSecondary, fontSize: 14 },
  }), [colors]);
  ...
}
```

> **참고**: `checkmark`의 `colors.bgPrimary`는 accent 배경 위 반전 텍스트. 라이트 모드에서는 `bgPrimary = #FBF7F0`(크림 계열)로 여전히 밝은 색상 → 대비 유지 확인 필요.

---

### RecordModeScreen.tsx — pressed 스타일

현재 카드 pressed 상태 borderColor가 `'#82B090'`. 마이그레이션 후 `colors.accentPrimary` 사용.

```tsx
// pressedStyle을 useMemo 내부에 포함
const styles = useMemo(() => StyleSheet.create({
  card:        { borderWidth: 1, borderColor: 'transparent', ... },
  cardPressed: { borderColor: colors.accentPrimary },   // ← 토큰 교체
  ...
}), [colors]);
```

### S08RecordModeScreen.test.tsx — 전체 수정 패턴

```ts
// @theme/ alias tsconfig/babel에 미정의 → 상대 경로 사용
// 테스트 파일 위치: src/__tests__/screens/ → theme/tokens 상대 경로: ../../theme/tokens
import { darkColors } from '../../theme/tokens';

const mockColors = darkColors;

// 기존 mock 블록들 이후, renderScreen 이전에 추가
vi.mock('@hooks/useTheme', () => ({
  useTheme: () => ({ colors: mockColors, isDark: true }),
}));

// pressed 스타일 assertion 수정 (기존: '#82B090')
const hasActiveStyle = styleArray.some(
  (s: any) => s && typeof s === 'object' && s.borderColor === mockColors.accentPrimary
)
```

`vi.mock` 호출 위치: 파일 최상단 mock 블록 영역에 추가 (다른 `vi.mock` 호출과 동일 위치).

---

## 구현 순서 권고

```
1. components/ 13개 → 단순 hex 교체 + useMemo 패턴
2. screens/ 20개 → 동일 패턴 (S02PrivacyScreen은 이미 분석된 예시 참조)
3. navigation/MainNavigator.tsx → 결정 2 패턴 적용
4. navigation/AuthNavigator.tsx → 동일 패턴
5. hooks/useBackNavigation.tsx → useTheme 직접 호출 (StyleSheet 사용 여부 확인 후)
6. __tests__/screens/S08RecordModeScreen.test.tsx → mock 추가 + assertion 수정
```

> **병렬 작업 주의**: 각 파일은 독립적으로 변경 가능. 단, 테스트 파일(6번)은 RecordModeScreen 변경 완료 후 실행해야 FAIL/PASS 판단 가능.

---

## 검증 기준

```bash
# 1. hex 리터럴 잔존 확인 (0개 기대) — 전수 조사된 모든 패턴 포함
grep -riE "#82B090|#82b090|#8BAED4|#8baed4|\
#4A6FFF|#2A1A0F|#2A1A1A|#5A8A6A|#1A1D2E|#1A1D35|\
#F5F5F5|#E0E2F0|#B0B4CC|#2D3050|#3A3D58|#4A4E68|\
#FF6B6B|#252940" \
  apps/mobile/src/ --exclude-dir=__tests__ | wc -l
# → 0

# 2. useTheme 사용 파일 수 확인 (32개+ 기대)
grep -ri "useTheme()" apps/mobile/src/screens/ apps/mobile/src/components/ | wc -l
# → 32+

# 3. 테스트 통과
cd apps/mobile && npx vitest run
# → 전체 통과 (S08RecordModeScreen 포함)

# 4. TypeScript 컴파일
npx tsc --noEmit
# → 오류 0개
```

---

## 주의사항

1. **`Colors` 별칭 유지**: `apps/mobile/src/theme/tokens.ts`의 `export const Colors = darkColors`는 **삭제하지 않는다**. 이번 impl 범위 밖 (점진 마이그레이션 원칙).

2. **`#252940` 처리**: `tokens.ts`에 없음 → `surfaceHigh(#21253E)` 근사 매핑. 시각 차이 무시 허용. 대안으로 `colors.border` 고려(#2A2E48). 파일별로 컨텍스트 보고 더 가까운 쪽 선택.

3. **`useMemo` import**: `import { useMemo } from 'react'` — 기존 파일에 이미 React import가 있을 경우 구조 분해 추가만.

4. **테스트 결과 변경 예상**: `S08RecordModeScreen.test.tsx`의 pressed 스타일 테스트가 마이그레이션 전에는 PASS(`#82B090` 비교), 마이그레이션 후 mock 없이 실행하면 FAIL. mock 추가 후 다시 PASS가 최종 상태.

5. **alias 정의 현황** (tsconfig.json + babel.config.js 직접 확인):
   - `@hooks/*` → **정의됨** ✅ → `import { useTheme } from '@hooks/useTheme'` 사용 가능
   - `@theme/*` → **정의 안 됨** ❌ → **테스트 파일에서 반드시 상대 경로 사용**
     ```ts
     // src/__tests__/screens/*.test.tsx 기준
     import { darkColors } from '../../theme/tokens';  // ← 유일한 정답
     ```
   - `@lib/*` → tsconfig에만 정의, babel에 없음 → 런타임 위험. 사용 금지.

6. **design: required 이유 명시** — accentPrimary가 `#82B090`(warm sage green)에서 `#5A7AA8`(steel blue/indigo)으로 실제 변경됨. 버튼, 파형 바, 선택 상태 하이라이트, 탭바 active 색상 등 모든 accent 영역이 육안으로 다름.

---

## Design Ref

`docs/ux-flow.md` § 0 디자인 가이드 참조:
- 엑센트 Primary: `#82B090` (Sage Mist) — *단, PR #106에서 Midnight Indigo `#5A7AA8`로 교체됨. tokens.ts가 진실 공급원.*
- 배경: `#0D0F1A` → `colors.bgPrimary`
- 서피스: `#1A1D30` → `colors.surface`
- 탭바 배경: `#12152B` → `colors.bgDeep`

> engineer는 `tokens.ts`의 `darkColors` 값을 최종 기준으로 사용. `ux-flow.md`의 hex는 구설계 기준이며 PR #106으로 override됨.
