/**
 * LyricsBox 컴포넌트 테스트 (TDD — impl/09 §3, §9 기반)
 *
 * 인터페이스:
 *   <LyricsBox songKey: string mode: 'preview' | 'recording' />
 *
 * 렌더 규약:
 *   - songKey 가 LYRICS 에 존재  → 타이틀 + 가사 줄 목록 렌더
 *   - songKey 가 LYRICS 에 미존재 → null (박스 미렌더)  ← impl §3 fallback
 *   - mode 'preview' 와 'recording' 동일 스타일/구조 (재사용 컴포넌트)
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react-native';

import { LyricsBox } from '@components/LyricsBox';
import { LYRICS } from '../../data/lyrics';
import { SONG_NAMES } from '../../services/songs';

const VALID_KEYS = ['brahms', 'hush', 'mozart', 'schubert', 'twinkle', 'rockabye'] as const;

describe('LyricsBox — 인터페이스 contract (impl/09 §3)', () => {
  it('valid songKey + mode=preview 일 때 타이틀이 렌더된다', () => {
    const songKey = VALID_KEYS[0];
    const expectedTitle = SONG_NAMES[songKey];
    expect(expectedTitle).toBeTruthy();

    const { getByText } = render(<LyricsBox songKey={songKey} mode="preview" />);
    expect(getByText(expectedTitle as string)).toBeTruthy();
  });

  it('valid songKey + mode=preview 일 때 모든 가사 줄이 렌더된다', () => {
    const songKey = VALID_KEYS[0];
    const lines = LYRICS[songKey]?.lines ?? [];
    expect(lines.length).toBeGreaterThanOrEqual(4);
    expect(lines.length).toBeLessThanOrEqual(6);

    const { getByText } = render(<LyricsBox songKey={songKey} mode="preview" />);
    for (const line of lines) {
      expect(getByText(line)).toBeTruthy();
    }
  });

  it('valid songKey + mode=recording 일 때도 동일하게 렌더된다 (재사용 컴포넌트)', () => {
    const songKey = VALID_KEYS[0];
    const expectedTitle = SONG_NAMES[songKey] as string;

    const { getByText } = render(<LyricsBox songKey={songKey} mode="recording" />);
    expect(getByText(expectedTitle)).toBeTruthy();
  });

  it('6곡 모든 valid songKey 에 대해 박스가 렌더된다 (출시 시점 가사 준비됨)', () => {
    for (const key of VALID_KEYS) {
      const title = SONG_NAMES[key];
      expect(LYRICS[key], `LYRICS[${key}] must exist`).toBeTruthy();
      expect(title, `SONG_NAMES[${key}] must exist`).toBeTruthy();

      const { getByText, unmount } = render(<LyricsBox songKey={key} mode="preview" />);
      expect(getByText(title as string)).toBeTruthy();
      unmount();
    }
  });
});

describe('LyricsBox — fallback 처리 (impl/09 §3)', () => {
  it('LYRICS 에 미매핑된 songKey 면 박스를 렌더하지 않는다 (null 반환)', () => {
    const { toJSON } = render(<LyricsBox songKey="__unknown_song__" mode="preview" />);
    expect(toJSON()).toBeNull();
  });

  it('빈 문자열 songKey 면 박스를 렌더하지 않는다', () => {
    const { toJSON } = render(<LyricsBox songKey="" mode="preview" />);
    expect(toJSON()).toBeNull();
  });

  it('mode=recording 에서도 미매핑 songKey 면 박스를 렌더하지 않는다', () => {
    const { toJSON } = render(<LyricsBox songKey="__nope__" mode="recording" />);
    expect(toJSON()).toBeNull();
  });
});
