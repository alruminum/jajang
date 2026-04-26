---
depth: std
design: skipped
---

# impl/04 — C06 미니 플레이어 (MiniPlayer)

**커버 스토리**: C06 미니 플레이어 컴포넌트  
**선행 조건**: impl/01 AudioEngine 완료, impl/02 PlayScreen 완료 (재생 상태 Zustand 동기화)  
**예상 소요**: 0.5일

---

## 1. 생성/수정 파일

| 경로 | 동작 | 비고 |
|---|---|---|
| `apps/mobile/src/components/MiniPlayer.tsx` | 신규 생성 | C06 미니 플레이어 |
| `apps/mobile/src/screens/S06_HomeScreen.tsx` | 수정 | MiniPlayer 조건부 렌더 추가 |

---

## 2. TS 인터페이스

```typescript
interface MiniPlayerProps {
  // 외부 props 없음 — Zustand에서 직접 읽음
  // 표시/숨김은 S06에서 조건부 렌더로 제어
}
```

---

## 3. 핵심 로직 의사코드

### 3-1. MiniPlayer 컴포넌트

```typescript
function MiniPlayer() {
  const { isPlaying, currentSongKey } = usePlayerStore()
  const navigation = useNavigation()

  const handleBarPress = () => {
    // S13으로 이동 — 현재 재생 위치 유지 (trackId, trackUrl, songKey Zustand에서 읽음)
    const { currentTrackId, currentTrackUrl, currentSongKey: key } = usePlayerStore.getState()
    if (!currentTrackId || !currentTrackUrl || !key) return
    navigation.navigate('PlayScreen', {
      trackId: currentTrackId,
      trackUrl: currentTrackUrl,
      songKey: key,
    })
  }

  const handlePlayPause = (e: GestureResponderEvent) => {
    e.stopPropagation()  // 바 탭 이벤트 차단
    isPlaying ? AudioEngine.pausePlayback() : AudioEngine.resumePlayback()
  }

  return (
    <Animated.View style={styles.container} entering={SlideInDown.duration(300)}>
      <TouchableOpacity
        style={styles.bar}
        onPress={handleBarPress}
        accessibilityLabel="재생 중인 자장가로 이동"
      >
        {/* 미니 파형 애니메이션 */}
        <MiniWaveform isPlaying={isPlaying} />

        <Text style={styles.songName} numberOfLines={1}>
          {SONG_NAMES[currentSongKey ?? ''] ?? '자장가'}
        </Text>
        <Text style={styles.status}>{isPlaying ? '재생 중' : '일시정지'}</Text>

        <TouchableOpacity
          onPress={handlePlayPause}
          style={styles.playButton}
          accessibilityLabel={isPlaying ? '일시정지' : '재생'}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} color="#EEF0F8" size={20} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  )
}
```

### 3-2. MiniWaveform (낮은 진폭 loop 애니메이션)

```typescript
function MiniWaveform({ isPlaying }: { isPlaying: boolean }) {
  // 3개 바 각각 다른 위상의 loop 애니메이션
  const bars = [useRef(new Animated.Value(0.3)).current,
                useRef(new Animated.Value(0.6)).current,
                useRef(new Animated.Value(0.5)).current]

  useEffect(() => {
    if (!isPlaying) {
      bars.forEach(b => b.setValue(0.3))
      return
    }
    const anims = bars.map((b, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(b, { toValue: 1.0, duration: 400 + i * 100, useNativeDriver: false }),
          Animated.timing(b, { toValue: 0.2, duration: 400 + i * 100, useNativeDriver: false }),
        ])
      )
    )
    anims.forEach(a => a.start())
    return () => anims.forEach(a => a.stop())
  }, [isPlaying])

  return (
    <View style={styles.waveformContainer}>
      {bars.map((b, i) => (
        <Animated.View
          key={i}
          style={[styles.bar, { height: b.interpolate({ inputRange: [0, 1], outputRange: [4, 16] }) }]}
        />
      ))}
    </View>
  )
}
```

### 3-3. S06 홈 화면에서 조건부 렌더

```typescript
// apps/mobile/src/screens/S06_HomeScreen.tsx 수정 위치

function HomeScreen() {
  const { currentTrackId, isPlaying } = usePlayerStore()
  const { entitlement } = useAuthStore()

  // Premium/Trial 유저이고 trackId가 있을 때만 미니 플레이어 노출
  const showMiniPlayer = (entitlement === 'premium' || entitlement === 'trial') && !!currentTrackId

  return (
    <View style={{ flex: 1 }}>
      {/* 홈 콘텐츠 */}
      <ScrollView contentContainerStyle={{ paddingBottom: showMiniPlayer ? 72 : 0 }}>
        {/* ... 음원 목록 ... */}
      </ScrollView>

      {/* C06 미니 플레이어 — 하단 고정 오버레이 */}
      {showMiniPlayer && (
        <View style={styles.miniPlayerWrapper}>
          <MiniPlayer />
        </View>
      )}
    </View>
  )
}

// S06 스타일
const styles = StyleSheet.create({
  miniPlayerWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
})
```

---

## 4. 결정 근거

| 결정 | 이유 |
|---|---|
| Zustand 직접 읽기 (props 없음) | MiniPlayer는 앱 전역에서 단 1개 인스턴스. 부모로부터 props 드릴 없이 스토어 직독 |
| `entitlement` 조건부 렌더를 S06에서 담당 | MiniPlayer 자체는 entitlement를 모름. 노출 정책(Premium/Trial 전용)은 렌더 호출 측에서 결정 |
| SlideInDown 진입 애니메이션 | ux-flow.md C06 "slide-up 0.3s ease-out" 명시. react-native-reanimated의 `entering` prop 활용 |
| handlePlayPause에서 e.stopPropagation() | ⏸ 버튼과 바 탭 이벤트가 겹치지 않도록 |
| paddingBottom 동적 적용 | 미니 플레이어가 절대 위치 오버레이이므로 스크롤 콘텐츠 하단이 가려지지 않도록 |

---

## 5. 모듈 경계

- **MiniPlayer → AudioEngine**: pausePlayback, resumePlayback 호출
- **MiniPlayer → PlayerSlice**: isPlaying, currentTrackId, currentTrackUrl, currentSongKey (read)
- **S06 → MiniPlayer**: 조건부 렌더만. props 전달 없음
- **MiniPlayer → navigation**: `navigate('PlayScreen', params)`. trackId/trackUrl/songKey는 PlayerSlice에서 읽음

---

## 6. 수용 기준

| # | 시나리오 | 기대 결과 |
|---|---|---|
| AC-01 | Premium/Trial + 트랙 있음 | S06 하단에 MiniPlayer slide-up 표시 |
| AC-02 | 무료 유저 | MiniPlayer 미노출 |
| AC-03 | 트랙 없음 (currentTrackId=null) | MiniPlayer 미노출 |
| AC-04 | 바 탭 | S13으로 navigate, 현재 재생 위치 유지 |
| AC-05 | ⏸ 버튼 탭 | 재생 일시정지, 버튼 ▶ 전환, S06 유지 |
| AC-06 | ▶ 버튼 탭 | 재생 재개, 버튼 ⏸ 전환 |
| AC-07 | 재생 중 | 미니 파형 3개 바 loop 애니메이션 |
| AC-08 | 일시정지 | 미니 파형 바 고정 (낮은 높이) |
| AC-09 | S13에서 뒤로 탭 (Premium/Trial) | S06 이동 + MiniPlayer 노출 |

---

## 7. 주의사항

- react-native-reanimated v3+ 필요. `entering` prop 사용 전 버전 확인.
- MiniPlayer가 노출된 상태에서 S06 ScrollView 하단 콘텐츠 가림 방지를 위해 `paddingBottom` 동적 계산. 미니 플레이어 높이(약 64dp)에 Safe Area bottom 더해야 함 (`useSafeAreaInsets()` 활용).
- `currentSongKey`가 null인 경우 fallback '자장가' 표시.
