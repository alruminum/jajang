import axios, { AxiosError, AxiosInstance } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { sessionEvents, SESSION_EXPIRED_EVENT } from '@lib/session-events';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:8000';

export const api: AxiosInstance = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

// Request 인터셉터: access_token 자동 주입
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response 인터셉터: 401 시 refresh 시도
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = await SecureStore.getItemAsync('refresh_token');
        if (!refreshToken) throw new Error('no refresh token');

        const { data } = await api.post('/auth/refresh', { refresh_token: refreshToken });
        await SecureStore.setItemAsync('access_token', data.access_token);
        await SecureStore.setItemAsync('refresh_token', data.refresh_token);

        originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
        return api(originalRequest);
      } catch {
        await SecureStore.deleteItemAsync('access_token');
        await SecureStore.deleteItemAsync('refresh_token');
        sessionEvents.emit(SESSION_EXPIRED_EVENT);  // 이벤트 발행 → SessionExpiredListener
        throw error;
      }
    }
    throw error;
  },
);
