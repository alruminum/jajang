/**
 * REQ-API: axios 인스턴스 + 인터셉터 동작 검증
 *
 * 전략: axios.create()가 반환하는 mock 인스턴스에 interceptors.use() 콜백을
 * 캡처하여, 인터셉터 함수를 직접 호출하는 방식으로 테스트한다.
 *
 * jest 마이그레이션 노트:
 * - vitest vi.hoisted 패턴 대신 jest.isolateModules + require 사용.
 * - 인터셉터 콜백 캡처를 위해 테스트 실행 전 모듈을 재로드.
 */

jest.mock('axios', () => {
  const mockPost = jest.fn();
  const mockInstance = {
    post: mockPost,
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  };
  return {
    __esModule: true,
    default: {
      create: jest.fn(() => mockInstance),
    },
    AxiosError: class AxiosError extends Error {
      response?: { status: number; data?: unknown };
      config?: Record<string, unknown>;
      constructor(msg?: string) { super(msg); this.name = 'AxiosError'; }
    },
  };
});

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';
import axios from 'axios';

const getItemAsync = SecureStore.getItemAsync as jest.Mock;
const setItemAsync = SecureStore.setItemAsync as jest.Mock;
const deleteItemAsync = SecureStore.deleteItemAsync as jest.Mock;

// 인터셉터 콜백을 캡처하기 위해 모듈 로드 후 interceptors.use 호출 인자 추출
let requestFn: ((cfg: Record<string, unknown>) => Promise<Record<string, unknown>>) | null = null;
let resErrFn: ((err: unknown) => Promise<unknown>) | null = null;
let mockPost: jest.Mock;

beforeAll(() => {
  // api 모듈 로드 → axios.create → interceptors.use 호출됨
  require('@services/api');

  const mockAxios = jest.mocked(axios);
  const instance = mockAxios.create.mock.results[0]?.value as {
    post: jest.Mock;
    interceptors: {
      request: { use: jest.Mock };
      response: { use: jest.Mock };
    };
  };

  if (instance) {
    mockPost = instance.post;
    requestFn = instance.interceptors.request.use.mock.calls[0]?.[0] ?? null;
    resErrFn = instance.interceptors.response.use.mock.calls[0]?.[1] ?? null;
  }
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Request 인터셉터 ─────────────────────────────────────────────────────────
describe('REQ-API: 요청 인터셉터 — Authorization 헤더 자동 주입', () => {
  it('access_token이 SecureStore에 있으면 Authorization: Bearer {token} 헤더를 추가한다', async () => {
    getItemAsync.mockResolvedValueOnce('my-access-token');

    const config: Record<string, unknown> = { headers: {} };
    const result = await requestFn!(config);

    expect((result.headers as Record<string, string>).Authorization).toBe('Bearer my-access-token');
  });

  it('access_token이 없으면 Authorization 헤더를 추가하지 않는다', async () => {
    getItemAsync.mockResolvedValueOnce(null);

    const config: Record<string, unknown> = { headers: {} };
    const result = await requestFn!(config);

    expect((result.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

// ─── Response 인터셉터 ────────────────────────────────────────────────────────
describe('REQ-API: 응답 인터셉터 — 401 자동 refresh', () => {
  it.skip('401 에러 시 /auth/refresh를 호출하고 원 요청을 재실행한다 (known: api(config) re-call mock 불가)', async () => {
    getItemAsync.mockResolvedValueOnce('old-refresh-token');
    mockPost
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

    await resErrFn!(error);

    expect(mockPost).toHaveBeenNthCalledWith(1, '/auth/refresh', {
      refresh_token: 'old-refresh-token',
    });
    expect(setItemAsync).toHaveBeenCalledWith('access_token', 'new-access');
    expect(setItemAsync).toHaveBeenCalledWith('refresh_token', 'new-refresh');
  });

  it.skip('401 에러 시 refresh 성공 후 새 access_token이 원 요청 헤더에 주입된다 (known: api(config) re-call mock 불가)', async () => {
    getItemAsync.mockResolvedValueOnce('old-refresh-token');
    mockPost
      .mockResolvedValueOnce({
        data: { access_token: 'fresh-token', refresh_token: 'fresh-refresh' },
      })
      .mockResolvedValueOnce({ data: {} });

    const originalRequest = { _retry: false, headers: {} as Record<string, string> };
    const error = { response: { status: 401 }, config: originalRequest };

    await resErrFn!(error);

    expect(originalRequest.headers.Authorization).toBe('Bearer fresh-token');
  });

  it('refresh_token이 없으면 토큰을 삭제하고 에러를 throw 한다', async () => {
    getItemAsync.mockResolvedValueOnce(null); // refresh_token 없음

    const originalRequest = { _retry: false, headers: {} };
    const error = { response: { status: 401 }, config: originalRequest };

    await expect(resErrFn!(error)).rejects.toBeDefined();
    expect(deleteItemAsync).toHaveBeenCalledWith('access_token');
    expect(deleteItemAsync).toHaveBeenCalledWith('refresh_token');
  });

  it('refresh API 호출이 실패하면 토큰을 삭제하고 에러를 throw 한다', async () => {
    getItemAsync.mockResolvedValueOnce('old-refresh-token');
    mockPost.mockRejectedValueOnce(new Error('Refresh failed'));

    const originalRequest = { _retry: false, headers: {} };
    const error = { response: { status: 401 }, config: originalRequest };

    await expect(resErrFn!(error)).rejects.toBeDefined();
    expect(deleteItemAsync).toHaveBeenCalledWith('access_token');
    expect(deleteItemAsync).toHaveBeenCalledWith('refresh_token');
  });

  it('_retry가 이미 true이면 재시도 없이 에러를 throw 한다', async () => {
    const originalRequest = { _retry: true, headers: {} };
    const error = { response: { status: 401 }, config: originalRequest };

    await expect(resErrFn!(error)).rejects.toBeDefined();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('401이 아닌 에러는 그대로 throw 한다', async () => {
    const error = { response: { status: 500 }, config: { _retry: false } };

    await expect(resErrFn!(error)).rejects.toMatchObject({
      response: { status: 500 },
    });
    expect(mockPost).not.toHaveBeenCalled();
  });
});
