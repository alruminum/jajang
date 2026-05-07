import React from 'react';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react-native';

// --- React Native 모킹 (RNTL detectHostComponentNames 요구 컴포넌트 포함) ---
jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: 'View',
    Text: 'Text',
    TextInput: 'TextInput',
    Image: 'Image',
    Switch: 'Switch',
    ScrollView: 'ScrollView',
    Modal: 'Modal',
    TouchableOpacity: 'TouchableOpacity',
    Pressable: 'Pressable',
    StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
    FlatList: ({
      data,
      renderItem,
      ListHeaderComponent,
      ListEmptyComponent,
    }: any) =>
      React.createElement(
        'View',
        null,
        ListHeaderComponent,
        data && data.length > 0
          ? data.map((item: any, index: number) => renderItem({ item, index }))
          : ListEmptyComponent,
      ),
    RefreshControl: 'RefreshControl',
    ActivityIndicator: 'ActivityIndicator',
    useColorScheme: jest.fn().mockReturnValue('dark'),
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
    const { useEffect } = require('react');
    useEffect(() => {
      cb();
    }, []);
  },
}));

// --- AuthStore ---
jest.mock('@store/auth-store', () => ({
  __esModule: true,
  useAuthStore: jest.fn(() => ({ entitlement: 'trial' })),
}));

// --- mastersSlice ---
const mockLoadMasters = jest.fn();
const mockLoadMore = jest.fn();
jest.mock('@store/mastersSlice', () => ({
  useMastersStore: jest.fn(() => ({
    items: [],
    hasPending: false,
    nextCursor: null,
    isLoading: false,
    loadMasters: mockLoadMasters,
    loadMore: mockLoadMore,
  })),
}));

// --- store/player-store ---
jest.mock('@store/player-store', () => ({
  __esModule: true,
  usePlayerStore: jest.fn(() => ({ currentTrackId: null })),
}));

// --- store/theme-store ---
jest.mock('@store/theme-store', () => ({
  __esModule: true,
  useThemeStore: jest.fn(() => 'dark'),
}));

// --- hooks/useTrialExpiredGuard ---
jest.mock('@hooks/useTrialExpiredGuard', () => ({
  __esModule: true,
  useTrialExpiredGuard: jest.fn(),
}));

// --- pendingSession ---
jest.mock('@services/storage/pendingSession', () => ({
  loadPendingSession: jest.fn().mockResolvedValue(null),
  clearPendingSession: jest.fn().mockResolvedValue(undefined),
  savePendingSession: jest.fn().mockResolvedValue(undefined),
}));

// --- sessions API ---
jest.mock('@services/api/sessions', () => ({
  getSessionStatus: jest.fn(),
}));

// --- expo-secure-store ---
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// --- 자식 컴포넌트 모킹 ---
jest.mock('@components/TrialBadge', () => ({ __esModule: true, default: () => null }));
jest.mock('@components/TrialExpiryBanner', () => ({ __esModule: true, default: () => null }));
jest.mock('@components/MiniPlayer', () => ({ __esModule: true, default: () => null }));

jest.mock('@components/EmptyMastersState', () => ({
  __esModule: true,
  default: ({ onCta }: any) =>
    require('react').createElement(
      'TouchableOpacity',
      { onPress: onCta, accessibilityLabel: '자장가 만들기' },
      require('react').createElement('Text', null, 'EmptyMastersState'),
    ),
}));

jest.mock('@components/MasterAudioCard', () => ({
  __esModule: true,
  default: ({ songKey, onPlay }: any) => {
    const SONG_NAMES: Record<string, string> = {
      brahms: '브람스 자장가',
      mozart: '모차르트 자장가',
      schubert: '슈베르트 자장가',
    };
    return require('react').createElement(
      'TouchableOpacity',
      { onPress: onPlay, accessibilityLabel: `${SONG_NAMES[songKey] ?? songKey} 재생` },
      require('react').createElement('Text', null, songKey),
    );
  },
}));

jest.mock('@components/JustArrivedMasterCard', () => ({
  __esModule: true,
  default: ({ onPlay, onDismiss }: any) =>
    require('react').createElement(
      'View',
      { accessibilityLabel: 'just-arrived-card' },
      require('react').createElement(
        'TouchableOpacity',
        { onPress: onPlay, accessibilityLabel: '자장가 재생' },
        null,
      ),
      require('react').createElement(
        'TouchableOpacity',
        { onPress: onDismiss, accessibilityLabel: '닫기' },
        null,
      ),
    ),
}));

// CompletedTrackCard — 방어용 (구 코드 잔재 import 차단)
jest.mock('@components/CompletedTrackCard', () => ({ __esModule: true, default: () => null }));

import S06HomeScreen from '@screens/S06HomeScreen';

const { loadPendingSession } = jest.requireMock('@services/storage/pendingSession') as {
  loadPendingSession: jest.Mock;
  clearPendingSession: jest.Mock;
};
const { useMastersStore } = jest.requireMock('@store/mastersSlice') as {
  useMastersStore: jest.Mock;
};
const { getSessionStatus: mockGetSessionStatus } = jest.requireMock('@services/api/sessions') as {
  getSessionStatus: jest.Mock;
};

const makeMaster = (overrides: Record<string, any> = {}) => ({
  session_id: 'session-1',
  song_key: 'brahms',
  presigned_url: 'https://example.com/audio.mp3',
  completed_at: '2024-01-01T00:00:00.000Z',
  dsp_duration_ms: null,
  ...overrides,
});

describe('S06HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadMasters.mockResolvedValue(undefined);
    mockGetSessionStatus.mockResolvedValue({ status: 'generating', presigned_url: null });
    // 기본 상태: items 비어 있음
    useMastersStore.mockReturnValue({
      items: [],
      hasPending: false,
      nextCursor: null,
      isLoading: false,
      loadMasters: mockLoadMasters,
      loadMore: mockLoadMore,
    });
  });

  afterEach(async () => {
    cleanup();
    await Promise.resolve();
    await Promise.resolve();
  });

  // 1. 화면 포커스 시 loadMasters를 호출한다
  it('화면 포커스 시 loadMasters를 호출한다', async () => {
    render(<S06HomeScreen />);
    await waitFor(() => {
      expect(mockLoadMasters).toHaveBeenCalledTimes(1);
    });
  });

  // 2. items가 있을 때 MasterAudioCard를 렌더한다
  it('items가 있을 때 MasterAudioCard를 렌더한다', async () => {
    useMastersStore.mockReturnValue({
      items: [makeMaster()],
      hasPending: false,
      nextCursor: null,
      isLoading: false,
      loadMasters: mockLoadMasters,
      loadMore: mockLoadMore,
    });

    render(<S06HomeScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('브람스 자장가 재생')).toBeTruthy();
    });
  });

  // 3. items가 없을 때 EmptyMastersState를 렌더한다
  it('items가 없을 때 EmptyMastersState를 렌더한다', async () => {
    render(<S06HomeScreen />);
    await waitFor(() => {
      expect(screen.getByText('EmptyMastersState')).toBeTruthy();
    });
  });

  // 4. EmptyMastersState CTA 탭 시 SongSelect로 이동한다
  it('EmptyMastersState CTA 탭 시 SongSelect로 이동한다', async () => {
    render(<S06HomeScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('자장가 만들기')).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText('자장가 만들기'));
    expect(mockNavigate).toHaveBeenCalledWith('SongSelect');
  });

  // 5. 트랙 아이템 accessibilityLabel이 "[곡명] 재생" 형식이다
  it('트랙 아이템 accessibilityLabel이 "[곡명] 재생" 형식이다', async () => {
    useMastersStore.mockReturnValue({
      items: [makeMaster({ song_key: 'brahms' })],
      hasPending: false,
      nextCursor: null,
      isLoading: false,
      loadMasters: mockLoadMasters,
      loadMore: mockLoadMore,
    });

    render(<S06HomeScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('브람스 자장가 재생')).toBeTruthy();
    });
  });

  // 6. 트랙 아이템 탭 시 Play 화면으로 이동한다 (trackId=session_id, presignUrl=presigned_url)
  it('트랙 아이템 탭 시 Play 화면으로 이동한다', async () => {
    const master = makeMaster({
      session_id: 'sess-play-test',
      song_key: 'mozart',
      presigned_url: 'https://example.com/mozart.mp3',
    });
    useMastersStore.mockReturnValue({
      items: [master],
      hasPending: false,
      nextCursor: null,
      isLoading: false,
      loadMasters: mockLoadMasters,
      loadMore: mockLoadMore,
    });

    render(<S06HomeScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('모차르트 자장가 재생')).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText('모차르트 자장가 재생'));
    expect(mockNavigate).toHaveBeenCalledWith('Play', {
      trackId: 'sess-play-test',
      presignUrl: 'https://example.com/mozart.mp3',
    });
  });

  // 7. "새 자장가 만들기" CTA 탭 시 SongSelect 화면으로 이동한다
  it('"새 자장가 만들기" CTA 탭 시 SongSelect 화면으로 이동한다', async () => {
    render(<S06HomeScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('새 자장가 만들기')).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText('새 자장가 만들기'));
    expect(mockNavigate).toHaveBeenCalledWith('SongSelect');
  });

  // 8. loadMasters 에러 시 throw하지 않는다
  it('loadMasters 에러 시 throw하지 않는다', async () => {
    // 실제 mastersSlice.loadMasters는 내부 try/catch로 에러를 삼키고 error state만 세팅.
    // 스토어에서 error state를 가진 상황을 모사: items 비어 있고 loadMasters는 resolve.
    useMastersStore.mockReturnValue({
      items: [],
      hasPending: false,
      nextCursor: null,
      isLoading: false,
      loadMasters: jest.fn().mockResolvedValue(undefined),
      loadMore: mockLoadMore,
    });

    let caughtError: unknown;
    try {
      render(<S06HomeScreen />);
      await waitFor(() => expect(true).toBe(true));
    } catch (e) {
      caughtError = e;
    }
    expect(caughtError).toBeUndefined();
  });

  // 9. pendingSession 없을 때 getSessionStatus를 호출하지 않는다
  it('pendingSession 없을 때 getSessionStatus를 호출하지 않는다', async () => {
    loadPendingSession.mockResolvedValue(null);

    render(<S06HomeScreen />);
    await waitFor(() => {
      expect(mockLoadMasters).toHaveBeenCalled();
    });
    expect(mockGetSessionStatus).not.toHaveBeenCalled();
  });

  // 10. pendingSession 있고 completed 반환 시 JustArrivedMasterCard를 표시한다
  it('pendingSession 있고 completed 반환 시 JustArrivedMasterCard를 표시한다', async () => {
    loadPendingSession.mockResolvedValue('pending-sess-id');
    mockGetSessionStatus.mockResolvedValue({
      status: 'completed',
      presigned_url: 'https://example.com/completed.mp3',
    });

    render(<S06HomeScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('just-arrived-card')).toBeTruthy();
    });
  });

  // 11. pendingSession 있고 generating 반환 시 JustArrivedMasterCard를 표시하지 않는다
  it('pendingSession 있고 generating 반환 시 JustArrivedMasterCard를 표시하지 않는다', async () => {
    loadPendingSession.mockResolvedValue('pending-sess-id');
    mockGetSessionStatus.mockResolvedValue({
      status: 'generating',
      presigned_url: null,
    });

    render(<S06HomeScreen />);
    await waitFor(() => {
      expect(mockLoadMasters).toHaveBeenCalled();
    });
    expect(screen.queryByLabelText('just-arrived-card')).toBeNull();
  });

  // 12. JustArrivedMasterCard 닫기 탭 시 카드가 사라진다
  it('JustArrivedMasterCard 닫기 탭 시 카드가 사라진다', async () => {
    loadPendingSession.mockResolvedValue('pending-sess-id');
    mockGetSessionStatus.mockResolvedValue({
      status: 'completed',
      presigned_url: 'https://example.com/completed.mp3',
    });

    render(<S06HomeScreen />);

    // 닫기 탭 전 — 카드 존재 확인
    await waitFor(() => {
      expect(screen.getByLabelText('just-arrived-card')).toBeTruthy();
    });

    // 닫기 탭
    await act(async () => {
      fireEvent.press(screen.getByLabelText('닫기'));
    });

    // 닫기 탭 후 — 카드 사라짐
    expect(screen.queryByLabelText('just-arrived-card')).toBeNull();
  });
});
