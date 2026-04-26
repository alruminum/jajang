/**
 * tracksApi 클라이언트 테스트
 * impl/07 — apps/mobile/src/services/api/tracks.ts
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'

// apiClient mock — tracks.ts 내부에서 import { apiClient } from './client'
const mockGet    = vi.fn()
const mockDelete = vi.fn()

vi.mock('@services/api/client', () => ({
  apiClient: {
    get:    mockGet,
    delete: mockDelete,
  },
}))

import { tracksApi } from '@services/api/tracks'
import type { TracksListResponse, TrackDeleteResponse } from '@services/api/tracks'

// ─────────────────────────────────────────────
// 픽스처
// ─────────────────────────────────────────────
const makeListResponse = (overrides: Partial<TracksListResponse> = {}): TracksListResponse => ({
  tracks: [],
  has_pending: false,
  completed_since_last_check: false,
  total: 0,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
})

// ─────────────────────────────────────────────
// describe: REQ-TracksAPI-listTracks
// ─────────────────────────────────────────────
describe('tracksApi.listTracks — REQ-TracksAPI-listTracks', () => {
  it('GET /tracks/ 를 호출한다', async () => {
    mockGet.mockResolvedValue({ data: makeListResponse() })
    await tracksApi.listTracks()
    expect(mockGet).toHaveBeenCalledWith('/tracks/', expect.any(Object))
  })

  it('파라미터 없이 호출 시 쿼리 파라미터가 비어 있다', async () => {
    mockGet.mockResolvedValue({ data: makeListResponse() })
    await tracksApi.listTracks()
    expect(mockGet).toHaveBeenCalledWith('/tracks/', { params: {} })
  })

  it('lastCheckedAt 전달 시 last_checked_at 파라미터가 포함된다', async () => {
    mockGet.mockResolvedValue({ data: makeListResponse() })
    const ts = '2024-01-15T10:00:00Z'
    await tracksApi.listTracks({ lastCheckedAt: ts })
    expect(mockGet).toHaveBeenCalledWith('/tracks/', {
      params: { last_checked_at: ts },
    })
  })

  it('includePresigned=true 전달 시 include_presigned="true" 파라미터가 포함된다', async () => {
    mockGet.mockResolvedValue({ data: makeListResponse() })
    await tracksApi.listTracks({ includePresigned: true })
    expect(mockGet).toHaveBeenCalledWith('/tracks/', {
      params: { include_presigned: 'true' },
    })
  })

  it('includePresigned=false 전달 시 include_presigned="false" 파라미터가 포함된다', async () => {
    mockGet.mockResolvedValue({ data: makeListResponse() })
    await tracksApi.listTracks({ includePresigned: false })
    expect(mockGet).toHaveBeenCalledWith('/tracks/', {
      params: { include_presigned: 'false' },
    })
  })

  it('lastCheckedAt + includePresigned 동시 전달 시 두 파라미터 모두 포함된다', async () => {
    mockGet.mockResolvedValue({ data: makeListResponse() })
    await tracksApi.listTracks({ lastCheckedAt: '2024-01-15T10:00:00Z', includePresigned: true })
    expect(mockGet).toHaveBeenCalledWith('/tracks/', {
      params: {
        last_checked_at: '2024-01-15T10:00:00Z',
        include_presigned: 'true',
      },
    })
  })

  it('응답 data를 TracksListResponse 형태로 반환한다', async () => {
    const response = makeListResponse({
      has_pending: true,
      completed_since_last_check: true,
      total: 5,
    })
    mockGet.mockResolvedValue({ data: response })
    const result = await tracksApi.listTracks()
    expect(result).toEqual(response)
  })

  it('has_pending=true가 정확히 반환된다', async () => {
    mockGet.mockResolvedValue({ data: makeListResponse({ has_pending: true }) })
    const result = await tracksApi.listTracks()
    expect(result.has_pending).toBe(true)
  })

  it('completed_since_last_check=true가 정확히 반환된다', async () => {
    mockGet.mockResolvedValue({ data: makeListResponse({ completed_since_last_check: true }) })
    const result = await tracksApi.listTracks()
    expect(result.completed_since_last_check).toBe(true)
  })

  it('lastCheckedAt 미전달 시 last_checked_at 파라미터가 쿼리에 없다', async () => {
    mockGet.mockResolvedValue({ data: makeListResponse() })
    await tracksApi.listTracks({})
    const callArgs = mockGet.mock.calls[0]
    expect(callArgs[1].params).not.toHaveProperty('last_checked_at')
  })

  it('includePresigned 미전달 시 include_presigned 파라미터가 쿼리에 없다', async () => {
    mockGet.mockResolvedValue({ data: makeListResponse() })
    await tracksApi.listTracks({})
    const callArgs = mockGet.mock.calls[0]
    expect(callArgs[1].params).not.toHaveProperty('include_presigned')
  })
})

// ─────────────────────────────────────────────
// describe: REQ-TracksAPI-deleteTrack
// ─────────────────────────────────────────────
describe('tracksApi.deleteTrack — REQ-TracksAPI-deleteTrack', () => {
  it('DELETE /tracks/{trackId} 를 호출한다', async () => {
    const deleteResponse: TrackDeleteResponse = { id: 'track-1', deleted: true }
    mockDelete.mockResolvedValue({ data: deleteResponse })
    await tracksApi.deleteTrack('track-1')
    expect(mockDelete).toHaveBeenCalledWith('/tracks/track-1')
  })

  it('응답 data를 TrackDeleteResponse로 반환한다', async () => {
    const deleteResponse: TrackDeleteResponse = { id: 'track-abc', deleted: true }
    mockDelete.mockResolvedValue({ data: deleteResponse })
    const result = await tracksApi.deleteTrack('track-abc')
    expect(result).toEqual(deleteResponse)
  })

  it('trackId가 UUID 형식일 때도 올바른 경로로 호출된다', async () => {
    const uuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
    mockDelete.mockResolvedValue({ data: { id: uuid, deleted: true } })
    await tracksApi.deleteTrack(uuid)
    expect(mockDelete).toHaveBeenCalledWith(`/tracks/${uuid}`)
  })

  it('deleted=true가 응답에 포함된다', async () => {
    mockDelete.mockResolvedValue({ data: { id: 'track-x', deleted: true } })
    const result = await tracksApi.deleteTrack('track-x')
    expect(result.deleted).toBe(true)
  })
})
