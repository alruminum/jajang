/**
 * LocalGeneratingScreen.test.tsx
 * REQ-004 (task 10 수용 기준) + impl §3 인터페이스 검증
 *
 * 테스트 대상: apps/mobile/src/screens/S12LocalGeneratingScreen.tsx (신규, task 10 산출물)
 * 테스트 파일: apps/mobile/src/__tests__/screens/LocalGeneratingScreen.test.tsx
 *
 * 검증 범위:
 *   - mount 시 setInterval 등록 (LocalDspService.pollStatus 폴링)
 *   - pollStatus 결과 status='completed' → clearInterval + navigation.replace('Play', {...}) 호출
 *   - pollStatus 결과 status='failed' → 에러 UI 렌더링 + clearInterval
 *   - unmount 시 clearInterval 호출 (interval 누수 방지 — §주의사항 §8)
 *
 * NOTE: S12LocalGeneratingScreen 은 task 10 구현 산출물.
 * 현 상태에서 import 하면 모듈 미존재 에러 → RED 확인 가능.
 *
 * pollStatus 는 sync — LocalGenerationJob | null 반환 (task 09 실제 시그니처).
 * job.status 필드로 분기 처리:
 *   - status='completed' + outputUri non-null → 완료
 *   - status='failed' → 실패
 *   - status='processing' | 'pending' → 계속 폴링
 */

// ── Jest fake timers 설정 ────────────────────────────────────────────────────
// setInterval / clearInterval 을 jest 가 제어하도록 fake timers 활성화
beforeAll(() => {
  jest.useFakeTimers();
});

afterAll(() => {
  jest.useRealTimers();
});

// ── hoisted mock 변수 ────────────────────────────────────────────────────────
const mockPollStatus = jest.fn();
const mockNavigationReplace = jest.fn();

// ── module mocks ────────────────────────────────────────────────────────────

jest.mock('../../audio/local-dsp/LocalDspService', () => ({
  LocalDspService: jest.fn().mockImplementation(() => ({
    startJob: jest.fn(),
    pollStatus: mockPollStatus,
    cancel: jest.fn(),
  })),
}));

jest.mock('@store/generationSlice', () => ({
  useGenerationStore: {
    getState: jest.fn(() => ({
      setSessionId: jest.fn(),
      setPollState: jest.fn(),
    })),
  },
}));

jest.mock('@hooks/useTheme', () => ({
  useTheme: jest.fn(() => ({
    colors: {
      bgPrimary: '#000', textPrimary: '#fff', textSecondary: '#aaa',
      accentPrimary: '#6cf', accentSecondary: '#9cf',
      surface: '#111', surfaceHigh: '#222',
    },
  })),
}));

// ── 실제 import ─────────────────────────────────────────────────────────────
import React from 'react';
import { render, screen, act, cleanup } from '@testing-library/react-native';

// S12LocalGeneratingScreen: task 10 구현 후 생성될 파일
// 현재 미존재 → import error = RED 확인
import S12LocalGeneratingScreen from '@screens/S12LocalGeneratingScreen';

// ── 헬퍼: makeNavigation ─────────────────────────────────────────────────────
function makeNavigation() {
  return {
    replace: mockNavigationReplace,
    navigate: jest.fn(),
    goBack: jest.fn(),
    setOptions: jest.fn(),
  };
}

function makeRoute(jobId: string) {
  return { params: { jobId } };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
});

afterEach(() => {
  cleanup();
});

// ── mount 시 setInterval 등록 ────────────────────────────────────────────────

describe('REQ-004 — LocalGeneratingScreen: mount 시 setInterval 등록', () => {
  it('화면 mount 시 1초 간격으로 LocalDspService.pollStatus 를 폴링 시작한다', () => {
    mockPollStatus.mockReturnValue({ jobId: 'job-001', status: 'processing', inputUri: '', outputUri: null, songKey: 'brahms', createdAt: Date.now() });

    const navigation = makeNavigation();
    render(<S12LocalGeneratingScreen navigation={navigation as never} route={makeRoute('job-001') as never} />);

    // 1초 경과 — pollStatus 호출 확인
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(mockPollStatus).toHaveBeenCalledWith('job-001');
  });
});

// ── status='completed' → clearInterval + navigation.replace ─────────────────

describe('REQ-004 — LocalGeneratingScreen: completed 감지 시 navigation.replace 호출', () => {
  it('pollStatus 가 status=completed 반환 시 navigation.replace("Play", {...}) 를 호출한다', () => {
    // 첫 번째 틱: processing → 두 번째 틱: completed
    mockPollStatus
      .mockReturnValueOnce({ jobId: 'job-002', status: 'processing', inputUri: '', outputUri: null, songKey: 'brahms', createdAt: Date.now() })
      .mockReturnValueOnce({ jobId: 'job-002', status: 'completed', outputUri: 'file:///documents/lullaby_job-002.wav', inputUri: '', songKey: 'brahms', createdAt: Date.now() });

    const navigation = makeNavigation();
    render(<S12LocalGeneratingScreen navigation={navigation as never} route={makeRoute('job-002') as never} />);

    // 1초 경과 (첫 번째 틱 - processing)
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // 2초 경과 (두 번째 틱 - completed)
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(mockNavigationReplace).toHaveBeenCalledWith(
      'Play',
      expect.objectContaining({
        trackId: 'job-002',
        trackUrl: 'file:///documents/lullaby_job-002.wav',
      }),
    );
  });

  it('completed 감지 후 추가 pollStatus 호출이 없다 (clearInterval 확인)', () => {
    mockPollStatus
      .mockReturnValueOnce({ jobId: 'job-003', status: 'processing', inputUri: '', outputUri: null, songKey: 'brahms', createdAt: Date.now() })
      .mockReturnValueOnce({ jobId: 'job-003', status: 'completed', outputUri: 'file:///documents/out.wav', inputUri: '', songKey: 'brahms', createdAt: Date.now() });

    const navigation = makeNavigation();
    render(<S12LocalGeneratingScreen navigation={navigation as never} route={makeRoute('job-003') as never} />);

    act(() => { jest.advanceTimersByTime(1000); }); // processing
    act(() => { jest.advanceTimersByTime(1000); }); // completed → clearInterval

    const callCountAfterComplete = mockPollStatus.mock.calls.length;

    // 추가 3초 경과해도 pollStatus 호출 수 변화 없음
    act(() => { jest.advanceTimersByTime(3000); });

    expect(mockPollStatus.mock.calls.length).toBe(callCountAfterComplete);
  });
});

// ── status='failed' → 에러 UI + clearInterval ───────────────────────────────

describe('REQ-004 — LocalGeneratingScreen: failed 감지 시 에러 UI', () => {
  it('pollStatus 가 status=failed 반환 시 에러 UI 가 렌더링된다', () => {
    mockPollStatus.mockReturnValue({ jobId: 'job-004', status: 'failed', error: 'DSP 실패', inputUri: '', outputUri: null, songKey: 'brahms', createdAt: Date.now() });

    const navigation = makeNavigation();
    render(<S12LocalGeneratingScreen navigation={navigation as never} route={makeRoute('job-004') as never} />);

    act(() => { jest.advanceTimersByTime(1000); });

    // 에러 상태 UI (에러 메시지 또는 재시도 버튼) 표시
    const hasErrorText = screen.queryByText(/실패|오류|다시|goBack/) !== null ||
      screen.queryByText(/back|retry/i) !== null ||
      screen.queryByTestId('local-generating-error') !== null;
    expect(hasErrorText).toBe(true);
  });

  it('pollStatus 가 status=failed 반환 시 navigation.replace("Play") 를 호출하지 않는다', () => {
    mockPollStatus.mockReturnValue({ jobId: 'job-005', status: 'failed', error: 'DSP 실패', inputUri: '', outputUri: null, songKey: 'brahms', createdAt: Date.now() });

    const navigation = makeNavigation();
    render(<S12LocalGeneratingScreen navigation={navigation as never} route={makeRoute('job-005') as never} />);

    act(() => { jest.advanceTimersByTime(1000); });

    expect(mockNavigationReplace).not.toHaveBeenCalledWith('Play', expect.anything());
  });

  it('failed 후 추가 pollStatus 호출 없다 (clearInterval 확인)', () => {
    mockPollStatus.mockReturnValue({ jobId: 'job-006', status: 'failed', error: 'DSP 실패', inputUri: '', outputUri: null, songKey: 'brahms', createdAt: Date.now() });

    const navigation = makeNavigation();
    render(<S12LocalGeneratingScreen navigation={navigation as never} route={makeRoute('job-006') as never} />);

    act(() => { jest.advanceTimersByTime(1000); }); // failed → clearInterval

    const callCountAfterFail = mockPollStatus.mock.calls.length;

    act(() => { jest.advanceTimersByTime(3000); }); // 추가 3초

    expect(mockPollStatus.mock.calls.length).toBe(callCountAfterFail);
  });
});

// ── unmount 시 clearInterval (interval 누수 방지) ────────────────────────────

describe('REQ-004 — LocalGeneratingScreen: unmount 시 clearInterval (§주의사항 §8)', () => {
  it('화면 unmount 시 interval 이 정리되어 추가 pollStatus 호출이 없다', () => {
    mockPollStatus.mockReturnValue({ jobId: 'job-007', status: 'processing', inputUri: '', outputUri: null, songKey: 'brahms', createdAt: Date.now() });

    const navigation = makeNavigation();
    const { unmount } = render(<S12LocalGeneratingScreen navigation={navigation as never} route={makeRoute('job-007') as never} />);

    act(() => { jest.advanceTimersByTime(1000); });
    const callCountBeforeUnmount = mockPollStatus.mock.calls.length;

    // unmount
    act(() => { unmount(); });

    // unmount 후 3초 경과
    act(() => { jest.advanceTimersByTime(3000); });

    expect(mockPollStatus.mock.calls.length).toBe(callCountBeforeUnmount);
  });
});
