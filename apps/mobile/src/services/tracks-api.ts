import { api } from './api';

export interface GeneratedTrack {
  id: string;
  song_key: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  s3_key: string | null;
  completed_at: string | null;
}

/**
 * 내 생성된 트랙 목록 조회
 * Epic 02/03 완료 후 실제 엔드포인트 연동
 */
export async function getMyTracks(): Promise<GeneratedTrack[]> {
  const { data } = await api.get<GeneratedTrack[]>('/tracks');
  return data;
}

/**
 * 백그라운드 생성 완료 카드용 — 마지막 확인 시각 이후 완료된 트랙
 * lastCheckedAt: ISO 8601 string
 */
export async function getNewlyCompletedTrack(
  lastCheckedAt: string,
): Promise<GeneratedTrack | null> {
  const { data } = await api.get<GeneratedTrack | null>('/tracks/newly-completed', {
    params: { since: lastCheckedAt },
  });
  return data;
}

/**
 * 목소리 샘플 삭제 — 녹음된 목소리 학습 데이터 전체 삭제.
 * DELETE /me/voice-samples
 * S16 설정 화면에서 호출. auth-api에도 동일 함수 존재 (별도 import 경로 대응).
 */
export async function deleteVoiceSamplesAPI(): Promise<void> {
  await api.delete('/me/voice-samples');
}

/**
 * 생성된 음원 전체 삭제.
 * DELETE /me/generated-tracks
 */
export async function deleteAllTracksAPI(): Promise<void> {
  await api.delete('/me/generated-tracks');
}
