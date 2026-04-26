---
depth: std
design: skipped
---

# impl/05 — S13 뒤로가기 분기 정책 (BackNavigationPolicy)

**커버 스토리**: Story 1 (재생 화면 컨트롤 — 뒤로가기), Story 3 (백그라운드 재생 — entitlement 분기)  
**선행 조건**: impl/01 AudioEngine, impl/02 PlayScreen, impl/04 MiniPlayer  
**예상 소요**: 0.5일

---

## 1. 생성/수정 파일

| 경로 | 동작 | 비고 |
|---|---|---|
| `apps/mobile/src/screens/S13_PlayScreen.tsx` | 수정 | handleBack 연결 + Android 하드웨어 백 처리 |
| `apps/mobile/src/hooks/useBackNavigation.ts` | 신규 생성 | 뒤로가기 분기 훅 |

---

## 2. TS 인터페이스

```typescript
// apps/mobile/src/hooks/useBackNavigation.ts

interface UseBackNavigationParams {
  entitlement: 'free' | 'trial' | 'premium'
  isPlaying: boolean
}

interface UseBackNavigationReturn {
  handleBack: () => void                // 헤더 ← 버튼 / iOS 스와이프백 제스처
  ConfirmStopDialog: React.FC           // 무료 유저 확인 다이얼로그 컴포넌트
}
```

---

## 3. 핵심 로직 의사코드

### 3-1. useBackNavigation 훅

```typescript
// apps/mobile/src/hooks/useBackNavigation.ts

export function useBackNavigation({ entitlement, isPlaying }: UseBackNavigationParams) {
  const navigation = useNavigation()
  const [showConfirm, setShowConfirm] = useState(false)

  const handleBack = useCallback(() => {
    if (entitlement === 'premium' || entitlement === 'trial') {
      // Premium/Trial: 재생 유지 + S06 이동 (C06 미니 플레이어 표시는 impl/04 S06에서 자동)
      navigation.navigate('Home')
    } else {
      // 무료: 재생 중이면 확인 다이얼로그, 일시정지 상태면 그냥 이동
      if (isPlaying) {
        setShowConfirm(true)
      } else {
        navigation.navigate('Home')
      }
    }
  }, [entitlement, isPlaying, navigation])

  const handleConfirmStop = useCallback(() => {
    setShowConfirm(false)
    AudioEngine.stopPlayback()
    navigation.navigate('Home')
  }, [navigation])

  const handleCancelStop = useCallback(() => {
    setShowConfirm(false)
    // 재생 유지, 화면 유지
  }, [])

  // Android 하드웨어 백 버튼
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack()
      return true  // 기본 동작(앱 종료) 차단
    })
    return () => subscription.remove()
  }, [handleBack])

  const ConfirmStopDialog: React.FC = () => (
    <Modal visible={showConfirm} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>재생을 중단할까요?</Text>
          <Text style={styles.dialogBody}>
            화면을 나가면 자장가가 멈춰요
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={handleCancelStop}
              style={styles.cancelBtn}
              accessibilityLabel="재생 유지"
            >
              <Text style={styles.cancelText}>계속 들을게요</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirmStop}
              style={styles.confirmBtn}
              accessibilityLabel="재생 중단하고 나가기"
            >
              <Text style={styles.confirmText}>중단할게요</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )

  return { handleBack, ConfirmStopDialog }
}
```

### 3-2. S13_PlayScreen에 연결

```typescript
// S13_PlayScreen.tsx — impl/02에서 placeholder였던 handleBack 교체

function PlayScreen({ route }) {
  const { entitlement } = useAuthStore()
  const { isPlaying } = usePlayerStore()

  const { handleBack, ConfirmStopDialog } = useBackNavigation({ entitlement, isPlaying })

  return (
    <SafeAreaView style={styles.container}>
      <Header onBack={handleBack} /* ... */ />
      {/* 나머지 UI ... */}
      <ConfirmStopDialog />
    </SafeAreaView>
  )
}
```

### 3-3. iOS 스와이프백 제스처 처리

```typescript
// React Navigation Stack — PlayScreen 설정
<Stack.Screen
  name="PlayScreen"
  component={PlayScreen}
  options={({ navigation }) => ({
    gestureEnabled: false,  // 스와이프백 기본 제스처 비활성화
    // S13에서 스와이프백을 허용하면 entitlement 분기 없이 이동됨
    // → 헤더 ← 버튼 + Android BackHandler로만 처리
    headerShown: false,
  })}
/>
```

> **근거**: iOS 스와이프백 제스처는 navigating 이벤트를 가로채기 어렵고, entitlement 체크 없이 화면을 닫아버릴 수 있음. gestureEnabled=false로 제스처를 비활성화하고 ← 버튼으로만 처리.

---

## 4. 결정 근거

| 결정 | 이유 |
|---|---|
| gestureEnabled=false | 스와이프백 인터셉트가 React Navigation v7에서 완전 신뢰할 수 없음. 헤더 버튼 단일 진입점 유지 |
| 무료 + 일시정지 상태 → 다이얼로그 없이 이동 | 이미 재생 중단 상태이므로 "중단할까요?" 질문이 불필요. ux-flow.md S13 "← 뒤로 탭 (무료) → 재생을 중단할까요?" 는 재생 중 케이스에만 해당 |
| AudioEngine.stopPlayback() 호출 | 단순 pause()가 아닌 stop(). 홈으로 나가면서 타이머도 초기화. clearAllTimers() 포함 |
| 훅으로 분리 | S13 컴포넌트 복잡도 감소 + 테스트 단위 분리 가능 |

---

## 5. 모듈 경계

- **useBackNavigation → AudioEngine**: stopPlayback() 호출 (무료 확인 후)
- **useBackNavigation → navigation**: navigate('Home')
- **S13 PlayScreen → useBackNavigation**: entitlement, isPlaying 전달, handleBack + ConfirmStopDialog 사용
- **S06 HomeScreen**: 이동 후 `currentTrackId` 존재 여부에 따라 MiniPlayer 자동 렌더 (impl/04)

---

## 6. 수용 기준

| # | 시나리오 | 기대 결과 |
|---|---|---|
| AC-01 | Premium + 재생 중 + ← 탭 | 재생 유지, S06 이동, MiniPlayer 노출 |
| AC-02 | Trial + 재생 중 + ← 탭 | 재생 유지, S06 이동, MiniPlayer 노출 |
| AC-03 | 무료 + 재생 중 + ← 탭 | "재생을 중단할까요?" 다이얼로그 |
| AC-04 | 다이얼로그 "중단할게요" | stopPlayback(), S06 이동, MiniPlayer 미노출 |
| AC-05 | 다이얼로그 "계속 들을게요" | 다이얼로그 닫힘, S13 유지, 재생 유지 |
| AC-06 | 무료 + 일시정지 + ← 탭 | 다이얼로그 없이 S06 이동 |
| AC-07 | Android 하드웨어 백 (무료 + 재생 중) | AC-03과 동일 |
| AC-08 | Android 하드웨어 백 (Premium + 재생 중) | AC-01과 동일 |
| AC-09 | iOS 스와이프백 시도 | 제스처 비활성화 — 아무 동작 없음 |

---

## 7. 주의사항

- `AudioEngine.stopPlayback()`은 내부에서 `clearAllTimers()`를 포함해야 함. impl/01에서 확인.
- React Navigation `navigate('Home')`은 홈 화면 스택을 초기화(reset)하지 않음. 히스토리 스택에 S13이 남아 있을 수 있음. 필요 시 `navigation.popToTop()` 검토.
- `ConfirmStopDialog` 컴포넌트가 훅 내부에서 정의되므로 매 렌더마다 재생성됨. 상태(`showConfirm`)가 훅 스코프에 있으므로 문제 없으나, 성능 민감 시 `useMemo`로 감싸거나 별도 파일로 분리.
