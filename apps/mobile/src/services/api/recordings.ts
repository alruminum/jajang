// apps/mobile/src/services/api/recordings.ts
// /recordings/init, /complete, /validate API 클라이언트

import * as FileSystem from 'expo-file-system/legacy'

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
   * file:// URI 업로드는 expo-file-system 사용 (RN/Hermes의 fetch+Blob이 file:// 미지원).
   */
  uploadToS3: async (
    presignedUrl: string,
    fileUri: string,
    contentType: string,
  ): Promise<void> => {
    const result = await FileSystem.uploadAsync(presignedUrl, fileUri, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Type': contentType },
    })
    if (result.status < 200 || result.status >= 300) {
      const bodyPreview = result.body ? ` ${result.body.slice(0, 200)}` : ''
      throw new Error(`S3 upload failed: ${result.status}${bodyPreview}`)
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
