/**
 * S11PreviewScreen.test.tsx
 * REQ-002, REQ-003, REQ-004, REQ-005 (task 10 수용 기준) 검증
 *
 * 테스트 대상: apps/mobile/src/screens/S11PreviewScreen.tsx
 * 테스트 파일: apps/mobile/src/__tests__/screens/S11PreviewScreen.test.tsx
 *
 * 검증 범위:
 *   REQ-002 — generationsApi 호출 site 0 (서버 API mock 호출 횟수로 검증)
 *   REQ-003 — recordingsApi.initUpload / uploadToS3 호출 site 0 (교체 후)
 *   REQ-004 — handleUseRecording 흐름: counter guard → startJob → LocalGenerating 이동
 *             startJob 실패 시 phase='error'
 *   REQ-005 — count >= 3 시 UpgradeSheet 이동 + startJob 호출 0
 *
 * NOTE: LocalDspService 는 class 인스턴스 주입 방식이 아니라 module-level import 예상.
 * 이 테스트는 task 10 구현 전 RED 상태 (S11PreviewScreen 이 아직 LocalDspService 를 import 안 함).
 */

// ── hoisted mock 변수 (jest.mock factory 참조용 — mock 접두사 필수) ───────────────
const mockLocalCounterRepoPeek = jest.fn();
const mockLocalDspServiceStartJob = jest.fn();
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

jest.mock('../../audio/local-dsp/LocalDspService', () => ({
  LocalDspService: jest.fn().mockImplementation(() => ({
    startJob: mockLocalDspServiceStartJob,
    pollStatus: jest.fn().mockReturnValue(null),
    cancel: jest.fn(),
  })),
}));

// recordingsApi mock — 교체 후 호출 0 확인용
const mockInitUpload = jest.fn();
const mockUploadToS3 = jest.fn();
jest.mock('@services/api/recordings', () => ({
  recordingsApi: {
    initUpload: mockInitUpload,
    uploadToS3: mockUploadToS3,
    completeUpload: jest.fn(),
    validateSample: jest.fn(),
  },
}));

// generationsApi mock — 호출 0 확인용
const mockGenerationsApiCall = jest.fn();
jest.mock('@services/api/generations', () => ({
  generationsApi: {
    createSession: mockGenerationsApiCall,
    getSession: mockGenerationsApiCall,
  },
}));

jest.mock('@store/recordingSlice', () => ({
  __esModule: true,
  useRecordingStore: jest.fn(),
}));

jest.mock('@store/authSlice', () => ({
  __esModule: true,
  useAuthStore: jest.fn(() => ({ entitlement: 'free' })),
}));

jest.mock('@store/generationSlice', () => ({
  useGenerationStore: {
    getState: jest.fn(() => ({
      setSessionId: jest.fn(),
      setPollState: jest.fn(),
    })),
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  documentDirectory: 'file:///documents/',
}));

jest.mock('@utils/audio-quality', () => ({
  validateFromMetadata: jest.fn(() => ({ passed: true })),
  QUALITY_FAIL_MESSAGES: {},
}));

jest.mock('@components/WaveformVisualizer', () => ({
  WaveformVisualizer: () => null,
}));

jest.mock('@hooks/useTheme', () => ({
  useTheme: jest.fn(() => ({
    colors: {
      bgPrimary: '#000', textPrimary: '#fff', textSecondary: '#aaa',
      accentPrimary: '#6cf', accentSecondary: '#9cf', surface: '#111',
      surfaceHigh: '#222', destructiveBg: '#300', errorText: '#f66',
      successMuted: '#6a6', textOnAccent: '#000',
    },
  })),
}));

// ── 실제 import ─────────────────────────────────────────────────────────────
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { useRecordingStore } from '@store/recordingSlice';

// S11PreviewScreen: task 10 구현 후 LocalDspService 를 import 할 파일
// 현재 상태에서 import 하면 기존 서버 path 코드만 있어 테스트 RED
import S11PreviewScreen from '@screens/S11PreviewScreen';

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

function setupRecordingStore(overrides: Record<string, unknown> = {}) {
  jest.mocked(useRecordingStore).mockReturnValue({
    localAudioUri: 'file:///recordings/test.wav',
    selectedSongKey: 'brahms',
    recordingLevels: [0.5, 0.6, 0.7],
    recordingMode: null,
    uploadedSampleId: null,
    qualityValidationPassed: null,
    setUploadedSampleId: jest.fn(),
    setQualityValidationPassed: jest.fn(),
    resetRecordingFlow: jest.fn(),
    setLocalAudioUri: jest.fn(),
    setRecordingMode: jest.fn(),
    setRecordingLevels: jest.fn(),
    ...overrides,
  } as never);
}

function makeNavigation() {
  return {
    navigate: mockNavigate,
    replace: jest.fn(),
    goBack: jest.fn(),
    setOptions: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── REQ-005: count >= 3 → UpgradeSheet, startJob 호출 0 ──────────────────────

describe('REQ-005 — S11PreviewScreen: 카운터 소진 시 UpgradeSheet 이동', () => {
  it('LocalCounterRepo.peek() 가 count=3 반환 시 UpgradeSheet(generation_exhausted) 로 이동한다', async () => {
    setupRecordingStore();
    mockLocalCounterRepoPeek.mockResolvedValue({ count: 3, limit: 3 });

    const navigation = makeNavigation();
    render(<S11PreviewScreen navigation={navigation as never} route={{ params: { recordingUri: 'file:///recordings/test.wav', songKey: 'brahms' } } as never} />);

    const cta = screen.getByLabelText('이 목소리로 만들기');
    await act(async () => {
      fireEvent.press(cta);
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('UpgradeSheet', { variant: 'generation_exhausted' });
    });
  });

  it('count >= 3 시 LocalDspService.startJob 을 호출하지 않는다', async () => {
    setupRecordingStore();
    mockLocalCounterRepoPeek.mockResolvedValue({ count: 3, limit: 3 });

    const navigation = makeNavigation();
    render(<S11PreviewScreen navigation={navigation as never} route={{ params: { recordingUri: 'file:///recordings/test.wav', songKey: 'brahms' } } as never} />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('이 목소리로 만들기'));
    });

    await waitFor(() => {
      expect(mockLocalDspServiceStartJob).not.toHaveBeenCalled();
    });
  });
});

// ── REQ-004: count < 3 → startJob → LocalGenerating 이동 ────────────────────

describe('REQ-004 — S11PreviewScreen: 정상 흐름 (count < 3)', () => {
  it('LocalCounterRepo.peek() 가 count=0 반환 시 LocalDspService.startJob 을 호출한다', async () => {
    setupRecordingStore();
    mockLocalCounterRepoPeek.mockResolvedValue({ count: 0, limit: 3 });
    mockLocalDspServiceStartJob.mockResolvedValue('job-abc-123');

    const navigation = makeNavigation();
    render(<S11PreviewScreen navigation={navigation as never} route={{ params: { recordingUri: 'file:///recordings/test.wav', songKey: 'brahms' } } as never} />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('이 목소리로 만들기'));
    });

    await waitFor(() => {
      expect(mockLocalDspServiceStartJob).toHaveBeenCalledTimes(1);
    });
  });

  it('startJob 에 inputUri, songKey, outputUri 를 전달한다', async () => {
    setupRecordingStore({
      localAudioUri: 'file:///recordings/voice.wav',
      selectedSongKey: 'brahms',
    });
    mockLocalCounterRepoPeek.mockResolvedValue({ count: 1, limit: 3 });
    mockLocalDspServiceStartJob.mockResolvedValue('job-xyz-789');

    const navigation = makeNavigation();
    render(<S11PreviewScreen navigation={navigation as never} route={{ params: { recordingUri: 'file:///recordings/voice.wav', songKey: 'brahms' } } as never} />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('이 목소리로 만들기'));
    });

    await waitFor(() => {
      const callArgs = mockLocalDspServiceStartJob.mock.calls[0]?.[0];
      expect(callArgs).toMatchObject({
        inputUri: 'file:///recordings/voice.wav',
        songKey: 'brahms',
      });
      // outputUri 는 caller 책임 — 정의된 형태로 전달되는지 확인
      expect(typeof callArgs.outputUri).toBe('string');
      expect(callArgs.outputUri).toMatch(/^file:\/\//);
    });
  });

  it('startJob 성공 시 navigation.navigate("LocalGenerating", { jobId }) 를 호출한다', async () => {
    setupRecordingStore();
    mockLocalCounterRepoPeek.mockResolvedValue({ count: 0, limit: 3 });
    mockLocalDspServiceStartJob.mockResolvedValue('job-test-456');

    const navigation = makeNavigation();
    render(<S11PreviewScreen navigation={navigation as never} route={{ params: { recordingUri: 'file:///recordings/test.wav', songKey: 'brahms' } } as never} />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('이 목소리로 만들기'));
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('LocalGenerating', { jobId: 'job-test-456' });
    });
  });
});

// ── REQ-004: startJob 실패 → phase='error', navigation 호출 0 ────────────────

describe('REQ-004 — S11PreviewScreen: startJob 실패 시 에러 처리', () => {
  it('startJob throw 시 에러 UI 가 렌더링된다 (phase=error 진입)', async () => {
    setupRecordingStore();
    mockLocalCounterRepoPeek.mockResolvedValue({ count: 0, limit: 3 });
    mockLocalDspServiceStartJob.mockRejectedValue(new Error('DSP 처리 오류'));

    const navigation = makeNavigation();
    render(<S11PreviewScreen navigation={navigation as never} route={{ params: { recordingUri: 'file:///recordings/test.wav', songKey: 'brahms' } } as never} />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('이 목소리로 만들기'));
    });

    await waitFor(() => {
      // phase='error' 시 에러 메시지 배너가 표시되어야 함
      expect(screen.queryByText(/생성에 실패했어요/)).not.toBeNull();
    });
  });

  it('startJob throw 시 LocalGenerating 으로 navigate 하지 않는다', async () => {
    setupRecordingStore();
    mockLocalCounterRepoPeek.mockResolvedValue({ count: 0, limit: 3 });
    mockLocalDspServiceStartJob.mockRejectedValue(new Error('DSP 처리 오류'));

    const navigation = makeNavigation();
    render(<S11PreviewScreen navigation={navigation as never} route={{ params: { recordingUri: 'file:///recordings/test.wav', songKey: 'brahms' } } as never} />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('이 목소리로 만들기'));
    });

    await waitFor(() => {
      expect(mockNavigate).not.toHaveBeenCalledWith('LocalGenerating', expect.anything());
    });
  });
});

// ── REQ-002 / REQ-003: 서버 API 호출 0 ─────────────────────────────────────

describe('REQ-002/REQ-003 — S11PreviewScreen: 서버 API 호출 0', () => {
  it('handleUseRecording 실행 후 recordingsApi.initUpload 를 호출하지 않는다', async () => {
    setupRecordingStore();
    mockLocalCounterRepoPeek.mockResolvedValue({ count: 0, limit: 3 });
    mockLocalDspServiceStartJob.mockResolvedValue('job-id-001');

    const navigation = makeNavigation();
    render(<S11PreviewScreen navigation={navigation as never} route={{ params: { recordingUri: 'file:///recordings/test.wav', songKey: 'brahms' } } as never} />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('이 목소리로 만들기'));
    });

    await waitFor(() => {
      expect(mockInitUpload).not.toHaveBeenCalled();
    });
  });

  it('handleUseRecording 실행 후 recordingsApi.uploadToS3 를 호출하지 않는다', async () => {
    setupRecordingStore();
    mockLocalCounterRepoPeek.mockResolvedValue({ count: 0, limit: 3 });
    mockLocalDspServiceStartJob.mockResolvedValue('job-id-002');

    const navigation = makeNavigation();
    render(<S11PreviewScreen navigation={navigation as never} route={{ params: { recordingUri: 'file:///recordings/test.wav', songKey: 'brahms' } } as never} />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('이 목소리로 만들기'));
    });

    await waitFor(() => {
      expect(mockUploadToS3).not.toHaveBeenCalled();
    });
  });
});
