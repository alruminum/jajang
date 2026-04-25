/**
 * REQ-S05: 로그인 화면 동작 검증
 *
 * 수용 기준 매핑:
 * - 빈 이메일/비밀번호 → "이메일과 비밀번호를 입력해주세요" 에러
 * - 잘못된 비밀번호 (401) → "이메일 또는 비밀번호를 확인해주세요"
 * - 로그인 성공 → navigation.replace('Main')
 * - loading 중 버튼 disabled + "로그인 중..." 텍스트
 * - 소셜 로그인 성공 → navigation.replace('Main')
 * - 비밀번호 찾기 → Alert (V1 임시 처리)
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { AxiosError } from 'axios';

// ─── 의존 모듈 Mock ──────────────────────────────────────────────────────────
const mockReplace = vi.fn();
const mockNavigate = vi.fn();

vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ replace: mockReplace, navigate: mockNavigate }),
}));

const mockSaveSession = vi.fn();

vi.mock('@hooks/useAuth', () => ({
  useAuth: () => ({ saveSession: mockSaveSession }),
}));

const mockEmailLogin = vi.fn();
const mockSocialAuth = vi.fn();

vi.mock('@services/auth-api', () => ({
  emailLogin: (...args: unknown[]) => mockEmailLogin(...args),
  socialAuth: (...args: unknown[]) => mockSocialAuth(...args),
}));

vi.mock('@components/SocialAuthButtons', () => ({
  default: ({ onSuccess, onError }: {
    onSuccess: (provider: 'apple' | 'google', token: string) => void;
    onError?: (e: unknown) => void;
  }) => {
    const React = require('react');
    const { TouchableOpacity, Text } = require('react-native');
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        TouchableOpacity,
        {
          testID: 'social-success-trigger',
          onPress: () => onSuccess('google', 'mock-google-token'),
        },
        React.createElement(Text, null, 'Google로 계속하기'),
      ),
      React.createElement(
        TouchableOpacity,
        {
          testID: 'social-error-trigger',
          onPress: () => onError?.(new Error('social network error')),
        },
        React.createElement(Text, null, 'Social 실패 트리거'),
      ),
    );
  },
}));

const mockAlertFn = vi.fn();
vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, Alert: { alert: mockAlertFn } };
});

import S05LoginScreen from '@screens/S05LoginScreen';

const MOCK_AUTH_RESPONSE = {
  access_token: 'token-abc',
  refresh_token: 'refresh-xyz',
  token_type: 'Bearer',
  entitlement: 'free' as const,
  user_id: 'user-002',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── 빈 입력 검사 ────────────────────────────────────────────────────────────
describe('REQ-S05: 빈 입력 유효성 검사', () => {
  it('이메일과 비밀번호를 모두 입력하지 않으면 "이메일과 비밀번호를 입력해주세요" 에러를 표시한다', async () => {
    const { getByLabelText, getByText } = render(<S05LoginScreen />);

    fireEvent.press(getByLabelText('로그인하기'));

    await waitFor(() => {
      expect(getByText('이메일과 비밀번호를 입력해주세요')).toBeTruthy();
    });
  });

  it('이메일만 입력하고 비밀번호를 비우면 에러를 표시한다', async () => {
    const { getByLabelText, getByText } = render(<S05LoginScreen />);

    fireEvent.changeText(getByLabelText('이메일 입력'), 'test@example.com');
    fireEvent.press(getByLabelText('로그인하기'));

    await waitFor(() => {
      expect(getByText('이메일과 비밀번호를 입력해주세요')).toBeTruthy();
    });
  });

  it('빈 입력 시 API를 호출하지 않는다', async () => {
    const { getByLabelText } = render(<S05LoginScreen />);

    fireEvent.press(getByLabelText('로그인하기'));

    await waitFor(() => {
      expect(mockEmailLogin).not.toHaveBeenCalled();
    });
  });
});

// ─── 401 잘못된 자격증명 ─────────────────────────────────────────────────────
describe('REQ-S05: 잘못된 이메일/비밀번호 (401)', () => {
  it('401 응답 시 "이메일 또는 비밀번호를 확인해주세요" 에러를 표시한다', async () => {
    const axiosError = new AxiosError('Unauthorized');
    (axiosError as AxiosError & { response: unknown }).response = { status: 401 };
    mockEmailLogin.mockRejectedValueOnce(axiosError);

    const { getByLabelText, getByText } = render(<S05LoginScreen />);

    fireEvent.changeText(getByLabelText('이메일 입력'), 'test@example.com');
    fireEvent.changeText(getByLabelText('비밀번호 입력'), 'wrongpass');
    fireEvent.press(getByLabelText('로그인하기'));

    await waitFor(() => {
      expect(getByText('이메일 또는 비밀번호를 확인해주세요')).toBeTruthy();
    });
  });

  it('401 응답 시 Alert를 표시하지 않는다 (인라인 에러만 표시)', async () => {
    const axiosError = new AxiosError('Unauthorized');
    (axiosError as AxiosError & { response: unknown }).response = { status: 401 };
    mockEmailLogin.mockRejectedValueOnce(axiosError);

    const { getByLabelText } = render(<S05LoginScreen />);

    fireEvent.changeText(getByLabelText('이메일 입력'), 'test@example.com');
    fireEvent.changeText(getByLabelText('비밀번호 입력'), 'wrongpass');
    fireEvent.press(getByLabelText('로그인하기'));

    await waitFor(() => {
      expect(mockAlertFn).not.toHaveBeenCalled();
    });
  });

  it('서버 500 에러 시 Alert를 표시한다', async () => {
    const axiosError = new AxiosError('Server Error');
    (axiosError as AxiosError & { response: unknown }).response = { status: 500 };
    mockEmailLogin.mockRejectedValueOnce(axiosError);

    const { getByLabelText } = render(<S05LoginScreen />);

    fireEvent.changeText(getByLabelText('이메일 입력'), 'test@example.com');
    fireEvent.changeText(getByLabelText('비밀번호 입력'), 'pass1234');
    fireEvent.press(getByLabelText('로그인하기'));

    await waitFor(() => {
      expect(mockAlertFn).toHaveBeenCalledWith('로그인 실패', expect.any(String));
    });
  });
});

// ─── 로그인 성공 ─────────────────────────────────────────────────────────────
describe('REQ-S05: 로그인 성공 흐름', () => {
  it('로그인 성공 시 saveSession을 호출한다', async () => {
    mockEmailLogin.mockResolvedValueOnce(MOCK_AUTH_RESPONSE);

    const { getByLabelText } = render(<S05LoginScreen />);

    fireEvent.changeText(getByLabelText('이메일 입력'), 'user@example.com');
    fireEvent.changeText(getByLabelText('비밀번호 입력'), 'pass1234');
    fireEvent.press(getByLabelText('로그인하기'));

    await waitFor(() => {
      expect(mockSaveSession).toHaveBeenCalledWith(MOCK_AUTH_RESPONSE);
    });
  });

  it('로그인 성공 시 navigation.replace("Main")을 호출한다', async () => {
    mockEmailLogin.mockResolvedValueOnce(MOCK_AUTH_RESPONSE);
    mockSaveSession.mockResolvedValueOnce(undefined);

    const { getByLabelText } = render(<S05LoginScreen />);

    fireEvent.changeText(getByLabelText('이메일 입력'), 'user@example.com');
    fireEvent.changeText(getByLabelText('비밀번호 입력'), 'pass1234');
    fireEvent.press(getByLabelText('로그인하기'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('Main');
    });
  });
});

// ─── 로딩 상태 ───────────────────────────────────────────────────────────────
describe('REQ-S05: 로딩 상태 처리', () => {
  it('API 호출 중 버튼이 disabled 상태가 된다', async () => {
    mockEmailLogin.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(MOCK_AUTH_RESPONSE), 100)),
    );

    const { getByLabelText } = render(<S05LoginScreen />);

    fireEvent.changeText(getByLabelText('이메일 입력'), 'user@example.com');
    fireEvent.changeText(getByLabelText('비밀번호 입력'), 'pass1234');
    fireEvent.press(getByLabelText('로그인하기'));

    const button = getByLabelText('로그인하기');
    expect(button.props.disabled).toBe(true);
  });

  it('API 호출 중 버튼 텍스트가 "로그인 중..."으로 변경된다', async () => {
    mockEmailLogin.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(MOCK_AUTH_RESPONSE), 100)),
    );

    const { getByLabelText, getByText } = render(<S05LoginScreen />);

    fireEvent.changeText(getByLabelText('이메일 입력'), 'user@example.com');
    fireEvent.changeText(getByLabelText('비밀번호 입력'), 'pass1234');
    fireEvent.press(getByLabelText('로그인하기'));

    expect(getByText('로그인 중...')).toBeTruthy();
  });
});

// ─── 소셜 로그인 ──────────────────────────────────────────────────────────────
describe('REQ-S05: 소셜 로그인 처리', () => {
  it('소셜 로그인 성공 시 saveSession 후 navigation.replace("Main")으로 이동한다', async () => {
    mockSocialAuth.mockResolvedValueOnce(MOCK_AUTH_RESPONSE);
    mockSaveSession.mockResolvedValueOnce(undefined);

    const { getByTestId } = render(<S05LoginScreen />);

    fireEvent.press(getByTestId('social-success-trigger'));

    await waitFor(() => {
      expect(mockSaveSession).toHaveBeenCalledWith(MOCK_AUTH_RESPONSE);
      expect(mockReplace).toHaveBeenCalledWith('Main');
    });
  });

  it('소셜 로그인 네트워크 실패 시 "소셜 로그인에 실패했어요" Alert를 표시한다', async () => {
    mockSocialAuth.mockRejectedValueOnce(new Error('Network Error'));

    const { getByTestId } = render(<S05LoginScreen />);

    fireEvent.press(getByTestId('social-error-trigger'));

    await waitFor(() => {
      expect(mockAlertFn).toHaveBeenCalledWith(
        '로그인 실패',
        expect.stringContaining('소셜 로그인에 실패했어요'),
      );
    });
  });
});

// ─── 비밀번호 찾기 ───────────────────────────────────────────────────────────
describe('REQ-S05: 비밀번호 찾기 (V1 임시 처리)', () => {
  it('비밀번호 찾기 버튼 클릭 시 Alert를 표시한다', async () => {
    const { getByLabelText } = render(<S05LoginScreen />);

    fireEvent.press(getByLabelText('비밀번호를 잊으셨나요'));

    expect(mockAlertFn).toHaveBeenCalledWith(
      '비밀번호 찾기',
      expect.any(String),
      expect.any(Array),
    );
  });
});
