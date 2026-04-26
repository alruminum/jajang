/**
 * revenue-cat.ts — getManagementURL() 단위 테스트
 *
 * 대상 함수: getManagementURL(): Promise<string | null>
 * 참조 impl: docs/milestones/v1/epics/epic-05-monetization/impl/05-app-settings-subscription.md
 * AC 연관: AC-04 (구독 관리 URL 조회 로직)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// react-native-purchases mock — getManagementURL 내부에서 Purchases.getCustomerInfo() 호출
vi.mock('react-native-purchases', () => ({
  default: {
    getCustomerInfo: vi.fn(),
  },
}))

import Purchases from 'react-native-purchases'
import { getManagementURL } from '@services/revenue-cat'

const mockGetCustomerInfo = vi.mocked(Purchases.getCustomerInfo)

describe('getManagementURL — RevenueCat 구독 관리 URL 조회', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── 정상 흐름 ──────────────────────────────────────────────────────────────

  it('iOS: itms-apps:// 구독 관리 URL 반환', async () => {
    const url =
      'itms-apps://buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/manageSubscriptions'
    mockGetCustomerInfo.mockResolvedValue({ managementURL: url } as any)

    const result = await getManagementURL()

    expect(result).toBe(url)
  })

  it('Android: Google Play 구독 관리 URL 반환', async () => {
    const url =
      'https://play.google.com/store/account/subscriptions?package=com.jajang'
    mockGetCustomerInfo.mockResolvedValue({ managementURL: url } as any)

    const result = await getManagementURL()

    expect(result).toBe(url)
  })

  // ─── 엣지 케이스 ────────────────────────────────────────────────────────────

  it('managementURL이 null인 경우 null 반환 (구독 없는 유저)', async () => {
    mockGetCustomerInfo.mockResolvedValue({ managementURL: null } as any)

    const result = await getManagementURL()

    expect(result).toBeNull()
  })

  it('managementURL이 undefined인 경우 null 반환 (?? null 연산자 처리)', async () => {
    mockGetCustomerInfo.mockResolvedValue({ managementURL: undefined } as any)

    const result = await getManagementURL()

    expect(result).toBeNull()
  })

  // ─── 에러 처리 ──────────────────────────────────────────────────────────────

  it('Purchases.getCustomerInfo() 예외 발생 시 null 반환 (크래시 방지)', async () => {
    mockGetCustomerInfo.mockRejectedValue(new Error('Network error'))

    const result = await getManagementURL()

    expect(result).toBeNull()
  })
})
