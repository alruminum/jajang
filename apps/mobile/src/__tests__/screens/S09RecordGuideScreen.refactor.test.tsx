/**
 * S09 RecordGuideScreen 리팩토링 테스트 (TDD — impl/09 §4, §9 기반)
 *
 * 변경 contract:
 *  1. challenge-response 박스 제거 → 가사 미리보기 박스 + 헤드폰 chip 으로 교체
 *  2. route.params 에 songKey 추가: { mode: 'humming'|'shush'; songKey: string }
 *  3. 허밍 모드 한정으로 헤드폰 chip + 가사 박스 노출 (쉬 모드 미노출)
 *  4. 가사 미준비(songKey 미매핑) fallback: "허밍해 주세요" 텍스트 표시 (박스 숨김)
 *  5. CTA 탭 → navigate('Record', { mode, songKey })
 *  6. challengesApi 호출 없음 (네트워크 요청 제거)
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { LYRICS } from '../../data/lyrics';
import { SONG_NAMES } from '../../services/songs';

const mockGetRandomPhrase = vi.fn();
vi.mock('@services/api/challenges', () => ({
  challengesApi: { getRandomPhrase: mockGetRandomPhrase },
}));

import { RecordGuideScreen } from '@screens/RecordGuideScreen';

const mockNavigate = vi.fn();
const mockNavigation = { navigate: mockNavigate } as any;

function renderWith(params: { mode: 'humming' | 'shush'; songKey: string }) {
  return render(
    <RecordGuideScreen
      navigation={mockNavigation}
      route={{ key: 'RecordGuide', name: 'RecordGuide', params } as any}
    />,
  );
}

beforeEach(() => {
  mockNavigate.mockReset();
  mockGetRandomPhrase.mockReset();
});

describe('S09 RecordGuideScreen — 허밍 모드 (impl/09 §9)', () => {
  it('헤드폰 chip 텍스트가 노출된다', () => {
    const { getByText } = renderWith({ mode: 'humming', songKey: 'brahms' });
    expect(getByText('이어폰을 끼면 더 또렷하게 담겨요')).toBeTruthy();
  });

  it('선택 곡 가사 박스가 노출된다 (타이틀 + 가사 줄)', () => {
    const title = SONG_NAMES['brahms'] as string;
    const lines = LYRICS['brahms'].lines;

    const { getByText } = renderWith({ mode: 'humming', songKey: 'brahms' });
    expect(getByText(title)).toBeTruthy();
    expect(getByText(lines[0])).toBeTruthy();
  });

  it('challengesApi.getRandomPhrase 가 호출되지 않는다 (네트워크 요청 제거)', () => {
    renderWith({ mode: 'humming', songKey: 'brahms' });
    expect(mockGetRandomPhrase).not.toHaveBeenCalled();
  });
});

describe('S09 RecordGuideScreen — 쉬 모드 (impl/09 §9)', () => {
  it('헤드폰 chip 이 노출되지 않는다', () => {
    const { queryByText } = renderWith({ mode: 'shush', songKey: 'brahms' });
    expect(queryByText('이어폰을 끼면 더 또렷하게 담겨요')).toBeNull();
  });

  it('가사 박스가 노출되지 않는다 (가사 타이틀 미렌더)', () => {
    const title = SONG_NAMES['brahms'] as string;

    const { queryByText } = renderWith({ mode: 'shush', songKey: 'brahms' });
    expect(queryByText(title)).toBeNull();
  });

  it('challengesApi.getRandomPhrase 가 호출되지 않는다', () => {
    renderWith({ mode: 'shush', songKey: 'brahms' });
    expect(mockGetRandomPhrase).not.toHaveBeenCalled();
  });
});

describe('S09 RecordGuideScreen — 가사 미준비 fallback (impl/09 §3, §9)', () => {
  it('허밍 모드 + 미매핑 songKey 면 "허밍해 주세요" 텍스트가 표시된다', () => {
    const { getByText } = renderWith({ mode: 'humming', songKey: '__no_lyrics__' });
    expect(getByText('허밍해 주세요')).toBeTruthy();
  });

  it('허밍 모드 + 미매핑 songKey 면 가사 박스(타이틀)는 숨겨진다', () => {
    const anyTitle = SONG_NAMES['brahms'] as string;

    const { queryByText } = renderWith({ mode: 'humming', songKey: '__no_lyrics__' });
    expect(queryByText(anyTitle)).toBeNull();
  });

  it('허밍 모드 + 미매핑 songKey 라도 헤드폰 chip 은 유지된다', () => {
    const { getByText } = renderWith({ mode: 'humming', songKey: '__no_lyrics__' });
    expect(getByText('이어폰을 끼면 더 또렷하게 담겨요')).toBeTruthy();
  });

  it('허밍 모드 + 빈 문자열 songKey 도 fallback 처리된다 (deep-link 비정상 진입 방어)', () => {
    const { getByText } = renderWith({ mode: 'humming', songKey: '' });
    expect(getByText('허밍해 주세요')).toBeTruthy();
  });
});

describe('S09 RecordGuideScreen — CTA 네비게이션 (impl/09 §4, §9)', () => {
  it('CTA 탭 → navigate("Record", { mode, songKey }) 가 호출된다', async () => {
    const { getByTestId } = renderWith({ mode: 'humming', songKey: 'brahms' });
    fireEvent.press(getByTestId('record-guide-cta'));
    await Promise.resolve();
    expect(mockNavigate).toHaveBeenCalledWith('Record', {
      mode: 'humming',
      songKey: 'brahms',
    });
  });

  it('쉬 모드 CTA 탭에서도 songKey 가 전달된다', async () => {
    const { getByTestId } = renderWith({ mode: 'shush', songKey: 'twinkle' });
    fireEvent.press(getByTestId('record-guide-cta'));
    await Promise.resolve();
    expect(mockNavigate).toHaveBeenCalledWith('Record', {
      mode: 'shush',
      songKey: 'twinkle',
    });
  });
});
