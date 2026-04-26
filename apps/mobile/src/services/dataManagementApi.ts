// apps/mobile/src/services/dataManagementApi.ts
// Epic 06 — 개인정보 & 데이터 관리 API 래퍼

import { api } from './api'

// ─── 타입 정의 ────────────────────────────────────────────────────────────────

export interface VoiceSampleStatus {
  hasSample: boolean
  sampleStatus: 'uploaded' | 'validated' | 'generation_started' | 'deleted' | null
}

export interface Track {
  id: string
  songKey: string
  createdAt: string
  s3Key: string | null
}

// ─── API 함수 ─────────────────────────────────────────────────────────────────

/** 목소리 샘플 존재 여부 조회 */
export async function getVoiceSampleStatus(): Promise<VoiceSampleStatus> {
  const res = await api.get<VoiceSampleStatus>('/users/me/voice-sample-status')
  return res.data
}

/** 목소리 샘플 즉시 삭제 */
export async function deleteVoiceSample(): Promise<void> {
  await api.delete('/recordings/me/sample')
}

/** 개별 음원 삭제 */
export async function deleteTrack(trackId: string): Promise<void> {
  await api.delete(`/tracks/${trackId}`)
}

/** 전체 음원 일괄 삭제 */
export async function deleteAllTracks(): Promise<void> {
  await api.delete('/tracks')
}
