import { api } from './api';

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  entitlement: 'free' | 'trial' | 'premium';
  user_id: string;
}

export async function emailSignup(email: string, password: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/signup/email', { email, password });
  return data;
}

export async function emailLogin(email: string, password: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/login/email', { email, password });
  return data;
}

export async function socialAuth(
  provider: 'apple' | 'google',
  idToken: string,
): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/social', {
    provider,
    id_token: idToken,
  });
  return data;
}

/**
 * 계정 탈퇴 — 서버에서 모든 유저 데이터 삭제.
 * DELETE /me
 */
export async function deleteAccountAPI(): Promise<void> {
  await api.delete('/me');
}

/**
 * 목소리 샘플 삭제 — 녹음된 목소리 학습 데이터 전체 삭제.
 * DELETE /me/voice-samples
 */
export async function deleteVoiceSamplesAPI(): Promise<void> {
  await api.delete('/me/voice-samples');
}
