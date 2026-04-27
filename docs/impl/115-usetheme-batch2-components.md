---
depth: std
---

# impl #115 — useTheme 마이그레이션 Batch 2: 컴포넌트 8개

**Issue**: [#115](https://github.com/alruminum/jajang/issues/115)  
**Scope**: `apps/mobile/src/components/`  
**작성일**: 2026-04-27  
**선행 작업**: #113 (theme-store + useTheme user override 완료)

---

## 구현 파일 목록

| 순서 | 파일 | 조작 |
|------|------|------|
| 1 | `src/components/MiniPlayer.tsx` | 수정 — MiniWaveform 독립 useTheme + MiniPlayer useMemo |
| 2 | `src/components/TrackCard.tsx` | 수정 — useTheme + useMemo 도입 |
| 3 | `src/components/SongListItem.tsx` | 수정 — useTheme + useMemo 도입 (JSX prop 포함) |
| 4 | `src/components/TimerBottomSheet.tsx` | 수정 — useTheme + useMemo 도입 |
| 5 | `src/components/TrialBadge.tsx` | 수정 — useTheme + useMemo 도입 |
| 6 | `src/components/TrialExpiryBanner.tsx` | 수정 — useTheme + useMemo 도입 |
| 7 | `src/components/EmptyTrackState.tsx` | 수정 — useTheme + useMemo 도입 |
| 8 | `src/components/CompletedTrackCard.tsx` | 수정 — useTheme + useMemo 도입 |

> 8개 파일 모두 독립적, 의존 관계 없음. 병렬 구현 가능.

---

## 공통 적용 패턴

모든 파일에 동일하게 적용되는 변환 규칙:

```tsx
// ─── Before: 파일 하단 정적 StyleSheet ───────────────────────────────────────
const styles = StyleSheet.create({
  container: { backgroundColor: '#1A1D30' },
});

// ─── After: 함수 본문 내 useMemo ─────────────────────────────────────────────
import React, { useMemo } from 'react';          // useMemo 추가
import { useTheme } from '@hooks/useTheme';       // import 추가

function MyComponent(props) {
  const { colors } = useTheme();                  // 함수 본문 첫 줄
  const styles = useMemo(() => StyleSheet.create({
    container: { backgroundColor: colors.surface },
  }), [colors]);
  // ... 이하 기존 로직
}
// 파일 하단 정적 StyleSheet.create 블록 완전 삭제
```

---

## 1. MiniPlayer.tsx

### 변경 구조

`MiniWaveform`은 별도 함수로 선언된 서브컴포넌트. 부모(`MiniPlayer`)의 스코프에 접근 불가하므로
**독립적으로 `useTheme()`를 호출**해야 한다 (impl-03 §B-1 Pattern B 결정).

```tsx
// ─── 변경 전 헤더 ─────────────────────────────────────────────────────────────
import React, { useEffect, useRef } from 'react';

// ─── 변경 후 헤더 ─────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useRef } from 'react';
import { useTheme } from '@hooks/useTheme';
```

### MiniWaveform 내부 변경

```tsx
function MiniWaveform({ isPlaying }: { isPlaying: boolean }) {
  const { colors } = useTheme();                         // ← 추가
  const waveformStyles = useMemo(() => StyleSheet.create({  // ← 추가 (localStyles로 이름 변경 불필요)
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: 12,
    },
    bar: {
      width: 3,
      borderRadius: 2,
      backgroundColor: colors.accentPrimary,             // '#5A7AA8' → token
      marginRight: 3,
    },
  }), [colors]);

  const bar0 = useRef(new Animated.Value(0.3)).current;
  const bar1 = useRef(new Animated.Value(0.6)).current;
  const bar2 = useRef(new Animated.Value(0.5)).current;

  // ... useEffect 로직 그대로 유지 ...

  return (
    <View style={waveformStyles.container}>   {/* ← waveformStyles 참조 */}
      {[bar0, bar1, bar2].map((b, i) => (
        <Animated.View
          key={i}
          style={[
            waveformStyles.bar,               {/* ← waveformStyles 참조 */}
            { height: b.interpolate({ inputRange: [0, 1], outputRange: [4, 16] }) },
          ]}
        />
      ))}
    </View>
  );
}
```

### MiniPlayer 본체 변경

```tsx
export default function MiniPlayer() {
  const { colors } = useTheme();                         // ← 추가
  const styles = useMemo(() => StyleSheet.create({       // ← 추가
    container: {
      backgroundColor: colors.surface,                   // '#1A1D30' → token
      borderTopWidth: 1,
      borderTopColor: colors.border,                     // '#252940' → token (근사: border #2A2E48, divider 용도)
    },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      height: 64,
    },
    songName: {
      flex: 1,
      color: colors.textPrimary,                         // '#EEF0F8' → token
      fontSize: 14,
      fontWeight: '600',
      marginRight: 8,
    },
    status: {
      color: colors.textSecondary,                       // '#7B80A0' → token
      fontSize: 12,
      marginRight: 12,
    },
    playButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surfaceHigh,               // '#252940' → token (근사: surfaceHigh #21253E, 버튼 배경)
      justifyContent: 'center',
      alignItems: 'center',
    },
    playButtonText: {
      color: colors.textPrimary,                         // '#EEF0F8' → token
      fontSize: 14,
    },
  }), [colors]);

  const { isPlaying, currentSongKey } = usePlayerStore();
  // ... 이하 기존 로직 그대로 유지 ...
}

// ─── 파일 하단 정적 waveformStyles, styles 블록 완전 삭제 ───────────────────────
```

### 근사 매핑 근거

| 원본 hex | 사용 위치 | 매핑 토큰 | 근거 |
|---|---|---|---|
| `#252940` | container.borderTopColor | `colors.border` | 수평 구분선 용도. border(`#2A2E48`)와 동일 레이어 |
| `#252940` | playButton.backgroundColor | `colors.surfaceHigh` | 버튼 배경. surfaceHigh(`#21253E`) 가장 근접한 raised surface |

---

## 2. TrackCard.tsx

### 변경 구조

```tsx
// ─── 헤더 변경 ─────────────────────────────────────────────────────────────────
import React, { useMemo } from 'react'    // useMemo 추가
import { useTheme } from '@hooks/useTheme' // import 추가

// ─── 함수 본문 변경 ────────────────────────────────────────────────────────────
export function TrackCard({ track, onPlay, onRetryPending, onDelete }: Props) {
  const { colors } = useTheme();           // ← 추가 (함수 본문 첫 줄)
  const styles = useMemo(() => StyleSheet.create({  // ← 추가
    card:            { flexDirection: 'row', alignItems: 'center',
                       backgroundColor: colors.surface,    // '#1A1D30' → token
                       borderRadius: 16, padding: 16, marginBottom: 10 },
    cardPending:     { opacity: 0.8, borderWidth: 1,
                       borderColor: colors.border },        // '#2A2E48' → token
    iconWrap:        { width: 44, height: 44, borderRadius: 12,
                       backgroundColor: colors.surfaceHigh, // '#21253E' → token
                       justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    iconWrapPending: { backgroundColor: colors.surface,    // '#1A1D30' → token
                       borderWidth: 1, borderColor: colors.border }, // '#2A2E48' → token
    icon:            { color: colors.accentSecondary, fontSize: 20 }, // '#C49A8A' → token
    textWrap:        { flex: 1 },
    songName:        { color: colors.textPrimary, fontSize: 16,       // '#EEF0F8' → token
                       fontFamily: 'NotoSansKR-Regular', marginBottom: 4 },
    subText:         { color: colors.textSecondary, fontSize: 13 },   // '#7B80A0' → token
    playBtn:         { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
    playIcon:        { color: colors.accentPrimary, fontSize: 18 },   // '#5A7AA8' → token
  }), [colors]);

  // ... 이하 기존 로직 그대로 유지 ...
}

// ─── 파일 하단 정적 styles 블록 완전 삭제 ──────────────────────────────────────
```

---

## 3. SongListItem.tsx

### 변경 구조

```tsx
// ─── 헤더 변경 ─────────────────────────────────────────────────────────────────
import React, { useMemo } from 'react';
import { useTheme } from '@hooks/useTheme';

// ─── 함수 본문 변경 ────────────────────────────────────────────────────────────
export function SongListItem({
  song, isSelected, isPreviewPlaying, isPreviewLoading, onSelect, onPreviewToggle,
}: SongListItemProps) {
  const { colors } = useTheme();           // ← 추가
  const styles = useMemo(() => StyleSheet.create({  // ← 추가
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,     // '#1A1D30' → token
      borderRadius: 16,
      padding: 16,
      marginBottom: 10,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    itemSelected: {
      borderColor: colors.accentPrimary,   // '#5A7AA8' → token
    },
    info: { flex: 1 },
    titleKo: {
      color: colors.textPrimary,           // '#EEF0F8' → token
      fontSize: 16,
      fontFamily: 'NotoSansKR-Regular',
      marginBottom: 2,
    },
    composer: {
      color: colors.textSecondary,         // '#7B80A0' → token
      fontSize: 13,
    },
    previewBtn: {
      width: 36,
      height: 36,
      justifyContent: 'center',
      alignItems: 'center',
    },
    previewIcon: {
      color: colors.accentSecondary,       // '#C49A8A' → token
      fontSize: 18,
    },
  }), [colors]);

  return (
    <Pressable
      style={[styles.item, isSelected && styles.itemSelected]}
      onPress={onSelect}
      accessibilityLabel={`${song.title_ko} 선택`}
      accessibilityState={{ selected: isSelected }}
    >
      {/* ... 내부 구조 그대로 ... */}
      {isPreviewLoading
        ? <ActivityIndicator size="small" color={colors.accentPrimary} />  {/* ← JSX prop도 교체 */}
        : <Text style={styles.previewIcon}>{isPreviewPlaying ? '⏸' : '▷'}</Text>
      }
    </Pressable>
  );
}

// ─── 파일 하단 정적 styles 블록 완전 삭제 ──────────────────────────────────────
```

> **주의**: `ActivityIndicator`의 `color` prop은 StyleSheet 밖 JSX 인라인 값임.
> `colors.accentPrimary`를 직접 참조해야 한다. `string` 타입 prop이므로 `{colors.accentPrimary}` 형태로 전달.

---

## 4. TimerBottomSheet.tsx

### 변경 구조

```tsx
// ─── 헤더 변경 ─────────────────────────────────────────────────────────────────
import React, { useMemo } from 'react';
import { useTheme } from '@hooks/useTheme';

// ─── 함수 본문 변경 ────────────────────────────────────────────────────────────
export default function TimerBottomSheet({
  visible, currentEndsAt, onClose,
}: TimerBottomSheetProps) {
  const { colors } = useTheme();           // ← 추가 (함수 본문 첫 줄)
  const styles = useMemo(() => StyleSheet.create({  // ← 추가
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,    // 'rgba(0, 0, 0, 0.5)' → token
    },
    sheet: {
      backgroundColor: colors.surface,    // '#1A1D2E' → token (근사: surface #1A1D30)
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 24,
      paddingBottom: 40,
      paddingHorizontal: 24,
    },
    title: {
      color: colors.textPrimary,          // '#EEF0F8' → token
      fontSize: 18,
      fontWeight: '600',
      marginBottom: 20,
      textAlign: 'center',
    },
    option: {
      paddingVertical: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,   // '#2D3050' → token (근사: border #2A2E48)
    },
    optionLabel: {
      color: colors.textPrimary,          // '#EEF0F8' → token
      fontSize: 16,
      textAlign: 'center',
    },
    clearOption: {
      paddingVertical: 16,
      marginTop: 8,
    },
    clearLabel: {
      color: colors.accentPrimary,        // '#5A7AA8' → token
      fontSize: 16,
      textAlign: 'center',
    },
  }), [colors]);

  // ... handleSelect, handleClear, return 그대로 유지 ...
}

// ─── 파일 하단 정적 styles 블록 완전 삭제 ──────────────────────────────────────
```

### 근사 매핑 근거

| 원본 hex | 매핑 토큰 | 근거 |
|---|---|---|
| `#1A1D2E` | `colors.surface` | surface `#1A1D30`과 2포인트 차이. 동일 바텀시트 배경 용도 |
| `#2D3050` | `colors.border` | border `#2A2E48`과 유사 채도. 옵션 구분선 용도 |
| `rgba(0,0,0,0.5)` | `colors.overlay` | overlay `#000000AA`(≈67%). 배경 딤 처리 — 약간 진해지나 수용 범위 |

---

## 5. TrialBadge.tsx

### 변경 구조

```tsx
// ─── 헤더 변경 ─────────────────────────────────────────────────────────────────
import React, { useMemo } from 'react';
import { useTheme } from '@hooks/useTheme';

// ─── 함수 본문 변경 ────────────────────────────────────────────────────────────
export default function TrialBadge() {
  const { entitlement } = useAuthStore();
  const daysRemaining = useTrialDaysRemaining();
  const { colors } = useTheme();           // ← 추가 (조건 분기 앞에 위치)
  const styles = useMemo(() => StyleSheet.create({  // ← 추가
    badge: {
      backgroundColor: colors.accentPrimary14, // 'rgba(130, 176, 144, 0.15)' → token
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 6,
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: colors.accentPrimary33,     // 'rgba(130, 176, 144, 0.3)' → token
    },
    text: {
      color: colors.accentPrimary,             // '#5A7AA8' → token
      fontSize: 13,
      fontWeight: '500',
    },
  }), [colors]);

  if (entitlement !== 'trial' || daysRemaining === null) return null;

  return (
    <View style={styles.badge}>
      <Text style={styles.text}>
        7일 무료 체험 중
        {daysRemaining > 0 ? ` · ${daysRemaining}일 남음` : ' · 오늘 만료'}
      </Text>
    </View>
  );
}

// ─── 파일 하단 정적 styles 블록 완전 삭제 ──────────────────────────────────────
```

### rgba 매핑 근거 (impl-03 §5-3 동일)

| 원본 rgba | 매핑 토큰 | 근거 |
|---|---|---|
| `rgba(130, 176, 144, 0.15)` | `colors.accentPrimary14` | 구 Sage Mist 15% → Midnight Indigo 14% 파생. 배지 배경 |
| `rgba(130, 176, 144, 0.3)` | `colors.accentPrimary33` | 구 Sage Mist 30% → Midnight Indigo 33% 파생. 배지 테두리 |

> **색상 변화 안내**: 구 값은 Sage Mist(`#82B090`) 기반의 초록빛 rgba.
> 현재 accentPrimary가 Midnight Indigo(`#5A7AA8`)로 변경됐으므로 파생 토큰이 청색 계열로 렌더됨.
> 이는 PR #112 팔레트 변경의 후속 정합 작업이며 의도된 변화임.

---

## 6. TrialExpiryBanner.tsx

### 변경 구조

```tsx
// ─── 헤더 변경 ─────────────────────────────────────────────────────────────────
import React, { useMemo } from 'react';
import { useTheme } from '@hooks/useTheme';

// ─── 함수 본문 변경 ────────────────────────────────────────────────────────────
export default function TrialExpiryBanner() {
  const { entitlement } = useAuthStore();
  const daysRemaining = useTrialDaysRemaining();
  const navigation = useNavigation<NavProp>();
  const { colors } = useTheme();           // ← 추가
  const styles = useMemo(() => StyleSheet.create({  // ← 추가
    banner: {
      backgroundColor: colors.accentPrimary14, // 'rgba(130, 176, 144, 0.1)' → token (10% ≈ 14%)
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.accentPrimary20,     // 'rgba(130, 176, 144, 0.25)' → token (25% ≈ 20%)
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 12,
      marginHorizontal: 0,
    },
    message: {
      color: colors.textPrimary,               // '#EEF0F8' → token
      fontSize: 13,
      flex: 1,
    },
    cta: {
      color: colors.accentPrimary,             // '#5A7AA8' → token
      fontSize: 13,
      fontWeight: '600',
      marginLeft: 12,
    },
  }), [colors]);

  if (entitlement !== 'trial' || daysRemaining === null || daysRemaining > 1) return null;

  // ... message 분기 + return 그대로 유지 ...
}

// ─── 파일 하단 정적 styles 블록 완전 삭제 ──────────────────────────────────────
```

### rgba 매핑 근거 (impl-03 §5-3 동일)

| 원본 rgba | 매핑 토큰 | 근거 |
|---|---|---|
| `rgba(130, 176, 144, 0.1)` | `colors.accentPrimary14` | 10% ≈ 14%. 가장 가까운 파생 토큰 |
| `rgba(130, 176, 144, 0.25)` | `colors.accentPrimary20` | 25% ≈ 20%. 가장 가까운 파생 토큰 |

---

## 7. EmptyTrackState.tsx

### 변경 구조

```tsx
// ─── 헤더 변경 ─────────────────────────────────────────────────────────────────
import React, { useMemo } from 'react';
import { useTheme } from '@hooks/useTheme';

// ─── 함수 본문 변경 ────────────────────────────────────────────────────────────
export default function EmptyTrackState() {
  const navigation = useNavigation<NavProp>();
  const { colors } = useTheme();           // ← 추가
  const styles = useMemo(() => StyleSheet.create({  // ← 추가
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 40,
    },
    emoji: { fontSize: 56, marginBottom: 24 },
    title: {
      color: colors.textPrimary,           // '#EEF0F8' → token
      fontSize: 18,
      fontWeight: '600',
      marginBottom: 8,
      textAlign: 'center',
    },
    subtitle: {
      color: colors.textSecondary,         // '#7B80A0' → token
      fontSize: 14,
      marginBottom: 32,
      textAlign: 'center',
    },
    btn: {
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.accentPrimary, // '#5A7AA8' → token
      paddingHorizontal: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnText: {
      color: colors.bgPrimary,             // '#0D0F1A' → token
      fontSize: 15,
      fontWeight: '600',
    },
  }), [colors]);

  return (
    <View style={styles.container}>
      {/* ... 기존 JSX 그대로 ... */}
    </View>
  );
}

// ─── 파일 하단 정적 styles 블록 완전 삭제 ──────────────────────────────────────
```

---

## 8. CompletedTrackCard.tsx

### 변경 구조

```tsx
// ─── 헤더 변경 ─────────────────────────────────────────────────────────────────
import React, { useMemo } from 'react';
import { useTheme } from '@hooks/useTheme';

// ─── 함수 본문 변경 ────────────────────────────────────────────────────────────
export default function CompletedTrackCard({ track, onDismiss }: Props) {
  const navigation = useNavigation<NavProp>();
  const { colors } = useTheme();           // ← 추가
  const styles = useMemo(() => StyleSheet.create({  // ← 추가
    card: {
      backgroundColor: colors.surface,     // '#1A1D30' → token
      borderRadius: 20,
      padding: 24,
      marginHorizontal: 20,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,          // '#2A2E48' → token
    },
    badge: {
      backgroundColor: colors.accentPrimary14, // 'rgba(139, 174, 212, 0.15)' → token (impl-03 §5-4)
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 4,
      alignSelf: 'flex-start',
      marginBottom: 12,
    },
    badgeText: {
      color: colors.accentSecondary,       // '#C49A8A' → token
      fontSize: 12,
      fontWeight: '500',
    },
    songName: {
      color: colors.textPrimary,           // '#EEF0F8' → token
      fontSize: 18,
      fontWeight: '600',
      marginBottom: 6,
    },
    subtext: {
      color: colors.textSecondary,         // '#7B80A0' → token
      fontSize: 13,
      marginBottom: 20,
    },
    actions: { gap: 10 },
    primaryBtn: {
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.accentPrimary, // '#5A7AA8' → token
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: {
      color: colors.bgPrimary,             // '#0D0F1A' → token
      fontSize: 15,
      fontWeight: '600',
    },
    dismissBtn: { alignItems: 'center', padding: 10 },
    dismissText: {
      color: colors.textSecondary,         // '#7B80A0' → token
      fontSize: 14,
    },
  }), [colors]);

  const songName = SONG_NAMES[track.song_key] ?? track.song_key;

  return (
    <View style={styles.card}>
      {/* ... 기존 JSX 그대로 ... */}
    </View>
  );
}

// ─── 파일 하단 정적 styles 블록 완전 삭제 ──────────────────────────────────────
```

### badge rgba 매핑 근거 (impl-03 §5-4 동일)

| 원본 rgba | 매핑 토큰 | 근거 |
|---|---|---|
| `rgba(139, 174, 212, 0.15)` | `colors.accentPrimary14` | 구 accentSecondary(`#8BAED4`) 15% 기반. accentSecondary14 토큰 미존재 → 완성 알림 맥락상 accentPrimary14로 대체가 의미적으로 적합. (impl-03 §5-4 결정 그대로 적용) |

---

## 전체 hex → 토큰 매핑 요약

| hex / rgba | 토큰 | 적용 파일 |
|---|---|---|
| `#5A7AA8` | `colors.accentPrimary` | MiniPlayer(bar), SongListItem(selected), TrialBadge(text), TrialExpiryBanner(cta), EmptyTrackState(btn), TimerBottomSheet(clearLabel), TrackCard(playIcon) |
| `#C49A8A` | `colors.accentSecondary` | TrackCard(icon), SongListItem(previewIcon), CompletedTrackCard(badgeText) |
| `#0D0F1A` | `colors.bgPrimary` | EmptyTrackState(btnText), CompletedTrackCard(primaryBtnText) |
| `#1A1D30` | `colors.surface` | MiniPlayer(container bg), TrackCard(card, iconWrapPending bg), SongListItem(item bg), CompletedTrackCard(card bg) |
| `#1A1D2E` | `colors.surface` *(근사)* | TimerBottomSheet(sheet bg) |
| `#21253E` | `colors.surfaceHigh` | TrackCard(iconWrap bg) |
| `#EEF0F8` | `colors.textPrimary` | MiniPlayer(songName, playButtonText), TrackCard(songName), SongListItem(titleKo), TimerBottomSheet(title, optionLabel), TrialExpiryBanner(message), EmptyTrackState(title), CompletedTrackCard(songName) |
| `#7B80A0` | `colors.textSecondary` | MiniPlayer(status), TrackCard(subText), SongListItem(composer), EmptyTrackState(subtitle), CompletedTrackCard(subtext, dismissText) |
| `#2A2E48` | `colors.border` | TrackCard(cardPending, iconWrapPending), CompletedTrackCard(card border) |
| `#2D3050` | `colors.border` *(근사)* | TimerBottomSheet(option borderBottomColor) |
| `#252940` (borderTop) | `colors.border` *(근사)* | MiniPlayer(container borderTopColor) |
| `#252940` (button bg) | `colors.surfaceHigh` *(근사)* | MiniPlayer(playButton bg) |
| `rgba(0,0,0,0.5)` | `colors.overlay` | TimerBottomSheet(backdrop) |
| `rgba(130,176,144,0.15)` | `colors.accentPrimary14` | TrialBadge(badge bg) |
| `rgba(130,176,144,0.3)` | `colors.accentPrimary33` | TrialBadge(badge border) |
| `rgba(130,176,144,0.1)` | `colors.accentPrimary14` *(근사)* | TrialExpiryBanner(banner bg) |
| `rgba(130,176,144,0.25)` | `colors.accentPrimary20` *(근사)* | TrialExpiryBanner(banner border) |
| `rgba(139,174,212,0.15)` | `colors.accentPrimary14` | CompletedTrackCard(badge bg) |

---

## 검증

```bash
# 1) 대상 파일에 old hex literal 잔여 여부 확인 (0개 기대)
# 시스템 색상(흰색/검정 등) 제외한 토큰 대상 hex
grep -rE "'#(5A7AA8|C49A8A|0D0F1A|1A1D30|21253E|EEF0F8|7B80A0|2A2E48|1A1D2E|2D3050|252940|E85A5A)[0-9A-Fa-f]{0,2}'" \
  apps/mobile/src/components/MiniPlayer.tsx \
  apps/mobile/src/components/TrackCard.tsx \
  apps/mobile/src/components/SongListItem.tsx \
  apps/mobile/src/components/TimerBottomSheet.tsx \
  apps/mobile/src/components/TrialBadge.tsx \
  apps/mobile/src/components/TrialExpiryBanner.tsx \
  apps/mobile/src/components/EmptyTrackState.tsx \
  apps/mobile/src/components/CompletedTrackCard.tsx

# 2) 구 Sage Mist rgba 잔여 여부 확인 (0개 기대)
grep -rE "rgba\(130|rgba\(139" \
  apps/mobile/src/components/{MiniPlayer,TrackCard,SongListItem,TimerBottomSheet,TrialBadge,TrialExpiryBanner,EmptyTrackState,CompletedTrackCard}.tsx

# 3) 이슈 명시 grep 검증 — 토큰 외 hex 0개 기대
grep -rE "'#[0-9A-Fa-f]{6,8}'" \
  apps/mobile/src/components/{MiniPlayer,TrackCard,SongListItem,TimerBottomSheet,TrialBadge,TrialExpiryBanner,EmptyTrackState,CompletedTrackCard}.tsx \
  | grep -v "// "

# 4) useTheme import 전체 확인 (8개 파일 모두 있어야 함)
grep -l "useTheme" \
  apps/mobile/src/components/MiniPlayer.tsx \
  apps/mobile/src/components/TrackCard.tsx \
  apps/mobile/src/components/SongListItem.tsx \
  apps/mobile/src/components/TimerBottomSheet.tsx \
  apps/mobile/src/components/TrialBadge.tsx \
  apps/mobile/src/components/TrialExpiryBanner.tsx \
  apps/mobile/src/components/EmptyTrackState.tsx \
  apps/mobile/src/components/CompletedTrackCard.tsx

# 5) 전체 테스트 (기존 useTheme 테스트 PASS 확인)
cd apps/mobile && npx vitest run
```

---

## 핵심 결정 근거

| 결정 | 대안 | 채택 이유 |
|---|---|---|
| MiniWaveform 독립 useTheme 호출 | 부모에서 colors prop 주입 | 서브컴포넌트가 독립적으로 테마를 구독해야 리렌더 격리. impl-03 §B-1 결정 방향 일치 |
| `#252940` → border / surfaceHigh 분리 매핑 | 단일 토큰으로 통일 | 사용 컨텍스트(구분선 vs 버튼배경)가 명확히 다름. 적합한 의미론적 토큰 선택 |
| TrialBadge/Banner rgba → accentPrimary 파생 토큰 | accentSecondary 파생 토큰 신설 | #82B090 기반 rgba는 이미 deprecated 팔레트. accentPrimary14/20/33이 현재 토큰 체계에서 유일한 투명도 파생 토큰 |
| CompletedTrackCard badge → accentPrimary14 | accentSecondary 파생 신설 | impl-03 §5-4 결정 그대로 적용. 완성 알림 맥락은 accentPrimary 계열이 의미적으로 적합 |
| 정적 StyleSheet 블록 완전 삭제 | 남겨두고 useMemo 추가 | 정적 블록이 남으면 colors 변경 시 반응하지 않음. 충돌 위험 제거 |

---

## 주의사항

- **파일 하단 정적 StyleSheet 블록 삭제 필수**: useMemo 추가 후 파일 하단의 기존 `const styles = StyleSheet.create({...})`, `const waveformStyles = StyleSheet.create({...})` 블록을 반드시 삭제. 미삭제 시 변수 중복 선언 오류 발생.
- **MiniPlayer — waveformStyles 이름 유지**: MiniWaveform 내부에서 `waveformStyles`로 그대로 사용. `localStyles`로 변경 불필요.
- **SongListItem — ActivityIndicator JSX prop**: StyleSheet 패턴 밖 인라인 prop. `color={colors.accentPrimary}` 형태로 교체.
- **useMemo dependency 배열**: 이번 파일들은 styles 내부에 colors 이외 외부 값을 사용하지 않음 → `[colors]` 단독 의존성으로 충분.
- **테스트 파일 수정 불필요**: 8개 컴포넌트에 대한 기존 테스트 없음. `useTheme.test.ts`는 훅 자체를 테스트하므로 이 마이그레이션에 영향 없음.
- **`'transparent'` 유지**: SongListItem `item.borderColor: 'transparent'` — 이는 시스템 컬러이므로 토큰 교체 대상 아님.
- **ux-flow.md 드리프트**: `docs/ux-flow.md §0`의 accentPrimary가 `#82B090`(Sage Mist)로 기재되어 있으나 실제 tokens.ts는 `#5A7AA8`(Midnight Indigo). 이 drift는 PR #112에서 발생했으며 이번 PR 범위 외. 후속 DOCS_SYNC 태스크 권고.

---

## Design Ref

design-handoff.md 미제공. UX Flow 참조: `docs/ux-flow.md`.

이 impl은 색상 토큰 교체만 수행. **다크 모드에서는 렌더링 변화 없음** (현재 파일의 hex 값과 darkColors 토큰 값이 동일).
단, `TrialBadge`, `TrialExpiryBanner`의 rgba 값 교체는 구 Sage Mist → Midnight Indigo 파생으로의 색상 보정이며,
PR #112 팔레트 변경의 후속 정합 작업임.
