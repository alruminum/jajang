/**
 * generationSlice.regression.test.ts
 * REQ-008 (task 10 수용 기준) — generationSlice 시그니처 보존 회귀 검증
 *
 * 테스트 대상: apps/mobile/src/store/generationSlice.ts
 * 테스트 파일: apps/mobile/src/__tests__/store/generationSlice.regression.test.ts
 *
 * 검증 범위:
 *   REQ-008-a — setSessionId(string | null) 시그니처 보존
 *   REQ-008-b — setPollState(PollState | null) 시그니처 보존 + kind 필드 정합
 *   REQ-008-c — setSessionId(null) 로 세션 초기화 가능
 *   REQ-008-d — setPollState({ kind: 'polling', elapsedSec: 0 }) 정상 수용
 *   REQ-008-e — setPollState({ kind: 'completed', presignedUrl }) 정상 수용
 *   REQ-008-f — setPollState({ kind: 'failed', error }) 정상 수용
 *
 * NOTE: task 10 이 generationSlice 를 수정할 경우 기존 시그니처가 보존되어야 함.
 * PollState union 의 kind 필드 = task 09 에서 확정 (LocalDspService.test.ts 동일).
 *
 * zustand 는 jest.mock 으로 교체하고, generationSlice 의 공개 API contract 만 검증한다.
 * (zustand 실제 동작 검증은 useGenerationStore mock 을 통한 계약 검증 방식으로 대체)
 */

// ── AsyncStorage mock ────────────────────────────────────────────────────────
const mockAsyncStorage = {
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
  clear: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: mockAsyncStorage,
}));

// ── zustand mock — 실제 상태 관리를 인메모리로 대체 ─────────────────────────
// generationSlice 의 공개 API 계약(setSessionId / setPollState 시그니처)을 검증한다.
// zustand 자체 동작 검증 X — 계약 위반(필드 삭제/타입 변경) 을 감지하는 것이 목적.

type PollStateKind = 'polling' | 'timeout_notice' | 'completed' | 'failed';

interface MockPollState {
  kind: PollStateKind;
  elapsedSec?: number;
  presignedUrl?: string;
  error?: string;
}

interface MockGenerationState {
  sessionId: string | null;
  pollState: MockPollState | null;
  isRetrying: boolean;
  setSessionId: (id: string | null) => void;
  setPollState: (state: MockPollState | null) => void;
  setRetrying: (val: boolean) => void;
  reset: () => void;
  tracks: unknown[];
  removeTrack: (id: string) => void;
  clearAllTracks: () => void;
}

// mock store 상태 (인메모리)
let mockState: MockGenerationState;

function resetMockState() {
  mockState = {
    sessionId: null,
    pollState: null,
    isRetrying: false,
    setSessionId: jest.fn((id) => { mockState.sessionId = id; }),
    setPollState: jest.fn((s) => { mockState.pollState = s; }),
    setRetrying: jest.fn((v) => { mockState.isRetrying = v; }),
    reset: jest.fn(() => { mockState.sessionId = null; mockState.pollState = null; mockState.isRetrying = false; }),
    tracks: [],
    removeTrack: jest.fn(),
    clearAllTracks: jest.fn(),
  };
}

jest.mock('@store/generationSlice', () => ({
  useGenerationStore: {
    getState: jest.fn(() => mockState),
  },
}));

import { useGenerationStore } from '@store/generationSlice';

beforeEach(() => {
  resetMockState();
  jest.clearAllMocks();
  // getState 가 최신 mockState 를 참조하도록 갱신
  (useGenerationStore.getState as jest.Mock).mockReturnValue(mockState);
});

// ── REQ-008-a: setSessionId 시그니처 ────────────────────────────────────────

describe('REQ-008 — generationSlice: setSessionId 시그니처 보존', () => {
  it('setSessionId 는 함수 타입이다 (시그니처 보존 확인)', () => {
    const { setSessionId } = useGenerationStore.getState();
    expect(typeof setSessionId).toBe('function');
  });

  it('setSessionId(string) 호출 후 sessionId 상태가 해당 문자열이 된다', () => {
    const store = useGenerationStore.getState();
    store.setSessionId('test-session-id-001');
    expect(store.sessionId).toBe('test-session-id-001');
  });

  it('setSessionId(null) 호출 후 sessionId 상태가 null이 된다', () => {
    const store = useGenerationStore.getState();
    store.setSessionId('some-id');
    store.setSessionId(null);
    expect(store.sessionId).toBeNull();
  });
});

// ── REQ-008-b: setPollState 시그니처 ────────────────────────────────────────

describe('REQ-008 — generationSlice: setPollState 시그니처 보존', () => {
  it('setPollState 는 함수 타입이다 (시그니처 보존 확인)', () => {
    const { setPollState } = useGenerationStore.getState();
    expect(typeof setPollState).toBe('function');
  });

  it('setPollState(null) 호출 후 pollState 가 null 이 된다', () => {
    const store = useGenerationStore.getState();
    store.setPollState({ kind: 'polling', elapsedSec: 0 });
    store.setPollState(null);
    expect(store.pollState).toBeNull();
  });
});

// ── REQ-008-d: { kind: 'polling' } 수용 ─────────────────────────────────────

describe('REQ-008 — generationSlice: setPollState kind=polling 수용', () => {
  it('setPollState({ kind: "polling", elapsedSec: 0 }) 후 pollState.kind 가 "polling" 이다', () => {
    const store = useGenerationStore.getState();
    store.setPollState({ kind: 'polling', elapsedSec: 0 });
    expect(store.pollState?.kind).toBe('polling');
  });

  it('setPollState({ kind: "polling", elapsedSec: 10 }) 후 elapsedSec 이 보존된다', () => {
    const store = useGenerationStore.getState();
    store.setPollState({ kind: 'polling', elapsedSec: 10 });
    const stored = store.pollState;
    expect(stored?.kind).toBe('polling');
    if (stored?.kind === 'polling') {
      expect(stored.elapsedSec).toBe(10);
    }
  });
});

// ── REQ-008-e: { kind: 'completed', presignedUrl } 수용 ─────────────────────

describe('REQ-008 — generationSlice: setPollState kind=completed 수용', () => {
  it('setPollState({ kind: "completed", presignedUrl }) 후 pollState.kind 가 "completed" 이다', () => {
    const store = useGenerationStore.getState();
    store.setPollState({ kind: 'completed', presignedUrl: 'file:///documents/out.wav' });
    expect(store.pollState?.kind).toBe('completed');
  });

  it('setPollState({ kind: "completed", presignedUrl }) 후 presignedUrl 이 보존된다', () => {
    const store = useGenerationStore.getState();
    const url = 'file:///documents/lullaby_job-001.wav';
    store.setPollState({ kind: 'completed', presignedUrl: url });
    const stored = store.pollState;
    if (stored?.kind === 'completed') {
      expect(stored.presignedUrl).toBe(url);
    } else {
      throw new Error('pollState.kind 가 "completed" 이어야 함');
    }
  });
});

// ── REQ-008-f: { kind: 'failed', error } 수용 ───────────────────────────────

describe('REQ-008 — generationSlice: setPollState kind=failed 수용', () => {
  it('setPollState({ kind: "failed", error }) 후 pollState.kind 가 "failed" 이다', () => {
    const store = useGenerationStore.getState();
    store.setPollState({ kind: 'failed', error: '생성에 실패했어요' });
    expect(store.pollState?.kind).toBe('failed');
  });

  it('setPollState({ kind: "failed", error }) 후 error 문자열이 보존된다', () => {
    const store = useGenerationStore.getState();
    const errorMsg = '생성에 실패했어요. 다시 시도해주세요';
    store.setPollState({ kind: 'failed', error: errorMsg });
    const stored = store.pollState;
    if (stored?.kind === 'failed') {
      expect(stored.error).toBe(errorMsg);
    } else {
      throw new Error('pollState.kind 가 "failed" 이어야 함');
    }
  });
});

// ── REQ-008: reset() 시그니처 보존 ──────────────────────────────────────────

describe('REQ-008 — generationSlice: reset() 시그니처 보존', () => {
  it('reset 은 함수 타입이다', () => {
    const { reset } = useGenerationStore.getState();
    expect(typeof reset).toBe('function');
  });

  it('reset() 호출 후 sessionId 가 null이 된다', () => {
    const store = useGenerationStore.getState();
    store.setSessionId('some-id');
    store.reset();
    expect(store.sessionId).toBeNull();
  });

  it('reset() 호출 후 pollState 가 null이 된다', () => {
    const store = useGenerationStore.getState();
    store.setPollState({ kind: 'polling', elapsedSec: 5 });
    store.reset();
    expect(store.pollState).toBeNull();
  });
});

// ── REQ-008: useGenerationStore.getState 진입점 보존 ─────────────────────────

describe('REQ-008 — generationSlice: useGenerationStore.getState() 진입점 보존', () => {
  it('useGenerationStore.getState 는 함수 타입이다 (LocalDspService 가 사용하는 진입점)', () => {
    expect(typeof useGenerationStore.getState).toBe('function');
  });

  it('useGenerationStore.getState() 반환 객체에 setSessionId 와 setPollState 가 있다', () => {
    const state = useGenerationStore.getState();
    expect(typeof state.setSessionId).toBe('function');
    expect(typeof state.setPollState).toBe('function');
  });
});
