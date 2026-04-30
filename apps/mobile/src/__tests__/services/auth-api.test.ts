
// api 모듈 전체를 mock — axios 실제 호출 방지
jest.mock('@services/api', () => ({
  api: {
    post: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  },
}));

import { api } from '@services/api';
import { emailSignup, emailLogin, socialAuth } from '@services/auth-api';
import type { AuthResponse } from '@services/auth-api';

// ─── 픽스처 ──────────────────────────────────────────────────────────────────
const MOCK_RESPONSE: AuthResponse = {
  access_token: 'access-abc123',
  refresh_token: 'refresh-xyz456',
  token_type: 'Bearer',
  entitlement: 'free',
  user_id: 'user-001',
};

const mockPost = api.post as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── emailSignup ─────────────────────────────────────────────────────────────
describe('REQ-AUTH-API: emailSignup', () => {
  it('성공 시 AuthResponse를 반환한다', async () => {
    mockPost.mockResolvedValueOnce({ data: MOCK_RESPONSE });

    const result = await emailSignup('test@example.com', 'pass1234');

    expect(result).toEqual(MOCK_RESPONSE);
  });

  it('/auth/signup/email 엔드포인트로 이메일·비밀번호를 POST 한다', async () => {
    mockPost.mockResolvedValueOnce({ data: MOCK_RESPONSE });

    await emailSignup('test@example.com', 'pass1234');

    expect(mockPost).toHaveBeenCalledWith('/auth/signup/email', {
      email: 'test@example.com',
      password: 'pass1234',
    });
  });

  it('API 에러 발생 시 에러를 그대로 throw 한다', async () => {
    const networkError = new Error('Network Error');
    mockPost.mockRejectedValueOnce(networkError);

    await expect(emailSignup('test@example.com', 'pass1234')).rejects.toThrow('Network Error');
  });
});

// ─── emailLogin ──────────────────────────────────────────────────────────────
describe('REQ-AUTH-API: emailLogin', () => {
  it('성공 시 AuthResponse를 반환한다', async () => {
    mockPost.mockResolvedValueOnce({ data: MOCK_RESPONSE });

    const result = await emailLogin('test@example.com', 'pass1234');

    expect(result).toEqual(MOCK_RESPONSE);
  });

  it('/auth/login/email 엔드포인트로 이메일·비밀번호를 POST 한다', async () => {
    mockPost.mockResolvedValueOnce({ data: MOCK_RESPONSE });

    await emailLogin('test@example.com', 'pass1234');

    expect(mockPost).toHaveBeenCalledWith('/auth/login/email', {
      email: 'test@example.com',
      password: 'pass1234',
    });
  });

  it('API 에러 발생 시 에러를 그대로 throw 한다', async () => {
    const axiosError = { response: { status: 401 }, message: 'Unauthorized' };
    mockPost.mockRejectedValueOnce(axiosError);

    await expect(emailLogin('test@example.com', 'wrongpass')).rejects.toMatchObject({
      response: { status: 401 },
    });
  });
});

// ─── socialAuth ───────────────────────────────────────────────────────────────
describe('REQ-AUTH-API: socialAuth', () => {
  it('apple provider로 호출 시 /auth/social에 provider와 id_token을 POST 한다', async () => {
    mockPost.mockResolvedValueOnce({ data: MOCK_RESPONSE });

    const result = await socialAuth('apple', 'apple-identity-token-abc');

    expect(mockPost).toHaveBeenCalledWith('/auth/social', {
      provider: 'apple',
      id_token: 'apple-identity-token-abc',
    });
    expect(result).toEqual(MOCK_RESPONSE);
  });

  it('google provider로 호출 시 /auth/social에 provider와 id_token을 POST 한다', async () => {
    mockPost.mockResolvedValueOnce({ data: MOCK_RESPONSE });

    const result = await socialAuth('google', 'google-id-token-xyz');

    expect(mockPost).toHaveBeenCalledWith('/auth/social', {
      provider: 'google',
      id_token: 'google-id-token-xyz',
    });
    expect(result).toEqual(MOCK_RESPONSE);
  });

  it('소셜 API 에러 발생 시 에러를 throw 한다', async () => {
    mockPost.mockRejectedValueOnce(new Error('Social auth failed'));

    await expect(socialAuth('google', 'invalid-token')).rejects.toThrow('Social auth failed');
  });
});
