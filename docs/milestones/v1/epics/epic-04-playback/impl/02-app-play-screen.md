---
depth: std
design: skipped
---

# impl/02 — S13 재생 화면 (PlayScreen)

**커버 스토리**: Story 1 (재생 화면 기본 컨트롤), Story 3 (백그라운드 재생 — UI 분기), Story 5 (Lockscreen 연동)  
**선행 조건**: impl/01 AudioEngine 완료  
**예상 소요**: 2일

---

## 1. 생성/수정 파일

| 경로 | 동작 | 비고 |
|---|---|---|
| `apps/mobile/src/screens/S13_PlayScreen.tsx` | 신규 생성 | 재생 화면 전체 |
| `apps/mobile/src/components/AlbumArtRotating.tsx` | 신규 생성 | 느린 회전 원형 그래픽 |
| `apps/mobile/src/components/VolumeSlider.tsx` | 신규 생성 | 볼륨 슬라이더 |
| `apps/mobile/src/utils/sleep.ts` | 신규 생성 | sleep 헬퍼 (impl/01 공유) |

---

## 2. TS 인터페이스

### 2-1. 화면 route params

```typescript
// React Navigation Stack Params
type PlayScreenParams = {
  trackId: string
  trackUrl: string     // presigned URL 또는 로컬 file:// 경로
  songKey: string
}
```

### 2-2. 컴포넌트 Props

```typescript
interface AlbumArtRotatingProps {
  isPlaying: boolean   // 재생 중일 때만 회전
  size?: number        // 기본 240
}

interface VolumeSliderProps {
  value: number        // 0.0 ~ 1.0
  disabled: boolean    // crossfade 중 잠금
  onChange: (v: number) => void
}
```

---

## 3. 핵심 로직 의사코드

### 3-1. S13_PlayScreen 마운트 흐름

```typescript
function PlayScreen({ route }) {
  const { trackId, trackUrl, songKey } = route.params
  const { isPlaying, volume, timerEndsAt, pendingUpgradePrompt, notificationPermission } =
    usePlayerStore()
  const { entitlement } = useAuthStore()
  const navigation = useNavigation()

  // --- 마운트: 재생 시작 + 알림 권한 요청 (첫 진입) ---
  useEffect(() => {
    AudioEngine.startPlayback({ trackId, trackUrl, songKey })
    requestNotificationPermissionOnFirstEntry()
    return () => {
      // unmount 시 재생 중단 안 함 — 뒤로가기 정책은 impl/05 처리
    }
  }, [])

  // --- pendingUpgradePrompt 감시 → S14 A형 팝업 ---
  useEffect(() => {
    if (pendingUpgradePrompt === 'background_blocked') {
      navigation.navigate('UpgradeSheet', { variant: 'background' })
    }
  }, [pendingUpgradePrompt])

  // --- 볼륨 슬라이더 ---
  const handleVolumeChange = (v: number) => {
    if (AudioEngine.isVolumeControlLocked()) return
    AudioEngine.setVolume(v)
  }

  // --- 재생/일시정지 ---
  const handlePlayPause = () => {
    isPlaying ? AudioEngine.pausePlayback() : AudioEngine.resumePlayback()
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header
        onBack={() => handleBack(entitlement, isPlaying, navigation)}  // impl/05
        rightAction={<TimerButton onPress={openTimerSheet} />}         // impl/03
      />

      <AlbumArtRotating isPlaying={isPlaying} />

      <Text style={styles.songTitle}>{SONG_NAMES[songKey]}</Text>
      <Text style={styles.songSubtitle}>내 목소리로 만든 자장가</Text>

      <VolumeSlider
        value={volume}
        disabled={AudioEngine.isVolumeControlLocked()}
        onChange={handleVolumeChange}
      />

      <PlayPauseButton isPlaying={isPlaying} onPress={handlePlayPause} />

      {timerEndsAt && <TimerRemainingLabel endsAt={timerEndsAt} />}

      {/* 무료 유저만 — impl/07 처리 */}
      {entitlement === 'free' && <BannerAdSlot />}
    </SafeAreaView>
  )
}
```

### 3-2. 알림 권한 요청 (첫 진입)

```typescript
async function requestNotificationPermissionOnFirstEntry() {
  const alreadyAsked = await AsyncStorage.getItem('notif_permission_asked')
  if (alreadyAsked) return

  const { status } = await Notifications.requestPermissionsAsync()
  usePlayerStore.setState({
    notificationPermission: status === 'granted' ? 'granted' : 'denied',
  })
  await AsyncStorage.setItem('notif_permission_asked', '1')
}
```

### 3-3. AlbumArtRotating (Animated)

```typescript
function AlbumArtRotating({ isPlaying, size = 240 }) {
  const rotateAnim = useRef(new Animated.Value(0)).current
  const animRef = useRef<Animated.CompositeAnimation | null>(null)

  useEffect(() => {
    if (isPlaying) {
      animRef.current = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 120_000,  // 120초 1회전
          easing: Easing.linear,
          useNativeDriver: true,
        })
      )
      animRef.current.start()
    } else {
      animRef.current?.stop()
    }
  }, [isPlaying])

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  return (
    <Animated.Image
      source={require('../assets/album-art.png')}
      style={[{ width: size, height: size, borderRadius: size / 2 }, { transform: [{ rotate }] }]}
    />
  )
}
```

### 3-4. TimerRemainingLabel (실시간 카운트다운)

```typescript
function TimerRemainingLabel({ endsAt }: { endsAt: number }) {
  const [remaining, setRemaining] = useState(endsAt - Date.now())

  useEffect(() => {
    const interval = setInterval(() => {
      const r = endsAt - Date.now()
      setRemaining(r > 0 ? r : 0)
    }, 1000)
    return () => clearInterval(interval)
  }, [endsAt])

  const formatted = formatDuration(remaining)  // "1시간 45분 남음"
  return <Text style={styles.timerLabel}>{formatted}</Text>
}
```

---

## 4. 결정 근거

| 결정 | 이유 |
|---|---|
| `pendingUpgradePrompt` watch를 useEffect로 처리 | AppState 이벤트(AudioEngine) → Zustand → 화면 반응 단방향 흐름 유지. 직접 navigation 호출을 AudioEngine에서 하면 DI 의존 역전 발생 |
| 첫 진입 알림 권한 요청을 AsyncStorage 플래그로 1회 제어 | S13는 여러 번 재방문 가능. 매번 권한 팝업 노출 방지. 거부 후 타이머 경고는 인앱 배너 degrade (impl/03) |
| 볼륨 슬라이더 `disabled` prop crossfade 중 | crossfade 중 setVolume 호출 시 ramp 값이 덮어쓰여 음질 이상 — impl/01 `isVolumeControlLocked()` 참조 |
| AlbumArtRotating 120초 회전 | ux-flow.md S13 "느린 rotation 120s/loop" 명시값 그대로 |

---

## 5. 모듈 경계

- **S13 → AudioEngine**: startPlayback, pausePlayback, resumePlayback, setVolume, isVolumeControlLocked
- **S13 → PlayerSlice**: isPlaying, volume, timerEndsAt, pendingUpgradePrompt, notificationPermission (read-only)
- **S13 ← impl/05**: `handleBack()` 함수는 impl/05에서 구현, 여기서 호출만
- **BannerAdSlot**: 무료 전용, impl/07에서 구현. S13에서 `entitlement === 'free'` 조건부 렌더
- **TimerBottomSheet**: impl/03에서 구현. `openTimerSheet()` 호출만 여기서

---

## 6. 수용 기준

| # | 시나리오 | 기대 결과 |
|---|---|---|
| AC-01 | S13 진입 | AudioEngine.startPlayback 호출, 앨범 아트 회전 시작 |
| AC-02 | ⏸ 탭 | AudioEngine.pausePlayback, 앨범 아트 회전 멈춤, 버튼 ▶ 전환 |
| AC-03 | ▶ 탭 | AudioEngine.resumePlayback, 앨범 아트 회전 재개 |
| AC-04 | 볼륨 슬라이더 드래그 | AudioEngine.setVolume 즉시 호출, PlayerSlice.volume 동기화 |
| AC-05 | crossfade 중 볼륨 드래그 | disabled=true, AudioEngine 호출 없음 |
| AC-06 | 최초 S13 진입 | OS 알림 권한 요청 팝업 1회 |
| AC-07 | 두 번째 S13 진입 | 알림 권한 팝업 재노출 없음 (AsyncStorage 플래그) |
| AC-08 | 타이머 설정됨 | TimerRemainingLabel 노출, 1초 단위 카운트다운 |
| AC-09 | Premium/Trial 유저 | BannerAdSlot 미렌더 |
| AC-10 | 무료 유저 | BannerAdSlot 렌더 (impl/07 컴포넌트) |
| AC-11 | pendingUpgradePrompt='background_blocked' | UpgradeSheet variant='background' 자동 노출 |

---

## 7. 스타일 가이드 (ux-flow.md 기반)

```typescript
// 배경: #0D0F1A ~ #12152B
// 텍스트 주: #EEF0F8 / 보조: #7B80A0
// 앰버: #F5C97A (타이머 레이블, 활성 상태)
// 버튼 Primary: 앰버 채움, 높이 56, borderRadius 28
// 터치 타겟 최소 48dp (야간 큰 터치 타겟)

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0F1A' },
  songTitle: { color: '#EEF0F8', fontFamily: 'DMSans-Regular', fontSize: 22 },
  songSubtitle: { color: '#7B80A0', fontSize: 14 },
  timerLabel: { color: '#F5C97A', fontVariant: ['tabular-nums'] },
})
```

---

## 8. 주의사항

- `useNavigation()` 타입은 React Navigation `StackNavigationProp<RootStackParamList, 'PlayScreen'>` 명시.
- `BannerAdSlot` 컴포넌트는 impl/07 완료 후 import. 그 전까지 `null` placeholder.
- `TimerBottomSheet` 컴포넌트는 impl/03 완료 후 import.
- 백 버튼 동작 핵심 로직은 impl/05에서 담당. 이 파일에서는 인터페이스 호출만.
