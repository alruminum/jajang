/**
 * TimerBottomSheet 컴포넌트 테스트
 * impl: docs/milestones/v1/epics/epic-04-playback/impl/03-app-timer-bottomsheet.md
 *
 * 커버 AC: AC-01, AC-02, AC-03, AC-04, AC-08
 */

import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import TimerBottomSheet, { TIMER_OPTIONS } from '@components/TimerBottomSheet'
import * as AudioEngine from '@audio/AudioEngine'

// AudioEngine 의존성 mock — 컴포넌트는 setTimer/clearTimer 호출만 담당
vi.mock('@audio/AudioEngine', () => ({
  setTimer: vi.fn(),
  clearTimer: vi.fn(),
}))

const mockSetTimer = AudioEngine.setTimer as ReturnType<typeof vi.fn>
const mockClearTimer = AudioEngine.clearTimer as ReturnType<typeof vi.fn>

describe('TimerBottomSheet', () => {
  const mockOnClose = vi.fn()

  const defaultProps = {
    visible: true,
    currentEndsAt: null as number | null,
    onClose: mockOnClose,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ──────────────────────────────────────────────
  // AC-01: 타이머 아이콘 탭 → 바텀시트 노출, 5개 옵션 표시
  // ──────────────────────────────────────────────
  describe('AC-01: 바텀시트 노출 및 옵션 목록', () => {
    it('visible=true일 때 "언제 꺼드릴까요?" 타이틀이 표시된다', () => {
      const { getByText } = render(<TimerBottomSheet {...defaultProps} />)
      expect(getByText('언제 꺼드릴까요?')).toBeTruthy()
    })

    it('TIMER_OPTIONS 상수가 정확히 5개다', () => {
      expect(TIMER_OPTIONS).toHaveLength(5)
    })

    it('"30분" 옵션이 표시된다', () => {
      const { getByText } = render(<TimerBottomSheet {...defaultProps} />)
      expect(getByText('30분')).toBeTruthy()
    })

    it('"1시간" 옵션이 표시된다', () => {
      const { getByText } = render(<TimerBottomSheet {...defaultProps} />)
      expect(getByText('1시간')).toBeTruthy()
    })

    it('"2시간" 옵션이 표시된다', () => {
      const { getByText } = render(<TimerBottomSheet {...defaultProps} />)
      expect(getByText('2시간')).toBeTruthy()
    })

    it('"6시간" 옵션이 표시된다', () => {
      const { getByText } = render(<TimerBottomSheet {...defaultProps} />)
      expect(getByText('6시간')).toBeTruthy()
    })

    it('"10시간" 옵션이 표시된다', () => {
      const { getByText } = render(<TimerBottomSheet {...defaultProps} />)
      expect(getByText('10시간')).toBeTruthy()
    })

    it('각 옵션의 accessibilityLabel이 "{label} 후 종료" 형식이다', () => {
      const { getByLabelText } = render(<TimerBottomSheet {...defaultProps} />)
      TIMER_OPTIONS.forEach(({ label }) => {
        expect(getByLabelText(`${label} 후 종료`)).toBeTruthy()
      })
    })
  })

  // ──────────────────────────────────────────────
  // AC-02: 타이머 미설정 상태 → "타이머 끄기" 미노출
  // ──────────────────────────────────────────────
  describe('AC-02: 타이머 미설정 상태 (currentEndsAt=null)', () => {
    it('"타이머 끄기" 옵션이 표시되지 않는다', () => {
      const { queryByText } = render(
        <TimerBottomSheet {...defaultProps} currentEndsAt={null} />,
      )
      expect(queryByText('타이머 끄기')).toBeNull()
    })
  })

  // ──────────────────────────────────────────────
  // AC-03: 타이머 설정 상태 → "타이머 끄기" 노출
  // ──────────────────────────────────────────────
  describe('AC-03: 타이머 설정 상태 (currentEndsAt 값 존재)', () => {
    it('"타이머 끄기" 옵션이 표시된다', () => {
      const { getByText } = render(
        <TimerBottomSheet {...defaultProps} currentEndsAt={Date.now() + 7_200_000} />,
      )
      expect(getByText('타이머 끄기')).toBeTruthy()
    })

    it('currentEndsAt=0이면 "타이머 끄기"가 노출되지 않는다 (falsy 경계값)', () => {
      // 0은 falsy → currentEndsAt && 조건에서 미노출
      const { queryByText } = render(
        <TimerBottomSheet {...defaultProps} currentEndsAt={0} />,
      )
      expect(queryByText('타이머 끄기')).toBeNull()
    })
  })

  // ──────────────────────────────────────────────
  // AC-04: 옵션 선택 → setTimer 호출 + 시트 닫힘
  // ──────────────────────────────────────────────
  describe('AC-04: 타이머 옵션 선택', () => {
    it('"30분" 선택 시 AudioEngine.setTimer(1_800_000)가 호출된다', () => {
      const { getByText } = render(<TimerBottomSheet {...defaultProps} />)
      fireEvent.press(getByText('30분'))
      expect(mockSetTimer).toHaveBeenCalledWith(30 * 60 * 1000)
    })

    it('"1시간" 선택 시 AudioEngine.setTimer(3_600_000)가 호출된다', () => {
      const { getByText } = render(<TimerBottomSheet {...defaultProps} />)
      fireEvent.press(getByText('1시간'))
      expect(mockSetTimer).toHaveBeenCalledWith(60 * 60 * 1000)
    })

    it('"2시간" 선택 시 AudioEngine.setTimer(7_200_000)가 호출된다', () => {
      const { getByText } = render(<TimerBottomSheet {...defaultProps} />)
      fireEvent.press(getByText('2시간'))
      expect(mockSetTimer).toHaveBeenCalledWith(2 * 60 * 60 * 1000)
    })

    it('"6시간" 선택 시 AudioEngine.setTimer(21_600_000)가 호출된다', () => {
      const { getByText } = render(<TimerBottomSheet {...defaultProps} />)
      fireEvent.press(getByText('6시간'))
      expect(mockSetTimer).toHaveBeenCalledWith(6 * 60 * 60 * 1000)
    })

    it('"10시간" 선택 시 AudioEngine.setTimer(36_000_000)가 호출된다', () => {
      const { getByText } = render(<TimerBottomSheet {...defaultProps} />)
      fireEvent.press(getByText('10시간'))
      expect(mockSetTimer).toHaveBeenCalledWith(10 * 60 * 60 * 1000)
    })

    it('옵션 선택 후 onClose가 1회 호출된다', () => {
      const { getByText } = render(<TimerBottomSheet {...defaultProps} />)
      fireEvent.press(getByText('2시간'))
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('옵션 선택 시 setTimer가 1회만 호출된다 (중복 호출 없음)', () => {
      const { getByText } = render(<TimerBottomSheet {...defaultProps} />)
      fireEvent.press(getByText('2시간'))
      expect(mockSetTimer).toHaveBeenCalledTimes(1)
    })
  })

  // ──────────────────────────────────────────────
  // AC-08: "타이머 끄기" → clearTimer 호출 + 시트 닫힘
  // ──────────────────────────────────────────────
  describe('AC-08: 타이머 끄기 선택', () => {
    const propsWithTimer = {
      visible: true,
      currentEndsAt: Date.now() + 7_200_000,
      onClose: mockOnClose,
    }

    it('"타이머 끄기" 탭 시 AudioEngine.clearTimer가 1회 호출된다', () => {
      const { getByText } = render(<TimerBottomSheet {...propsWithTimer} />)
      fireEvent.press(getByText('타이머 끄기'))
      expect(mockClearTimer).toHaveBeenCalledTimes(1)
    })

    it('"타이머 끄기" 탭 후 onClose가 1회 호출된다', () => {
      const { getByText } = render(<TimerBottomSheet {...propsWithTimer} />)
      fireEvent.press(getByText('타이머 끄기'))
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('"타이머 끄기" 탭 시 setTimer는 호출되지 않는다', () => {
      const { getByText } = render(<TimerBottomSheet {...propsWithTimer} />)
      fireEvent.press(getByText('타이머 끄기'))
      expect(mockSetTimer).not.toHaveBeenCalled()
    })
  })
})
