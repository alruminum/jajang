// apps/mobile/src/services/api/sessions.ts
// sessions API 클라이언트 (impl/07 §2)
// DSP 세션 생성·녹음 등록·생성 요청·상태 조회

import { apiClient } from './client';

export type SessionStatus = 'open' | 'generating' | 'completed' | 'failed';

export interface SessionStatusResponse {
  session_id: string;
  status: SessionStatus;
  master_status: 'pending' | 'processing' | 'completed' | 'failed' | null;
  presigned_url: string | null;
  error_message: string | null;
}

export async function initSession(p: {
  idempotency_key: string;
  song_key: string;
}): Promise<{ session_id: string; presigned_upload_url: string; s3_key: string; is_new: boolean }> {
  const r = await apiClient.post('/sessions/init', p);
  return r.data;
}

export async function postRecording(
  sessionId: string,
  p: { s3_key: string; duration_ms: number },
): Promise<{ recording_id: string }> {
  const r = await apiClient.post(`/sessions/${sessionId}/recordings`, p);
  return r.data;
}

export async function generateSession(sessionId: string): Promise<void> {
  await apiClient.post(`/sessions/${sessionId}/generate`);
}

export async function getSessionStatus(sessionId: string): Promise<SessionStatusResponse> {
  const r = await apiClient.get(`/sessions/${sessionId}/status`);
  return r.data;
}
