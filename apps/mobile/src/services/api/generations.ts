// apps/mobile/src/services/api/generations.ts
// /generations API 클라이언트

import { api } from '../api.ts'

export type GenerationStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface GenerationInitRequest {
  job_id:          string   // UUID (클라이언트 생성)
  voice_sample_id: string
  song_key:        string
}

export interface GenerationInitResponse {
  job_id:   string
  track_id: string
  status:   GenerationStatus
  is_new:   boolean
}

export interface GenerationStatusResponse {
  job_id:          string
  track_id:        string
  status:          GenerationStatus
  presigned_url:   string | null
  error_message:   string | null
  queue_position:  number | null
}

export interface CounterStatusResponse {
  count:        number
  limit:        number
  remaining:    number
  is_free_tier: boolean
}

export const generationsApi = {
  initGeneration: (
    params: GenerationInitRequest,
  ): Promise<GenerationInitResponse> =>
    api.post('/generations/init', params).then(r => r.data),

  getStatus: (jobId: string): Promise<GenerationStatusResponse> =>
    api.get(`/generations/${jobId}`).then(r => r.data),

  getCounter: (): Promise<CounterStatusResponse> =>
    api.get('/generations/counter/me').then(r => r.data),
}
