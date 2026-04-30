/**
 * S09 — RecordGuideScreen 테스트
 * impl: docs/bugfix/#108-mic-permission-flow.md
 * 마이크 권한 흐름 3-갈래 분기 검증
 */

import React from 'react'
import { render, fireEvent, cleanup } from '@testing-library/react-native'
import { Linking } from 'react-native'
import { RecordGuideScreen } from '@screens/RecordGuideScreen'

// ─── Mock: expo-audio (권한 API) ──────────────────────────────────────────────
const mockGetPermissions = jest.fn()
const mockRequestPermissions = jest.fn()

jest.mock('expo-audio', () => ({
  getRecordingPermissionsAsync: mockGetPermissions,
  requestRecordingPermissionsAsync: mockRequestPermissions,
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}))

// ─── Mock: challengesApi ──────────────────────────────────────────────────────
const mockGetRandomPhrase = jest.fn()

jest.mock('@services/api/challenges', () => ({
  challengesApi: {
    getRandomPhrase: mockGetRandomPhrase,
  },
}))

// ─── Mock: navigation ─────────────────────────────────────────────────────────
const mockNavigate = jest.fn()
const mockNavigation = { navigate: mockNavigate } as any

// ─── helpers ─────────────────────────────────────────────────────────────────
function renderScreen() {
  return render(
    <RecordGuideScreen
      navigation={mockNavigation}
      route={{ key: 'RecordGuide', name: 'RecordGuide', params: { mode: 'humming' } } as any}
    />
  )
}

// ─── 전역 teardown: 각 테스트 후 pending async 소진 + 컴포넌트 unmount ──────────
afterEach(async () => {
  await Promise.resolve()
  await Promise.resolve()
  cleanup()
})

// ─────────────────────────────────────────────────────────────────────────────

describe('RecordGuideScreen (S09) — 권한 분기: granted', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetRandomPhrase.mockResolvedValue({ phrase: '자장 자장 우리 아기' })
  })

  it('REQ-01: granted 상태에서 버튼 탭 → navigate("Record") 호출', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'granted', canAskAgain: true, granted: true })
    const { getByLabelText } = renderScreen()
    fireEvent.press(getByLabelText('녹음 시작'))
    await Promise.resolve()
    expect(mockNavigate).toHaveBeenCalledWith('Record', { mode: 'humming', songKey: '' })
  })

  it('REQ-01: granted 상태에서 requestPermissionsAsync는 호출되지 않는다', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'granted', canAskAgain: true, granted: true })
    const { getByLabelText } = renderScreen()
    fireEvent.press(getByLabelText('녹음 시작'))
    await Promise.resolve()
    expect(mockRequestPermissions).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('RecordGuideScreen (S09) — 권한 분기: canAskAgain=true', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetRandomPhrase.mockResolvedValue({ phrase: '자장 자장 우리 아기' })
  })

  it('REQ-02: canAskAgain=true, requestPermissions → granted → navigate 호출', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'denied', canAskAgain: true, granted: false })
    mockRequestPermissions.mockResolvedValue({ status: 'granted', granted: true })
    const { getByLabelText } = renderScreen()
    fireEvent.press(getByLabelText('녹음 시작'))
    await Promise.resolve()
    await Promise.resolve()
    expect(mockNavigate).toHaveBeenCalledWith('Record', { mode: 'humming', songKey: '' })
  })

  it('REQ-03: canAskAgain=true, requestPermissions → denied, 이후 canAskAgain=false → 모달 표시', async () => {
    mockGetPermissions
      .mockResolvedValueOnce({ status: 'denied', canAskAgain: true, granted: false })
      .mockResolvedValueOnce({ status: 'denied', canAskAgain: false, granted: false })
    mockRequestPermissions.mockResolvedValue({ status: 'denied', granted: false })
    const { getByLabelText, findByText } = renderScreen()
    fireEvent.press(getByLabelText('녹음 시작'))
    expect(await findByText('마이크 접근이 필요해요')).toBeTruthy()
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('RecordGuideScreen (S09) — 권한 분기: canAskAgain=false', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetRandomPhrase.mockResolvedValue({ phrase: '자장 자장 우리 아기' })
  })

  it('REQ-04: canAskAgain=false → 모달 즉시 표시, requestPermissions 미호출', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'denied', canAskAgain: false, granted: false })
    const { getByLabelText, findByText } = renderScreen()
    fireEvent.press(getByLabelText('녹음 시작'))
    expect(await findByText('마이크 접근이 필요해요')).toBeTruthy()
    expect(mockRequestPermissions).not.toHaveBeenCalled()
  })

  it('REQ-04: canAskAgain=false → navigate 호출 없음', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'denied', canAskAgain: false, granted: false })
    const { getByLabelText } = renderScreen()
    fireEvent.press(getByLabelText('녹음 시작'))
    await Promise.resolve()
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('RecordGuideScreen (S09) — 권한 모달 동작', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetRandomPhrase.mockResolvedValue({ phrase: '자장 자장 우리 아기' })
    mockGetPermissions.mockResolvedValue({ status: 'denied', canAskAgain: false, granted: false })
  })

  it('REQ-05: 모달 "설정으로 가기" 탭 → Linking.openSettings() 호출', async () => {
    const { getByLabelText, findByText, getByText } = renderScreen()
    fireEvent.press(getByLabelText('녹음 시작'))
    await findByText('마이크 접근이 필요해요')
    fireEvent.press(getByText('설정으로 가기'))
    expect(Linking.openSettings).toHaveBeenCalled()
  })

  it('REQ-06: 모달 "나중에" 탭 → 모달 닫힘', async () => {
    const { getByLabelText, findByText, getByText, queryByText } = renderScreen()
    fireEvent.press(getByLabelText('녹음 시작'))
    await findByText('마이크 접근이 필요해요')
    fireEvent.press(getByText('나중에'))
    expect(queryByText('마이크 접근이 필요해요')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('RecordGuideScreen (S09) — 가이드 렌더링', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetRandomPhrase.mockResolvedValue({ phrase: '자장 자장 우리 아기' })
    mockGetPermissions.mockResolvedValue({ status: 'granted', canAskAgain: true, granted: true })
  })

  it('REQ-07: 가이드 항목 "조용한 방에서 해주세요" 표시', () => {
    const { getByText } = renderScreen()
    expect(getByText('조용한 방에서 해주세요')).toBeTruthy()
  })

  it('REQ-07: 가이드 항목 "마이크를 입에서 20~30cm 거리로" 표시', () => {
    const { getByText } = renderScreen()
    expect(getByText('마이크를 입에서 20~30cm 거리로')).toBeTruthy()
  })

  it('REQ-07: 가이드 항목 "30초 이상 이어주세요" 표시', () => {
    const { getByText } = renderScreen()
    expect(getByText('30초 이상 이어주세요')).toBeTruthy()
  })

  it('REQ-08: challengePhrase 로드 성공 → 문구 화면에 표시', async () => {
    mockGetRandomPhrase.mockResolvedValue({ phrase: '우리 아기 잘도 잔다' })
    const { findByText } = renderScreen()
    expect(await findByText('"우리 아기 잘도 잔다"')).toBeTruthy()
  })
})
