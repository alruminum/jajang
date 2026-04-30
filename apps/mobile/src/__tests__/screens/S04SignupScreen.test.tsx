/**
 * REQ-S04: 회원가입 화면 동작 검증
 *
 * 수용 기준 매핑:
 * - 이메일 형식 오류 → 인라인 에러 표시
 * - 비밀번호 8자 미만 → 인라인 에러 표시
 * - 비밀번호 문자+숫자 미포함 → 인라인 에러 표시
 * - 중복 이메일 (409) → "이미 등록된 이메일이에요" + "로그인하기 →" 링크 노출
 * - 가입 성공 → navigation.replace('Main')
 * - loading 중 버튼 disabled + "가입 중..." 텍스트
 * - 소셜 로그인 성공 → navigation.replace('Main')
 * - 소셜 로그인 실패(네트워크) → Alert
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { AxiosError } from 'axios';

// ─── 의존 모듈 Mock ──────────────────────────────────────────────────────────
const mockReplace = jest.fn();
const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ replace: mockReplace, navigate: mockNavigate }),
}));

const mockSaveSession = jest.fn();

jest.mock('@hooks/useAuth', () => ({
  useAuth: () => ({ saveSession: mockSaveSession }),
}));

const mockEmailSignup = jest.fn();
const mockSocialAuth = jest.fn();

jest.mock('@services/auth-api', () => ({
  emailSignup: (...args: unknown[]) => mockEmailSignup(...args),
  socialAuth: (...args: unknown[]) => mockSocialAuth(...args),
}));

// SocialAuthButtons는 별도로 테스트하므로 단순 mock
jest.mock('@components/SocialAuthButtons', () => {
  const mockFn = ({ onSuccess, onError }: {
    onSuccess: (provider: 'apple' | 'google', token: string) => void;
    onError?: (e: unknown) => void;
  }) => {
    // 테스트에서 직접 호출 가능하도록 testID 노출
    const React = require('react');
    const { TouchableOpacity, Text } = require('react-native');
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        TouchableOpacity,
        {
          testID: 'social-success-trigger',
          onPress: () => onSuccess('google', 'mock-token'),
        },
        React.createElement(Text, null, 'Social 성공'),
      ),
      React.createElement(
        TouchableOpacity,
        {
          testID: 'social-error-trigger',
          onPress: () => onError?.(new Error('social error')),
        },
        React.createElement(Text, null, 'Social 실패'),
      ),
    );
  };
  return {
    __esModule: true,
    default: mockFn,
    SocialAuthButtons: mockFn,
  };
});

import S04SignupScreen from '@screens/S04SignupScreen';

let mockAlertFn: jest.SpyInstance;

const MOCK_AUTH_RESPONSE = {
  access_token: 'token',
  refresh_token: 'refresh',
  token_type: 'Bearer',
  entitlement: 'free' as const,
  user_id: 'user-001',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAlertFn = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── 이메일 유효성 검사 ──────────────────────────────────────────────────────
describe('REQ-S04: 이메일 유효성 검사', () => {
  it('이메일 형식이 올바르지 않으면 "올바른 이메일 형식이 아니에요" 에러를 표시한다', async () => {
    const { getByLabelText, getByText } = render(<S04SignupScreen />);

    fireEvent.changeText(getByLabelText('이메일 입력'), 'not-an-email');
    fireEvent.changeText(getByLabelText('비밀번호 입력'), 'pass1234');
    fireEvent.press(getByLabelText('이메일로 가입하기'));

    await waitFor(() => {
      expect(getByText('올바른 이메일 형식이 아니에요')).toBeTruthy();
    });
  });

  it('이메일 형식 오류 시 API를 호출하지 않는다', async () => {
    const { getByLabelText } = render(<S04SignupScreen />);

    fireEvent.changeText(getByLabelText('이메일 입력'), 'bad-email');
    fireEvent.changeText(getByLabelText('비밀번호 입력'), 'pass1234');
    fireEvent.press(getByLabelText('이메일로 가입하기'));

    await waitFor(() => {
      expect(mockEmailSignup).not.toHaveBeenCalled();
    });
  });
});

// ─── 비밀번호 유효성 검사 ────────────────────────────────────────────────────
describe('REQ-S04: 비밀번호 유효성 검사', () => {
  it('비밀번호가 8자 미만이면 "비밀번호는 8자 이상이어야 해요" 에러를 표시한다', async () => {
    const { getByLabelText, getByText } = render(<S04SignupScreen />);

    fireEvent.changeText(getByLabelText('이메일 입력'), 'test@example.com');
    fireEvent.changeText(getByLabelText('비밀번호 입력'), 'abc12'); // 5자
    fireEvent.press(getByLabelText('이메일로 가입하기'));

    await waitFor(() => {
      expect(getByText('비밀번호는 8자 이상이어야 해요')).toBeTruthy();
    });
  });

  it('비밀번호가 8자이지만 숫자가 없으면 "문자와 숫자를 모두 포함해주세요" 에러를 표시한다', async () => {
    const { getByLabelText, getByText } = render(<S04SignupScreen />);

    fireEvent.changeText(getByLabelText('이메일 입력'), 'test@example.com');
    fireEvent.changeText(getByLabelText('비밀번호 입력'), 'abcdefgh'); // 문자만
    fireEvent.press(getByLabelText('이메일로 가입하기'));

    await waitFor(() => {
      expect(getByText('문자와 숫자를 모두 포함해주세요')).toBeTruthy();
    });
  });

  it('비밀번호가 8자이지만 문자가 없으면 "문자와 숫자를 모두 포함해주세요" 에러를 표시한다', async () => {
    const { getByLabelText, getByText } = render(<S04SignupScreen />);

    fireEvent.changeText(getByLabelText('이메일 입력'), 'test@example.com');
    fireEvent.changeText(getByLabelText('비밀번호 입력'), '12345678'); // 숫자만
    fireEvent.press(getByLabelText('이메일로 가입하기'));

    await waitFor(() => {
      expect(getByText('문자와 숫자를 모두 포함해주세요')).toBeTruthy();
    });
  });
});

// ─── 중복 이메일 (409) ───────────────────────────────────────────────────────
describe('REQ-S04: 중복 이메일 409 에러 처리', () => {
  it('409 응답 시 "이미 등록된 이메일이에요" 에러를 표시한다', async () => {
    const axiosError = new AxiosError('Conflict');
    (axiosError as AxiosError & { response: unknown }).response = { status: 409 };
    mockEmailSignup.mockRejectedValueOnce(axiosError);

    const { getByLabelText, getByText } = render(<S04SignupScreen />);

    fireEvent.changeText(getByLabelText('이메일 입력'), 'dup@example.com');
    fireEvent.changeText(getByLabelText('비밀번호 입력'), 'pass1234');
    fireEvent.press(getByLabelText('이메일로 가입하기'));

    await waitFor(() => {
      expect(getByText('이미 등록된 이메일이에요')).toBeTruthy();
    });
  });

  it('409 응답 시 "로그인하기 →" 링크를 표시한다', async () => {
    const axiosError = new AxiosError('Conflict');
    (axiosError as AxiosError & { response: unknown }).response = { status: 409 };
    mockEmailSignup.mockRejectedValueOnce(axiosError);

    const { getByLabelText, getByText } = render(<S04SignupScreen />);

    fireEvent.changeText(getByLabelText('이메일 입력'), 'dup@example.com');
    fireEvent.changeText(getByLabelText('비밀번호 입력'), 'pass1234');
    fireEvent.press(getByLabelText('이메일로 가입하기'));

    await waitFor(() => {
      expect(getByText('로그인하기 →')).toBeTruthy();
    });
  });

  it('409 응답 후 "로그인하기 →" 링크 클릭 시 Login 화면으로 이동한다', async () => {
    const axiosError = new AxiosError('Conflict');
    (axiosError as AxiosError & { response: unknown }).response = { status: 409 };
    mockEmailSignup.mockRejectedValueOnce(axiosError);

    const { getByLabelText, getByText } = render(<S04SignupScreen />);

    fireEvent.changeText(getByLabelText('이메일 입력'), 'dup@example.com');
    fireEvent.changeText(getByLabelText('비밀번호 입력'), 'pass1234');
    fireEvent.press(getByLabelText('이메일로 가입하기'));

    await waitFor(() => getByText('로그인하기 →'));
    fireEvent.press(getByText('로그인하기 →'));

    expect(mockNavigate).toHaveBeenCalledWith('Auth', expect.objectContaining({ screen: 'Login' }));
  });
});

// ─── 가입 성공 ───────────────────────────────────────────────────────────────
describe('REQ-S04: 가입 성공 흐름', () => {
  it('가입 성공 시 saveSession을 호출한다', async () => {
    mockEmailSignup.mockResolvedValueOnce(MOCK_AUTH_RESPONSE);

    const { getByLabelText } = render(<S04SignupScreen />);

    fireEvent.changeText(getByLabelText('이메일 입력'), 'new@example.com');
    fireEvent.changeText(getByLabelText('비밀번호 입력'), 'pass1234');
    fireEvent.press(getByLabelText('이메일로 가입하기'));

    await waitFor(() => {
      expect(mockSaveSession).toHaveBeenCalledWith(MOCK_AUTH_RESPONSE);
    });
  });

  it('가입 성공 시 navigation.replace("Main")을 호출한다', async () => {
    mockEmailSignup.mockResolvedValueOnce(MOCK_AUTH_RESPONSE);
    mockSaveSession.mockResolvedValueOnce(undefined);

    const { getByLabelText } = render(<S04SignupScreen />);

    fireEvent.changeText(getByLabelText('이메일 입력'), 'new@example.com');
    fireEvent.changeText(getByLabelText('비밀번호 입력'), 'pass1234');
    fireEvent.press(getByLabelText('이메일로 가입하기'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('Main');
    });
  });
});

// ─── 로딩 상태 ───────────────────────────────────────────────────────────────
describe('REQ-S04: 로딩 상태 처리', () => {
  it('API 호출 중 버튼이 disabled 상태가 된다', async () => {
    mockEmailSignup.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(MOCK_AUTH_RESPONSE), 100)),
    );

    const { getByLabelText } = render(<S04SignupScreen />);

    fireEvent.changeText(getByLabelText('이메일 입력'), 'test@example.com');
    fireEvent.changeText(getByLabelText('비밀번호 입력'), 'pass1234');
    fireEvent.press(getByLabelText('이메일로 가입하기'));

    const button = getByLabelText('이메일로 가입하기');
    expect(button.props.accessibilityState?.disabled ?? button.props.disabled).toBe(true);
  });

  it('API 호출 중 버튼 텍스트가 "가입 중..."으로 변경된다', async () => {
    mockEmailSignup.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(MOCK_AUTH_RESPONSE), 100)),
    );

    const { getByLabelText, getByText } = render(<S04SignupScreen />);

    fireEvent.changeText(getByLabelText('이메일 입력'), 'test@example.com');
    fireEvent.changeText(getByLabelText('비밀번호 입력'), 'pass1234');
    fireEvent.press(getByLabelText('이메일로 가입하기'));

    expect(getByText('가입 중...')).toBeTruthy();
  });
});

// ─── 소셜 로그인 성공 ────────────────────────────────────────────────────────
describe('REQ-S04: 소셜 로그인 처리', () => {
  it('소셜 로그인 성공 시 saveSession 호출 후 navigation.replace("Main")으로 이동한다', async () => {
    mockSocialAuth.mockResolvedValueOnce(MOCK_AUTH_RESPONSE);
    mockSaveSession.mockResolvedValueOnce(undefined);

    const { getByTestId } = render(<S04SignupScreen />);

    fireEvent.press(getByTestId('social-success-trigger'));

    await waitFor(() => {
      expect(mockSaveSession).toHaveBeenCalledWith(MOCK_AUTH_RESPONSE);
      expect(mockReplace).toHaveBeenCalledWith('Main');
    });
  });

  it('소셜 로그인 네트워크 실패 시 Alert를 표시한다', async () => {
    mockSocialAuth.mockRejectedValueOnce(new Error('Network error'));

    const { getByTestId } = render(<S04SignupScreen />);

    fireEvent.press(getByTestId('social-error-trigger'));

    await waitFor(() => {
      expect(mockAlertFn).toHaveBeenCalledWith(
        '가입 실패',
        expect.stringContaining('소셜 로그인에 실패했어요'),
      );
    });
  });
});
