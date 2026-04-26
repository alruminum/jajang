// apps/mobile/src/services/accountApi.ts
// Epic 06 — 계정 탈퇴 API 래퍼

import { api } from './api'

// ─── 타입 정의 ────────────────────────────────────────────────────────────────

export interface AccountDeletionError {
  code: 'ACTIVE_SUBSCRIPTION'
  message: string
  subscriptionPlatform: 'ios' | 'android'
}

// ─── 에러 클래스 ──────────────────────────────────────────────────────────────

export class ActiveSubscriptionError extends Error {
  constructor(public detail: AccountDeletionError) {
    super(detail.message)
    this.name = 'ActiveSubscriptionError'
  }
}

// ─── API 함수 ─────────────────────────────────────────────────────────────────

/**
 * 계정 탈퇴 — DELETE /users/me
 *
 * 성공: void (서버 202 응답)
 * 실패 422 ACTIVE_SUBSCRIPTION: ActiveSubscriptionError throw
 * 기타 오류: 원본 에러 re-throw
 */
export async function deleteMyAccount(): Promise<void> {
  try {
    await api.delete('/users/me')
  } catch (err: any) {
    if (err?.response?.status === 422) {
      const detail = err.response.data?.detail as AccountDeletionError
      if (detail?.code === 'ACTIVE_SUBSCRIPTION') {
        throw new ActiveSubscriptionError(detail)
      }
    }
    throw err
  }
}
