export interface LyricEntry {
  lines: string[];
}

export type SongKey = 'brahms' | 'hush' | 'mozart' | 'schubert' | 'twinkle' | 'rockabye';

export const LYRICS: Record<SongKey, LyricEntry> = {
  brahms: {
    lines: [
      '잘 자라 우리 아기',
      '앞뜰과 뒷동산에',
      '새들도 양들도',
      '모두 자는데',
      '달님은 영창으로',
      '은구슬 금구슬을',
    ],
  },
  hush: {
    lines: [
      '쉿 아가야 울지 마',
      '엄마가 작은 새를 사줄게',
      '새가 노래 못 하면',
      '반짝이는 반지를 사줄게',
      '아가야 잘 자렴',
      '엄마가 곁에 있어',
    ],
  },
  mozart: {
    lines: [
      '잘 자라 내 아기',
      '달빛 아래 포근히',
      '엄마 품에 안겨서',
      '달콤하게 꿈꾸렴',
      '아침이 올 때까지',
      '평온히 잠들어',
    ],
  },
  schubert: {
    lines: [
      '잠들어라 내 아기',
      '별빛이 가득한 밤',
      '천사들이 지켜보며',
      '꿈을 선물해줄 거야',
      '고요한 밤 속에서',
      '포근히 잠들어라',
    ],
  },
  twinkle: {
    lines: [
      '반짝반짝 작은 별',
      '아름답게 빛나네',
      '동쪽 하늘에서도',
      '서쪽 하늘에서도',
      '반짝반짝 작은 별',
      '아름답게 빛나네',
    ],
  },
  rockabye: {
    lines: [
      '자장자장 아가야',
      '나뭇가지 위에서',
      '바람이 살랑살랑',
      '요람이 흔들리네',
      '가지가 부러지면',
      '엄마가 받아줄게',
    ],
  },
};

export function getLyrics(songKey: string): LyricEntry | null {
  return (LYRICS as Record<string, LyricEntry>)[songKey] ?? null;
}
