
import { getBgmTrackMeta } from '../../data/bgmTracks';

describe('data/bgmTracks — getBgmTrackMeta() (SONG_NAMES SSOT wrapper)', () => {
  it('brahms → { titleKo: "브람스 자장가" }', () => {
    expect(getBgmTrackMeta('brahms')).toEqual({ titleKo: '브람스 자장가' });
  });

  it('mozart → { titleKo: "모차르트 자장가" }', () => {
    expect(getBgmTrackMeta('mozart')).toEqual({ titleKo: '모차르트 자장가' });
  });

  it('schubert → { titleKo: "슈베르트 자장가" }', () => {
    expect(getBgmTrackMeta('schubert')).toEqual({ titleKo: '슈베르트 자장가' });
  });

  it('twinkle → { titleKo: "반짝반짝 작은 별" } (서버 title_ko 와 일치, drift 정정)', () => {
    expect(getBgmTrackMeta('twinkle')).toEqual({ titleKo: '반짝반짝 작은 별' });
  });

  it('rockabye → { titleKo: "Rock-a-bye Baby" }', () => {
    expect(getBgmTrackMeta('rockabye')).toEqual({ titleKo: 'Rock-a-bye Baby' });
  });

  it('hush → { titleKo: "Hush Little Baby" }', () => {
    expect(getBgmTrackMeta('hush')).toEqual({ titleKo: 'Hush Little Baby' });
  });

  it('unknown 키 → null (fallback)', () => {
    expect(getBgmTrackMeta('unknown')).toBeNull();
    expect(getBgmTrackMeta('')).toBeNull();
    expect(getBgmTrackMeta('TWINKLE')).toBeNull(); // 대소문자 구분 — SONG_NAMES key 그대로
  });

  it('반환값은 항상 titleKo 단일 필드만 포함 (BGM URL 은 본 모듈 책임 아님)', () => {
    const meta = getBgmTrackMeta('brahms');
    expect(meta).not.toBeNull();
    expect(Object.keys(meta as object).sort()).toEqual(['titleKo']);
  });
});
