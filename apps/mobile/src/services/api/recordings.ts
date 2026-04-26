// apps/mobile/src/services/api/recordings.ts
// /recordings/init, /complete, /validate API 클라이언트

import { api } from '../api.ts'

export interface UploadInitResponse {
  sample_id: string
  upload_url: string
  s3_key: string
  expires_in_seconds: number
}

export interface UploadCompleteResponse {
  sample_id: string
  status: string
  message: string
}

export interface ValidateResponse {
  sample_id: string
  passed: boolean
  snr_db?: number
  fail_reason?: string
  message: string
}

export const recordingsApi = {
  initUpload: (params: {
    song_key: string
    file_size_bytes: number
    content_type: string
  }): Promise<UploadInitResponse> =>
    api.post('/recordings/init', params).then(r => r.data),

  /**
   * S3 presigned PUT URL로 파일 직접 업로드.
   * axios 인터셉터(JWT) 우회 — presigned URL은 S3로 직접 전송.
   * expo-file-system 미사용 — fetch + Blob API 사용 (React Native 내장).
   */
  uploadToS3: async (
    presignedUrl: string,
    fileUri: string,
    contentType: string,
  ): Promise<void> => {
    const fileResponse = await fetch(fileUri)
    const blob = await fileResponse.blob()
    const uploadResponse = await fetch(presignedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: blob,
    })
    if (!uploadResponse.ok) {
      throw new Error(`S3 upload failed: ${uploadResponse.status}`)
    }
  },

  completeUpload: (
    sampleId: string,
    params: {
      duration_seconds: number
      rms_db: number
      peak_count: number
    },
  ): Promise<UploadCompleteResponse> =>
    api.post(`/recordings/${sampleId}/complete`, { ...params, sample_id: sampleId }).then(r => r.data),

  validateSample: (sampleId: string): Promise<ValidateResponse> =>
    api.post(`/recordings/${sampleId}/validate`).then(r => r.data),
}
