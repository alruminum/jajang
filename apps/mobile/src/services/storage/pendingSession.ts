// apps/mobile/src/services/storage/pendingSession.ts
// SecureStore wrapper — pending session_id 단일 저장/조회/클리어
// impl/07 §3

import * as SecureStore from 'expo-secure-store';

const KEY = 'pendingSessionId';

export const savePendingSession = (id: string): Promise<void> =>
  SecureStore.setItemAsync(KEY, id);

export const loadPendingSession = (): Promise<string | null> =>
  SecureStore.getItemAsync(KEY);

export const clearPendingSession = (): Promise<void> =>
  SecureStore.deleteItemAsync(KEY);
