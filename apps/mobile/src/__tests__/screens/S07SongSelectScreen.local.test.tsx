/**
 * S07SongSelectScreen.local.test.tsx
 * REQ-005 (task 10 수용 기준) — LocalCounterRepo 연동 후 카운터 UI + 진입 차단 검증
 *
 * 테스트 대상: apps/mobile/src/screens/S07SongSelectScreen.tsx
 * 테스트 파일: apps/mobile/src/__tests__/screens/S07SongSelectScreen.local.test.tsx
 *
 * 검증 범위:
 *   REQ-005-a — count=0 (미소진) 시 CTA enabled + RecordGuide 이동
 *   REQ-005-b — count=3 (소진) 시 CTA disabled + 탭 시 UpgradeSheet 이동
 *   REQ-005-c — useFocusEffect 내 peek() 호출 확인 (focus 시 재조회)
 *   REQ-005-d — LocalCounterRepo.peek() 소스로 카운터 칩 표시
 *
 * NOTE: task 10 구현 전 RED 상태 — S07SongSelectScreen 이 LocalCounterRepo 를 아직 import 안 함.
 * 기존 S07SongSelectScreen.test.tsx 는 authStore.generationCount 기반 — 본 파일은 LocalCounterRepo 기반 검증.
 */

// ── hoisted mock 변수 ────────────────────────────────────────────────────────
const mockLocalCounterRepoPeek = jest.fn();
const mockNavigate = jest.fn();

// ── module mocks ────────────────────────────────────────────────────────────

jest.mock('../../audio/local-dsp/LocalCounterRepo', () => ({
  LocalCounterRepo: jest.fn().mockImplementation(() => ({
    peek: mockLocalCounterRepoPeek,
    increment: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn().mockResolvedValue(undefined),
  })),
  FreeLimitReachedError: class FreeLimitReachedError extends Error {
    constructor(count: number, limit: number) {
      super(`Free limit reached: count=${count}, limit=${limit}`);
      this.name = 'FreeLimitReachedError';
    }
  },
}));

jest.mock('@services/api/songs', () => ({
  songsApi: {
    listSongs: jest.fn().mockResolvedValue({ songs: [] }),
    getPreviewUrl: jest.fn(),
  },
}));

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn().mockReturnValue({
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  }),
}));

jest.mock('@store/recordingSlice', () => ({
  __esModule: true,
  useRecordingStore: jest.fn(),
}));

jest.mock('@store/authSlice', () => ({
  __esModule: true,
  useAuthStore: jest.fn(() => ({ entitlement: 'free', generationCount: 0 })),
}));

jest.mock('@hooks/useTheme', () => ({
  useTheme: jest.fn(() => ({
    colors: {
      bgPrimary: '#000', textPrimary: '#fff', textSecondary: '#aaa',
      accentPrimary: '#6cf', accentSecondary: '#9cf', surface: '#111',
      surfaceHigh: '#222',
    },
  })),
}));

// useFocusEffect mock — focus 콜백 즉시 실행 + cleanup 노출
const mockUseFocusEffect = { cleanup: null as (() => void) | null };
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(() => {
      const cleanup = cb();
      if (typeof cleanup === 'function') {
        mockUseFocusEffect.cleanup = cleanup;
      }
      return () => {
        if (typeof cleanup === 'function') cleanup();
      };
    }, []);
  },
}));

// ── 실제 import ─────────────────────────────────────────────────────────────
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { useRecordingStore } from '@store/recordingSlice';
import { SongSelectScreen } from '@screens/S07SongSelectScreen';

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

function setupRecordingStore(songKey: string | null = 'brahms') {
  jest.mocked(useRecordingStore).mockReturnValue({
    selectedSongKey: songKey,
    setSelectedSong: jest.fn(),
    resetRecordingFlow: jest.fn(),
    recordingMode: null,
    localAudioUri: null,
    uploadedSampleId: null,
    qualityValidationPassed: null,
    recordingLevels: [],
    setRecordingMode: jest.fn(),
    setLocalAudioUri: jest.fn(),
    setUploadedSampleId: jest.fn(),
    setQualityValidationPassed: jest.fn(),
    setRecordingLevels: jest.fn(),
  } as never);
}

function makeNavigation() {
  return { navigate: mockNavigate, goBack: jest.fn() };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseFocusEffect.cleanup = null;
});

// ── REQ-005-a: count=0 → CTA enabled ────────────────────────────────────────

describe('REQ-005 — S07SongSelectScreen: LocalCounterRepo count=0 (미소진)', () => {
  it('peek() count=0 반환 시 CTA 탭 → RecordGuide 이동한다', async () => {
    setupRecordingStore('brahms');
    mockLocalCounterRepoPeek.mockResolvedValue({ count: 0, limit: 3 });

    const navigation = makeNavigation();
    render(<SongSelectScreen navigation={navigation as never} route={{} as never} />);

    await waitFor(() => screen.getByText('이 곡으로 시작'));
    await act(async () => {
      fireEvent.press(screen.getByLabelText('이 곡으로 시작'));
    });

    expect(mockNavigate).toHaveBeenCalledWith('RecordGuide', { songKey: 'brahms' });
  });

  it('peek() count=0 반환 시 CTA 탭 후 UpgradeSheet 이동하지 않는다', async () => {
    setupRecordingStore('brahms');
    mockLocalCounterRepoPeek.mockResolvedValue({ count: 0, limit: 3 });

    const navigation = makeNavigation();
    render(<SongSelectScreen navigation={navigation as never} route={{} as never} />);

    await waitFor(() => screen.getByText('이 곡으로 시작'));
    await act(async () => {
      fireEvent.press(screen.getByLabelText('이 곡으로 시작'));
    });

    expect(mockNavigate).not.toHaveBeenCalledWith('UpgradeSheet', expect.anything());
  });
});

// ── REQ-005-b: count=3 → CTA disabled + UpgradeSheet 이동 ───────────────────

describe('REQ-005 — S07SongSelectScreen: LocalCounterRepo count=3 (소진)', () => {
  it('peek() count=3 반환 시 CTA 탭 → UpgradeSheet(generation_exhausted) 이동한다', async () => {
    setupRecordingStore('brahms');
    mockLocalCounterRepoPeek.mockResolvedValue({ count: 3, limit: 3 });

    const navigation = makeNavigation();
    render(<SongSelectScreen navigation={navigation as never} route={{} as never} />);

    await waitFor(() => screen.getByText('이 곡으로 시작'));
    await act(async () => {
      fireEvent.press(screen.getByLabelText('이 곡으로 시작'));
    });

    expect(mockNavigate).toHaveBeenCalledWith('UpgradeSheet', { variant: 'generation_exhausted' });
  });

  it('peek() count=3 반환 시 RecordGuide 로 이동하지 않는다', async () => {
    setupRecordingStore('brahms');
    mockLocalCounterRepoPeek.mockResolvedValue({ count: 3, limit: 3 });

    const navigation = makeNavigation();
    render(<SongSelectScreen navigation={navigation as never} route={{} as never} />);

    await waitFor(() => screen.getByText('이 곡으로 시작'));
    await act(async () => {
      fireEvent.press(screen.getByLabelText('이 곡으로 시작'));
    });

    expect(mockNavigate).not.toHaveBeenCalledWith('RecordGuide', expect.anything());
  });

  it('peek() count=3 반환 시 CTA 가 disabled 상태 (accessibilityState.disabled=true 또는 opacity 0.4)', async () => {
    setupRecordingStore('brahms');
    mockLocalCounterRepoPeek.mockResolvedValue({ count: 3, limit: 3 });

    const navigation = makeNavigation();
    render(<SongSelectScreen navigation={navigation as never} route={{} as never} />);

    await waitFor(() => screen.getByText('이 곡으로 시작'));

    // CTA 가 disabled 또는 opacity 0.4 style 적용됨을 확인
    // impl §5: count >= 3 → CTA opacity 0.4 + disabled
    const cta = screen.getByLabelText('이 곡으로 시작');
    const isDisabled = cta.props.accessibilityState?.disabled === true;
    const hasDisabledStyle = JSON.stringify(cta.props.style).includes('0.4');
    expect(isDisabled || hasDisabledStyle).toBe(true);
  });
});

// ── REQ-005-c: useFocusEffect 내 peek() 호출 ────────────────────────────────

describe('REQ-005 — S07SongSelectScreen: useFocusEffect 내 LocalCounterRepo.peek() 재조회', () => {
  it('화면 마운트(focus 진입) 시 LocalCounterRepo.peek() 를 호출한다', async () => {
    setupRecordingStore('brahms');
    mockLocalCounterRepoPeek.mockResolvedValue({ count: 1, limit: 3 });

    const navigation = makeNavigation();
    render(<SongSelectScreen navigation={navigation as never} route={{} as never} />);

    await waitFor(() => {
      expect(mockLocalCounterRepoPeek).toHaveBeenCalled();
    });
  });
});

// ── REQ-005-d: LocalCounterRepo 소스 카운터 칩 표시 ─────────────────────────

describe('REQ-005 — S07SongSelectScreen: LocalCounterRepo 기반 카운터 칩 표시', () => {
  it('peek() count=1 반환 시 "생성 1/3" 칩을 표시한다', async () => {
    setupRecordingStore('brahms');
    mockLocalCounterRepoPeek.mockResolvedValue({ count: 1, limit: 3 });

    const navigation = makeNavigation();
    render(<SongSelectScreen navigation={navigation as never} route={{} as never} />);

    await waitFor(() => {
      expect(screen.getByText('생성 1/3')).toBeTruthy();
    });
  });

  it('peek() count=0 반환 시 "생성 0/3" 칩을 표시한다', async () => {
    setupRecordingStore('brahms');
    mockLocalCounterRepoPeek.mockResolvedValue({ count: 0, limit: 3 });

    const navigation = makeNavigation();
    render(<SongSelectScreen navigation={navigation as never} route={{} as never} />);

    await waitFor(() => {
      expect(screen.getByText('생성 0/3')).toBeTruthy();
    });
  });
});
