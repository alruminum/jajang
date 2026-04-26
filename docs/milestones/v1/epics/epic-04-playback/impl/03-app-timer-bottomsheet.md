---
depth: std
design: skipped
---

# impl/03 — 타이머 바텀시트 (C04 TimerBottomSheet)

**커버 스토리**: Story 4 (수면 타이머)  
**선행 조건**: impl/01 AudioEngine 완료 (setTimer, clearTimer, fadeOutAndStop), impl/02 PlayScreen (TimerButton 노출 시점)  
**예상 소요**: 1일

---

## 1. 생성/수정 파일

| 경로 | 동작 | 비고 |
|---|---|---|
| `apps/mobile/src/components/TimerBottomSheet.tsx` | 신규 생성 | 타이머 선택 시트 |
| `apps/mobile/src/audio/AudioEngine.ts` | 수정 | setTimer, clearTimer, notifyOneMinuteWarning (impl/01에서 선언, 여기서 구현 보완) |

---

## 2. TS 인터페이스

```typescript
// 타이머 옵션 상수
export const TIMER_OPTIONS = [
  { label: '30분',   durationMs: 30 * 60 * 1000 },
  { label: '1시간',  durationMs: 60 * 60 * 1000 },
  { label: '2시간',  durationMs: 2 * 60 * 60 * 1000 },
  { label: '6시간',  durationMs: 6 * 60 * 60 * 1000 },
  { label: '10시간', durationMs: 10 * 60 * 60 * 1000 },
] as const

interface TimerBottomSheetProps {
  visible: boolean
  currentEndsAt: number | null   // PlayerSlice.timerEndsAt
  onClose: () => void
}
```

---

## 3. 핵심 로직 의사코드

### 3-1. TimerBottomSheet 렌더

```typescript
function TimerBottomSheet({ visible, currentEndsAt, onClose }) {
  const handleSelect = (durationMs: number) => {
    AudioEngine.setTimer(durationMs)
    onClose()
  }

  const handleClear = () => {
    AudioEngine.clearTimer()
    onClose()
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <Text style={styles.title}>언제 꺼드릴까요?</Text>

        {TIMER_OPTIONS.map(({ label, durationMs }) => (
          <TouchableOpacity
            key={label}
            style={styles.option}
            onPress={() => handleSelect(durationMs)}
            accessibilityLabel={`${label} 후 종료`}
          >
            <Text style={styles.optionLabel}>{label}</Text>
          </TouchableOpacity>
        ))}

        {currentEndsAt && (
          <TouchableOpacity style={styles.clearOption} onPress={handleClear}>
            <Text style={styles.clearLabel}>타이머 끄기</Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  )
}
```

### 3-2. AudioEngine.setTimer (impl/01 보완)

```typescript
let timerRef: ReturnType<typeof setTimeout> | null = null
let warningTimerRef: ReturnType<typeof setTimeout> | null = null

export function setTimer(durationMs: number) {
  // 기존 타이머 취소
  if (timerRef) clearTimeout(timerRef)
  if (warningTimerRef) clearTimeout(warningTimerRef)
  if (maxPlayTimerRef) clearTimeout(maxPlayTimerRef)

  const endsAt = Date.now() + durationMs
  usePlayerStore.setState({ timerEndsAt: endsAt })

  // 1분 전 알림 예약
  const oneMinBefore = durationMs - 60_000
  if (oneMinBefore > 0) {
    warningTimerRef = setTimeout(notifyOneMinuteWarning, oneMinBefore)
  }

  // 만료 시 fade-out 종료
  timerRef = setTimeout(() => fadeOutAndStop('timer_expired'), durationMs)
}

export function clearTimer() {
  if (timerRef) clearTimeout(timerRef)
  if (warningTimerRef) clearTimeout(warningTimerRef)
  timerRef = null
  warningTimerRef = null
  usePlayerStore.setState({ timerEndsAt: null })

  // 10시간 타이머 재활성화
  const elapsed = playbackStartTime ? Date.now() - playbackStartTime : 0
  const remaining = MAX_PLAY_MS - elapsed
  if (remaining > 0) {
    maxPlayTimerRef = setTimeout(() => fadeOutAndStop('max_playtime_reached'), remaining)
  }
}
```

### 3-3. notifyOneMinuteWarning

```typescript
async function notifyOneMinuteWarning() {
  const { notificationPermission } = usePlayerStore.getState()

  if (notificationPermission === 'granted') {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '자장',
        body: '1분 후 자장가가 끝나요',
        sound: false,
      },
      trigger: null,  // 즉시 발송
    })
  } else {
    // 인앱 배너 degrade
    usePlayerStore.setState({ showTimerWarningBanner: true })
    // 배너는 S13에서 showTimerWarningBanner watch → 인라인 배너 렌더 (impl/02 §3-1 참조)
  }
}
```

### 3-4. 타이머 상태 앱 종료/재실행 복원

```typescript
// PlayerSlice persist 미들웨어에 timerEndsAt 포함
// 앱 재실행 시 AudioEngine.setupAudioEngine()에서 복원 처리

// apps/mobile/src/audio/AudioEngine.ts setupAudioEngine() 내부에 추가:
const { timerEndsAt } = usePlayerStore.getState()
if (timerEndsAt) {
  const remaining = timerEndsAt - Date.now()
  if (remaining > 60_000) {
    // 복원: 1분 이상 남은 경우만 유효
    const oneMinBefore = remaining - 60_000
    warningTimerRef = setTimeout(notifyOneMinuteWarning, oneMinBefore)
    timerRef = setTimeout(() => fadeOutAndStop('timer_expired'), remaining)
  } else if (remaining > 0) {
    // 1분 미만 남은 상태로 복귀: 즉시 배너
    notifyOneMinuteWarning()
    timerRef = setTimeout(() => fadeOutAndStop('timer_expired'), remaining)
  } else {
    // 만료된 상태: 초기화
    usePlayerStore.setState({ timerEndsAt: null })
  }
}
```

---

## 4. 결정 근거

| 결정 | 이유 |
|---|---|
| 알림 권한 거부 시 인앱 배너 degrade | ux-flow.md S13 "타임아웃 1분 전 (알림 거부) → 인앱 배너 '1분 후 종료돼요'" 명시. OS 알림이 없어도 사용자에게 정보 전달 |
| 타이머 설정 시 maxPlayTimer 취소 | 10시간 자동 종료와 타이머가 경쟁하지 않도록. 타이머가 우선 |
| clearTimer 시 maxPlayTimer 재활성화 | 타이머 취소 후 잔여 10시간 기준 재계산 |
| PlayerSlice timerEndsAt persist | 앱 재실행 후에도 타이머 상태 유지 (ux-flow.md Story 4 수용 기준: "앱 종료/재실행 시 타이머 상태 유지") |
| 1분 미만 복원 시 즉시 배너 | 잠든 상태에서 재실행했을 때 경고가 누락되지 않도록 |

---

## 5. 모듈 경계

- **TimerBottomSheet → AudioEngine**: setTimer, clearTimer 호출
- **TimerBottomSheet → PlayerSlice**: currentEndsAt (read-only, props로 전달받음)
- **S13 PlayScreen → TimerBottomSheet**: `visible`, `onClose`, `currentEndsAt` props 전달
- **AudioEngine.notifyOneMinuteWarning → PlayerSlice**: `showTimerWarningBanner` setState
- **S13 PlayScreen**: `showTimerWarningBanner` watch → 인앱 배너 인라인 렌더 (impl/02에서 담당)

---

## 6. 수용 기준

| # | 시나리오 | 기대 결과 |
|---|---|---|
| AC-01 | 타이머 아이콘 탭 | 바텀시트 slide-up 노출, 5개 옵션 표시 |
| AC-02 | 타이머 미설정 상태 바텀시트 | "타이머 끄기" 옵션 미노출 |
| AC-03 | 타이머 설정 상태 바텀시트 | "타이머 끄기" 옵션 노출 |
| AC-04 | "2시간" 선택 | timerEndsAt=now+7200000, 시트 닫힘, S13 "2시간 남음" 레이블 |
| AC-05 | 2시간 경과 | 10초 fade-out 후 isPlaying=false |
| AC-06 | 타이머 1분 전 (알림 허용) | expo-notifications 즉시 로컬 푸시 발송 |
| AC-07 | 타이머 1분 전 (알림 거부) | showTimerWarningBanner=true, S13 인앱 배너 노출 |
| AC-08 | 재생 수동 정지 | stopPlayback() 내부에서 clearTimer() 호출 → timerEndsAt=null |
| AC-09 | 앱 종료 후 재실행 (타이머 30분 남음) | 복원 후 30분 뒤 fade-out 종료 |
| AC-10 | 앱 종료 후 재실행 (타이머 만료됨) | timerEndsAt=null 초기화 |

---

## 7. 주의사항

- `Notifications.scheduleNotificationAsync` 호출 전 `expo-notifications` 설정(`setNotificationHandler`)이 앱 진입 시 완료되어야 함. `index.js` 또는 App.tsx에서 초기화 확인.
- 타이머 복원 로직(§3-4)은 `setupAudioEngine()` 내 재생이 없는 상태에서도 실행됨. 재생 상태가 아닌 경우 타이머 복원은 skip (isPlaying 체크 추가).
- 바텀시트를 React Navigation 모달이 아닌 인라인 Modal로 구현. 이유: S13 화면 위에만 오버레이, 네비게이션 스택 오염 방지.
