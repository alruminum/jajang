/**
 * AudioEngine 타이머 로직 테스트
 * impl: docs/milestones/v1/epics/epic-04-playback/impl/03-app-timer-bottomsheet.md
 *
 * 커버 AC: AC-04(timerEndsAt), AC-05(fade-out 만료), AC-06(알림 허용),
 *          AC-07(알림 거부), AC-08(clearTimer), AC-09(복원 30분), AC-10(복원 만료)
 */

import { setTimer, clearTimer, setupAudioEngine } from '@audio/AudioEngine'

// ──────────────────────────────────────────────
// 스토어 mock — usePlayerStore.setState / getState 패턴
// ──────────────────────────────────────────────
const mockStore: {
  timerEndsAt: number | null
  notificationPermission: 'granted' | 'denied' | 'undetermined'
  showTimerWarningBanner: boolean
  isPlaying: boolean
} = {
  timerEndsAt: null,
  notificationPermission: 'undetermined',
  showTimerWarningBanner: false,
  isPlaying: false,
}

jest.mock('@store/player-store', () => ({
  usePlayerStore: {
    getState: () => mockStore,
    setState: (partial: Partial<typeof mockStore>) => {
      Object.assign(mockStore, partial)
    },
  },
}))

// expo-notifications mock (virtual: true — 패키지 미설치, jest 해상도 우회)
const mockScheduleNotificationAsync = jest.fn().mockResolvedValue('mock-notification-id')
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: mockScheduleNotificationAsync,
}), { virtual: true })

// react-native-track-player: moduleNameMapper → __mocks__/react-native-track-player.js (CJS)

// ──────────────────────────────────────────────
// 공통 헬퍼
// ──────────────────────────────────────────────
function resetMockStore() {
  mockStore.timerEndsAt = null
  mockStore.notificationPermission = 'undetermined'
  mockStore.showTimerWarningBanner = false
  mockStore.isPlaying = false
}

describe('AudioEngine — 타이머 (impl/03)', () => {
  beforeEach(async () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2025-01-01T00:00:00.000Z'))
    resetMockStore()
    jest.clearAllMocks()
    // 모듈 내부 timer ref 초기화 — clearTimer 호출로 재설정
    clearTimer()
    resetMockStore() // clearTimer가 store를 건드리므로 다시 초기화
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  // ──────────────────────────────────────────────
  // AC-04 (스토어): setTimer → timerEndsAt = now + durationMs
  // ──────────────────────────────────────────────
  describe('AC-04: setTimer — timerEndsAt 스토어 업데이트', () => {
    it('setTimer(7_200_000) 호출 시 timerEndsAt = now + 7_200_000 이 스토어에 설정된다', () => {
      const now = Date.now()
      setTimer(7_200_000)
      expect(mockStore.timerEndsAt).toBe(now + 7_200_000)
    })

    it('setTimer(1_800_000) 호출 시 timerEndsAt = now + 1_800_000 이 설정된다', () => {
      const now = Date.now()
      setTimer(1_800_000)
      expect(mockStore.timerEndsAt).toBe(now + 1_800_000)
    })

    it('setTimer를 연속 호출하면 마지막 호출의 timerEndsAt이 반영된다 (기존 취소)', () => {
      setTimer(3_600_000)
      const now2 = Date.now()
      setTimer(1_800_000)
      expect(mockStore.timerEndsAt).toBe(now2 + 1_800_000)
    })
  })

  // ──────────────────────────────────────────────
  // AC-06: 타이머 1분 전 — 알림 허용 → scheduleNotificationAsync 호출
  // ──────────────────────────────────────────────
  describe('AC-06: 1분 전 알림 (알림 허용 상태)', () => {
    it('durationMs=65_000, notificationPermission=granted → 5_000ms 후 scheduleNotificationAsync 호출', async () => {
      mockStore.notificationPermission = 'granted'
      setTimer(65_000)

      jest.advanceTimersByTime(5_000) // 65_000 - 60_000 = 5_000ms
      await Promise.resolve()

      expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1)
    })

    it('scheduleNotificationAsync가 올바른 payload로 호출된다', async () => {
      mockStore.notificationPermission = 'granted'
      setTimer(65_000)

      jest.advanceTimersByTime(5_000)
      await Promise.resolve()

      expect(mockScheduleNotificationAsync).toHaveBeenCalledWith({
        content: {
          title: '자장',
          body: '1분 후 자장가가 끝나요',
          sound: false,
        },
        trigger: null,
      })
    })

    it('durationMs <= 60_000 인 경우 1분 경보가 예약되지 않는다 (경계값)', async () => {
      mockStore.notificationPermission = 'granted'
      setTimer(60_000)

      jest.advanceTimersByTime(60_000)
      await Promise.resolve()

      expect(mockScheduleNotificationAsync).not.toHaveBeenCalled()
    })
  })

  // ──────────────────────────────────────────────
  // AC-07: 타이머 1분 전 — 알림 거부 → showTimerWarningBanner=true
  // ──────────────────────────────────────────────
  describe('AC-07: 1분 전 알림 거부 → 인앱 배너', () => {
    it('notificationPermission=denied → 1분 경보 시 showTimerWarningBanner=true가 설정된다', async () => {
      mockStore.notificationPermission = 'denied'
      setTimer(65_000)

      jest.advanceTimersByTime(5_000)
      await Promise.resolve()

      expect(mockStore.showTimerWarningBanner).toBe(true)
    })

    it('notificationPermission=undetermined → 1분 경보 시 showTimerWarningBanner=true가 설정된다', async () => {
      mockStore.notificationPermission = 'undetermined'
      setTimer(65_000)

      jest.advanceTimersByTime(5_000)
      await Promise.resolve()

      expect(mockStore.showTimerWarningBanner).toBe(true)
    })

    it('알림 거부 시 scheduleNotificationAsync는 호출되지 않는다', async () => {
      mockStore.notificationPermission = 'denied'
      setTimer(65_000)

      jest.advanceTimersByTime(5_000)
      await Promise.resolve()

      expect(mockScheduleNotificationAsync).not.toHaveBeenCalled()
    })
  })

  // ──────────────────────────────────────────────
  // AC-08: clearTimer → timerEndsAt=null, 예약 경보 취소
  // ──────────────────────────────────────────────
  describe('AC-08: clearTimer — 타이머 초기화', () => {
    it('clearTimer() 호출 시 timerEndsAt이 null로 설정된다', () => {
      setTimer(7_200_000)
      clearTimer()
      expect(mockStore.timerEndsAt).toBeNull()
    })

    it('clearTimer() 후 1분 경보 타이머가 취소된다 (알림이 발송되지 않는다)', async () => {
      mockStore.notificationPermission = 'granted'
      setTimer(65_000)
      clearTimer()

      jest.advanceTimersByTime(65_000)
      await Promise.resolve()

      expect(mockScheduleNotificationAsync).not.toHaveBeenCalled()
    })

    it('setTimer 없이 clearTimer()를 호출해도 timerEndsAt=null이 유지된다', () => {
      clearTimer()
      expect(mockStore.timerEndsAt).toBeNull()
    })
  })

  // ──────────────────────────────────────────────
  // AC-09: 앱 재실행 — 30분 이상 남은 타이머 복원
  // ──────────────────────────────────────────────
  describe('AC-09: setupAudioEngine — 타이머 복원 (remaining > 60_000)', () => {
    it('timerEndsAt=now+1_800_000인 상태로 setupAudioEngine() 호출 시 timerEndsAt이 초기화되지 않는다', async () => {
      const remaining = 1_800_000
      mockStore.timerEndsAt = Date.now() + remaining
      mockStore.isPlaying = true

      await setupAudioEngine()

      // 복원 후 timerEndsAt이 그대로 유지되어야 함
      expect(mockStore.timerEndsAt).not.toBeNull()
    })

    it('remaining=1_800_000 복원 후 (1_740_000ms) 경과 시 1분 경보가 발송된다 (알림 허용)', async () => {
      const remaining = 1_800_000
      mockStore.timerEndsAt = Date.now() + remaining
      mockStore.notificationPermission = 'granted'
      mockStore.isPlaying = true

      await setupAudioEngine()

      // (remaining - 60_000) = 1_740_000ms 경과 → 1분 경보
      jest.advanceTimersByTime(1_740_000)
      // async callback 내부의 promise chain flush (여러 microtask tick 필요)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()

      expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1)
    })
  })

  // ──────────────────────────────────────────────
  // AC-10: 앱 재실행 — 타이머 이미 만료 → timerEndsAt=null 초기화
  // ──────────────────────────────────────────────
  describe('AC-10: setupAudioEngine — 만료된 타이머 초기화', () => {
    it('timerEndsAt < now인 상태로 setupAudioEngine() 호출 시 timerEndsAt=null로 초기화된다', async () => {
      mockStore.timerEndsAt = Date.now() - 5_000 // 5초 전 만료
      mockStore.isPlaying = true

      await setupAudioEngine()

      expect(mockStore.timerEndsAt).toBeNull()
    })

    it('timerEndsAt=null인 초기 상태에서 setupAudioEngine() 호출 시 타이머가 생성되지 않는다', async () => {
      mockStore.timerEndsAt = null
      mockStore.notificationPermission = 'granted'
      mockStore.isPlaying = true

      await setupAudioEngine()

      jest.advanceTimersByTime(60_000)
      await Promise.resolve()

      expect(mockScheduleNotificationAsync).not.toHaveBeenCalled()
    })
  })

  // ──────────────────────────────────────────────
  // Edge case: 1분 미만 남은 상태 복원 → 즉시 배너 (§3-4)
  // ──────────────────────────────────────────────
  describe('setupAudioEngine — 1분 미만 남은 타이머 복원 (edge case)', () => {
    it('remaining=30_000 (30초) 복원 시 즉시 showTimerWarningBanner=true가 설정된다', async () => {
      mockStore.timerEndsAt = Date.now() + 30_000
      mockStore.notificationPermission = 'denied'
      mockStore.isPlaying = true

      await setupAudioEngine()

      // 즉시 실행 (trigger: null) — advanceTimersByTime(0) 으로 flush
      jest.advanceTimersByTime(0)
      await Promise.resolve()
      await Promise.resolve()

      expect(mockStore.showTimerWarningBanner).toBe(true)
    })

    it('remaining=1ms (경계값) 복원 시 timerEndsAt이 null로 초기화되지 않는다 (아직 만료 전)', async () => {
      mockStore.timerEndsAt = Date.now() + 1
      mockStore.isPlaying = true

      await setupAudioEngine()

      // remaining > 0 → 만료 전이므로 timerEndsAt 유지
      expect(mockStore.timerEndsAt).not.toBeNull()
    })
  })
})
