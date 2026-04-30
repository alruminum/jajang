
import { LYRICS, getLyrics, type SongKey } from '../../data/lyrics';

const SONG_KEYS: SongKey[] = [
  'brahms',
  'hush',
  'mozart',
  'schubert',
  'twinkle',
  'rockabye',
];

describe('data/lyrics — LYRICS 상수', () => {
  it('6곡 모두 키가 존재한다', () => {
    for (const key of SONG_KEYS) {
      expect(LYRICS[key]).toBeDefined();
    }
  });

  it.each(SONG_KEYS)('%s 가사는 4~6줄이고 모두 비어있지 않은 문자열이다', (key) => {
    const entry = LYRICS[key];
    expect(Array.isArray(entry.lines)).toBe(true);
    expect(entry.lines.length).toBeGreaterThanOrEqual(4);
    expect(entry.lines.length).toBeLessThanOrEqual(6);
    for (const line of entry.lines) {
      expect(typeof line).toBe('string');
      expect(line.trim().length).toBeGreaterThan(0);
    }
  });

  it('LyricEntry 는 곡명(titleKo)을 자체 보관하지 않는다 (SONG_NAMES SSOT)', () => {
    for (const key of SONG_KEYS) {
      const entry = LYRICS[key] as Record<string, unknown>;
      expect(entry.titleKo).toBeUndefined();
      expect(entry.title).toBeUndefined();
    }
  });
});

describe('data/lyrics — getLyrics()', () => {
  it.each(SONG_KEYS)('getLyrics(%s) 는 LyricEntry 를 반환한다', (key) => {
    const result = getLyrics(key);
    expect(result).not.toBeNull();
    expect(result).toEqual(LYRICS[key]);
  });

  it('getLyrics("brahms").lines[0] === "잘 자라 우리 아기"', () => {
    expect(getLyrics('brahms')?.lines[0]).toBe('잘 자라 우리 아기');
  });

  it('getLyrics("twinkle").lines[0] === "반짝반짝 작은 별"', () => {
    expect(getLyrics('twinkle')?.lines[0]).toBe('반짝반짝 작은 별');
  });

  it('getLyrics("unknown_key") → null', () => {
    expect(getLyrics('unknown_key')).toBeNull();
  });

  it('getLyrics("") → null (빈 문자열 fallback)', () => {
    expect(getLyrics('')).toBeNull();
  });
});
