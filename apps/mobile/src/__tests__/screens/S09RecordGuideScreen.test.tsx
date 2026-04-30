/**
 * S09 — RecordGuideScreen 테스트
 * impl: docs/milestones/v1/epics/epic-02-recording/impl/13-app-record-guide-pivot.md
 * 마이크 권한 흐름 3-갈래 분기 + 단일 흐름 (mode 파라미터 제거 반영)
 *
 * impl/13 변경점:
 *  - route.params에서 mode 필드 제거 → { songKey: string }
 *  - navigate('Record', { songKey }) — mode 없음
 *  - 가이드 항목 변경: "이어폰을 끼면 더 또렷하게 담겨요" (항상 노출)
 */

import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { Linking } from 'react-native'
import { RecordGuideScreen } from '@screens/RecordGuideScreen'

// ─── Mock: expo-audio (권한 API) ──────────────────────────────────────────────
// jest.mock factory는 파일 최상단으로 hoisting되므로 외부 const 변수를 참조하면
// TDZ(Temporal Dead Zone) 오류 또는 undefined 참조가 발생한다.
// factory 안에서 직접 jest.fn()을 생성하고, beforeEach에서 jest.mocked()로 주입한다.
jest.mock('expo-audio', () => ({
  __esModule: true,
  getRecordingPermissionsAsync: jest.fn(),
  requestRecordingPermissionsAsync: jest.fn(),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}))

// ─── Mock: @react-native-async-storage/async-storage ─────────────────────────
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}))

// ─── Mock: challengesApi (폐기됐으나 import 잔재 방어) ────────────────────────
jest.mock('@services/api/challenges', () => ({
  challengesApi: {
    getRandomPhrase: jest.fn(),
  },
}))

// ─── require로 mock 참조 획득 (hoisting 안전) ─────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-require-imports
const expoAudioMock = require('expo-audio') as {
  getRecordingPermissionsAsync: jest.Mock
  requestRecordingPermissionsAsync: jest.Mock
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const asyncStorageMock = (require('@react-native-async-storage/async-storage') as {
  default: { getItem: jest.Mock; setItem: jest.Mock }
}).default

// ─── Mock: navigation ─────────────────────────────────────────────────────────
const mockNavigate = jest.fn()
const mockNavigation = { navigate: mockNavigate } as any

// ─── helpers ─────────────────────────────────────────────────────────────────
function renderScreen(songKey = 'brahms') {
  return render(
    <RecordGuideScreen
      navigation={mockNavigation}
      route={{ key: 'RecordGuide', name: 'RecordGuide', params: { songKey } } as any}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────

describe('RecordGuideScreen (S09) — 권한 분기: granted (impl/13)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // 이어폰 경고 이미 dismissed — 권한 분기 테스트에서 이어폰 모달이 가로채지 않도록
    asyncStorageMock.getItem.mockResolvedValue('true')
    asyncStorageMock.setItem.mockResolvedValue(undefined)
    expoAudioMock.getRecordingPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true, granted: true })
  })

  it('REQ-01: granted 상태에서 버튼 탭 → navigate("Record", { songKey }) 호출 (mode 없음)', async () => {
    const { getByLabelText } = renderScreen('brahms')
    fireEvent.press(getByLabelText('녹음 시작'))
    await Promise.resolve()
    await Promise.resolve()
    expect(mockNavigate).toHaveBeenCalledWith('Record', { songKey: 'brahms' })
  })

  it('REQ-01: navigate 인자에 mode 필드가 포함되지 않는다', async () => {
    const { getByLabelText } = renderScreen('brahms')
    fireEvent.press(getByLabelText('녹음 시작'))
    await Promise.resolve()
    await Promise.resolve()
    const callArgs = mockNavigate.mock.calls[0]
    expect(callArgs?.[1]).not.toHaveProperty('mode')
  })

  it('REQ-01: granted 상태에서 requestPermissionsAsync는 호출되지 않는다', async () => {
    const { getByLabelText } = renderScreen()
    fireEvent.press(getByLabelText('녹음 시작'))
    await Promise.resolve()
    expect(expoAudioMock.requestRecordingPermissionsAsync).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('RecordGuideScreen (S09) — 권한 분기: canAskAgain=true (impl/13)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    asyncStorageMock.getItem.mockResolvedValue('true')
    asyncStorageMock.setItem.mockResolvedValue(undefined)
  })

  it('REQ-02: canAskAgain=true, requestPermissions → granted → navigate 호출', async () => {
    expoAudioMock.getRecordingPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true, granted: false })
    expoAudioMock.requestRecordingPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true })
    const { getByLabelText } = renderScreen('brahms')
    fireEvent.press(getByLabelText('녹음 시작'))
    // getPermissions(1) → requestPermissions(2) → AsyncStorage.getItem(3) → navigate
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(mockNavigate).toHaveBeenCalledWith('Record', { songKey: 'brahms' })
  })

  it('REQ-03: canAskAgain=true, requestPermissions → denied → 모달 표시', async () => {
    expoAudioMock.getRecordingPermissionsAsync
      .mockResolvedValueOnce({ status: 'denied', canAskAgain: true, granted: false })
      .mockResolvedValueOnce({ status: 'denied', canAskAgain: false, granted: false })
    expoAudioMock.requestRecordingPermissionsAsync.mockResolvedValue({ status: 'denied', granted: false })
    const { getByLabelText, findByText } = renderScreen()
    fireEvent.press(getByLabelText('녹음 시작'))
    expect(await findByText('마이크 접근이 필요해요')).toBeTruthy()
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('RecordGuideScreen (S09) — 권한 분기: canAskAgain=false (impl/13)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    asyncStorageMock.getItem.mockResolvedValue('true')
    asyncStorageMock.setItem.mockResolvedValue(undefined)
    expoAudioMock.getRecordingPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false, granted: false })
  })

  it('REQ-04: canAskAgain=false → 마이크 권한 모달 즉시 표시, requestPermissions 미호출', async () => {
    const { getByLabelText, findByText } = renderScreen()
    fireEvent.press(getByLabelText('녹음 시작'))
    expect(await findByText('마이크 접근이 필요해요')).toBeTruthy()
    expect(expoAudioMock.requestRecordingPermissionsAsync).not.toHaveBeenCalled()
  })

  it('REQ-04: canAskAgain=false → navigate 호출 없음', async () => {
    const { getByLabelText } = renderScreen()
    fireEvent.press(getByLabelText('녹음 시작'))
    await Promise.resolve()
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('RecordGuideScreen (S09) — 권한 모달 동작 (impl/13)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    asyncStorageMock.getItem.mockResolvedValue('true')
    asyncStorageMock.setItem.mockResolvedValue(undefined)
    expoAudioMock.getRecordingPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false, granted: false })
  })

  it('REQ-05: 마이크 모달 "설정으로 가기" 탭 → Linking.openSettings() 호출', async () => {
    const { getByLabelText, findByText, getByText } = renderScreen()
    fireEvent.press(getByLabelText('녹음 시작'))
    await findByText('마이크 접근이 필요해요')
    fireEvent.press(getByText('설정으로 가기'))
    expect(Linking.openSettings).toHaveBeenCalled()
  })

  it('REQ-06: 마이크 모달 "나중에" 탭 → 모달 닫힘', async () => {
    const { getByLabelText, findByText, getByText, queryByText } = renderScreen()
    fireEvent.press(getByLabelText('녹음 시작'))
    await findByText('마이크 접근이 필요해요')
    fireEvent.press(getByText('나중에'))
    expect(queryByText('마이크 접근이 필요해요')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('RecordGuideScreen (S09) — 가이드 렌더링 (impl/13 단일 흐름)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    asyncStorageMock.getItem.mockResolvedValue('true')
    asyncStorageMock.setItem.mockResolvedValue(undefined)
    expoAudioMock.getRecordingPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true, granted: true })
  })

  it('REQ-07: 가이드 항목 "조용한 방에서 해주세요" 표시 (단일 흐름)', () => {
    const { getByText } = renderScreen()
    expect(getByText('조용한 방에서 해주세요')).toBeTruthy()
  })

  it('REQ-07: 가이드 항목 "마이크를 입에서 20~30cm 거리로" 표시', () => {
    const { getByText } = renderScreen()
    expect(getByText('마이크를 입에서 20~30cm 거리로')).toBeTruthy()
  })

  it('REQ-07: 가이드 항목 "이어폰을 끼면 더 또렷하게 담겨요" 표시 (mode 무관 항상 노출)', () => {
    // GUIDE_ITEMS와 HeadphoneChip 컴포넌트 두 곳에 같은 텍스트가 있으므로 getAllByText 사용
    const { getAllByText } = renderScreen()
    expect(getAllByText('이어폰을 끼면 더 또렷하게 담겨요').length).toBeGreaterThanOrEqual(1)
  })
})
