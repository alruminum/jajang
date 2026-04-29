import { SONG_NAMES } from '@services/songs';

export type SongKey = 'brahms' | 'hush' | 'mozart' | 'schubert' | 'twinkle' | 'rockabye';

export interface BgmTrackMeta {
  titleKo: string;
}

export function getBgmTrackMeta(songKey: string): BgmTrackMeta | null {
  const titleKo = SONG_NAMES[songKey];
  return titleKo ? { titleKo } : null;
}
