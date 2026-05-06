// apps/mobile/src/services/api/masters.ts
// /masters API 클라이언트

import { apiClient } from './client';

export type MasterItem = {
  session_id: string;
  song_key: string;
  presigned_url: string;
  completed_at: string;       // ISO
  dsp_duration_ms: number | null;
};

export type MastersListResponse = {
  items: MasterItem[];
  has_pending: boolean;
  next_cursor: string | null;
};

export const mastersApi = {
  fetchMastersMe: (cursor?: string): Promise<MastersListResponse> => {
    const params: Record<string, string> = {};
    if (cursor) params.cursor = cursor;
    return apiClient.get('/masters/me', { params }).then(r => r.data);
  },
};
