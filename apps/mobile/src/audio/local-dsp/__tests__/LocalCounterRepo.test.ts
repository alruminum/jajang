// REQ-003, REQ-004, REQ-005 — LocalCounterRepo + FreeLimitReachedError
//
// 전역 _setup.ts 의 AsyncStorage stub 은 getItem 을 항상 null 반환하는 jest.fn() 으로
// 정의되어 있어 increment/peek round-trip 이 동작하지 않는다.
// 이 파일에서 in-memory map 기반 mock 으로 재정의하여 round-trip 을 실제로 테스트한다.

// 공식 jest mock 패키지가 루트 node_modules 에 존재하지만 worktree cwd 해상도
// 불확실성을 피하기 위해 직접 in-memory mock 을 사용한다.
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
import { LocalCounterRepo, FreeLimitReachedError } from '../LocalCounterRepo';

const STORAGE_KEY = 'jajang:local-dsp-counter';

describe('REQ-003 / REQ-004 / REQ-005 — LocalCounterRepo', () => {
  let repo: LocalCounterRepo;

  beforeEach(() => {
    jest.clearAllMocks();
    // in-memory store 초기화
    (AsyncStorage.clear as jest.Mock)();
    repo = new LocalCounterRepo();
  });

  it('REQ-003: peek returns { count: 0, limit: 3 } when AsyncStorage is empty', async () => {
    const state = await repo.peek();
    expect(state).toEqual({ count: 0, limit: 3 });
  });

  it('REQ-004: increment 3 times succeeds, 4th call throws FreeLimitReachedError', async () => {
    await repo.increment();
    await repo.increment();
    await repo.increment();
    await expect(repo.increment()).rejects.toBeInstanceOf(FreeLimitReachedError);
  });

  it('REQ-004: FreeLimitReachedError message contains count and limit information', async () => {
    await repo.increment();
    await repo.increment();
    await repo.increment();
    try {
      await repo.increment();
      fail('expected FreeLimitReachedError to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(FreeLimitReachedError);
      const message = (err as Error).message;
      // 에러 메시지에 count(3) 와 limit(3) 관련 정보 포함 여부 확인
      expect(message).toMatch(/3/);
    }
  });

  it('REQ-005: clamps negative stored count to 0 — peek returns { count: 0, limit: 3 }', async () => {
    // 스토리지에 음수 count 를 직접 주입
    (AsyncStorage.setItem as jest.Mock)(
      STORAGE_KEY,
      JSON.stringify({ count: -5, limit: 3 }),
    );
    const state = await repo.peek();
    expect(state).toEqual({ count: 0, limit: 3 });
  });

  it('reset() returns count to 0 after increments', async () => {
    await repo.increment();
    await repo.increment();
    await repo.reset();
    const state = await repo.peek();
    expect(state.count).toBe(0);
  });
});
