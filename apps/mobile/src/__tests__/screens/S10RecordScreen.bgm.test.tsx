// TDD red — impl/10 §4~§5 / §8 수용 기준
// 허밍 모드 BGM 통합 + 가사 박스 + BGM chip + 로드 실패 토스트 + 카운트다운 게이팅
// issue #133

import React from 'react'
import { act, render, waitFor } from '@testing-library/react-native'

// ─── jest.mock factory 내 외부 변수 참조 금지 규칙 우회 ───────────────────────
// 모든 mock factory 를 jest.fn() 으로 선언하고
// 각 테스트 beforeEach 에서 mockImplementation 으로 동작을 주입한다.

jest.mock('../../hooks/useBgmPlayer', () => ({
  useBgmPlayer: jest.fn(),
}))

jest.mock('../../components/LyricsBox', () => ({
  LyricsBox: jest.fn(),
}))

jest.mock('../../data/bgmTracks', () => ({
  BGM_TRACKS: {
    twinkle: { titleKo: '반짝반짝 작은 별', previewKey: 'twinkle' },
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

// ─── mock 변수 (factory 밖에서 선언 가능) ─────────────────────────────────────
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

// ─── mock 구현 획득 ────────────────────────────────────────────────────────────
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
  useBgmPlayer.mockImplementation(
    ({
      enabled,
      onLoadError,
    }: {
      enabled: boolean
      onLoadError?: () => void
    }) => ({
      isPlaying: enabled && mockBgmState.isPlaying,
      loadFailed: mockBgmState.loadFailed,
      startBgm: async () => {
        await startBgmMock()
        if (mockBgmState.loadFailed) onLoadError?.()
        else mockBgmState.isPlaying = true
      },
      stopBgm: async () => {
        await stopBgmMock()
        mockBgmState.isPlaying = false
      },
    }),
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

  LyricsBox.mockImplementation(
    ({ songKey, mode }: { songKey: string; mode: string }) => {
      const { Text } = require('react-native') as {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        Text: React.ComponentType<{
          testID?: string
          children?: React.ReactNode
        }>
      }
      return React.createElement(
        Text,
        { testID: `lyrics-box-${mode}` },
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

const setRoute = (params: { songKey: string; mode: 'humming' | 'shush' }) => {
  useRouteMock.mockReturnValue({ params })
  useRoute.mockReturnValue({ params })
}

const advanceCountdown = async () => {
  // 카운트다운 3초 → 0
  await act(async () => {
    jest.advanceTimersByTime(3500)
    await Promise.resolve()
  })
}

describe('RecordScreen — 허밍 모드 BGM 통합 (impl/10 §4~§5)', () => {
  it('카운트다운 종료와 동시에 startBgm 호출 (humming mode)', async () => {
    setRoute({ songKey: 'twinkle', mode: 'humming' })

    render(<RecordScreen />)
    await advanceCountdown()

    await waitFor(() => {
      expect(startBgmMock).toHaveBeenCalledTimes(1)
    })
  })

  it('shush 모드에서는 startBgm 호출하지 않고 가사 박스도 미렌더', async () => {
    setRoute({ songKey: 'twinkle', mode: 'shush' })

    const { queryByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    expect(startBgmMock).not.toHaveBeenCalled()
    expect(queryByTestId('lyrics-box-recording')).toBeNull()
  })

  it('humming 모드: 카운트다운 단계에서는 BGM chip / 가사 박스 미노출', async () => {
    setRoute({ songKey: 'twinkle', mode: 'humming' })

    const { queryByTestId, queryByText } = render(<RecordScreen />)
    // 카운트다운 진행 전 상태
    expect(queryByTestId('lyrics-box-recording')).toBeNull()
    expect(queryByText(/♬/)).toBeNull()
  })

  it('humming 모드: 녹음 단계에서 BGM chip + 가사 박스 노출', async () => {
    setRoute({ songKey: 'twinkle', mode: 'humming' })

    const { findByTestId, findByText } = render(<RecordScreen />)
    await advanceCountdown()

    await findByTestId('lyrics-box-recording')
    await findByText(/반짝반짝 작은 별/)
    await findByText(/30%/)
  })

  it('녹음 종료(수동 정지) → stopBgm 호출 후 Preview 화면 이동', async () => {
    setRoute({ songKey: 'twinkle', mode: 'humming' })

    const { findByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    const stopBtn = await findByTestId('stop-recording-button')
    await act(async () => {
      stopBtn.props.onPress?.()
    })

    await waitFor(() => {
      expect(stopBgmMock).toHaveBeenCalled()
      expect(navigateMock).toHaveBeenCalledWith(
        'Preview',
        expect.objectContaining({ songKey: 'twinkle' }),
      )
    })
    // stopBgm은 navigate보다 먼저 호출
    expect(stopBgmMock.mock.invocationCallOrder[0]).toBeLessThan(
      navigateMock.mock.invocationCallOrder[0],
    )
  })

  it('✕ 취소 → stopBgm 호출', async () => {
    setRoute({ songKey: 'twinkle', mode: 'humming' })

    const { findByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    const cancelBtn = await findByTestId('cancel-recording-button')
    await act(async () => {
      cancelBtn.props.onPress?.()
    })

    await waitFor(() => expect(stopBgmMock).toHaveBeenCalled())
  })

  it('다시 녹음 → stopBgm 후 카운트다운 재시작 → 완료 시 startBgm 재호출', async () => {
    setRoute({ songKey: 'twinkle', mode: 'humming' })

    const { findByTestId } = render(<RecordScreen />)
    await advanceCountdown()
    expect(startBgmMock).toHaveBeenCalledTimes(1)

    const restartBtn = await findByTestId('restart-recording-button')
    await act(async () => {
      restartBtn.props.onPress?.()
    })
    expect(stopBgmMock).toHaveBeenCalled()

    await advanceCountdown()
    await waitFor(() => expect(startBgmMock).toHaveBeenCalledTimes(2))
  })

  it('BGM 로드 실패 → 토스트 "음악 없이 녹음할게요" 노출 + BGM chip 미노출, 가사 박스는 유지', async () => {
    mockBgmState.loadFailed = true
    applyBgmImpl()
    setRoute({ songKey: 'twinkle', mode: 'humming' })

    const { findByText, findByTestId, queryByText } = render(<RecordScreen />)
    await advanceCountdown()

    await findByText(/음악 없이 녹음할게요/)
    expect(queryByText(/30%/)).toBeNull()
    await findByTestId('lyrics-box-recording')
  })

  it('BGM 실패 토스트는 3초 후 자동 숨김 (impl/10 §9)', async () => {
    mockBgmState.loadFailed = true
    applyBgmImpl()
    setRoute({ songKey: 'twinkle', mode: 'humming' })

    const { findByText, queryByText } = render(<RecordScreen />)
    await advanceCountdown()
    await findByText(/음악 없이 녹음할게요/)

    await act(async () => {
      jest.advanceTimersByTime(3100)
      await Promise.resolve()
    })
    expect(queryByText(/음악 없이 녹음할게요/)).toBeNull()
  })

  it('songKey 가 BGM_TRACKS 에 매핑되지 않으면 BGM chip 의 타이틀 자리는 비고, 가사 박스는 fallback', async () => {
    setRoute({ songKey: 'unmapped-song', mode: 'humming' })

    const { queryByText, queryByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    expect(queryByText(/반짝반짝 작은 별/)).toBeNull()
    // LyricsBox 자체는 렌더되며 내부적으로 fallback 메시지 처리(impl/09 책임)
    expect(queryByTestId('lyrics-box-recording')).not.toBeNull()
  })
})
