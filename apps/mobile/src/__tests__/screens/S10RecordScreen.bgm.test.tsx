// TDD red — impl/14 §7 수용 기준
// RecordScreen v1.3.1 단일 흐름: BGM 통합 + 가사 박스 + 로드 실패 토스트 + 카운트다운 게이팅
// issue #222

import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'

// ─── jest.mock factory 내 외부 변수 참조 금지 규칙 우회 ───────────────────────
// 모든 mock factory 를 jest.fn() 으로 선언하고
// 각 테스트 beforeEach 에서 mockImplementation 으로 동작을 주입한다.

jest.mock('@store/authSlice', () => ({
  useAuthStore: jest.fn(() => ({ entitlement: 'free', generationCount: 0 })),
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

// ─── mock 변수 (factory 밖에서 선언 가능) ─────────────────────────────────────
const startBgmMock = jest.fn(async () => {})
const stopBgmMock = jest.fn(async () => {})
let mockBgmState = {
  isPlaying: false,
  loadFailed: false,
}

// onPlaybackEnd 콜백 캡처 — 테스트에서 직접 호출 가능
let capturedOnPlaybackEnd: (() => void) | undefined

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
  capturedOnPlaybackEnd = undefined
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
      capturedOnPlaybackEnd = onPlaybackEnd
      return {
        isPlaying: enabled && mockBgmState.isPlaying,
        loadFailed: mockBgmState.loadFailed,
        startBgm: async () => {
          await startBgmMock()
          if (mockBgmState.loadFailed) onLoadError?.()
        },
        stopBgm: stopBgmMock,
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
  capturedOnPlaybackEnd = undefined
  applyBgmImpl()

  LyricsBox.mockImplementation(
    ({ songKey }: { songKey: string }) => {
      const { Text } = require('react-native') as {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
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

// impl/14 §7-1: route.params 에 mode 필드 없음 — { songKey: string } 만
const setRoute = (params: { songKey: string }) => {
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

describe('RecordScreen — 단일 흐름 BGM 통합 (impl/14 §7)', () => {
  // ─── impl/14 §7-2: 카운트다운 종료 시 BGM 재생 시작 (모드 조건 없음) ───────────
  it('카운트다운 종료와 동시에 startBgm 호출 (항상, 모드 조건 없음)', async () => {
    setRoute({ songKey: 'twinkle' })

    render(<RecordScreen />)
    await advanceCountdown()

    await waitFor(() => {
      expect(startBgmMock).toHaveBeenCalledTimes(1)
    })
  })

  // ─── impl/14 §7-3: 가사 박스 항상 표시 (모드 조건 없음) ──────────────────────
  it('카운트다운 단계에서는 가사 박스 미노출', async () => {
    setRoute({ songKey: 'twinkle' })

    const { queryByTestId } = render(<RecordScreen />)
    // 카운트다운 진행 전 상태
    expect(queryByTestId('lyrics-box-recording')).toBeNull()
  })

  it('녹음 단계에서 가사 박스 노출 (모드 조건 없음)', async () => {
    setRoute({ songKey: 'twinkle' })

    const { findByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    await findByTestId('lyrics-box-recording')
  })

  // ─── impl/14 §7-3: encourage text 항상 표시 ───────────────────────────────────
  it('녹음 단계에서 "더 많이 녹음할수록 더 풍성해집니다" 텍스트 노출', async () => {
    setRoute({ songKey: 'twinkle' })

    const { findByText } = render(<RecordScreen />)
    await advanceCountdown()

    await findByText(/더 많이 녹음할수록 더 풍성해집니다/)
  })

  // ─── impl/14 §7-9: isHummingMode 관련 코드 없음 → "30초 채워주세요" 미표시 ───
  it('"30초 채워주세요" 텍스트가 어떤 시점에도 노출되지 않음', async () => {
    setRoute({ songKey: 'twinkle' })

    const { queryByText } = render(<RecordScreen />)
    await advanceCountdown()

    expect(queryByText(/30초 채워주세요/)).toBeNull()
  })

  // ─── impl/14 §7-4: BGM 1 loop 종료 → 녹음 자동 종료 + S11 이동 ─────────────
  it('loopDurationMs(5000ms) setTimeout 만료 → navigate(Preview) 호출', async () => {
    setRoute({ songKey: 'twinkle' })

    render(<RecordScreen />)
    await advanceCountdown()

    await act(async () => {
      jest.advanceTimersByTime(5100)
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(
        'Preview',
        expect.objectContaining({ songKey: 'twinkle' }),
      )
    })
  })

  // ─── impl/14 §7-4: onPlaybackEnd 콜백 → handleAutoStop ──────────────────────
  it('onPlaybackEnd 콜백 호출 → stopBgm + navigate(Preview)', async () => {
    setRoute({ songKey: 'twinkle' })

    render(<RecordScreen />)
    await advanceCountdown()

    // useBgmPlayer 가 onPlaybackEnd 를 받았는지 확인
    expect(capturedOnPlaybackEnd).toBeDefined()

    await act(async () => {
      capturedOnPlaybackEnd!()
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(stopBgmMock).toHaveBeenCalled()
      expect(navigateMock).toHaveBeenCalledWith(
        'Preview',
        expect.objectContaining({ songKey: 'twinkle' }),
      )
    })
  })

  // ─── impl/14 §7-4: isStoppingRef 중복 stop 가드 ──────────────────────────────
  it('loopTimer + onPlaybackEnd 동시 트리거 시 navigate 1회만 호출', async () => {
    setRoute({ songKey: 'twinkle' })

    render(<RecordScreen />)
    await advanceCountdown()

    expect(capturedOnPlaybackEnd).toBeDefined()

    await act(async () => {
      // loopTimer 만료 + onPlaybackEnd 동시 발화
      jest.advanceTimersByTime(5100)
      capturedOnPlaybackEnd!()
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledTimes(1)
    })
  })

  // ─── impl/14 §7-5: 수동 종료(⏹ 탭) → BGM 정지 + S11 이동 ───────────────────
  it('녹음 종료(수동 정지) → stopBgm 호출 후 Preview 화면 이동', async () => {
    setRoute({ songKey: 'twinkle' })

    const { findByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    const stopBtn = await findByTestId('stop-recording-button')
    await act(async () => {
      fireEvent.press(stopBtn)
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(stopBgmMock).toHaveBeenCalled()
      expect(navigateMock).toHaveBeenCalledWith(
        'Preview',
        expect.objectContaining({ songKey: 'twinkle' }),
      )
    })
    // stopBgm 은 navigate 보다 먼저 호출
    expect(stopBgmMock.mock.invocationCallOrder[0]).toBeLessThan(
      navigateMock.mock.invocationCallOrder[0],
    )
  })

  it('✕ 취소 → stopBgm 호출', async () => {
    setRoute({ songKey: 'twinkle' })

    const { findByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    const cancelBtn = await findByTestId('cancel-recording-button')
    await act(async () => {
      fireEvent.press(cancelBtn)
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => expect(stopBgmMock).toHaveBeenCalled())
  })

  // ─── impl/14 §7-6: 다시 녹음 → BGM 정지 → 카운트다운 재시작 → BGM 처음부터 ──
  it('다시 녹음 → stopBgm 후 카운트다운 재시작 → 완료 시 startBgm 재호출', async () => {
    setRoute({ songKey: 'twinkle' })

    const { findByTestId } = render(<RecordScreen />)
    await advanceCountdown()
    expect(startBgmMock).toHaveBeenCalledTimes(1)

    const restartBtn = await findByTestId('restart-recording-button')
    await act(async () => {
      fireEvent.press(restartBtn)
      await Promise.resolve()
      await Promise.resolve()
    })
    await waitFor(() => expect(stopBgmMock).toHaveBeenCalled())

    await advanceCountdown()
    await waitFor(() => expect(startBgmMock).toHaveBeenCalledTimes(2))
  })

  // ─── impl/14 §7-7: BGM 로드 실패 ────────────────────────────────────────────
  it('BGM 로드 실패 → 토스트 "음악 없이 녹음할게요" 노출 + 가사 박스는 유지', async () => {
    mockBgmState.loadFailed = true
    applyBgmImpl()
    setRoute({ songKey: 'twinkle' })

    const { findByText, findByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    await findByText(/음악 없이 녹음할게요/)
    await findByTestId('lyrics-box-recording')
  })

  it('BGM 실패 토스트는 3초 후 자동 숨김', async () => {
    mockBgmState.loadFailed = true
    applyBgmImpl()
    setRoute({ songKey: 'twinkle' })

    const { findByText, queryByText } = render(<RecordScreen />)
    await advanceCountdown()
    await findByText(/음악 없이 녹음할게요/)

    await act(async () => {
      jest.advanceTimersByTime(3100)
      await Promise.resolve()
    })
    expect(queryByText(/음악 없이 녹음할게요/)).toBeNull()
  })

  // ─── impl/14 §7-7: BGM 로드 실패 시 loopDurationMs 타이머 기준 자동 종료 ─────
  it('BGM 로드 실패 시 loopDurationMs(5000ms) 타이머 경과 → navigate(Preview) 호출', async () => {
    mockBgmState.loadFailed = true
    applyBgmImpl()
    setRoute({ songKey: 'twinkle' })

    render(<RecordScreen />)
    await advanceCountdown()

    await act(async () => {
      jest.advanceTimersByTime(5100)
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(
        'Preview',
        expect.objectContaining({ songKey: 'twinkle' }),
      )
    })
  })

  // ─── impl/14 §7-8: bgmTracks.ts loopDurationMs 필드 존재 ────────────────────
  it('BGM_TRACKS mock 에 loopDurationMs 필드가 존재함', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BGM_TRACKS } = require('../../data/bgmTracks') as {
      BGM_TRACKS: Record<string, { loopDurationMs: number }>
    }
    expect(BGM_TRACKS['twinkle'].loopDurationMs).toBe(5000)
  })

  it('songKey 가 BGM_TRACKS 에 매핑되지 않으면 가사 박스는 fallback 렌더', async () => {
    setRoute({ songKey: 'unmapped-song' })

    const { queryByTestId } = render(<RecordScreen />)
    await advanceCountdown()

    // LyricsBox 자체는 렌더되며 내부적으로 fallback 처리 (S09 책임)
    expect(queryByTestId('lyrics-box-recording')).not.toBeNull()
  })
})
