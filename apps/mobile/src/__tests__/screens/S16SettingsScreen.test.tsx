/**
 * S16SettingsScreen 컴포넌트 통합 테스트
 *
 * 참조 impl: docs/milestones/v1/epics/epic-05-monetization/impl/05-app-settings-subscription.md
 * 커버 AC: AC-01 ~ AC-11 (전체)
 *
 * FIXME: showConfirmDialog / showToast의 실제 import 경로가 아래 경로와 다를 경우
 *        vi.mock 경로 및 import 경로를 실제 파일 위치에 맞게 수정 필요.
 *        현재 가정: @utils/dialog, @utils/toast
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react-native'

// ──────────────────────────────────────────────────────────────────────────────
// 모듈 Mocks (vi.mock은 호이스팅 — import 전 선언)
// ──────────────────────────────────────────────────────────────────────────────

vi.mock('@store', () => ({
  useAuthStore: vi.fn(),
}))

vi.mock('@services/revenue-cat', () => ({
  getManagementURL: vi.fn(),
  revenueCatLogout: vi.fn(),
}))

vi.mock('@services/auth-api', () => ({
  deleteAccountAPI: vi.fn(),
}))

vi.mock('@services/tracks-api', () => ({
  deleteVoiceSamplesAPI: vi.fn(),
  deleteAllTracksAPI: vi.fn(),
}))

// react-native is mocked globally in setup.ts (Linking, Platform, Alert, etc.)
// Do not re-mock here with importOriginal() — it triggers Flow syntax errors.

// FIXME: 실제 import 경로 확인 필요
vi.mock('@utils/dialog', () => ({
  showConfirmDialog: vi.fn(),
}))

vi.mock('@utils/toast', () => ({
  showToast: vi.fn(),
}))

// ──────────────────────────────────────────────────────────────────────────────
// Imports (mock 선언 이후)
// ──────────────────────────────────────────────────────────────────────────────

import { useAuthStore } from '@store'
import { getManagementURL, revenueCatLogout } from '@services/revenue-cat'
import { deleteAccountAPI } from '@services/auth-api'
import { deleteVoiceSamplesAPI, deleteAllTracksAPI } from '@services/tracks-api'
import { Linking } from 'react-native'
import { showConfirmDialog } from '@utils/dialog'
import { showToast } from '@utils/toast'
import S16SettingsScreen from '@screens/S16SettingsScreen'

// ──────────────────────────────────────────────────────────────────────────────
// 테스트 헬퍼
// ──────────────────────────────────────────────────────────────────────────────

const mockNavigation = {
  navigate: vi.fn(),
  goBack: vi.fn(),
}

const mockClearSession = vi.fn()

function setupAuthStore(overrides: {
  entitlement?: 'premium' | 'trial' | 'free'
  trialExpiresAt?: string | null
  email?: string
} = {}) {
  const state = {
    entitlement: 'free' as const,
    trialExpiresAt: null as string | null,
    email: 'test@example.com',
    ...overrides,
  }
  vi.mocked(useAuthStore).mockReturnValue(state as any)
  ;(useAuthStore as any).getState = vi.fn().mockReturnValue({
    ...state,
    clearSession: mockClearSession,
  })
}

function renderScreen() {
  return render(<S16SettingsScreen navigation={mockNavigation as any} />)
}

/** trialExpiresAt: 지금으로부터 daysLeft일 후 (5초 버퍼 포함) */
function trialExpiry(daysLeft: number): string {
  return new Date(
    Date.now() + daysLeft * 24 * 60 * 60 * 1000 + 5_000
  ).toISOString()
}

// ──────────────────────────────────────────────────────────────────────────────
// 전역 beforeEach — 안전한 기본값
// ──────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  // showConfirmDialog 기본: 취소 (의도치 않은 부수효과 방지)
  vi.mocked(showConfirmDialog).mockResolvedValue(false)
  // API 기본: 성공
  vi.mocked(revenueCatLogout).mockResolvedValue(undefined)
  vi.mocked(deleteAccountAPI).mockResolvedValue(undefined)
  vi.mocked(deleteVoiceSamplesAPI).mockResolvedValue(undefined)
  vi.mocked(deleteAllTracksAPI).mockResolvedValue(undefined)
  vi.mocked(getManagementURL).mockResolvedValue('https://example.com/manage')
})

// ──────────────────────────────────────────────────────────────────────────────
// AC-01: Premium 유저 진입
// ──────────────────────────────────────────────────────────────────────────────

describe('AC-01 — Premium 유저 진입', () => {
  beforeEach(() => setupAuthStore({ entitlement: 'premium' }))

  it('"Premium" 배지 노출', () => {
    const { getByText } = renderScreen()
    expect(getByText('Premium')).toBeTruthy()
  })

  it('"구독 관리" 항목 노출', () => {
    const { getByText } = renderScreen()
    expect(getByText('구독 관리')).toBeTruthy()
  })

  it('"플랜 업그레이드" 항목 미노출', () => {
    const { queryByText } = renderScreen()
    expect(queryByText('플랜 업그레이드')).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// AC-02: Trial 유저 진입 (D-3)
// ──────────────────────────────────────────────────────────────────────────────

describe('AC-02 — Trial 유저 진입 (D-3)', () => {
  beforeEach(() =>
    setupAuthStore({ entitlement: 'trial', trialExpiresAt: trialExpiry(3) })
  )

  it('"D-3" 배지 노출', () => {
    const { getByText } = renderScreen()
    expect(getByText('D-3')).toBeTruthy()
  })

  it('"플랜 업그레이드" 항목 노출', () => {
    const { getByText } = renderScreen()
    expect(getByText('플랜 업그레이드')).toBeTruthy()
  })

  it('"구독 관리" 항목 노출 (trial !== free 조건 충족)', () => {
    // impl 의사코드: {entitlement !== 'free' && <구독 관리>}
    // trial 유저도 해당 조건 통과
    const { getByText } = renderScreen()
    expect(getByText('구독 관리')).toBeTruthy()
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// AC-03: 무료 유저 진입
// ──────────────────────────────────────────────────────────────────────────────

describe('AC-03 — 무료 유저 진입', () => {
  beforeEach(() => setupAuthStore({ entitlement: 'free' }))

  it('배지 미노출 ("Premium" 없음)', () => {
    const { queryByText } = renderScreen()
    expect(queryByText('Premium')).toBeNull()
  })

  it('"플랜 업그레이드" 항목 노출', () => {
    const { getByText } = renderScreen()
    expect(getByText('플랜 업그레이드')).toBeTruthy()
  })

  it('"구독 관리" 항목 미노출', () => {
    const { queryByText } = renderScreen()
    expect(queryByText('구독 관리')).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// 계정 헤더 — 이메일 표시
// ──────────────────────────────────────────────────────────────────────────────

describe('계정 헤더 — 이메일 표시', () => {
  it('로그인된 이메일 주소 렌더링', () => {
    setupAuthStore({ email: 'hello@jajang.com', entitlement: 'free' })
    const { getByText } = renderScreen()
    expect(getByText('hello@jajang.com')).toBeTruthy()
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// AC-04: 구독 관리 탭 (Premium 유저)
// ──────────────────────────────────────────────────────────────────────────────

describe('AC-04 — 구독 관리 탭', () => {
  beforeEach(() => setupAuthStore({ entitlement: 'premium' }))

  it('managementURL 있을 때 Linking.openURL 호출', async () => {
    const url = 'itms-apps://subscriptions'
    vi.mocked(getManagementURL).mockResolvedValue(url)

    const { getByText } = renderScreen()
    fireEvent.press(getByText('구독 관리'))

    await waitFor(() => {
      expect(Linking.openURL).toHaveBeenCalledWith(url)
    })
  })

  it('managementURL이 null이면 토스트 "관리할 구독이 없어요", openURL 미호출', async () => {
    vi.mocked(getManagementURL).mockResolvedValue(null)

    const { getByText } = renderScreen()
    fireEvent.press(getByText('구독 관리'))

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('관리할 구독이 없어요')
      expect(Linking.openURL).not.toHaveBeenCalled()
    })
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// AC-05: 플랜 업그레이드 탭
// ──────────────────────────────────────────────────────────────────────────────

describe('AC-05 — 플랜 업그레이드 탭', () => {
  it('free 유저: Subscribe 화면 이동 (source=settings)', () => {
    setupAuthStore({ entitlement: 'free' })
    const { getByText } = renderScreen()
    fireEvent.press(getByText('플랜 업그레이드'))
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Subscribe', { source: 'settings' })
  })

  it('trial 유저: Subscribe 화면 이동 (source=settings)', () => {
    setupAuthStore({ entitlement: 'trial', trialExpiresAt: trialExpiry(7) })
    const { getByText } = renderScreen()
    fireEvent.press(getByText('플랜 업그레이드'))
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Subscribe', { source: 'settings' })
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// AC-06: 알림 설정 탭
// ──────────────────────────────────────────────────────────────────────────────

describe('AC-06 — 알림 설정 탭', () => {
  it('Linking.openSettings() 호출', () => {
    setupAuthStore({ entitlement: 'free' })
    const { getByText } = renderScreen()
    fireEvent.press(getByText('알림 설정'))
    expect(Linking.openSettings).toHaveBeenCalled()
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// AC-07: 목소리 샘플 삭제
// ──────────────────────────────────────────────────────────────────────────────

describe('AC-07 — 목소리 샘플 삭제', () => {
  beforeEach(() => setupAuthStore({ entitlement: 'free' }))

  it('확인 후 deleteVoiceSamplesAPI 호출 및 성공 토스트 "삭제했어요"', async () => {
    vi.mocked(showConfirmDialog).mockResolvedValue(true)

    const { getByText } = renderScreen()
    fireEvent.press(getByText('목소리 샘플 삭제'))

    await waitFor(() => {
      expect(deleteVoiceSamplesAPI).toHaveBeenCalledOnce()
      expect(showToast).toHaveBeenCalledWith('삭제했어요')
    })
  })

  it('취소 시 API 미호출', async () => {
    vi.mocked(showConfirmDialog).mockResolvedValue(false)

    const { getByText } = renderScreen()
    fireEvent.press(getByText('목소리 샘플 삭제'))

    await waitFor(() => {
      expect(deleteVoiceSamplesAPI).not.toHaveBeenCalled()
    })
  })

  it('API 실패 시 에러 토스트 "삭제에 실패했어요"', async () => {
    vi.mocked(showConfirmDialog).mockResolvedValue(true)
    vi.mocked(deleteVoiceSamplesAPI).mockRejectedValue(new Error('API error'))

    const { getByText } = renderScreen()
    fireEvent.press(getByText('목소리 샘플 삭제'))

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('삭제에 실패했어요')
    })
  })

  it('voice 삭제 중 다른 항목 (생성 음원 삭제, 계정 탈퇴) 여전히 렌더링됨', async () => {
    // impl: isDeleting==='voice'일 때 해당 항목만 비활성, 나머지는 정상 조작 가능
    let resolveDelete!: () => void
    const pending = new Promise<void>((res) => {
      resolveDelete = res
    })
    vi.mocked(showConfirmDialog).mockResolvedValue(true)
    vi.mocked(deleteVoiceSamplesAPI).mockReturnValue(pending)

    const { getByText } = renderScreen()
    fireEvent.press(getByText('목소리 샘플 삭제'))

    await waitFor(() => {
      expect(getByText('생성 음원 삭제')).toBeTruthy()
      expect(getByText('계정 탈퇴')).toBeTruthy()
    })

    resolveDelete()
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// AC-08: 생성 음원 전체 삭제
// ──────────────────────────────────────────────────────────────────────────────

describe('AC-08 — 생성 음원 전체 삭제', () => {
  beforeEach(() => setupAuthStore({ entitlement: 'free' }))

  it('확인 후 deleteAllTracksAPI 호출 및 성공 토스트', async () => {
    vi.mocked(showConfirmDialog).mockResolvedValue(true)

    const { getByText } = renderScreen()
    fireEvent.press(getByText('생성 음원 삭제'))

    await waitFor(() => {
      expect(deleteAllTracksAPI).toHaveBeenCalledOnce()
      expect(showToast).toHaveBeenCalledWith('삭제했어요')
    })
  })

  it('취소 시 API 미호출', async () => {
    vi.mocked(showConfirmDialog).mockResolvedValue(false)

    const { getByText } = renderScreen()
    fireEvent.press(getByText('생성 음원 삭제'))

    await waitFor(() => {
      expect(deleteAllTracksAPI).not.toHaveBeenCalled()
    })
  })

  it('API 실패 시 에러 토스트 "삭제에 실패했어요"', async () => {
    vi.mocked(showConfirmDialog).mockResolvedValue(true)
    vi.mocked(deleteAllTracksAPI).mockRejectedValue(new Error('Server error'))

    const { getByText } = renderScreen()
    fireEvent.press(getByText('생성 음원 삭제'))

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('삭제에 실패했어요')
    })
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// AC-09: 계정 탈퇴 (2단계 확인)
// ──────────────────────────────────────────────────────────────────────────────

describe('AC-09 — 계정 탈퇴 (2단계 확인)', () => {
  beforeEach(() => setupAuthStore({ entitlement: 'free' }))

  it('2단계 확인 → deleteAccountAPI + revenueCatLogout + clearSession + Login 이동', async () => {
    vi.mocked(showConfirmDialog)
      .mockResolvedValueOnce(true) // 1단계: 계정 탈퇴할까요?
      .mockResolvedValueOnce(true) // 2단계: 정말 삭제할까요?

    const { getByText } = renderScreen()
    fireEvent.press(getByText('계정 탈퇴'))

    await waitFor(() => {
      expect(deleteAccountAPI).toHaveBeenCalledOnce()
      expect(revenueCatLogout).toHaveBeenCalledOnce()
      expect(mockClearSession).toHaveBeenCalledOnce()
      expect(mockNavigation.navigate).toHaveBeenCalledWith('Login')
    })
  })

  it('1단계 취소 시 API 미호출, 화면 이동 없음', async () => {
    vi.mocked(showConfirmDialog).mockResolvedValueOnce(false)

    const { getByText } = renderScreen()
    fireEvent.press(getByText('계정 탈퇴'))

    await waitFor(() => {
      expect(deleteAccountAPI).not.toHaveBeenCalled()
      expect(mockNavigation.navigate).not.toHaveBeenCalled()
    })
  })

  it('2단계 취소 시 API 미호출', async () => {
    vi.mocked(showConfirmDialog)
      .mockResolvedValueOnce(true)  // 1단계 확인
      .mockResolvedValueOnce(false) // 2단계 취소

    const { getByText } = renderScreen()
    fireEvent.press(getByText('계정 탈퇴'))

    await waitFor(() => {
      expect(deleteAccountAPI).not.toHaveBeenCalled()
    })
  })

  it('deleteAccountAPI 실패 시 에러 토스트, Login 이동 없음', async () => {
    vi.mocked(showConfirmDialog)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
    vi.mocked(deleteAccountAPI).mockRejectedValue(new Error('서버 오류'))

    const { getByText } = renderScreen()
    fireEvent.press(getByText('계정 탈퇴'))

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('탈퇴 처리에 실패했어요')
      expect(mockNavigation.navigate).not.toHaveBeenCalled()
    })
  })

  it('revenueCatLogout이 clearSession보다 먼저 호출됨 (순서 보장)', async () => {
    // impl 설계 결정: RevenueCat → 앱 세션 순서. 역순이면 이전 유저 상태 남음.
    vi.mocked(showConfirmDialog)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)

    const callOrder: string[] = []
    vi.mocked(revenueCatLogout).mockImplementation(async () => {
      callOrder.push('revenueCat')
    })
    mockClearSession.mockImplementation(() => {
      callOrder.push('clearSession')
    })

    const { getByText } = renderScreen()
    fireEvent.press(getByText('계정 탈퇴'))

    await waitFor(() => {
      expect(callOrder).toEqual(['revenueCat', 'clearSession'])
    })
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// AC-10: 로그아웃
// ──────────────────────────────────────────────────────────────────────────────

describe('AC-10 — 로그아웃', () => {
  beforeEach(() => setupAuthStore({ entitlement: 'premium' }))

  it('확인 후 revenueCatLogout + clearSession + Login 이동', async () => {
    vi.mocked(showConfirmDialog).mockResolvedValue(true)

    const { getByText } = renderScreen()
    fireEvent.press(getByText('로그아웃'))

    await waitFor(() => {
      expect(revenueCatLogout).toHaveBeenCalledOnce()
      expect(mockClearSession).toHaveBeenCalledOnce()
      expect(mockNavigation.navigate).toHaveBeenCalledWith('Login')
    })
  })

  it('취소 시 revenueCatLogout 미호출, Login 이동 없음', async () => {
    vi.mocked(showConfirmDialog).mockResolvedValue(false)

    const { getByText } = renderScreen()
    fireEvent.press(getByText('로그아웃'))

    await waitFor(() => {
      expect(revenueCatLogout).not.toHaveBeenCalled()
      expect(mockNavigation.navigate).not.toHaveBeenCalled()
    })
  })

  it('revenueCatLogout이 clearSession보다 먼저 호출됨 (순서 보장)', async () => {
    vi.mocked(showConfirmDialog).mockResolvedValue(true)

    const callOrder: string[] = []
    vi.mocked(revenueCatLogout).mockImplementation(async () => {
      callOrder.push('revenueCat')
    })
    mockClearSession.mockImplementation(() => {
      callOrder.push('clearSession')
    })

    const { getByText } = renderScreen()
    fireEvent.press(getByText('로그아웃'))

    await waitFor(() => {
      expect(callOrder).toEqual(['revenueCat', 'clearSession'])
    })
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// AC-11: 법적 링크 (개인정보처리방침 / 이용약관)
// ──────────────────────────────────────────────────────────────────────────────

describe('AC-11 — 개인정보처리방침 / 이용약관', () => {
  beforeEach(() => setupAuthStore({ entitlement: 'free' }))

  it('개인정보처리방침 탭 → Linking.openURL 호출', () => {
    const { getByText } = renderScreen()
    fireEvent.press(getByText('개인정보처리방침'))
    expect(Linking.openURL).toHaveBeenCalledWith(expect.any(String))
  })

  it('이용약관 탭 → Linking.openURL 호출', () => {
    const { getByText } = renderScreen()
    fireEvent.press(getByText('이용약관'))
    expect(Linking.openURL).toHaveBeenCalledWith(expect.any(String))
  })

  it('개인정보처리방침과 이용약관은 서로 다른 URL', () => {
    const { getByText } = renderScreen()

    fireEvent.press(getByText('개인정보처리방침'))
    const privacyURL = vi.mocked(Linking.openURL).mock.calls[0][0]

    vi.mocked(Linking.openURL).mockClear()

    fireEvent.press(getByText('이용약관'))
    const termsURL = vi.mocked(Linking.openURL).mock.calls[0][0]

    expect(privacyURL).not.toBe(termsURL)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// 엣지 케이스: Trial 배지 D-N 계산 (Math.ceil 경계값)
// ──────────────────────────────────────────────────────────────────────────────

describe('Trial 배지 D-N 계산 — 경계값', () => {
  it('만료 1일 전: "D-1" 배지', () => {
    setupAuthStore({ entitlement: 'trial', trialExpiresAt: trialExpiry(1) })
    const { getByText } = renderScreen()
    expect(getByText('D-1')).toBeTruthy()
  })

  it('만료 7일 전: "D-7" 배지', () => {
    setupAuthStore({ entitlement: 'trial', trialExpiresAt: trialExpiry(7) })
    const { getByText } = renderScreen()
    expect(getByText('D-7')).toBeTruthy()
  })

  it('만료 14일 전: "D-14" 배지', () => {
    setupAuthStore({ entitlement: 'trial', trialExpiresAt: trialExpiry(14) })
    const { getByText } = renderScreen()
    expect(getByText('D-14')).toBeTruthy()
  })
})
