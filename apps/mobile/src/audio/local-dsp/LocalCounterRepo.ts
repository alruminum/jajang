// apps/mobile/src/audio/local-dsp/LocalCounterRepo.ts
// Device-local free-tier generation counter backed by AsyncStorage.

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'jajang:local-dsp-counter';
const DEFAULT_LIMIT = 3;

export interface CounterState {
  count: number;
  limit: number;
}

/** Thrown when count >= limit and caller attempts to increment. */
export class FreeLimitReachedError extends Error {
  constructor(count: number, limit: number) {
    super(`Free limit reached: count=${count}, limit=${limit}`);
    this.name = 'FreeLimitReachedError';
  }
}

export class LocalCounterRepo {
  /** Read current counter state. Missing key → { count: 0, limit: DEFAULT_LIMIT }. Negative count clamped to 0. */
  async peek(): Promise<CounterState> {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return { count: 0, limit: DEFAULT_LIMIT };
    }
    try {
      const parsed = JSON.parse(raw) as { count: number; limit: number };
      return {
        count: Math.max(0, parsed.count),
        limit: parsed.limit ?? DEFAULT_LIMIT,
      };
    } catch {
      return { count: 0, limit: DEFAULT_LIMIT };
    }
  }

  /**
   * Increment count by 1.
   * Throws FreeLimitReachedError if count >= limit before incrementing.
   * Atomic read-modify-write within a single AsyncStorage.setItem call.
   */
  async increment(): Promise<void> {
    const { count, limit } = await this.peek();
    if (count >= limit) {
      throw new FreeLimitReachedError(count, limit);
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ count: count + 1, limit }));
  }

  /** Reset count to 0 (used for subscription / restore-purchase flow). */
  async reset(): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ count: 0, limit: DEFAULT_LIMIT }));
  }
}
