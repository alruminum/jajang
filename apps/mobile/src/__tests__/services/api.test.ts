/**
 * REQ-API: axios 인스턴스 + 인터셉터 동작 검증
 *
 * 전략: axios.create()가 반환하는 mock 인스턴스에 interceptors.use() 콜백을
 * 캡처하여, 인터셉터 함수를 직접 호출하는 방식으로 테스트한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── interceptor 콜백 캡처 객체 ──────────────────────────────────────────────
// vi.mock 팩토리보다 먼저 선언되어야 클로저가 정상 동작한다
const captured: {
  requestFn: ((cfg: Record<string, unknown>) => Promise<Record<string, unknown>>) | null;
  resErrFn: ((err: unknown) => Promise<unknown>) | null;
  mockPost: ReturnType<typeof vi.fn>;
} = {
  requestFn: null,
  resErrFn: null,
  mockPost: vi.fn(),
};

vi.mock('axios', () => {
  const instance = {
    get post() { return captured.mockPost; },
    interceptors: {
      request: {
        use: vi.fn((fn: (cfg: Record<string, unknown>) => Promise<Record<string, unknown>>) => {
          captured.requestFn = fn;
        }),
      },
      response: {
        use: vi.fn(
          (_ok: unknown, errFn: (err: unknown) => Promise<unknown>) => {
            captured.resErrFn = errFn;
          },
        ),
      },
    },
  };
  return {
    default: {
      create: vi.fn(() => instance),
    },
    // AxiosError 클래스 — 인터셉터에서 instanceof 체크에 사용
    AxiosError: class AxiosError extends Error {
      response?: { status: number; data?: unknown };
      config?: Record<string, unknown>;
      constructor(msg?: string) { super(msg); this.name = 'AxiosError'; }
    },
  };
});

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));

// api 모듈 import → interceptors.use() 가 즉시 호출되어 captured에 저장됨
import * as SecureStore from 'expo-secure-store';
// Side-effect import: interceptors 등록
import '@services/api';

const getItemAsync = SecureStore.getItemAsync as ReturnType<typeof vi.fn>;
const setItemAsync = SecureStore.setItemAsync as ReturnType<typeof vi.fn>;
const deleteItemAsync = SecureStore.deleteItemAsync as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Request 인터셉터 ─────────────────────────────────────────────────────────
describe('REQ-API: 요청 인터셉터 — Authorization 헤더 자동 주입', () => {
  it('access_token이 SecureStore에 있으면 Authorization: Bearer {token} 헤더를 추가한다', async () => {
    getItemAsync.mockResolvedValueOnce('my-access-token');

    const config: Record<string, unknown> = { headers: {} };
    const result = await captured.requestFn!(config);

    expect((result.headers as Record<string, string>).Authorization).toBe('Bearer my-access-token');
  });

  it('access_token이 없으면 Authorization 헤더를 추가하지 않는다', async () => {
    getItemAsync.mockResolvedValueOnce(null);

    const config: Record<string, unknown> = { headers: {} };
    const result = await captured.requestFn!(config);

    expect((result.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

// ─── Response 인터셉터 ────────────────────────────────────────────────────────
describe('REQ-API: 응답 인터셉터 — 401 자동 refresh', () => {
  it('401 에러 시 /auth/refresh를 호출하고 원 요청을 재실행한다', async () => {
    getItemAsync.mockResolvedValueOnce('old-refresh-token');
    captured.mockPost
      .mockResolvedValueOnce({
        data: { access_token: 'new-access', refresh_token: 'new-refresh' },
      })
      .mockResolvedValueOnce({ data: { success: true } }); // 원 요청 재실행

    const originalRequest = {
      _retry: false,
      headers: {} as Record<string, string>,
    };
    const error = {
      response: { status: 401 },
      config: originalRequest,
    };

    await captured.resErrFn!(error);

    expect(captured.mockPost).toHaveBeenNthCalledWith(1, '/auth/refresh', {
      refresh_token: 'old-refresh-token',
    });
    expect(setItemAsync).toHaveBeenCalledWith('access_token', 'new-access');
    expect(setItemAsync).toHaveBeenCalledWith('refresh_token', 'new-refresh');
  });

  it('401 에러 시 refresh 성공 후 새 access_token이 원 요청 헤더에 주입된다', async () => {
    getItemAsync.mockResolvedValueOnce('old-refresh-token');
    captured.mockPost
      .mockResolvedValueOnce({
        data: { access_token: 'fresh-token', refresh_token: 'fresh-refresh' },
      })
      .mockResolvedValueOnce({ data: {} });

    const originalRequest = { _retry: false, headers: {} as Record<string, string> };
    const error = { response: { status: 401 }, config: originalRequest };

    await captured.resErrFn!(error);

    expect(originalRequest.headers.Authorization).toBe('Bearer fresh-token');
  });

  it('refresh_token이 없으면 토큰을 삭제하고 에러를 throw 한다', async () => {
    getItemAsync.mockResolvedValueOnce(null); // refresh_token 없음

    const originalRequest = { _retry: false, headers: {} };
    const error = { response: { status: 401 }, config: originalRequest };

    await expect(captured.resErrFn!(error)).rejects.toBeDefined();
    expect(deleteItemAsync).toHaveBeenCalledWith('access_token');
    expect(deleteItemAsync).toHaveBeenCalledWith('refresh_token');
  });

  it('refresh API 호출이 실패하면 토큰을 삭제하고 에러를 throw 한다', async () => {
    getItemAsync.mockResolvedValueOnce('old-refresh-token');
    captured.mockPost.mockRejectedValueOnce(new Error('Refresh failed'));

    const originalRequest = { _retry: false, headers: {} };
    const error = { response: { status: 401 }, config: originalRequest };

    await expect(captured.resErrFn!(error)).rejects.toBeDefined();
    expect(deleteItemAsync).toHaveBeenCalledWith('access_token');
    expect(deleteItemAsync).toHaveBeenCalledWith('refresh_token');
  });

  it('_retry가 이미 true이면 재시도 없이 에러를 throw 한다', async () => {
    const originalRequest = { _retry: true, headers: {} };
    const error = { response: { status: 401 }, config: originalRequest };

    await expect(captured.resErrFn!(error)).rejects.toBeDefined();
    expect(captured.mockPost).not.toHaveBeenCalled();
  });

  it('401이 아닌 에러는 그대로 throw 한다', async () => {
    const error = { response: { status: 500 }, config: { _retry: false } };

    await expect(captured.resErrFn!(error)).rejects.toMatchObject({
      response: { status: 500 },
    });
    expect(captured.mockPost).not.toHaveBeenCalled();
  });
});
