/**
 * S08 — RecordModeScreen 테스트
 * impl: docs/milestones/v1/epics/epic-02-recording/impl/05-app-record-mode-screen.md
 */

import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { RecordModeScreen } from '@screens/RecordModeScreen'

// ─── Mock: recordingSlice ──────────────────────────────────────────────────
const mockSetRecordingMode = vi.fn()

vi.mock('@store/recordingSlice', () => ({
  useRecordingStore: vi.fn(() => ({
    setRecordingMode: mockSetRecordingMode,
    selectedSongKey: 'test-song-key',
  })),
}))

// ─── Mock: authSlice ────────────────────────────────────────────────────────
// useAuthStore는 Epic 01 store. entitlement: 'free' | 'premium', generationCount: number
const mockUseAuthStore = vi.fn()

vi.mock('@store/authSlice', () => ({
  useAuthStore: mockUseAuthStore,
}))

// ─── Mock: navigation ───────────────────────────────────────────────────────
const mockNavigate = vi.fn()
const mockNavigation = { navigate: mockNavigate } as any

// ─── helpers ────────────────────────────────────────────────────────────────
function renderScreen() {
  return render(
    <RecordModeScreen
      navigation={mockNavigation}
      route={{ key: 'RecordMode', name: 'RecordMode', params: undefined } as any}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────

describe('RecordModeScreen (S08) — 기본 렌더링', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuthStore.mockReturnValue({ entitlement: 'premium', generationCount: 0 })
  })

  it('REQ-01: 허밍 모드 카드가 렌더링된다', () => {
    const { getByText } = renderScreen()
    expect(getByText('허밍 모드')).toBeTruthy()
  })

  it('REQ-01: 쉿 모드 카드가 렌더링된다', () => {
    const { getByText } = renderScreen()
    expect(getByText('쉿 모드')).toBeTruthy()
  })

  it('REQ-01: 화면 타이틀 "어떻게 녹음할까요?"가 표시된다', () => {
    const { getByText } = renderScreen()
    expect(getByText('어떻게 녹음할까요?')).toBeTruthy()
  })

  it('REQ-01: 허밍 카드 설명 텍스트가 표시된다', () => {
    const { getByText } = renderScreen()
    expect(getByText('흥얼거리듯 멜로디를 따라 불러주세요')).toBeTruthy()
  })

  it('REQ-01: 쉿 카드 설명 텍스트가 표시된다', () => {
    const { getByText } = renderScreen()
    expect(getByText('쉬이이~ 하고 달래는 소리를 내주세요')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('RecordModeScreen (S08) — 허밍 카드 탭', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuthStore.mockReturnValue({ entitlement: 'premium', generationCount: 0 })
  })

  it('REQ-02/04: 허밍 카드 탭 시 setRecordingMode("humming")가 호출된다', () => {
    const { getByLabelText } = renderScreen()
    fireEvent.press(getByLabelText('허밍 모드 선택'))
    expect(mockSetRecordingMode).toHaveBeenCalledWith('humming')
  })

  it('REQ-02: 허밍 카드 탭 시 RecordGuide로 navigate된다', () => {
    const { getByLabelText } = renderScreen()
    fireEvent.press(getByLabelText('허밍 모드 선택'))
    expect(mockNavigate).toHaveBeenCalledWith('RecordGuide', { mode: 'humming' })
  })

  it('REQ-02: 허밍 카드 탭 시 setRecordingMode가 navigate보다 먼저 호출된다', () => {
    const callOrder: string[] = []
    mockSetRecordingMode.mockImplementation(() => callOrder.push('setMode'))
    mockNavigate.mockImplementation(() => callOrder.push('navigate'))

    const { getByLabelText } = renderScreen()
    fireEvent.press(getByLabelText('허밍 모드 선택'))

    expect(callOrder).toEqual(['setMode', 'navigate'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('RecordModeScreen (S08) — 쉿 카드 탭', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuthStore.mockReturnValue({ entitlement: 'premium', generationCount: 0 })
  })

  it('REQ-03/04: 쉿 카드 탭 시 setRecordingMode("shush")가 호출된다', () => {
    const { getByLabelText } = renderScreen()
    fireEvent.press(getByLabelText('쉿 모드 선택'))
    expect(mockSetRecordingMode).toHaveBeenCalledWith('shush')
  })

  it('REQ-03: 쉿 카드 탭 시 RecordGuide로 navigate된다', () => {
    const { getByLabelText } = renderScreen()
    fireEvent.press(getByLabelText('쉿 모드 선택'))
    expect(mockNavigate).toHaveBeenCalledWith('RecordGuide', { mode: 'shush' })
  })

  it('REQ-04: 쉿 카드 탭 시 recordingMode가 "shush"로만 저장된다 (humming 아님)', () => {
    const { getByLabelText } = renderScreen()
    fireEvent.press(getByLabelText('쉿 모드 선택'))
    expect(mockSetRecordingMode).not.toHaveBeenCalledWith('humming')
    expect(mockSetRecordingMode).toHaveBeenCalledWith('shush')
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('RecordModeScreen (S08) — 무료 유저 카운터 칩', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('REQ-05: 무료 유저 entitlement="free"이면 "생성 N/3" 칩이 표시된다', () => {
    mockUseAuthStore.mockReturnValue({ entitlement: 'free', generationCount: 1 })
    const { getByText } = renderScreen()
    expect(getByText('생성 1/3')).toBeTruthy()
  })

  it('REQ-05: generationCount 값이 칩에 반영된다 (0회)', () => {
    mockUseAuthStore.mockReturnValue({ entitlement: 'free', generationCount: 0 })
    const { getByText } = renderScreen()
    expect(getByText('생성 0/3')).toBeTruthy()
  })

  it('REQ-05: generationCount 값이 칩에 반영된다 (3회 — 최대)', () => {
    mockUseAuthStore.mockReturnValue({ entitlement: 'free', generationCount: 3 })
    const { getByText } = renderScreen()
    expect(getByText('생성 3/3')).toBeTruthy()
  })

  it('REQ-05: 유료 유저 entitlement="premium"이면 카운터 칩이 표시되지 않는다', () => {
    mockUseAuthStore.mockReturnValue({ entitlement: 'premium', generationCount: 0 })
    const { queryByText } = renderScreen()
    expect(queryByText(/생성 \d+\/3/)).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('RecordModeScreen (S08) — 접근성', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuthStore.mockReturnValue({ entitlement: 'premium', generationCount: 0 })
  })

  it('REQ-06: 허밍 카드에 accessibilityLabel "허밍 모드 선택"이 있다', () => {
    const { getByLabelText } = renderScreen()
    expect(getByLabelText('허밍 모드 선택')).toBeTruthy()
  })

  it('REQ-06: 쉿 카드에 accessibilityLabel "쉿 모드 선택"이 있다', () => {
    const { getByLabelText } = renderScreen()
    expect(getByLabelText('쉿 모드 선택')).toBeTruthy()
  })

  it('REQ-06: 각 카드의 accessibilityRole이 "button"이다 (허밍)', () => {
    const { getByLabelText } = renderScreen()
    const card = getByLabelText('허밍 모드 선택')
    expect(card.props.accessibilityRole).toBe('button')
  })

  it('REQ-06: 각 카드의 accessibilityRole이 "button"이다 (쉿)', () => {
    const { getByLabelText } = renderScreen()
    const card = getByLabelText('쉿 모드 선택')
    expect(card.props.accessibilityRole).toBe('button')
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('RecordModeScreen (S08) — 엣지 케이스', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuthStore.mockReturnValue({ entitlement: 'premium', generationCount: 0 })
  })

  it('허밍 카드에만 "추천 · 더 자연스럽게" 배지가 표시된다', () => {
    const { getByText } = renderScreen()
    expect(getByText('추천 · 더 자연스럽게')).toBeTruthy()
  })

  it('쉿 카드에는 배지가 표시되지 않는다', () => {
    const { queryAllByText } = renderScreen()
    // badge가 하나만 존재해야 함 (humming에만)
    const badges = queryAllByText('추천 · 더 자연스럽게')
    expect(badges).toHaveLength(1)
  })

  it('카드 탭 시 navigate가 정확히 1회만 호출된다', () => {
    const { getByLabelText } = renderScreen()
    fireEvent.press(getByLabelText('허밍 모드 선택'))
    expect(mockNavigate).toHaveBeenCalledTimes(1)
  })

  it('두 카드를 연속 탭 시 각각 독립적으로 navigate가 호출된다', () => {
    const { getByLabelText } = renderScreen()
    fireEvent.press(getByLabelText('허밍 모드 선택'))
    fireEvent.press(getByLabelText('쉿 모드 선택'))
    expect(mockNavigate).toHaveBeenCalledTimes(2)
    expect(mockNavigate).toHaveBeenNthCalledWith(1, 'RecordGuide', { mode: 'humming' })
    expect(mockNavigate).toHaveBeenNthCalledWith(2, 'RecordGuide', { mode: 'shush' })
  })

  it('카드 pressIn 시 pressed 스타일 상태가 적용된다', () => {
    const { getByLabelText } = renderScreen()
    const hummingCard = getByLabelText('허밍 모드 선택')
    fireEvent(hummingCard, 'pressIn')
    // pressed 상태에서는 cardPressed 스타일(scale+border)이 추가됨
    // style prop 배열에 falsy가 아닌 값이 2개 이상 존재 (기본 + pressed)
    const styleArray = Array.isArray(hummingCard.props.style)
      ? hummingCard.props.style
      : [hummingCard.props.style]
    const hasActiveStyle = styleArray.some(
      (s: any) => s && typeof s === 'object' && s.borderColor === '#5A7AA8'
    )
    expect(hasActiveStyle).toBe(true)
  })

  it('카드 pressOut 후 pressed 스타일이 해제된다', () => {
    const { getByLabelText } = renderScreen()
    const hummingCard = getByLabelText('허밍 모드 선택')
    fireEvent(hummingCard, 'pressIn')
    fireEvent(hummingCard, 'pressOut')
    const styleArray = Array.isArray(hummingCard.props.style)
      ? hummingCard.props.style
      : [hummingCard.props.style]
    const hasActiveStyle = styleArray.some(
      (s: any) => s && typeof s === 'object' && s.borderColor === '#5A7AA8'
    )
    expect(hasActiveStyle).toBe(false)
  })
})
