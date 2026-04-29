// TDD red — impl/10 §3 useBgmPlayer 인터페이스 / §8 수용 기준 / §9 주의사항
// issue #133

import { act, renderHook, waitFor } from '@testing-library/react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getPreviewUrlMock = vi.fn()
vi.mock('../services/songs-api', () => ({
  songsApi: {
    getPreviewUrl: (...args: unknown[]) => getPreviewUrlMock(...args),
  },
}))

type FakePlayer = {
  loop: boolean
  volume: number
  play: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  seekTo: ReturnType<typeof vi.fn>
}

const createdPlayers: FakePlayer[] = []
const createAudioPlayerMock = vi.fn(
  (_source: { uri: string }, initialVolume: number = 0): FakePlayer => {
    const player: FakePlayer = {
      loop: false,
      volume: initialVolume,
      play: vi.fn(),
      pause: vi.fn(),
      remove: vi.fn(),
      seekTo: vi.fn(),
    }
    createdPlayers.push(player)
    return player
  },
)
vi.mock('expo-audio', () => ({
  createAudioPlayer: (source: { uri: string }, initialVolume?: number) =>
    createAudioPlayerMock(source, initialVolume),
}))

import { useBgmPlayer } from '../hooks/useBgmPlayer'

beforeEach(() => {
  vi.useFakeTimers()
  getPreviewUrlMock.mockReset()
  createAudioPlayerMock.mockClear()
  createdPlayers.length = 0
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useBgmPlayer (impl/10 §3)', () => {
  it('enabled=false 면 startBgm 호출해도 플레이어를 만들지 않는다', async () => {
    const { result } = renderHook(() =>
      useBgmPlayer({ songKey: 'twinkle', enabled: false }),
    )

    await act(async () => {
      await result.current.startBgm()
    })

    expect(getPreviewUrlMock).not.toHaveBeenCalled()
    expect(createAudioPlayerMock).not.toHaveBeenCalled()
    expect(result.current.isPlaying).toBe(false)
  })

  it('enabled=true: presigned URL 조회 → loop=true 플레이어 생성 → volume 0에서 시작', async () => {
    getPreviewUrlMock.mockResolvedValueOnce({
      preview_url: 'https://signed.example/twinkle.mp3',
    })

    const { result } = renderHook(() =>
      useBgmPlayer({ songKey: 'twinkle', enabled: true }),
    )

    await act(async () => {
      await result.current.startBgm()
    })

    expect(getPreviewUrlMock).toHaveBeenCalledWith('twinkle')
    expect(createAudioPlayerMock).toHaveBeenCalledTimes(1)
    const player = createdPlayers[0]
    expect(player.loop).toBe(true)
    expect(player.play).toHaveBeenCalledTimes(1)
    expect(player.volume).toBe(0)
    expect(result.current.isPlaying).toBe(true)
  })

  it('startBgm: volume ramp 0→0.3 over 300ms (30ms × 10 step, 매 tick +0.03)', async () => {
    getPreviewUrlMock.mockResolvedValueOnce({
      preview_url: 'https://signed.example/twinkle.mp3',
    })

    const { result } = renderHook(() =>
      useBgmPlayer({ songKey: 'twinkle', enabled: true }),
    )

    await act(async () => {
      await result.current.startBgm()
    })
    const player = createdPlayers[0]

    expect(player.volume).toBeCloseTo(0, 5)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30)
    })
    expect(player.volume).toBeCloseTo(0.03, 5)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150)
    })
    expect(player.volume).toBeCloseTo(0.18, 5)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120)
    })
    expect(player.volume).toBeCloseTo(0.3, 5)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120)
    })
    expect(player.volume).toBeCloseTo(0.3, 5)
  })

  it('startBgm: presigned URL 로드 실패 → loadFailed=true + onLoadError 호출, 플레이어 미생성', async () => {
    getPreviewUrlMock.mockRejectedValueOnce(new Error('network'))
    const onLoadError = vi.fn()

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
    expect(createAudioPlayerMock).not.toHaveBeenCalled()
    expect(result.current.isPlaying).toBe(false)
  })

  it('loadFailed=true 인 상태에서 startBgm 재호출 시 no-op', async () => {
    getPreviewUrlMock.mockRejectedValueOnce(new Error('network'))
    const { result } = renderHook(() =>
      useBgmPlayer({ songKey: 'twinkle', enabled: true }),
    )

    await act(async () => {
      await result.current.startBgm()
    })
    await waitFor(() => expect(result.current.loadFailed).toBe(true))

    getPreviewUrlMock.mockResolvedValueOnce({
      preview_url: 'https://signed.example/twinkle.mp3',
    })
    await act(async () => {
      await result.current.startBgm()
    })

    expect(createAudioPlayerMock).not.toHaveBeenCalled()
  })

  it('stopBgm: volume ramp 0.3→0 over 200ms (20ms × 10 step) 후 pause + remove + isPlaying=false', async () => {
    getPreviewUrlMock.mockResolvedValueOnce({
      preview_url: 'https://signed.example/twinkle.mp3',
    })

    const { result } = renderHook(() =>
      useBgmPlayer({ songKey: 'twinkle', enabled: true }),
    )

    await act(async () => {
      await result.current.startBgm()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    const player = createdPlayers[0]
    expect(player.volume).toBeCloseTo(0.3, 5)

    await act(async () => {
      await result.current.stopBgm()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20)
    })
    expect(player.volume).toBeCloseTo(0.27, 5)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(180)
    })
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
    getPreviewUrlMock.mockResolvedValueOnce({
      preview_url: 'https://signed.example/twinkle.mp3',
    })

    const { result, unmount } = renderHook(() =>
      useBgmPlayer({ songKey: 'twinkle', enabled: true }),
    )

    await act(async () => {
      await result.current.startBgm()
    })
    const player = createdPlayers[0]

    unmount()

    expect(player.pause).toHaveBeenCalled()
    expect(player.remove).toHaveBeenCalled()
  })
})
