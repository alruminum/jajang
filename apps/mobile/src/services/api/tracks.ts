// apps/mobile/src/services/api/tracks.ts
// /tracks API 클라이언트

import { api } from '@services/api'

export interface TrackItem {
  id:            string
  job_id:        string
  song_key:      string
  song_name:     string
  status:        'completed' | 'pending' | 'processing' | 'failed'
  presigned_url: string | null
  created_at:    string    // ISO8601
  completed_at:  string | null
}

export interface TracksListResponse {
  tracks:                     TrackItem[]
  has_pending:                boolean
  completed_since_last_check: boolean
  total:                      number
}

export interface TrackDeleteResponse {
  id:      string
  deleted: boolean
}

export const tracksApi = {
  listTracks: (params?: {
    lastCheckedAt?: string    // ISO8601 (UTC)
    includePresigned?: boolean
  }): Promise<TracksListResponse> => {
    const query: Record<string, string> = {}
    if (params?.lastCheckedAt)
      query.last_checked_at = params.lastCheckedAt
    if (params?.includePresigned !== undefined)
      query.include_presigned = String(params.includePresigned)
    return api.get('/tracks/', { params: query }).then(r => r.data)
  },

  deleteTrack: (trackId: string): Promise<TrackDeleteResponse> =>
    api.delete(`/tracks/${trackId}`).then(r => r.data),
}
