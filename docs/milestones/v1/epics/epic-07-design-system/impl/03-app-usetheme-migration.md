---
depth: std
---
# impl-03 — useTheme 훅 마이그레이션 (Issue #107)
## 개정 이력
| 버전 | 일자 | 요약 |
|---|---|---|
| v1.0 | 2026-04-26 | 초안 — Pattern A/B/C 구조 버그 분석 |
| v2.0 | 2026-04-27 | 개정 — grep 실증으로 현황 정확화 + 잔여 hex literal 치환 절 추가 |

## 컨텍스트

PR #106(`feat(mobile): dual dark/light theme`)으로 `useTheme` 인프라가 구축됐다.
이후 32개 화면·컴포넌트에 `useTheme` + `useMemo(() => StyleSheet.create({...}), [colors])` 패턴이 일괄 삽입됐으나 **코드 생성 과정에서 3종의 구조적 버그**가 발생했다.

**현 상태 (2026-04-27 grep 실증)**:
- 모든 대상 파일이 `useTheme`를 import하며 `useMemo` 구조는 존재
- **Pattern A (파라미터 블록 내 useMemo 삽입)**: 14개 파일 잔존 — 컴파일 오류 또는 런타임 undefined styles
- Pattern A **이미 수정 완료**: `TimerBottomSheet`, `SongListItem`, `WaveformVisualizer`
- **Pattern B (서브컴포넌트 렉시컬 스코프 오류)**: `MiniPlayer`, `S13PlayScreen` 잔존
- **Pattern C (네비게이터 스코프 오류)**: `MainNavigator` 잔존
- **잔여 hex literal**: 8개 파일에 old hex / rgba 리터럴 잔존 (§5 참조)

---

## 문제 분류

### Pattern A — 함수 파라미터 내부에 useMemo 삽입 (17개 파일 + 1개 훅)

props를 가지는 컴포넌트에서 `useMemo(() => StyleSheet.create({...}), [colors])` 블록이
함수 본문이 아닌 **파라미터 destructuring 블록 안에** 삽입됨.
결과: TypeScript 컴파일 오류 + 런타임 undefined 스타일.

```tsx
// ❌ 현재 (broken) — useMemo가 { ... } 파라미터 블록 안에 있음
export function MyScreen({
  const { colors } = useTheme();
  const styles = useMemo(() => StyleSheet.create({
    container: { backgroundColor: colors.bgPrimary },
  }), [colors]); navigation, route }: Props) {
  // 실제 함수 본문
}

// ✅ 목표 — useMemo를 함수 본문 첫 줄에 위치
export function MyScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => StyleSheet.create({
    container: { backgroundColor: colors.bgPrimary },
  }), [colors]);
  // 실제 함수 본문
}
```

**영향 파일 (14개) — grep 실증 결과, 각 파일의 복원 파라미터**:

| 파일 | 복원 파라미터 (grep으로 확인된 값) | 비고 |
|---|---|---|
| `src/screens/S07SongSelectScreen.tsx` | `navigation }: Props` | line 28 확인 |
| `src/screens/RecordModeScreen.tsx` | `navigation }: Props` | line 62 확인 |
| `src/screens/RecordGuideScreen.tsx` | `navigation, route }: Props` | line 126 확인. **useMemo 2개** 삽입됨 (line 89, 126) — 둘 다 본문으로 이동 |
| `src/screens/S10RecordScreen.tsx` | `navigation, route }: Props` | line 145 확인 |
| `src/screens/S11PreviewScreen.tsx` | `navigation }: Props` | line 129 확인 |
| `src/screens/S12GeneratingScreen.tsx` | `navigation, route }: Props` | line 61 확인 |
| `src/screens/S13PlayScreen.tsx` | `route }: PlayScreenProps` | line 273 확인. **Pattern B 동시 적용** |
| `src/screens/S14UpgradeSheet.tsx` | `route, navigation }: UpgradeSheetProps` | line 249 확인. **hex literal 동시 수정** |
| `src/screens/S15SubscribeScreen.tsx` | `navigation }: SubscribeScreenProps` | line 271 확인. **hex literal 동시 수정** |
| `src/screens/S16SettingsScreen.tsx` | `navigation }: S16SettingsScreenProps` | line 328 확인. **hex literal 동시 수정** |
| `src/screens/S17TrialExpiredScreen.tsx` | `navigation }: TrialExpiredScreenProps` | line 180 확인. **hex literal 동시 수정** |
| `src/screens/RecordScreen.tsx` | `navigation, route }: Props` | line 145 확인. **hex literal 동시 수정** |
| `src/hooks/useBackNavigation.tsx` | `entitlement, isPlaying }: UseBackNavigationParams` | 멀티라인 파라미터 — line 105‒107 확인. **hex literal(overlay) 동시 수정** |
| `src/components/VolumeSlider.tsx` | `value, disabled, onChange }: VolumeSliderProps` | line 62 확인 |

**이미 수정 완료 (수정 제외)**:
- `src/components/TimerBottomSheet.tsx` ✅ — 파라미터 별개 줄 배치 확인 (rgba literal만 남음 → §5)
- `src/components/SongListItem.tsx` ✅ — 파라미터 별개 줄 배치 확인
- `src/components/WaveformVisualizer.tsx` ✅ — 파라미터 별개 줄 배치 확인

> **수정 절차 (각 파일 공통)**:
> 1. `function ComponentName({` 다음 줄부터 마지막 `}), [colors]);` 전까지의 `const { colors } = useTheme()` + `const styles = useMemo(...)` 블록을 **선택 저장**
> 2. 마지막 `}), [colors]); originalParams }: PropsType) {` 라인을 `{ originalParams }: PropsType) {` 로 교체 (선행 `}), [colors]);` 제거)
> 3. 저장한 훅 + useMemo 블록을 함수 본문 첫 줄(`): PropsType) {` 바로 다음)에 삽입
> 4. `function ComponentName({` 헤더는 그대로 유지

> **RecordGuideScreen 특이사항**: `}), [colors]);`가 line 89(styles), line 126(modal) 두 개 존재.
> 두 useMemo 모두 파라미터 블록에 들어 있으므로 둘 다 함수 본문으로 이동.
> 본문 순서: `useTheme()` → `styles useMemo` → `modal useMemo` → 기존 로직.

> **useBackNavigation 특이사항**: 파라미터가 멀티라인(`entitlement,` / `isPlaying,` / `}: UseBackNavigationParams)`)으로 분산. line 104‒107의 `}), [colors]);` 뒤 3줄을 모두 파라미터로 복원.

---

### Pattern B — 서브컴포넌트가 부모 스코프의 styles를 직접 참조 (2개 파일)

부모 컴포넌트 함수 안에서 정의된 `styles`/`waveformStyles`를
**파일 상단에 정의된 내부 서브컴포넌트 함수**가 직접 참조. 렉시컬 스코프 위반 → ReferenceError.

#### B-1: `src/components/MiniPlayer.tsx`

```
함수 선언 순서:
  1. function MiniWaveform({ isPlaying })   ← 부모 외부에 정의
  2. function MiniPlayer()
       const waveformStyles = useMemo(...)  ← MiniWaveform이 이걸 참조함 (오류)
```

**수정 방향**: `MiniWaveform`이 자체적으로 `useTheme()`를 호출하고 내부 `useMemo`로 스타일 생성.

```tsx
// ✅ 수정 후
function MiniWaveform({ isPlaying }: { isPlaying: boolean }) {
  const { colors } = useTheme();
  const localStyles = useMemo(() => StyleSheet.create({
    container: { flexDirection: 'row', alignItems: 'center', marginRight: 12 },
    bar: {
      width: 3, borderRadius: 2,
      backgroundColor: colors.accentPrimary,
      marginRight: 3,
    },
  }), [colors]);

  // ... 이후 localStyles 사용
  return (
    <View style={localStyles.container}>
      {[bar0, bar1, bar2].map((b, i) => (
        <Animated.View key={i} style={[localStyles.bar, ...]} />
      ))}
    </View>
  );
}
```

`MiniPlayer` 본체에서는 `waveformStyles` 정의 및 참조 제거.

#### B-2: `src/screens/S13PlayScreen.tsx`

```
함수 선언 순서:
  1. function TimerRemainingLabel({ endsAt })   ← styles.timerLabel 참조
  2. function PlayPauseButton({ ... })           ← styles.playPauseBtn 등 참조
  3. function TimerButton({ ... })               ← styles.timerBtn 등 참조
  4. function Header({ ... })                    ← styles.header 등 참조
  5. export default function S13PlayScreen(...)
       const styles = useMemo(...)               ← 실제 styles 정의 (위 함수들이 참조 불가)
```

**수정 방향**: 4개 서브컴포넌트를 각각 독립적으로 만들거나, `colors: ColorTokens` prop을 주입받아 내부에서 스타일 생성.
`colors` prop 주입 방식 채택 (가장 적은 boilerplate, 서브컴포넌트가 단순 render 목적임).

```tsx
// ✅ TimerRemainingLabel 수정 후
function TimerRemainingLabel({ endsAt, colors }: { endsAt: number; colors: ColorTokens }) {
  const localStyles = useMemo(() => StyleSheet.create({
    timerLabel: {
      color: colors.accentPrimary,
      fontSize: 15,
      fontVariant: ['tabular-nums'],
    },
  }), [colors]);

  return <Text style={localStyles.timerLabel}>{formatDuration(remaining)}</Text>;
}

// ✅ PlayPauseButton 수정 후
function PlayPauseButton({
  isPlaying, onPress, colors,
}: { isPlaying: boolean; onPress: () => void; colors: ColorTokens }) {
  const localStyles = useMemo(() => StyleSheet.create({
    playPauseBtn: {
      height: 56, width: 120, backgroundColor: colors.accentPrimary,
      borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginBottom: 24,
    },
    playPauseBtnText: { color: colors.bgPrimary, fontSize: 24 },
  }), [colors]);
  // ...
}

// ✅ TimerButton 수정 후
function TimerButton({
  onPress, colors,
}: { onPress: () => void; colors: ColorTokens }) {
  const localStyles = useMemo(() => StyleSheet.create({
    timerBtn: {
      width: 48, height: 48,
      justifyContent: 'center', alignItems: 'center',
    },
    timerBtnText: { color: colors.textPrimary, fontSize: 22 },
  }), [colors]);
  return (
    <Pressable style={localStyles.timerBtn} onPress={onPress}
      accessibilityLabel="수면 타이머 설정" accessibilityRole="button">
      <Text style={localStyles.timerBtnText}>⏱</Text>
    </Pressable>
  );
}

// ✅ Header 수정 후
function Header({
  onBack, rightAction, colors,
}: {
  onBack: () => void;
  rightAction?: React.ReactNode;
  colors: ColorTokens;
}) {
  const localStyles = useMemo(() => StyleSheet.create({
    header: {
      width: '100%', flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, minHeight: 56,
    },
    headerBackBtn: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
    headerBackText: { color: colors.textPrimary, fontSize: 22 },
    headerRight: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  }), [colors]);
  return (
    <View style={localStyles.header}>
      <Pressable style={localStyles.headerBackBtn} onPress={onBack}
        accessibilityLabel="뒤로가기" accessibilityRole="button"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={localStyles.headerBackText}>{'<'}</Text>
      </Pressable>
      <View style={localStyles.headerRight}>{rightAction}</View>
    </View>
  );
}
```

`S13PlayScreen` 본체에서 서브컴포넌트 호출 시 `colors` prop 추가:
```tsx
<PlayPauseButton isPlaying={isPlaying} onPress={handlePlayPause} colors={colors} />
<TimerRemainingLabel endsAt={timerEndsAt} colors={colors} />
<TimerButton onPress={() => setTimerSheetVisible(true)} colors={colors} />
<Header onBack={handleBack} rightAction={...} colors={colors} />
```

> `import type { ColorTokens } from '@theme/tokens'` 추가 필요.

---

### Pattern C — 네비게이터 서브함수 colors 스코프 오류 (1개 파일)

#### `src/navigation/MainNavigator.tsx`

```tsx
// ❌ 현재 — HomeTabs에서 colors를 참조하지만 colors는 MainNavigator 스코프에만 있음
function HomeTabs() {
  return (
    <Tab.Navigator screenOptions={{
      tabBarStyle: { backgroundColor: colors.bgDeep, ... },  // ← ReferenceError
    }}>
```

**수정 방향**: `HomeTabs` 내부에서 `useTheme()` 직접 호출.

```tsx
// ✅ 수정 후
function HomeTabs() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator screenOptions={{
      tabBarStyle: {
        backgroundColor: colors.bgDeep,
        borderTopColor: colors.border,
      },
      tabBarActiveTintColor: colors.accentPrimary,
      tabBarInactiveTintColor: colors.textSecondary,
    }}>
      <Tab.Screen name="Home" component={S06HomeScreen} options={{ title: '홈' }} />
      <Tab.Screen name="Settings" component={S16SettingsScreen} options={{ title: '설정' }} />
    </Tab.Navigator>
  );
}
```

---

## §4 수정 파일 전체 목록

| 파일 | Pattern | 핵심 작업 |
|---|---|---|
| `src/screens/S07SongSelectScreen.tsx` | A | 함수 시그니처 정상화 |
| `src/screens/RecordModeScreen.tsx` | A | 함수 시그니처 정상화 |
| `src/screens/RecordGuideScreen.tsx` | A | useMemo 2개 본문 이동 |
| `src/screens/S10RecordScreen.tsx` | A + hex | 시그니처 정상화 + `#FF4444` → `colors.destructive` |
| `src/screens/S11PreviewScreen.tsx` | A | 함수 시그니처 정상화 |
| `src/screens/S12GeneratingScreen.tsx` | A | 함수 시그니처 정상화 |
| `src/screens/S13PlayScreen.tsx` | A + B | 시그니처 정상화 + 서브컴포넌트 colors prop 주입 |
| `src/screens/S14UpgradeSheet.tsx` | A + hex | 시그니처 정상화 + `#A0A5C0` → `colors.textSecondary` |
| `src/screens/S15SubscribeScreen.tsx` | A + hex | 시그니처 정상화 + 3개 literal → 토큰 (§5 참조) |
| `src/screens/S16SettingsScreen.tsx` | A + hex | 시그니처 정상화 + `#FF5C5C` → `colors.destructive` |
| `src/screens/S17TrialExpiredScreen.tsx` | A + hex | 시그니처 정상화 + `#A0A5C0` → `colors.textSecondary` |
| `src/screens/RecordScreen.tsx` | A + hex | 시그니처 정상화 + `#FF4444` → `colors.destructive` |
| `src/hooks/useBackNavigation.tsx` | A + hex | 시그니처 정상화 + `rgba(0,0,0,0.6)` → `colors.overlay` |
| `src/components/VolumeSlider.tsx` | A | 함수 시그니처 정상화 |
| `src/components/MiniPlayer.tsx` | B | MiniWaveform 독립 useTheme 호출 |
| `src/navigation/MainNavigator.tsx` | C | HomeTabs에 useTheme() 추가 |
| `src/components/TimerBottomSheet.tsx` | hex only | `rgba(0,0,0,0.5)` → `colors.overlay` |
| `src/components/DeleteTracksSheet.tsx` | hex only | `rgba(0,0,0,0.5)` → `colors.overlay` |
| `src/components/TrialBadge.tsx` | hex only | `rgba(130,176,144,...)` → accentPrimary 파생 토큰 (§5) |
| `src/components/TrialExpiryBanner.tsx` | hex only | `rgba(130,176,144,...)` → accentPrimary 파생 토큰 (§5) |
| `src/components/CompletedTrackCard.tsx` | hex only | `rgba(139,174,212,0.15)` → `colors.accentPrimary14` (§5) |
| `src/screens/S04SignupScreen.tsx` | hex only | `#E05F5F` → `colors.destructive` |
| `src/screens/S05LoginScreen.tsx` | hex only | `#E05F5F` → `colors.destructive` |

**수정 제외**:
- `src/components/BannerAdSlot.tsx` — color 토큰 사용 없음. 현재 상태 유지.
- `src/screens/AccountDeletionScreen.tsx` — `#FFFFFF`는 ActivityIndicator 컬러. 흰색 스피너는 배경색 무관 의도적 선택 → 토큰 불필요, 유지.
- `src/theme/tokens.ts` — 토큰 정의 파일, hex 값 자체가 토큰. 수정 대상 아님.

---

---

## §5 잔여 Hex Literal 치환 매핑

Pattern A/B/C 수정과 **동시에** 아래 리터럴을 토큰으로 교체한다.

### 5-1 단순 치환 (1:1 토큰 매핑)

| 리터럴 | 대상 토큰 | 근거 |
|---|---|---|
| `#FF4444`, `#FF5C5C`, `#E05F5F`, `#E85A5A` | `colors.destructive` | 에러/경고 색상. `darkColors.destructive = '#E85A5A'` |
| `rgba(0, 0, 0, 0.5)` | `colors.overlay` | backdrop. `darkColors.overlay = '#000000AA'(≈67%)`. 0.5→0.67 약간 진해지나 수용 범위 |
| `rgba(0, 0, 0, 0.6)` | `colors.overlay` | 동일 |

### 5-2 근사 치환 (비표준 → 최근사 토큰)

| 리터럴 | 파일 | 대상 토큰 | 근거 |
|---|---|---|---|
| `#A0A5C0` | S14, S15, S17 | `colors.textSecondary` | 토큰표에 없는 중간 톤. `textSecondary = '#7B80A0'`(약간 어둡지만 동일 용도 — 보조 텍스트). Light 모드에서 `#6B6055`로 자동 전환되므로 토큰화 필수. |
| `#1E2340` | S15 | `colors.surface` | `surface = '#1A1D30'`와 4포인트 차이. 동일 서피스 레이어 목적. |
| `rgba(30, 34, 60, 0.95)` | S15 | `colors.surface` | 반투명 서피스 오버레이. 불투명 surface로 교체 시 시각 차이 미미. 라이트 모드 대응 필요. |

### 5-3 Old accentPrimary rgba 치환 (TrialBadge, TrialExpiryBanner)

이전 `accentPrimary = '#82B090'`(Sage Mist) 기반의 rgba 값. 현재 토큰 `accentPrimary = '#5A7AA8'`(Midnight Indigo)으로 변경됐으므로 **파생 토큰으로 교체**해야 색상이 자동으로 테마에 따라 변한다.

| 리터럴 | 대상 토큰 | 근거 |
|---|---|---|
| `rgba(130, 176, 144, 0.15)` | `colors.accentPrimary14` | ≈14% 불투명도. `accentPrimary14 = '#5A7AA824'` |
| `rgba(130, 176, 144, 0.1)` | `colors.accentPrimary14` | 10% ≈ 14% (가장 가까운 토큰) |
| `rgba(130, 176, 144, 0.25)` | `colors.accentPrimary20` | 25% ≈ 20%. `accentPrimary20 = '#5A7AA833'` |
| `rgba(130, 176, 144, 0.3)` | `colors.accentPrimary33` | 30% ≈ 33%. `accentPrimary33 = '#5A7AA855'` |

### 5-4 accentSecondary 파생 처리 (CompletedTrackCard)

| 리터럴 | 파일 | 대상 토큰 | 근거 |
|---|---|---|---|
| `rgba(139, 174, 212, 0.15)` | CompletedTrackCard | `colors.accentPrimary14` | 구 `accentSecondary(#8BAED4)` 15% 투명도. `accentSecondary14` 토큰 부재 — 의미상 가장 유사한 파생 강조 토큰으로 대체. 완성 카드 배경은 accentPrimary 계열이 더 자연스러움. |

> **결정 근거**: accentSecondary 파생 토큰 신설은 이 PR의 범위를 벗어남. 컴포넌트 용도(완성 알림)를 감안하면 accentPrimary 계열이 의미적으로도 적합.

---

## §6 인터페이스 정의

### ColorTokens prop injection (Pattern B용)

```tsx
import type { ColorTokens } from '@theme/tokens';

// S13PlayScreen 내 서브컴포넌트 공통 추가 prop
interface WithColors {
  colors: ColorTokens;
}
```

### 정상 패턴 레퍼런스 (이미 올바른 파일)

```tsx
// ✅ 레퍼런스: S01SplashScreen.tsx (props 없는 컴포넌트)
export default function S01SplashScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
  }), [colors]);
  // ...
}

// ✅ 레퍼런스: S06HomeScreen.tsx (props 있는 컴포넌트 — 올바른 예)
export default function S06HomeScreen() {  // props 없으므로 정상
  const { colors } = useTheme();
  const styles = useMemo(() => StyleSheet.create({...}), [colors]);
  // ...
}
```

---

## §7 검증

수정 완료 후 아래 커맨드로 잔여 hex 및 패턴 오류 확인.

```bash
# 1) Pattern A 잔여 확인 — 파라미터 블록 내 useMemo (0개 기대)
# 함수 선언 `({` 뒤 바로 다음 줄에 `const { colors }` 또는 `const styles` 패턴
rg -n "\}.*\[colors\]\);.*\}.*Props\)" \
  apps/mobile/src/screens apps/mobile/src/components apps/mobile/src/hooks \
  --glob "*.tsx" --glob "*.ts"

# 2) 잔여 old hex 리터럴 (0개 기대)
rg -i "#82B090|#82b090|#8BAED4|#8baed4|#A0A5C0|#1E2340|#FF4444|#FF5C5C|#E05F5F|rgba\(130|rgba\(139" \
  apps/mobile/src/screens apps/mobile/src/components apps/mobile/src/hooks \
  --glob "*.tsx" --glob "*.ts"

# 3) useTheme 미적용 파일 (StyleSheet.create 있는데 useTheme 없는 파일 — 0개 기대)
grep -rL "useTheme" apps/mobile/src/screens apps/mobile/src/components \
  --include="*.tsx" | xargs grep -l "StyleSheet.create" 2>/dev/null

# 4) 전체 테스트
cd apps/mobile && npx vitest run
```

---

## §8 주의사항

### 테스트 파일 assertion 유효성 확인

`src/__tests__/screens/S08RecordModeScreen.test.tsx` 라인 252:
```tsx
const hasActiveStyle = styleArray.some(
  (s: any) => s && typeof s === 'object' && s.borderColor === mockColors.accentPrimary
)
```
`mockColors = darkColors`, `darkColors.accentPrimary = '#5A7AA8'` (Midnight Indigo 테마).
`RecordModeScreen`의 `cardPressed` 스타일이 `borderColor: colors.accentPrimary`를 사용하므로
`useTheme` 모킹 시 `mockColors.accentPrimary`와 일치. **테스트 파일 수정 불필요**.

### Pattern A 수정 시 파라미터 복원 주의

각 파일의 현재 파라미터는 `}), [colors]); ` 뒤에 남아있다. 예:
```
}), [colors]); navigation, route }: NativeStackScreenProps<MainStackParamList, 'SongSelect'>) {
```
→ 파라미터: `{ navigation, route }: NativeStackScreenProps<MainStackParamList, 'SongSelect'>`

engineer는 각 파일의 해당 줄을 먼저 확인하고 파라미터를 복원한 뒤 시그니처를 수정한다.

### 모듈 경계

- `src/hooks/useBackNavigation.tsx` — agent-boundary 훅이 `hooks/` 경로 Read를 차단하는 경우 `Grep` 도구로 내용 확인 가능.
- `BannerAdSlot.tsx` — 수정 대상 아님, 변경 금지.
- `src/theme/tokens.ts` — `Colors = darkColors` alias 유지 (기존 하위호환 코드 보호). 토큰 추가 없음 (§5 결정 근거).
- `src/__tests__/theme/tokens.test.ts` — tokens.ts 값 테스트. 이번 PR에서 토큰 값 변경 없으므로 **테스트 파일 수정 불필요**.

### useMemo 의존성 배열

styles 내에서 `colors` 외 다른 props/state를 사용하는 경우, `[colors]` 의존성에 해당 값도 추가.
예: `useMemo(() => StyleSheet.create({...}), [colors, someOtherProp])`.

---

## Design Ref

design-handoff.md 미제공. UX Flow 참조: `docs/ux-flow.md`.
화면 색상 토큰 매핑은 `docs/ux-flow.md §0 컬러 방향` + `apps/mobile/src/theme/tokens.ts` 기준.
이 impl은 레이아웃·UI 변경 없음 (구조 버그 수정 only). 스크린샷 diff 없음.
