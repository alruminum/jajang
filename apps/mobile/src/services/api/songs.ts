import { api } from '@services/api';

export interface Song {
  key: string;
  title_ko: string;
  title_en: string;
  composer: string;
  duration_seconds: number;
}

export interface SongListResponse {
  songs: Song[];
}

export interface PreviewUrlResponse {
  song_key: string;
  preview_url: string;
  expires_in_seconds: number;
}

export const songsApi = {
  listSongs: (): Promise<SongListResponse> =>
    api.get('/songs').then(r => r.data),

  getPreviewUrl: (songKey: string): Promise<PreviewUrlResponse> =>
    api.get(`/songs/${songKey}/preview`).then(r => r.data),
};
