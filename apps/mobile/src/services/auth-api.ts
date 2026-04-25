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
