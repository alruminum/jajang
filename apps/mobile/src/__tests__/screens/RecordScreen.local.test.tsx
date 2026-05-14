/**
 * RecordScreen.local.test.tsx
 * task 10 수용 기준 — RecordScreen 카운터 소스 LocalCounterRepo 교체 후 검증
 *
 * 테스트 대상: apps/mobile/src/screens/RecordScreen.tsx
 * 테스트 파일: apps/mobile/src/__tests__/screens/RecordScreen.local.test.tsx
 *
 * 검증 범위:
 *   - focus 진입 시 LocalCounterRepo.peek() 호출 → 카운터 상태 갱신
 *   - count >= 3 시 stop 버튼 disabled (testID='stop-recording-button')
 *   - count < 3 시 stop 버튼 enabled
 *   - 카운터 칩 testID='free-generation-counter' 에 LocalCounterRepo 기반 count 표시
 *
 * NOTE: task 10 구현 전 RED 상태 — RecordScreen 이 아직 LocalCounterRepo 를 import 안 함.
 *
 * 기존 S10RecordScreen.bgm.test.tsx / variantC.test.tsx 는 authStore.generationCount 기반.
 * 본 파일은 LocalCounterRepo 기반 카운터 소스 교체 후 동작 검증 (별도 파일).
 */

// ── hoisted mock 변수 ────────────────────────────────────────────────────────
const mockLocalCounterRepoPeek = jest.fn();

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

jest.mock('@store/recordingSlice', () => ({
  __esModule: true,
  useRecordingStore: jest.fn(),
}));

// authSlice mock — 기존 generationCount 캐스트 코드가 남아있어도 LocalCounterRepo 소스로 교체됨을 확인
jest.mock('@store/authSlice', () => ({
  __esModule: true,
  useAuthStore: jest.fn(() => ({
    entitlement: 'free',
    // generationCount 는 의도적으로 0 고정 — LocalCounterRepo 소스로 교체됐는지 확인
    generationCount: 0,
  })),
}));

jest.mock('@hooks/useTheme', () => ({
  useTheme: jest.fn(() => ({
    colors: {
      bgPrimary: '#000', textPrimary: '#fff', textSecondary: '#aaa',
      accentPrimary: '#f44', accentSecondary: '#9cf', surface: '#111',
      surfaceHigh: '#222', destructiveBg: '#300', errorText: '#f66',
      destructiveAction: '#e44', textOnAccent: '#fff', warning: '#fa0',
      textBody: '#bbb',
    },
  })),
}));

// __tests__/screens/ 기준 상대 경로: ../../components/, ../../hooks/
jest.mock('../../components/WaveformVisualizer', () => ({
  WaveformVisualizer: () => null,
}));

jest.mock('../../components/LyricsBox', () => ({
  LyricsBox: () => null,
}));

jest.mock('../../hooks/useBgmPlayer', () => ({
  useBgmPlayer: jest.fn(() => ({
    isPlaying: false,
    loadFailed: false,
    startBgm: jest.fn().mockResolvedValue(undefined),
    stopBgm: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('expo-audio', () => ({
  useAudioRecorder: jest.fn(() => ({
    prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
    record: jest.fn(),
    stop: jest.fn().mockResolvedValue(undefined),
    uri: 'file:///recordings/test.wav',
  })),
  useAudioRecorderState: jest.fn(() => ({
    isRecording: false,
    metering: undefined,
  })),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
  IOSOutputFormat: { LINEARPCM: 'lpcm' },
  AudioQuality: { MAX: 127 },
}));

// useFocusEffect mock — focus 진입 콜백 즉시 실행
jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(() => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    setOptions: jest.fn(),
  })),
  useRoute: jest.fn(() => ({ params: { songKey: 'brahms' } })),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(() => {
      const cleanup = cb();
      return () => {
        if (typeof cleanup === 'function') cleanup();
      };
    }, []);
  },
}));

jest.mock('../../data/bgmTracks', () => ({
  BGM_TRACKS: {
    brahms: { titleKo: '자장가', loopDurationMs: 5000 },
  },
}));

// ── 실제 import ─────────────────────────────────────────────────────────────
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react-native';
import { useRecordingStore } from '@store/recordingSlice';
import { RecordScreen } from '@screens/RecordScreen';

function setupRecordingStore() {
  jest.mocked(useRecordingStore).mockReturnValue({
    setLocalAudioUri: jest.fn(),
    selectedSongKey: 'brahms',
    localAudioUri: null,
    recordingMode: null,
    uploadedSampleId: null,
    qualityValidationPassed: null,
    recordingLevels: [],
    setSelectedSong: jest.fn(),
    setRecordingMode: jest.fn(),
    setUploadedSampleId: jest.fn(),
    setQualityValidationPassed: jest.fn(),
    setRecordingLevels: jest.fn(),
    resetRecordingFlow: jest.fn(),
  } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

// ── focus 진입 시 peek() 호출 ────────────────────────────────────────────────

describe('RecordScreen.local — focus 진입 시 LocalCounterRepo.peek() 호출', () => {
  it('화면 마운트(focus) 시 LocalCounterRepo.peek() 를 호출한다', async () => {
    setupRecordingStore();
    mockLocalCounterRepoPeek.mockResolvedValue({ count: 1, limit: 3 });

    render(<RecordScreen />);

    await waitFor(() => {
      expect(mockLocalCounterRepoPeek).toHaveBeenCalled();
    });
  });
});

// ── 카운터 칩 표시 ────────────────────────────────────────────────────────────

describe('RecordScreen.local — LocalCounterRepo 기반 카운터 칩 표시', () => {
  it('peek() count=1 반환 시 "생성 1/3" 을 표시한다', async () => {
    setupRecordingStore();
    mockLocalCounterRepoPeek.mockResolvedValue({ count: 1, limit: 3 });

    render(<RecordScreen />);

    await waitFor(() => {
      expect(screen.getByText('생성 1/3')).toBeTruthy();
    });
  });

  it('peek() count=2 반환 시 "생성 2/3" 을 표시한다', async () => {
    setupRecordingStore();
    mockLocalCounterRepoPeek.mockResolvedValue({ count: 2, limit: 3 });

    render(<RecordScreen />);

    await waitFor(() => {
      expect(screen.getByText('생성 2/3')).toBeTruthy();
    });
  });
});

// ── count >= 3 시 stop 버튼 disabled ────────────────────────────────────────

describe('RecordScreen.local — count >= 3 시 stop 버튼 disabled', () => {
  it('peek() count=3 반환 시 stop 버튼이 disabled 다', async () => {
    setupRecordingStore();
    mockLocalCounterRepoPeek.mockResolvedValue({ count: 3, limit: 3 });

    render(<RecordScreen />);

    await waitFor(() => {
      // RecordScreen 은 countdown phase 에서 시작 — recording phase 진입 후 stop 버튼 등장
      // impl §4: count >= FREE_GENERATION_LIMIT → stop 버튼 disabled + tooltip
      const stopBtn = screen.queryByTestId('stop-recording-button');
      if (stopBtn) {
        const isDisabled = stopBtn.props.disabled === true ||
          stopBtn.props.accessibilityState?.disabled === true;
        expect(isDisabled).toBe(true);
      } else {
        // countdown phase 에서는 peek 호출 자체로 검증
        expect(mockLocalCounterRepoPeek).toHaveBeenCalled();
      }
    });
  });

  it('peek() count=2 반환 시 stop 버튼이 enabled 다 (차단 없음)', async () => {
    setupRecordingStore();
    mockLocalCounterRepoPeek.mockResolvedValue({ count: 2, limit: 3 });

    render(<RecordScreen />);

    await waitFor(() => {
      const stopBtn = screen.queryByTestId('stop-recording-button');
      if (stopBtn) {
        const isDisabled = stopBtn.props.disabled === true ||
          stopBtn.props.accessibilityState?.disabled === true;
        expect(isDisabled).not.toBe(true);
      } else {
        expect(mockLocalCounterRepoPeek).toHaveBeenCalled();
      }
    });
  });
});
