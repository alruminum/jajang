import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create, act } from 'react-test-renderer';

// --- React Native 모킹 ---
vi.mock('react-native', () => {
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

vi.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaView: ({ children }: any) =>
      React.createElement('View', null, children),
  };
});

// --- 네비게이션 ---
const mockNavigate = vi.fn();
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useFocusEffect: (cb: Function) => {
    // 포커스 시 즉시 콜백 실행 (테스트에서 마운트 시 트리거)
    React.useEffect(() => {
      cb();
    }, []);
  },
}));

// --- AsyncStorage ---
const mockAsyncStorage = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: mockAsyncStorage,
}));

// --- AuthStore ---
vi.mock('@store/auth-store', () => ({
  useAuthStore: vi.fn(() => ({ entitlement: 'trial' })),
}));

// --- tracks-api ---
const mockGetMyTracks = vi.fn();
const mockGetNewlyCompletedTrack = vi.fn();
vi.mock('@services/tracks-api', () => ({
  getMyTracks: (...args: any[]) => mockGetMyTracks(...args),
  getNewlyCompletedTrack: (...args: any[]) => mockGetNewlyCompletedTrack(...args),
}));

// --- 자식 컴포넌트 모킹 (홈 화면 로직만 집중 테스트) ---
vi.mock('@components/TrialBadge', () => ({ default: () => null }));
vi.mock('@components/TrialExpiryBanner', () => ({ default: () => null }));
vi.mock('@components/EmptyTrackState', () => ({
  default: () => React.createElement('Text', null, 'EmptyTrackState'),
}));
vi.mock('@components/CompletedTrackCard', () => ({
  default: ({ track, onDismiss }: any) =>
    React.createElement(
      'TouchableOpacity',
      { onPress: onDismiss, accessibilityLabel: 'completed-card-dismiss' },
      React.createElement('Text', null, `CompletedTrackCard:${track.id}`),
    ),
}));

import S06HomeScreen from '@screens/S06HomeScreen';

const flushPromises = () => new Promise<void>(resolve => setTimeout(resolve, 0));

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
    vi.clearAllMocks();
    mockGetMyTracks.mockResolvedValue([]);
    mockGetNewlyCompletedTrack.mockResolvedValue(null);
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue(undefined);
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
    const ctaBtn = tree.root
      .findAllByType('TouchableOpacity' as any)
      .find((t: any) => t.props.accessibilityLabel === '새 자장가 만들기');
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
    const trackBtn = tree.root
      .findAllByType('TouchableOpacity' as any)
      .find((t: any) => t.props.accessibilityLabel === '브람스 자장가 재생');
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
    const trackBtn = tree.root
      .findAllByType('TouchableOpacity' as any)
      .find((t: any) => t.props.accessibilityLabel === '모차르트 자장가 재생');
    expect(trackBtn).toBeDefined();
    trackBtn.props.onPress();
    expect(mockNavigate).toHaveBeenCalledWith('Play', { trackId: 'track-play-test' });
  });
});
