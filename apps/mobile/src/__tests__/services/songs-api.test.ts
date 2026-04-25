/**
 * songs-api.test.ts
 * songsApi — GET /songs, GET /songs/{key}/preview 클라이언트 검증
 * impl: docs/milestones/v1/epics/epic-02-recording/impl/04-app-song-select-screen.md §3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// apiClient mock — songs.ts 의 import './client' 를 가로챔
vi.mock('@services/api/client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}))

import { songsApi } from '@services/api/songs'
import { apiClient } from '@services/api/client'

const mockedGet = vi.mocked(apiClient.get)

// ────────────────────────────────────────────
// listSongs
// ────────────────────────────────────────────
describe('songsApi.listSongs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET /songs 엔드포인트를 호출한다', async () => {
    mockedGet.mockResolvedValueOnce({ data: { songs: [] } })

    await songsApi.listSongs()

    expect(mockedGet).toHaveBeenCalledWith('/songs')
    expect(mockedGet).toHaveBeenCalledTimes(1)
  })

  it('응답의 songs 배열을 그대로 반환한다', async () => {
    const mockSongs = [
      { key: 'brahms', title_ko: '자장가', title_en: 'Lullaby', composer: 'Brahms', duration_seconds: 180 },
      { key: 'mozart', title_ko: '모차르트 자장가', title_en: 'Mozart Lullaby', composer: 'Mozart', duration_seconds: 120 },
    ]
    mockedGet.mockResolvedValueOnce({ data: { songs: mockSongs } })

    const result = await songsApi.listSongs()

    expect(result.songs).toEqual(mockSongs)
    expect(result.songs).toHaveLength(2)
  })

  it('빈 songs 배열도 그대로 반환한다 (엣지 케이스)', async () => {
    mockedGet.mockResolvedValueOnce({ data: { songs: [] } })

    const result = await songsApi.listSongs()

    expect(result.songs).toEqual([])
  })

  it('API 오류 발생 시 reject된 Promise를 반환한다', async () => {
    mockedGet.mockRejectedValueOnce(new Error('Network Error'))

    await expect(songsApi.listSongs()).rejects.toThrow('Network Error')
  })
})

// ────────────────────────────────────────────
// getPreviewUrl
// ────────────────────────────────────────────
describe('songsApi.getPreviewUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET /songs/{songKey}/preview 엔드포인트를 호출한다', async () => {
    mockedGet.mockResolvedValueOnce({
      data: { song_key: 'brahms', preview_url: 'https://cdn.example.com/brahms.mp3', expires_in_seconds: 3600 },
    })

    await songsApi.getPreviewUrl('brahms')

    expect(mockedGet).toHaveBeenCalledWith('/songs/brahms/preview')
    expect(mockedGet).toHaveBeenCalledTimes(1)
  })

  it('다른 songKey 전달 시 해당 경로로 요청한다', async () => {
    mockedGet.mockResolvedValueOnce({
      data: { song_key: 'mozart', preview_url: 'https://cdn.example.com/mozart.mp3', expires_in_seconds: 3600 },
    })

    await songsApi.getPreviewUrl('mozart')

    expect(mockedGet).toHaveBeenCalledWith('/songs/mozart/preview')
  })

  it('preview_url, song_key, expires_in_seconds를 포함한 응답을 반환한다', async () => {
    const mockResponse = {
      song_key: 'brahms',
      preview_url: 'https://cdn.example.com/brahms.mp3',
      expires_in_seconds: 3600,
    }
    mockedGet.mockResolvedValueOnce({ data: mockResponse })

    const result = await songsApi.getPreviewUrl('brahms')

    expect(result.song_key).toBe('brahms')
    expect(result.preview_url).toBe('https://cdn.example.com/brahms.mp3')
    expect(result.expires_in_seconds).toBe(3600)
  })

  it('API 오류 발생 시 reject된 Promise를 반환한다', async () => {
    mockedGet.mockRejectedValueOnce(new Error('Unauthorized'))

    await expect(songsApi.getPreviewUrl('brahms')).rejects.toThrow('Unauthorized')
  })
})
