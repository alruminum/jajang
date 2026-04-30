import React from 'react';
import { act, create } from 'react-test-renderer';
import { cleanup } from '@testing-library/react-native';
import { TouchableOpacity } from 'react-native';
import type { GeneratedTrack } from '@services/tracks-api';

// react-native는 jest-expo preset mock 사용 (수동 mock 제거)

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('@hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      background: '#fff',
      text: '#000',
      primary: '#000',
      secondary: '#999',
      accent: '#000',
      surface: '#f5f5f5',
      border: '#e0e0e0',
      error: '#f00',
    },
    theme: 'light',
  }),
}));

import CompletedTrackCard from '@components/CompletedTrackCard';

const makeTrack = (overrides: Partial<GeneratedTrack> = {}): GeneratedTrack => ({
  id: 'track-1',
  song_key: 'brahms',
  status: 'completed',
  s3_key: 's3/audio/key',
  completed_at: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

afterEach(() => {
  cleanup();
});

function renderTree(props: { track: GeneratedTrack; onDismiss: () => void }) {
  let tree: ReturnType<typeof create>;
  act(() => {
    tree = create(<CompletedTrackCard {...props} />);
  });
  return tree!;
}

describe('CompletedTrackCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- SONG_NAMES 매핑 ---

  it.each([
    ['brahms', '브람스 자장가'],
    ['mozart', '모차르트 자장가'],
    ['schubert', '슈베르트 자장가'],
    ['twinkle', '반짝반짝 작은 별'],
    ['rockabye', 'Rock-a-bye Baby'],
    ['hush', 'Hush Little Baby'],
  ])('song_key="%s" → 곡명 "%s"을 표시한다', (key, expectedName) => {
    const track = makeTrack({ song_key: key });
    const tree = renderTree({ track, onDismiss: jest.fn() });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain(expectedName);
  });

  it('알 수 없는 song_key는 key 값 자체를 표시한다 (fallback)', () => {
    const track = makeTrack({ song_key: 'custom-unknown-key' });
    const tree = renderTree({ track, onDismiss: jest.fn() });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('custom-unknown-key');
  });

  // --- 배지 / 안내 텍스트 ---

  it('"새 자장가 완성" 배지 텍스트를 표시한다', () => {
    const tree = renderTree({ track: makeTrack(), onDismiss: jest.fn() });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('새 자장가 완성');
  });

  it('"내 목소리로 만든 자장가가 준비됐어요" 안내 문구를 표시한다', () => {
    const tree = renderTree({ track: makeTrack(), onDismiss: jest.fn() });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('내 목소리로 만든 자장가가 준비됐어요');
  });

  // --- "들어볼게요" 버튼 ---

  it('"들어볼게요" 버튼 탭 시 onDismiss를 호출한다', () => {
    const onDismiss = jest.fn();
    const tree = renderTree({ track: makeTrack(), onDismiss });
    const touchables = tree.root.findAllByType(TouchableOpacity);
    act(() => {
      touchables[0].props.onPress();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('"들어볼게요" 버튼 탭 시 Play 화면으로 이동한다', () => {
    const track = makeTrack({ id: 'track-42' });
    const tree = renderTree({ track, onDismiss: jest.fn() });
    const touchables = tree.root.findAllByType(TouchableOpacity);
    act(() => {
      touchables[0].props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('Play', { trackId: 'track-42' });
  });

  it('"들어볼게요" 버튼의 accessibilityLabel이 "들어볼게요"이다', () => {
    const tree = renderTree({ track: makeTrack(), onDismiss: jest.fn() });
    const touchables = tree.root.findAllByType(TouchableOpacity);
    expect(touchables[0].props.accessibilityLabel).toBe('들어볼게요');
  });

  // --- "나중에 들을게요" 버튼 ---

  it('"나중에 들을게요" 버튼 탭 시 onDismiss를 호출한다', () => {
    const onDismiss = jest.fn();
    const tree = renderTree({ track: makeTrack(), onDismiss });
    const touchables = tree.root.findAllByType(TouchableOpacity);
    act(() => {
      touchables[1].props.onPress();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('"나중에 들을게요" 버튼 탭 시 navigate는 호출되지 않는다', () => {
    const tree = renderTree({ track: makeTrack(), onDismiss: jest.fn() });
    const touchables = tree.root.findAllByType(TouchableOpacity);
    act(() => {
      touchables[1].props.onPress();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('"나중에 들을게요" 버튼의 accessibilityLabel이 "나중에 들을게요"이다', () => {
    const tree = renderTree({ track: makeTrack(), onDismiss: jest.fn() });
    const touchables = tree.root.findAllByType(TouchableOpacity);
    expect(touchables[1].props.accessibilityLabel).toBe('나중에 들을게요');
  });
});
