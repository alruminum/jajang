import React from 'react';
import { act, create } from 'react-test-renderer';

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (s: any) => s },
  useColorScheme: () => 'light',
}));

jest.mock('@hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      textPrimary: '#fff',
      textSecondary: '#aaa',
      accentPrimary: '#5A7AA8',
      bgPrimary: '#0D0F1A',
    },
    isDark: false,
  }),
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

import EmptyTrackState from '@components/EmptyTrackState';

describe('EmptyTrackState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function renderTree() {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<EmptyTrackState />);
    });
    return tree!;
  }

  it('"아직 자장가가 없어요" 제목 텍스트를 표시한다', () => {
    const tree = renderTree();
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('아직 자장가가 없어요');
  });

  it('"목소리를 담아볼까요?" 서브타이틀 텍스트를 표시한다', () => {
    const tree = renderTree();
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('목소리를 담아볼까요?');
  });

  it('"자장가 만들기" 버튼 텍스트를 표시한다', () => {
    const tree = renderTree();
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('자장가 만들기');
  });

  it('"자장가 만들기" 버튼 탭 시 SongSelect 화면으로 이동한다', () => {
    const tree = renderTree();
    const touchable = tree.root.findByType('TouchableOpacity' as any);
    touchable.props.onPress();
    expect(mockNavigate).toHaveBeenCalledWith('SongSelect');
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('"자장가 만들기" 버튼의 accessibilityLabel이 "자장가 만들기"이다', () => {
    const tree = renderTree();
    const touchable = tree.root.findByType('TouchableOpacity' as any);
    expect(touchable.props.accessibilityLabel).toBe('자장가 만들기');
  });
});
