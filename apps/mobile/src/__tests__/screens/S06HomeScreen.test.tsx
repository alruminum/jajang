import React from 'react';
import { create, act } from 'react-test-renderer';
import { cleanup } from '@testing-library/react-native';

// --- React Native 모킹 ---
jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: 'View',
    Text: 'Text',
    TouchableOpacity: 'TouchableOpacity',
    StyleSheet: { create: (s: any) => s },
    FlatList: ({
      data,
      renderItem,
      ListHeaderComponent,
      ListEmptyComponent,
      keyExtractor,
      refreshControl,
      contentContainerStyle,
    }: any) =>
      React.createElement(
        'View',
        null,
        refreshControl,
        ListHeaderComponent,
        data && data.length > 0
          ? data.map((item: any, index: number) => renderItem({ item, index }))
          : ListEmptyComponent,
      ),
    RefreshControl: 'RefreshControl',
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaView: ({ children }: any) =>
      React.createElement('View', null, children),
  };
});

// --- 네비게이션 ---
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useFocusEffect: (cb: Function) => {
    // 포커스 시 즉시 콜백 실행 (테스트에서 마운트 시 트리거)
    const { useEffect } = require('react');
    useEffect(() => {
      cb();
    }, []);
  },
}));

// --- AsyncStorage ---
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

// --- AuthStore ---
jest.mock('@store/auth-store', () => ({
  __esModule: true,
  useAuthStore: jest.fn(() => ({ entitlement: 'trial' })),
}));

// --- tracks-api ---
const mockGetMyTracks = jest.fn();
const mockGetNewlyCompletedTrack = jest.fn();
jest.mock('@services/tracks-api', () => ({
  getMyTracks: (...args: any[]) => mockGetMyTracks(...args),
  getNewlyCompletedTrack: (...args: any[]) => mockGetNewlyCompletedTrack(...args),
}));

// --- store/player-store ---
jest.mock('@store/player-store', () => ({
  __esModule: true,
  usePlayerStore: jest.fn(() => ({ currentTrackId: null })),
}));

// --- hooks/useTrialExpiredGuard ---
jest.mock('@hooks/useTrialExpiredGuard', () => ({
  __esModule: true,
  useTrialExpiredGuard: jest.fn(),
}));

// --- 자식 컴포넌트 모킹 (홈 화면 로직만 집중 테스트) ---
jest.mock('@components/TrialBadge', () => ({ __esModule: true, default: () => null }));
jest.mock('@components/TrialExpiryBanner', () => ({ __esModule: true, default: () => null }));
jest.mock('@components/MiniPlayer', () => ({ __esModule: true, default: () => null }));
jest.mock('@components/EmptyTrackState', () => ({
  __esModule: true,
  default: () => require('react').createElement('Text', null, 'EmptyTrackState'),
}));
jest.mock('@components/CompletedTrackCard', () => ({
  __esModule: true,
  default: ({ track, onDismiss }: any) =>
    require('react').createElement(
      'TouchableOpacity',
      { onPress: onDismiss, accessibilityLabel: 'completed-card-dismiss' },
      require('react').createElement('Text', null, `CompletedTrackCard:${track.id}`),
    ),
}));

import S06HomeScreen from '@screens/S06HomeScreen';

// jest.requireMock — hoisting 우회 (factory 내 jest.fn 인스턴스 참조)
const mockAsyncStorage = jest.requireMock('@react-native-async-storage/async-storage').default as {
  getItem: jest.Mock;
  setItem: jest.Mock;
};

const flushPromises = async () => {
  // microtask 기반 — setTimeout(macrotask) 사용 시 act 블록 완료 전 렌더러 unmount 문제 회피
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

// toJSON 트리에서 accessibilityLabel이 일치하는 노드를 재귀 탐색
// tree.root는 async act 완료 후 unmounted 상태가 될 수 있으므로 toJSON 대안 사용
function findByLabel(node: any, label: string): any {
  if (!node) return undefined;
  // 최상단이 배열인 경우 (toJSON 반환값)
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByLabel(child, label);
      if (found) return found;
    }
    return undefined;
  }
  if (node.props && node.props.accessibilityLabel === label) return node;
  if (node.children) {
    const children = Array.isArray(node.children) ? node.children : [node.children];
    for (const child of children) {
      const found = findByLabel(child, label);
      if (found) return found;
    }
  }
  return undefined;
}

const makeTrack = (overrides: Record<string, any> = {}) => ({
  id: 'track-1',
  song_key: 'brahms',
  status: 'completed',
  s3_key: null,
  completed_at: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('S06HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMyTracks.mockResolvedValue([]);
    mockGetNewlyCompletedTrack.mockResolvedValue(null);
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    cleanup();
    await Promise.resolve();
    await Promise.resolve();
  });

  // --- useFocusEffect: 포커스 시 API 호출 ---

  it('화면 포커스 시 getMyTracks를 호출한다', async () => {
    await act(async () => {
      create(<S06HomeScreen />);
      await flushPromises();
    });
    expect(mockGetMyTracks).toHaveBeenCalledTimes(1);
  });

  // --- status 필터링 ---

  it('status=completed 트랙만 목록에 포함한다', async () => {
    const tracks = [
      makeTrack({ id: 't1', status: 'completed' }),
      makeTrack({ id: 't2', status: 'pending' }),
      makeTrack({ id: 't3', status: 'processing' }),
      makeTrack({ id: 't4', status: 'failed' }),
      makeTrack({ id: 't5', status: 'completed' }),
    ];
    mockGetMyTracks.mockResolvedValue(tracks);

    let tree: any;
    await act(async () => {
      tree = create(<S06HomeScreen />);
      await flushPromises();
    });
    // FlatList data prop에 completed 트랙만 포함되어야 함
    const flatList = tree.root.findByType('View'); // 최상단 View 내부 확인
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('t1');
    expect(json).toContain('t5');
    expect(json).not.toContain('t2');
    expect(json).not.toContain('t3');
    expect(json).not.toContain('t4');
  });

  // --- AsyncStorage: lastChecked 없을 때 ---

  it('AsyncStorage에 lastChecked 값이 없으면 getNewlyCompletedTrack을 호출하지 않는다', async () => {
    mockAsyncStorage.getItem.mockResolvedValue(null);

    await act(async () => {
      create(<S06HomeScreen />);
      await flushPromises();
    });
    expect(mockGetNewlyCompletedTrack).not.toHaveBeenCalled();
  });

  // --- AsyncStorage: lastChecked 있을 때 ---

  it('AsyncStorage에 lastChecked 값이 있으면 getNewlyCompletedTrack을 호출한다', async () => {
    const lastChecked = '2024-01-01T00:00:00.000Z';
    mockAsyncStorage.getItem.mockResolvedValue(lastChecked);
    mockGetNewlyCompletedTrack.mockResolvedValue(null);

    await act(async () => {
      create(<S06HomeScreen />);
      await flushPromises();
    });
    expect(mockGetNewlyCompletedTrack).toHaveBeenCalledWith(lastChecked);
  });

  // --- 생성 완료 카드 ---

  it('getNewlyCompletedTrack이 트랙을 반환하면 CompletedTrackCard를 표시한다', async () => {
    const newTrack = makeTrack({ id: 'new-track' });
    mockAsyncStorage.getItem.mockResolvedValue('2024-01-01T00:00:00.000Z');
    mockGetNewlyCompletedTrack.mockResolvedValue(newTrack);

    let tree: any;
    await act(async () => {
      tree = create(<S06HomeScreen />);
      await flushPromises();
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('CompletedTrackCard:new-track');
  });

  it('getNewlyCompletedTrack이 null을 반환하면 CompletedTrackCard를 표시하지 않는다', async () => {
    mockAsyncStorage.getItem.mockResolvedValue('2024-01-01T00:00:00.000Z');
    mockGetNewlyCompletedTrack.mockResolvedValue(null);

    let tree: any;
    await act(async () => {
      tree = create(<S06HomeScreen />);
      await flushPromises();
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).not.toContain('CompletedTrackCard');
  });

  // --- 에러 처리 ---

  it('getMyTracks API 에러 시 throw하지 않고 빈 목록을 유지한다', async () => {
    mockGetMyTracks.mockRejectedValue(new Error('Network error'));

    await expect(
      act(async () => {
        create(<S06HomeScreen />);
        await flushPromises();
      }),
    ).resolves.not.toThrow();
  });

  // --- AsyncStorage.setItem 현재 시각 기록 ---

  it('loadTracks 완료 후 AsyncStorage에 현재 시각을 기록한다', async () => {
    await act(async () => {
      create(<S06HomeScreen />);
      await flushPromises();
    });
    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
      'home_last_checked_at',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/), // ISO 8601 형식
    );
  });

  // --- 빈 상태 ---

  it('트랙이 없을 때 EmptyTrackState를 표시한다', async () => {
    mockGetMyTracks.mockResolvedValue([]);

    let tree: any;
    await act(async () => {
      tree = create(<S06HomeScreen />);
      await flushPromises();
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('EmptyTrackState');
  });

  // --- CTA 네비게이션 ---

  it('"새 자장가 만들기" CTA 탭 시 SongSelect 화면으로 이동한다', async () => {
    let tree: any;
    await act(async () => {
      tree = create(<S06HomeScreen />);
      await flushPromises();
    });
    // act 밖에서 toJSON — status=completed 테스트와 동일 패턴
    const json = tree.toJSON();
    const ctaBtn = findByLabel(json, '새 자장가 만들기');
    expect(ctaBtn).toBeDefined();
    ctaBtn.props.onPress();
    expect(mockNavigate).toHaveBeenCalledWith('SongSelect');
  });

  // --- 트랙 아이템 VoiceOver ---

  it('트랙 아이템 accessibilityLabel이 "[곡명] 재생" 형식이다', async () => {
    const tracks = [makeTrack({ id: 't1', song_key: 'brahms', status: 'completed' })];
    mockGetMyTracks.mockResolvedValue(tracks);

    let tree: any;
    await act(async () => {
      tree = create(<S06HomeScreen />);
      await flushPromises();
    });
    // act 밖에서 toJSON — status=completed 테스트와 동일 패턴
    const json = tree.toJSON();
    const trackBtn = findByLabel(json, '브람스 자장가 재생');
    expect(trackBtn).toBeDefined();
  });

  // --- 트랙 아이템 탭 네비게이션 ---

  it('트랙 아이템 탭 시 Play 화면으로 이동한다', async () => {
    const tracks = [makeTrack({ id: 'track-play-test', song_key: 'mozart', status: 'completed' })];
    mockGetMyTracks.mockResolvedValue(tracks);

    let tree: any;
    await act(async () => {
      tree = create(<S06HomeScreen />);
      await flushPromises();
    });
    // act 밖에서 toJSON — status=completed 테스트와 동일 패턴
    const json = tree.toJSON();
    const trackBtn = findByLabel(json, '모차르트 자장가 재생');
    expect(trackBtn).toBeDefined();
    trackBtn.props.onPress();
    expect(mockNavigate).toHaveBeenCalledWith('Play', { trackId: 'track-play-test' });
  });
});
