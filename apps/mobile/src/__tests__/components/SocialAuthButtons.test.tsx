/**
 * REQ-SOCIAL-BUTTONS: SocialAuthButtons 컴포넌트 동작 검증
 *
 * 수용 기준 매핑:
 * - Apple 버튼 iOS에서만 노출 (Android 미노출)
 * - Google 버튼 항상 노출
 * - Apple 취소 (CANCELED 코드) → onError 미호출
 * - Google 취소 (12501) → onError 미호출
 * - Apple identityToken 없음 → onError 호출
 * - Google idToken 없음 → onError 호출
 * - Apple 성공 → onSuccess('apple', identityToken)
 * - Google 성공 → onSuccess('google', idToken)
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';

// ─── 네이티브 SDK Mock ───────────────────────────────────────────────────────
const mockApplePerformRequest = jest.fn();
const APPLE_CANCELED_CODE = 'CANCELED';

jest.mock('@invertase/react-native-apple-authentication', () => ({
  default: {
    performRequest: (...args: unknown[]) => mockApplePerformRequest(...args),
    Operation: { LOGIN: 'LOGIN' },
    Scope: { EMAIL: 'EMAIL', FULL_NAME: 'FULL_NAME' },
    Error: { CANCELED: 'CANCELED' },
  },
}));

const mockGoogleHasPlayServices = jest.fn();
const mockGoogleSignIn = jest.fn();

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    hasPlayServices: (...args: unknown[]) => mockGoogleHasPlayServices(...args),
    signIn: (...args: unknown[]) => mockGoogleSignIn(...args),
  },
}));

import SocialAuthButtons from '@components/SocialAuthButtons';

let mockAlertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'ios');
  mockAlertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockGoogleHasPlayServices.mockResolvedValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── 버튼 노출 조건 ──────────────────────────────────────────────────────────
describe('REQ-SOCIAL-BUTTONS: 버튼 노출 조건', () => {
  it('iOS에서 Google 버튼이 노출된다', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const { getByLabelText } = render(
      <SocialAuthButtons onSuccess={jest.fn()} />,
    );
    expect(getByLabelText('Google로 계속하기')).toBeTruthy();
  });

  it('iOS에서 Apple 버튼이 노출된다 (PRD F1: iOS 필수)', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const { getByLabelText } = render(
      <SocialAuthButtons onSuccess={jest.fn()} />,
    );
    expect(getByLabelText('Apple로 계속하기')).toBeTruthy();
  });

  it('Android에서 Google 버튼이 노출된다', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const { getByLabelText } = render(
      <SocialAuthButtons onSuccess={jest.fn()} />,
    );
    expect(getByLabelText('Google로 계속하기')).toBeTruthy();
  });

  it('Android에서 Apple 버튼이 노출되지 않는다', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const { queryByLabelText } = render(
      <SocialAuthButtons onSuccess={jest.fn()} />,
    );
    expect(queryByLabelText('Apple로 계속하기')).toBeNull();
  });
});

// ─── Apple 로그인 ─────────────────────────────────────────────────────────────
describe('REQ-SOCIAL-BUTTONS: Apple 로그인 처리', () => {
  it('Apple 로그인 성공 시 onSuccess("apple", identityToken)를 호출한다', async () => {
    mockApplePerformRequest.mockResolvedValueOnce({ identityToken: 'apple-identity-abc' });
    const onSuccess = jest.fn();

    const { getByLabelText } = render(
      <SocialAuthButtons onSuccess={onSuccess} />,
    );

    fireEvent.press(getByLabelText('Apple로 계속하기'));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith('apple', 'apple-identity-abc');
    });
  });

  it('Apple 취소 (CANCELED 에러코드) 시 onError를 호출하지 않는다', async () => {
    const cancelError = Object.assign(new Error('Canceled'), { code: APPLE_CANCELED_CODE });
    mockApplePerformRequest.mockRejectedValueOnce(cancelError);
    const onError = jest.fn();

    const { getByLabelText } = render(
      <SocialAuthButtons onSuccess={jest.fn()} onError={onError} />,
    );

    fireEvent.press(getByLabelText('Apple로 계속하기'));

    await waitFor(() => {
      expect(onError).not.toHaveBeenCalled();
    });
  });

  it('Apple 취소 시 Alert를 표시하지 않는다', async () => {
    const cancelError = Object.assign(new Error('Canceled'), { code: APPLE_CANCELED_CODE });
    mockApplePerformRequest.mockRejectedValueOnce(cancelError);

    const { getByLabelText } = render(
      <SocialAuthButtons onSuccess={jest.fn()} />,
    );

    fireEvent.press(getByLabelText('Apple로 계속하기'));

    await waitFor(() => {
      expect(mockAlertSpy).not.toHaveBeenCalled();
    });
  });

  it('Apple identityToken이 없으면 onError를 호출한다', async () => {
    mockApplePerformRequest.mockResolvedValueOnce({ identityToken: null });
    const onError = jest.fn();

    const { getByLabelText } = render(
      <SocialAuthButtons onSuccess={jest.fn()} onError={onError} />,
    );

    fireEvent.press(getByLabelText('Apple로 계속하기'));

    await waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });
  });

  it('Apple 예상치 못한 에러 시 Alert("Apple 로그인 실패")를 표시한다', async () => {
    const unexpectedError = Object.assign(new Error('Unknown'), { code: 'UNKNOWN_ERROR' });
    mockApplePerformRequest.mockRejectedValueOnce(unexpectedError);

    const { getByLabelText } = render(
      <SocialAuthButtons onSuccess={jest.fn()} />,
    );

    fireEvent.press(getByLabelText('Apple로 계속하기'));

    await waitFor(() => {
      expect(mockAlertSpy).toHaveBeenCalledWith('Apple 로그인 실패', expect.any(String));
    });
  });
});

// ─── Google 로그인 ────────────────────────────────────────────────────────────
describe('REQ-SOCIAL-BUTTONS: Google 로그인 처리', () => {
  it('Google 로그인 성공 시 onSuccess("google", idToken)를 호출한다', async () => {
    mockGoogleSignIn.mockResolvedValueOnce({ idToken: 'google-id-token-xyz' });
    const onSuccess = jest.fn();

    const { getByLabelText } = render(
      <SocialAuthButtons onSuccess={onSuccess} />,
    );

    fireEvent.press(getByLabelText('Google로 계속하기'));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith('google', 'google-id-token-xyz');
    });
  });

  it('Google 취소 (코드 12501) 시 onError를 호출하지 않는다', async () => {
    const cancelError = Object.assign(new Error('User cancelled'), { code: 12501 });
    mockGoogleSignIn.mockRejectedValueOnce(cancelError);
    const onError = jest.fn();

    const { getByLabelText } = render(
      <SocialAuthButtons onSuccess={jest.fn()} onError={onError} />,
    );

    fireEvent.press(getByLabelText('Google로 계속하기'));

    await waitFor(() => {
      expect(onError).not.toHaveBeenCalled();
    });
  });

  it('Google 취소 시 Alert를 표시하지 않는다', async () => {
    const cancelError = Object.assign(new Error('User cancelled'), { code: 12501 });
    mockGoogleSignIn.mockRejectedValueOnce(cancelError);

    const { getByLabelText } = render(
      <SocialAuthButtons onSuccess={jest.fn()} />,
    );

    fireEvent.press(getByLabelText('Google로 계속하기'));

    await waitFor(() => {
      expect(mockAlertSpy).not.toHaveBeenCalled();
    });
  });

  it('Google idToken이 없으면 onError를 호출한다', async () => {
    mockGoogleSignIn.mockResolvedValueOnce({ idToken: null });
    const onError = jest.fn();

    const { getByLabelText } = render(
      <SocialAuthButtons onSuccess={jest.fn()} onError={onError} />,
    );

    fireEvent.press(getByLabelText('Google로 계속하기'));

    await waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });
  });

  it('Google 예상치 못한 에러 시 Alert("Google 로그인 실패")를 표시한다', async () => {
    const unexpectedError = Object.assign(new Error('Play Services error'), { code: 99999 });
    mockGoogleSignIn.mockRejectedValueOnce(unexpectedError);

    const { getByLabelText } = render(
      <SocialAuthButtons onSuccess={jest.fn()} />,
    );

    fireEvent.press(getByLabelText('Google로 계속하기'));

    await waitFor(() => {
      expect(mockAlertSpy).toHaveBeenCalledWith('Google 로그인 실패', expect.any(String));
    });
  });
});
