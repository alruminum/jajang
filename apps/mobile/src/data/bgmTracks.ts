export type SongKey = 'brahms' | 'hush' | 'mozart' | 'schubert' | 'twinkle' | 'rockabye';

export interface BgmTrackMeta {
  titleKo: string;
  previewKey: string;
  loopDurationMs: number;
}

// TODO(#222): loopDurationMs 는 placeholder. 실제 BGM mp3 파일 확정 후
// `ffprobe -show_entries format=duration` 로 실측해서 교체할 것.
export const BGM_TRACKS: Record<SongKey, BgmTrackMeta> = {
  brahms: { titleKo: '브람스 자장가', previewKey: 'brahms', loopDurationMs: 120000 },
  mozart: { titleKo: '모차르트 자장가', previewKey: 'mozart', loopDurationMs: 140000 },
  schubert: { titleKo: '슈베르트 자장가', previewKey: 'schubert', loopDurationMs: 130000 },
  twinkle: { titleKo: '반짝반짝 작은 별', previewKey: 'twinkle', loopDurationMs: 90000 },
  rockabye: { titleKo: 'Rock-a-bye Baby', previewKey: 'rockabye', loopDurationMs: 100000 },
  hush: { titleKo: 'Hush Little Baby', previewKey: 'hush', loopDurationMs: 110000 },
};

export function getBgmTrackMeta(songKey: string): BgmTrackMeta | null {
  return BGM_TRACKS[songKey as SongKey] ?? null;
}
