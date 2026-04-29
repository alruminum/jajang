// TDD red — impl/10 §4~§5 / §8 수용 기준
// 허밍 모드 BGM 통합 + 가사 박스 + BGM chip + 로드 실패 토스트 + 카운트다운 게이팅
// issue #133

import React from 'react'
import { act, render, waitFor } from '@testing-library/react-native'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const startBgmMock = vi.fn(async () => {})
const stopBgmMock = vi.fn(async () => {})
let mockBgmState = {
  isPlaying: false,
  loadFailed: false,
}

vi.mock('../../hooks/useBgmPlayer', () => ({
  useBgmPlayer: ({
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
}))

const lyricsBoxMock = vi.fn(
  ({ songKey, mode }: { songKey: string; mode: string }) => {
    const { Text } = require('react-native')
    return (
      <Text testID={`lyrics-box-${mode}`}>{`LyricsBox:${songKey}`}</Text>
    )
  },
)
vi.mock('../../components/LyricsBox', () => ({
  LyricsBox: (props: { songKey: string; mode: string }) =>
    lyricsBoxMock(props),
}))

vi.mock('../../data/bgmTracks', () => ({
  BGM_TRACKS: {
    twinkle: { titleKo: '반짝반짝 작은 별', previewKey: 'twinkle' },
  },
}))

const recordMock = vi.fn()
const stopRecordingMock = vi.fn(async () => 'file:///recording.m4a')
vi.mock('expo-audio', () => ({
  useAudioRecorder: () => ({
    record: recordMock,
    stop: stopRecordingMock,
    uri: 'file:///recording.m4a',
  }),
  setAudioModeAsync: vi.fn(async () => {}),
  AudioModule: {
    requestRecordingPermissionsAsync: vi.fn(async () => ({
      granted: true,
    })),
  },
}))

const navigateMock = vi.fn()
const useRouteMock = vi.fn()
vi.mock('@react-navigation/native', async () => {
  const actual = await vi.importActual<object>('@react-navigation/native')
  return {
    ...actual,
    useNavigation: () => ({ navigate: navigateMock, goBack: vi.fn() }),
    useRoute: () => useRouteMock(),
  }
})

import { RecordScreen } from '../../screens/RecordScreen'

beforeEach(() => {
  startBgmMock.mockClear()
  stopBgmMock.mockClear()
  lyricsBoxMock.mockClear()
  navigateMock.mockClear()
  recordMock.mockClear()
  stopRecordingMock.mockClear()
  mockBgmState = { isPlaying: false, loadFailed: false }
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

const setRoute = (params: { songKey: string; mode: 'humming' | 'shush' }) => {
  useRouteMock.mockReturnValue({ params })
}

const advanceCountdown = async () => {
  // 카운트다운 3초 → 0
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3500)
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
    setRoute({ songKey: 'twinkle', mode: 'humming' })

    const { findByText, findByTestId, queryByText } = render(<RecordScreen />)
    await advanceCountdown()

    await findByText(/음악 없이 녹음할게요/)
    expect(queryByText(/30%/)).toBeNull()
    await findByTestId('lyrics-box-recording')
  })

  it('BGM 실패 토스트는 3초 후 자동 숨김 (impl/10 §9)', async () => {
    mockBgmState.loadFailed = true
    setRoute({ songKey: 'twinkle', mode: 'humming' })

    const { findByText, queryByText } = render(<RecordScreen />)
    await advanceCountdown()
    await findByText(/음악 없이 녹음할게요/)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100)
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
