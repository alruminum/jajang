import { SONG_NAMES } from '@services/songs';

export type SongKey = 'brahms' | 'hush' | 'mozart' | 'schubert' | 'twinkle' | 'rockabye';

export interface BgmTrackMeta {
  titleKo: string;
  previewKey: string;
}

export const BGM_TRACKS: Record<string, BgmTrackMeta> = Object.fromEntries(
  Object.entries(SONG_NAMES).map(([key, titleKo]) => [
    key,
    { titleKo, previewKey: key },
  ]),
);

export function getBgmTrackMeta(songKey: string): BgmTrackMeta | null {
  return BGM_TRACKS[songKey] ?? null;
}
