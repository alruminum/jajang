// REQ-006~REQ-010 — LocalDspService.startJob 상태 전이 + 카운터 + store 호출 검증
//
// useGenerationStore 는 Zustand store 이지만 LocalDspService 내부에서
// useGenerationStore.getState().setSessionId / setPollState 를 직접 호출한다.
// (React hook 호출 X — 컴포넌트 외부 service 레이어)
// 아래 mock 은 그 getState() 반환 객체의 spy 를 통해 호출 사실을 검증한다.
//
// NOTE: setPollState 는 PollState union (kind 필드) 을 받는다. plan pseudocode 의
// { status: ... } 형식은 illustrative 이며 실제 타입 계약은 kind 필드를 사용한다.
// REQ-007, REQ-009 assertions 은 { kind: ... } 으로 업데이트됨.
//
// NOTE: jest.mock() factory 는 hoisting 으로 인해 모듈 스코프 변수 참조가
// 금지된다. mock 접두사로 시작하는 이름만 허용되므로 spy 변수명에 mock 접두사 사용.

const mockSetSessionId = jest.fn();
const mockSetPollState = jest.fn();

jest.mock('../../../store/generationSlice', () => ({
  useGenerationStore: {
    getState: () => ({ setSessionId: mockSetSessionId, setPollState: mockSetPollState }),
  },
}));

// AsyncStorage in-memory mock — LocalCounterRepo 내부 round-trip 을 위해
jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
      setItem: jest.fn((key: string, value: string) => {
        store[key] = value;
        return Promise.resolve();
      }),
      removeItem: jest.fn((key: string) => {
        delete store[key];
        return Promise.resolve();
      }),
      clear: jest.fn(() => {
        Object.keys(store).forEach((k) => delete store[k]);
        return Promise.resolve();
      }),
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocalDspService } from '../LocalDspService';
import { FreeLimitReachedError } from '../LocalCounterRepo';
import type { IDspBridge } from '../MinimalDspBridge';

// ── 헬퍼: hand-rolled mock counterRepo ─────────────────────────────────────

function makeCounterRepo(initialCount = 0, limit = 3) {
  let count = initialCount;
  return {
    peek: jest.fn(async () => ({ count, limit })),
    increment: jest.fn(async () => {
      if (count >= limit) throw new FreeLimitReachedError(count, limit);
      count += 1;
    }),
    reset: jest.fn(async () => {
      count = 0;
    }),
  };
}

// ── 헬퍼: mock IDspBridge ───────────────────────────────────────────────────

function makeBridge(
  result: { outputUri: string; durationMs: number } | Error = {
    outputUri: 'file:///out.wav',
    durationMs: 100,
  },
): IDspBridge {
  return {
    execute: jest.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  } as unknown as IDspBridge;
}

const JOB_PARAMS = {
  inputUri: 'file:///in.wav',
  songKey: 'lullaby-A',
  outputUri: 'file:///out.wav',
};

describe('REQ-006~REQ-010 — LocalDspService.startJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.clear as jest.Mock)();
  });

  it('REQ-006: throws FreeLimitReachedError when count is at limit, bridge.execute not called', async () => {
    const counterRepo = makeCounterRepo(3, 3); // count === limit
    const bridge = makeBridge();
    const service = new LocalDspService(bridge, counterRepo as never);

    await expect(service.startJob(JOB_PARAMS)).rejects.toBeInstanceOf(FreeLimitReachedError);
    expect(bridge.execute).not.toHaveBeenCalled();
  });

  it('REQ-007: status transitions pending → processing → completed on success', async () => {
    const counterRepo = makeCounterRepo(0, 3);
    const bridge = makeBridge();
    const service = new LocalDspService(bridge, counterRepo as never);

    await service.startJob(JOB_PARAMS);

    const calls = (mockSetPollState as jest.Mock).mock.calls.map(
      (c: unknown[]) => c[0] as Record<string, unknown>,
    );

    // First call: pending phase → { kind: 'polling' }
    expect(calls[0]).toEqual(expect.objectContaining({ kind: 'polling' }));
    // Processing phase also uses { kind: 'polling' } (same PollState shape)
    const pollingIdx = calls.findIndex(
      (s) => (s as Record<string, unknown>).kind === 'polling',
    );
    expect(pollingIdx).toBeGreaterThan(-1);
    // Last call: completed → { kind: 'completed' }
    const lastCall = calls[calls.length - 1];
    expect(lastCall).toEqual(expect.objectContaining({ kind: 'completed' }));
  });

  it('REQ-008: counterRepo.increment called exactly 1 time on success', async () => {
    const counterRepo = makeCounterRepo(0, 3);
    const bridge = makeBridge();
    const service = new LocalDspService(bridge, counterRepo as never);

    await service.startJob(JOB_PARAMS);

    expect(counterRepo.increment).toHaveBeenCalledTimes(1);
  });

  it('REQ-009: status=failed on bridge error, increment not called', async () => {
    const counterRepo = makeCounterRepo(0, 3);
    const bridge = makeBridge(new Error('DSP 처리 오류'));
    const service = new LocalDspService(bridge, counterRepo as never);

    await service.startJob(JOB_PARAMS);

    expect(counterRepo.increment).not.toHaveBeenCalled();
    const calls = (mockSetPollState as jest.Mock).mock.calls.map(
      (c: unknown[]) => c[0] as Record<string, unknown>,
    );
    const lastCall = calls[calls.length - 1];
    // Failure path → { kind: 'failed' }
    expect(lastCall).toEqual(expect.objectContaining({ kind: 'failed' }));
  });

  it('REQ-010: setSessionId called with returned jobId on success', async () => {
    const counterRepo = makeCounterRepo(0, 3);
    const bridge = makeBridge();
    const service = new LocalDspService(bridge, counterRepo as never);

    const jobId = await service.startJob(JOB_PARAMS);

    expect(mockSetSessionId).toHaveBeenCalledWith(jobId);
  });
});
