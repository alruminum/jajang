// TDD red — impl/15 §9 수용 기준 (variant-C 시각 정제)
// S10 RecordScreen: 타이머 28px · "녹음 중" 라벨 · 정지 버튼 ring 96dp · encourage accentSecondary
// issue #225

import React from 'react'
import { act, render, waitFor } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

// ─── mock 설정 (S10RecordScreen.bgm.test.tsx 패턴 동일) ─────────────────────

jest.mock('@store/authSlice', () => ({
  useAuthStore: jest.fn(),
}))

jest.mock('../../hooks/useBgmPlayer', () => ({
  useBgmPlayer: jest.fn(),
}))

jest.mock('../../components/LyricsBox', () => ({
  LyricsBox: jest.fn(),
}))

jest.mock('../../data/bgmTracks', () => ({
  BGM_TRACKS: {
    twinkle: {
      titleKo: '반짝반짝 작은 별',
      previewKey: 'twinkle',
      loopDurationMs: 5000,
    },
  },
}))

jest.mock('expo-audio', () => ({
  useAudioRecorder: jest.fn(),
  setAudioModeAsync: jest.fn(async () => {}),
  AudioModule: {
    requestRecordingPermissionsAsync: jest.fn(async () => ({
      granted: true,
    })),
  },
  IOSOutputFormat: { LINEARPCM: 'lpcm' },
  AudioQuality: { MAX: 127, HIGH: 96, MEDIUM: 64, LOW: 32, MIN: 0 },
}))

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native')
  return {
    ...actual,
    useNavigation: jest.fn(),
    useRoute: jest.fn(),
  }
})

// ─── mock 변수 ────────────────────────────────────────────────────────────────

const startBgmMock = jest.fn(async () => {})
const stopBgmMock = jest.fn(async () => {})
let mockBgmState = {
  isPlaying: false,
  loadFailed: false,
}

const recordMock = jest.fn()
const stopRecordingMock = jest.fn(async () => 'file:///recording.m4a')
const navigateMock = jest.fn()
const useRouteMock = jest.fn()

// ─── mock 구현 획득 ───────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useAuthStore } = require('@store/authSlice') as {
  useAuthStore: jest.Mock
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useBgmPlayer } = require('../../hooks/useBgmPlayer') as {
  useBgmPlayer: jest.Mock
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { LyricsBox } = require('../../components/LyricsBox') as {
  LyricsBox: jest.Mock
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useAudioRecorder } = require('expo-audio') as {
  useAudioRecorder: jest.Mock
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useNavigation, useRoute } = require('@react-navigation/native') as {
  useNavigation: jest.Mock
  useRoute: jest.Mock
}

function applyBgmImpl() {
  stopBgmMock.mockImplementation(async () => {
    mockBgmState.isPlaying = false
  })
  startBgmMock.mockImplementation(async () => {
    if (mockBgmState.loadFailed) return
    mockBgmState.isPlaying = true
  })
  useBgmPlayer.mockImplementation(
    ({
      enabled,
      onLoadError,
      onPlaybackEnd,
    }: {
      enabled: boolean
      onLoadError?: () => void
      onPlaybackEnd?: () => void
    }) => {
      return {
        isPlaying: enabled && mockBgmState.isPlaying,
        loadFailed: mockBgmState.loadFailed,
        startBgm: async () => {
          await startBgmMock()
          if (mockBgmState.loadFailed) onLoadError?.()
        },
        stopBgm: stopBgmMock,
        onPlaybackEnd,
      }
    },
  )
}

import { RecordScreen } from '../../screens/RecordScreen'

beforeEach(() => {
  startBgmMock.mockClear()
  stopBgmMock.mockClear()
  navigateMock.mockClear()
  recordMock.mockClear()
  stopRecordingMock.mockClear()
  LyricsBox.mockClear()

  mockBgmState = { isPlaying: false, loadFailed: false }
  applyBgmImpl()

  useAuthStore.mockReturnValue({ entitlement: 'free', generationCount: 0 })

  LyricsBox.mockImplementation(
    ({ songKey }: { songKey: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Text } = require('react-native') as {
        Text: React.ComponentType<{
          testID?: string
          children?: React.ReactNode
        }>
      }
      return React.createElement(
        Text,
        { testID: 'lyrics-box-recording' },
        `LyricsBox:${songKey}`,
      )
    },
  )

  useAudioRecorder.mockReturnValue({
    record: recordMock,
    stop: stopRecordingMock,
    uri: 'file:///recording.m4a',
  })

  useNavigation.mockReturnValue({ navigate: navigateMock, goBack: jest.fn() })

  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

const setRoute = (params: { songKey: string }) => {
  useRouteMock.mockReturnValue({ params })
  useRoute.mockReturnValue({ params })
}

/** 카운트다운 3초 → recording phase 진입 */
const advanceCountdown = async () => {
  await act(async () => {
    jest.advanceTimersByTime(3500)
    await Promise.resolve()
  })
}

// ─── 헬퍼: StyleSheet.flatten + 중첩 배열 처리 ────────────────────────────────
function flatStyle(style: unknown): Record<string, unknown> {
  return StyleSheet.flatten(style as Parameters<typeof StyleSheet.flatten>[0]) ?? {}
}

// ─────────────────────────────────────────────────────────────────────────────
describe('RecordScreen — variant-C 시각 정제 (impl/15 §9)', () => {
  // ────────────────────────────────────────────────────────────────────────────
  // REQ-001: recording phase 진입 후 "녹음 중" 라벨 노출
  // ────────────────────────────────────────────────────────────────────────────
  it('REQ-001: recording phase 진입 후 testID=recording-status-label 요소 존재', async () => {
    setRoute({ songKey: 'twinkle' })
    const { findByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    const label = await findByTestId('recording-status-label')
    expect(label).toBeTruthy()
  })

  it('REQ-001: recording-status-label 의 텍스트 내용이 "녹음 중"', async () => {
    setRoute({ songKey: 'twinkle' })
    const { findByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    const label = await findByTestId('recording-status-label')
    // children prop 또는 textContent 로 확인
    expect(label.props.children).toBe('녹음 중')
  })

  // ────────────────────────────────────────────────────────────────────────────
  // REQ-002: "녹음 중" 라벨 색상 = darkColors.textSecondary (#7B80A0)
  // ────────────────────────────────────────────────────────────────────────────
  it('REQ-002: recording-status-label 의 style.color === "#7B80A0" (darkColors.textSecondary)', async () => {
    setRoute({ songKey: 'twinkle' })
    const { findByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    const label = await findByTestId('recording-status-label')
    const style = flatStyle(label.props.style)
    expect(style.color).toBe('#7B80A0')
  })

  // ────────────────────────────────────────────────────────────────────────────
  // REQ-003: topBar 3-슬롯 구조 — cancel / label / timer 모두 존재
  // ────────────────────────────────────────────────────────────────────────────
  it('REQ-003: recording phase 에 cancel / recording-status-label / recording-timer 모두 존재', async () => {
    setRoute({ songKey: 'twinkle' })
    const { findByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    await findByTestId('cancel-recording-button')
    await findByTestId('recording-status-label')
    await findByTestId('recording-timer')
  })

  // ────────────────────────────────────────────────────────────────────────────
  // REQ-004: 타이머 fontSize === 28 (FontSize.xxl)
  // ────────────────────────────────────────────────────────────────────────────
  it('REQ-004: recording-timer 의 style.fontSize === 28', async () => {
    setRoute({ songKey: 'twinkle' })
    const { findByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    const timer = await findByTestId('recording-timer')
    const style = flatStyle(timer.props.style)
    expect(style.fontSize).toBe(28)
  })

  // ────────────────────────────────────────────────────────────────────────────
  // REQ-005: 타이머 lineHeight ≈ 33.6 (28 * 1.2)
  // ────────────────────────────────────────────────────────────────────────────
  it('REQ-005: recording-timer 의 style.lineHeight ≈ 33.6 (toBeCloseTo)', async () => {
    setRoute({ songKey: 'twinkle' })
    const { findByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    const timer = await findByTestId('recording-timer')
    const style = flatStyle(timer.props.style)
    expect(style.lineHeight as number).toBeCloseTo(33.6, 1)
  })

  // ────────────────────────────────────────────────────────────────────────────
  // REQ-006: 정지 버튼 outer ring 96×96, borderWidth 2, borderRadius 48
  // ────────────────────────────────────────────────────────────────────────────
  it('REQ-006: stop-recording-button(outer ring) width === 96', async () => {
    setRoute({ songKey: 'twinkle' })
    const { findByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    const ring = await findByTestId('stop-recording-button')
    const style = flatStyle(ring.props.style)
    expect(style.width).toBe(96)
  })

  it('REQ-006: stop-recording-button(outer ring) height === 96', async () => {
    setRoute({ songKey: 'twinkle' })
    const { findByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    const ring = await findByTestId('stop-recording-button')
    const style = flatStyle(ring.props.style)
    expect(style.height).toBe(96)
  })

  it('REQ-006: stop-recording-button(outer ring) borderWidth === 2', async () => {
    setRoute({ songKey: 'twinkle' })
    const { findByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    const ring = await findByTestId('stop-recording-button')
    const style = flatStyle(ring.props.style)
    expect(style.borderWidth).toBe(2)
  })

  it('REQ-006: stop-recording-button(outer ring) borderRadius === 48', async () => {
    setRoute({ songKey: 'twinkle' })
    const { findByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    const ring = await findByTestId('stop-recording-button')
    const style = flatStyle(ring.props.style)
    expect(style.borderRadius).toBe(48)
  })

  // ────────────────────────────────────────────────────────────────────────────
  // REQ-007: 정지 버튼 inner solid View 72×72 보존
  // ────────────────────────────────────────────────────────────────────────────
  it('REQ-007: stop-button-inner(inner solid) width === 72', async () => {
    setRoute({ songKey: 'twinkle' })
    const { findByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    const inner = await findByTestId('stop-button-inner')
    const style = flatStyle(inner.props.style)
    expect(style.width).toBe(72)
  })

  it('REQ-007: stop-button-inner(inner solid) height === 72', async () => {
    setRoute({ songKey: 'twinkle' })
    const { findByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    const inner = await findByTestId('stop-button-inner')
    const style = flatStyle(inner.props.style)
    expect(style.height).toBe(72)
  })

  // ────────────────────────────────────────────────────────────────────────────
  // REQ-008: encourage text 색상 = darkColors.accentSecondary (#C49A8A)
  // ────────────────────────────────────────────────────────────────────────────
  it('REQ-008: "더 많이 녹음할수록 더 풍성해집니다" 텍스트의 style.color === "#C49A8A" (accentSecondary)', async () => {
    setRoute({ songKey: 'twinkle' })
    const { findByText } = render(<RecordScreen />)
    await advanceCountdown()

    const encourageEl = await findByText(/더 많이 녹음할수록 더 풍성해집니다/)
    const style = flatStyle(encourageEl.props.style)
    expect(style.color).toBe('#C49A8A')
  })

  // ────────────────────────────────────────────────────────────────────────────
  // REQ-009: 기존 testID 회귀 보존
  // ────────────────────────────────────────────────────────────────────────────
  it('REQ-009: cancel-recording-button testID 회귀 보존', async () => {
    setRoute({ songKey: 'twinkle' })
    const { findByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    await expect(findByTestId('cancel-recording-button')).resolves.toBeTruthy()
  })

  it('REQ-009: stop-recording-button testID 회귀 보존', async () => {
    setRoute({ songKey: 'twinkle' })
    const { findByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    await expect(findByTestId('stop-recording-button')).resolves.toBeTruthy()
  })

  it('REQ-009: restart-recording-button testID 회귀 보존', async () => {
    setRoute({ songKey: 'twinkle' })
    const { findByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    await expect(findByTestId('restart-recording-button')).resolves.toBeTruthy()
  })

  // ────────────────────────────────────────────────────────────────────────────
  // REQ-010: 카운트다운 phase 에는 recording-status-label 미존재 (회귀)
  // ────────────────────────────────────────────────────────────────────────────
  it('REQ-010: 카운트다운 phase 에서 recording-status-label 미노출', () => {
    setRoute({ songKey: 'twinkle' })
    // 카운트다운 진행 전 (phase=countdown) — advanceCountdown 호출 안 함
    const { queryByTestId } = render(<RecordScreen />)

    expect(queryByTestId('recording-status-label')).toBeNull()
  })

  it('REQ-010: 카운트다운 phase 에서 recording-timer testID 미노출', () => {
    setRoute({ songKey: 'twinkle' })
    const { queryByTestId } = render(<RecordScreen />)

    expect(queryByTestId('recording-timer')).toBeNull()
  })

  // ────────────────────────────────────────────────────────────────────────────
  // REQ-011: 변경 4 스타일 항목에서 신규 hex/px 리터럴 0 — 토큰 resolve 값과 비교
  // 토큰 상수를 직접 import 해서 런타임 값으로 비교 (grep 정적 검사 대체)
  // ────────────────────────────────────────────────────────────────────────────
  it('REQ-011: recording-status-label 색이 darkColors.textSecondary 토큰 값과 일치', async () => {
    setRoute({ songKey: 'twinkle' })
    const { findByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { darkColors } = require('../../theme/tokens') as {
      darkColors: { textSecondary: string }
    }

    const label = await findByTestId('recording-status-label')
    const style = flatStyle(label.props.style)
    expect(style.color).toBe(darkColors.textSecondary)
  })

  it('REQ-011: recording-timer fontSize 가 FontSize.xxl 토큰 값(28)과 일치', async () => {
    setRoute({ songKey: 'twinkle' })
    const { findByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { FontSize } = require('../../theme/tokens') as {
      FontSize: { xxl: number }
    }

    const timer = await findByTestId('recording-timer')
    const style = flatStyle(timer.props.style)
    expect(style.fontSize).toBe(FontSize.xxl)
  })

  it('REQ-011: encourage text 색이 darkColors.accentSecondary 토큰 값과 일치', async () => {
    setRoute({ songKey: 'twinkle' })
    const { findByText } = render(<RecordScreen />)
    await advanceCountdown()

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { darkColors } = require('../../theme/tokens') as {
      darkColors: { accentSecondary: string }
    }

    const encourageEl = await findByText(/더 많이 녹음할수록 더 풍성해집니다/)
    const style = flatStyle(encourageEl.props.style)
    expect(style.color).toBe(darkColors.accentSecondary)
  })

  it('REQ-011: stop-button-inner borderRadius === 36 (72 / 2, solid circle 유지)', async () => {
    setRoute({ songKey: 'twinkle' })
    const { findByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    const inner = await findByTestId('stop-button-inner')
    const style = flatStyle(inner.props.style)
    expect(style.borderRadius).toBe(36)
  })

  // ────────────────────────────────────────────────────────────────────────────
  // 추가: recording-status-label 이 recording phase 진입 시 getByText 로도 접근 가능
  // ────────────────────────────────────────────────────────────────────────────
  it('recording phase 에서 getByText("녹음 중") accessible', async () => {
    setRoute({ songKey: 'twinkle' })
    const { findByText } = render(<RecordScreen />)
    await advanceCountdown()

    await waitFor(async () => {
      await findByText('녹음 중')
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('S10 — free generation counter chip (issue #235)', () => {
  // REQ-235-1: free entitlement → chip 렌더 + 텍스트 일치
  it('free entitlement → testID="free-generation-counter" 렌더 + "생성 N/3" 텍스트', async () => {
    useAuthStore.mockReturnValue({ entitlement: 'free', generationCount: 1 })
    setRoute({ songKey: 'twinkle' })
    const { findByTestId, getByText } = render(<RecordScreen />)
    await advanceCountdown()

    expect(await findByTestId('free-generation-counter')).toBeTruthy()
    expect(getByText('생성 1/3')).toBeTruthy()
  })

  // REQ-235-2: trial entitlement → chip 미렌더
  it('trial entitlement → chip 미렌더', async () => {
    useAuthStore.mockReturnValue({ entitlement: 'trial', generationCount: 5 })
    setRoute({ songKey: 'twinkle' })
    const { queryByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    expect(queryByTestId('free-generation-counter')).toBeNull()
  })

  // REQ-235-2: premium entitlement → chip 미렌더
  it('premium entitlement → chip 미렌더', async () => {
    useAuthStore.mockReturnValue({ entitlement: 'premium', generationCount: 99 })
    setRoute({ songKey: 'twinkle' })
    const { queryByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    expect(queryByTestId('free-generation-counter')).toBeNull()
  })
})
