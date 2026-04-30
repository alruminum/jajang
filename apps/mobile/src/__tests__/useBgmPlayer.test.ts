// TDD red — impl/10 §3 useBgmPlayer 인터페이스 / §8 수용 기준 / §9 주의사항
// issue #133

import { act, renderHook, waitFor } from '@testing-library/react-native'

const mockGetPreviewUrl = jest.fn()
jest.mock('../services/songs-api', () => ({
  songsApi: {
    getPreviewUrl: (...args: unknown[]) => mockGetPreviewUrl(...args),
  },
}))

type FakePlayer = {
  loop: boolean
  volume: number
  play: jest.Mock
  pause: jest.Mock
  remove: jest.Mock
  seekTo: jest.Mock
}

const mockCreatedPlayers: FakePlayer[] = []
const mockCreateAudioPlayer = jest.fn(
  (_source: { uri: string }, initialVolume: number = 0): FakePlayer => {
    const player: FakePlayer = {
      loop: false,
      volume: initialVolume,
      play: jest.fn(),
      pause: jest.fn(),
      remove: jest.fn(),
      seekTo: jest.fn(),
    }
    mockCreatedPlayers.push(player)
    return player
  },
)
jest.mock('expo-audio', () => ({
  createAudioPlayer: (source: { uri: string }, initialVolume?: number) =>
    mockCreateAudioPlayer(source, initialVolume),
}))

import { useBgmPlayer } from '../hooks/useBgmPlayer'

beforeEach(() => {
  jest.useFakeTimers()
  mockGetPreviewUrl.mockReset()
  mockCreateAudioPlayer.mockClear()
  mockCreatedPlayers.length = 0
})

afterEach(() => {
  jest.useRealTimers()
})

describe('useBgmPlayer (impl/10 §3)', () => {
  it('enabled=false 면 startBgm 호출해도 플레이어를 만들지 않는다', async () => {
    const { result } = renderHook(() =>
      useBgmPlayer({ songKey: 'twinkle', enabled: false }),
    )

    await act(async () => {
      await result.current.startBgm()
    })

    expect(mockGetPreviewUrl).not.toHaveBeenCalled()
    expect(mockCreateAudioPlayer).not.toHaveBeenCalled()
    expect(result.current.isPlaying).toBe(false)
  })

  it('enabled=true: presigned URL 조회 → loop=true 플레이어 생성 → volume 0에서 시작', async () => {
    mockGetPreviewUrl.mockResolvedValueOnce({
      preview_url: 'https://signed.example/twinkle.mp3',
    })

    const { result } = renderHook(() =>
      useBgmPlayer({ songKey: 'twinkle', enabled: true }),
    )

    await act(async () => {
      await result.current.startBgm()
    })

    expect(mockGetPreviewUrl).toHaveBeenCalledWith('twinkle')
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1)
    const player = mockCreatedPlayers[0]
    expect(player.loop).toBe(true)
    expect(player.play).toHaveBeenCalledTimes(1)
    expect(player.volume).toBe(0)
    expect(result.current.isPlaying).toBe(true)
  })

  it('startBgm: volume ramp 0→0.3 over 300ms (30ms × 10 step, 매 tick +0.03)', async () => {
    mockGetPreviewUrl.mockResolvedValueOnce({
      preview_url: 'https://signed.example/twinkle.mp3',
    })

    const { result } = renderHook(() =>
      useBgmPlayer({ songKey: 'twinkle', enabled: true }),
    )

    await act(async () => {
      await result.current.startBgm()
    })
    const player = mockCreatedPlayers[0]

    expect(player.volume).toBeCloseTo(0, 5)

    await act(async () => {
      jest.advanceTimersByTime(30)
      await Promise.resolve()
    })
    expect(player.volume).toBeCloseTo(0.03, 5)

    await act(async () => {
      jest.advanceTimersByTime(150)
      await Promise.resolve()
    })
    expect(player.volume).toBeCloseTo(0.18, 5)

    await act(async () => {
      jest.advanceTimersByTime(120)
      await Promise.resolve()
    })
    expect(player.volume).toBeCloseTo(0.3, 5)

    await act(async () => {
      jest.advanceTimersByTime(120)
      await Promise.resolve()
    })
    expect(player.volume).toBeCloseTo(0.3, 5)
  })

  it('startBgm: presigned URL 로드 실패 → loadFailed=true + onLoadError 호출, 플레이어 미생성', async () => {
    mockGetPreviewUrl.mockRejectedValueOnce(new Error('network'))
    const onLoadError = jest.fn()

    const { result } = renderHook(() =>
      useBgmPlayer({ songKey: 'twinkle', enabled: true, onLoadError }),
    )

    await act(async () => {
      await result.current.startBgm()
    })

    await waitFor(() => {
      expect(result.current.loadFailed).toBe(true)
    })
    expect(onLoadError).toHaveBeenCalledTimes(1)
    expect(mockCreateAudioPlayer).not.toHaveBeenCalled()
    expect(result.current.isPlaying).toBe(false)
  })

  it('loadFailed=true 인 상태에서 startBgm 재호출 시 no-op', async () => {
    mockGetPreviewUrl.mockRejectedValueOnce(new Error('network'))
    const { result } = renderHook(() =>
      useBgmPlayer({ songKey: 'twinkle', enabled: true }),
    )

    await act(async () => {
      await result.current.startBgm()
    })
    await waitFor(() => expect(result.current.loadFailed).toBe(true))

    mockGetPreviewUrl.mockResolvedValueOnce({
      preview_url: 'https://signed.example/twinkle.mp3',
    })
    await act(async () => {
      await result.current.startBgm()
    })

    expect(mockCreateAudioPlayer).not.toHaveBeenCalled()
  })

  it('stopBgm: volume ramp 0.3→0 over 200ms (20ms × 10 step) 후 pause + remove + isPlaying=false', async () => {
    mockGetPreviewUrl.mockResolvedValueOnce({
      preview_url: 'https://signed.example/twinkle.mp3',
    })

    const { result } = renderHook(() =>
      useBgmPlayer({ songKey: 'twinkle', enabled: true }),
    )

    await act(async () => {
      await result.current.startBgm()
    })
    await act(async () => {
      jest.advanceTimersByTime(300)
      await Promise.resolve()
    })
    const player = mockCreatedPlayers[0]
    expect(player.volume).toBeCloseTo(0.3, 5)

    await act(async () => {
      await result.current.stopBgm()
    })

    await act(async () => {
      jest.advanceTimersByTime(20)
      await Promise.resolve()
    })
    expect(player.volume).toBeCloseTo(0.27, 5)

    // 나머지 ticks: 부동소수점 오차로 인해 마지막 tick(0→pause)까지 10 ticks 필요
    // 초기 0.30 → 20ms 1st tick(0.27) → 20ms×9=180ms → 2.77e-17 → 20ms 1 more → 0 + pause
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        jest.advanceTimersByTime(20)
        await Promise.resolve()
      })
    }
    expect(player.volume).toBeCloseTo(0, 5)
    expect(player.pause).toHaveBeenCalledTimes(1)
    expect(player.remove).toHaveBeenCalledTimes(1)
    expect(result.current.isPlaying).toBe(false)
  })

  it('stopBgm: 플레이어 없을 때 호출해도 throw 하지 않는다', async () => {
    const { result } = renderHook(() =>
      useBgmPlayer({ songKey: 'twinkle', enabled: true }),
    )

    await expect(
      act(async () => {
        await result.current.stopBgm()
      }),
    ).resolves.not.toThrow()
  })

  it('언마운트 시 활성 플레이어를 pause + remove 한다', async () => {
    mockGetPreviewUrl.mockResolvedValueOnce({
      preview_url: 'https://signed.example/twinkle.mp3',
    })

    const { result, unmount } = renderHook(() =>
      useBgmPlayer({ songKey: 'twinkle', enabled: true }),
    )

    await act(async () => {
      await result.current.startBgm()
    })
    const player = mockCreatedPlayers[0]

    unmount()

    expect(player.pause).toHaveBeenCalled()
    expect(player.remove).toHaveBeenCalled()
  })
})
