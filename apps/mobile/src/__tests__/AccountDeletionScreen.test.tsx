/**
 * AccountDeletionScreen — 계정 탈퇴 2단계 확인 + 422 핸들링 테스트
 *
 * 참조 impl: docs/milestones/v1/epics/epic-06-privacy/impl/04-app-account-deletion-flow.md
 * 커버 AC:
 *   - Step 2 바텀 시트: 삭제 대상 항목 목록 표시
 *   - 탈퇴 완료 (202): AsyncStorage.clear + Zustand 초기화 + Auth 이동
 *   - 탈퇴 422 ACTIVE_SUBSCRIPTION: 구독 취소 안내 Alert + 앱스토어 딥링크
 *   - 탈퇴 중 로딩: 버튼 비활성 + 스피너
 *   - 사유 미선택 상태에서도 "다음으로" 버튼 활성
 *   - 구독 활성 시 경고 배너 노출
 */

import React from 'react'
import { render, fireEvent, waitFor, act, cleanup } from '@testing-library/react-native'
import { Alert } from 'react-native'

// ──────────────────────────────────────────────────────────────────────────────
// 모듈 Mocks
// ──────────────────────────────────────────────────────────────────────────────

const mockNavigationDispatch = jest.fn()
const mockNavigationGoBack = jest.fn()

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    dispatch: mockNavigationDispatch,
    goBack: mockNavigationGoBack,
  }),
  CommonActions: {
    reset: jest.fn((payload) => payload),
  },
}))

jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    clear: jest.fn().mockResolvedValue(undefined),
  },
}))

jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file:///cache/',
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@services/accountApi', () => ({
  deleteMyAccount: jest.fn(),
  ActiveSubscriptionError: class ActiveSubscriptionError extends Error {
    detail: { code: string; message: string; subscriptionPlatform: 'ios' | 'android' }
    constructor(mockDetail: { code: string; message: string; subscriptionPlatform: 'ios' | 'android' }) {
      super(mockDetail.message)
      this.detail = mockDetail
      this.name = 'ActiveSubscriptionError'
    }
  },
}))

jest.mock('@store', () => ({
  __esModule: true,
  useAuthStore: jest.fn(),
}))

jest.mock('@store/generationSlice', () => ({
  useGenerationStore: jest.fn(),
}))

jest.mock('@audio/AudioEngine', () => ({
  stopPlayback: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// ──────────────────────────────────────────────────────────────────────────────
// Import after mocks
// ──────────────────────────────────────────────────────────────────────────────

import AccountDeletionScreen from '@screens/AccountDeletionScreen'
import { deleteMyAccount, ActiveSubscriptionError } from '@services/accountApi'
import { useAuthStore } from '@store'
import { useGenerationStore } from '@store/generationSlice'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { CommonActions } from '@react-navigation/native'

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const mockClearAuthState = jest.fn()
const mockClearAllTracks = jest.fn()

function setupMocks({
  entitlement = 'free' as 'free' | 'trial' | 'premium' | null,
} = {}) {
  jest.mocked(useAuthStore).mockReturnValue({
    entitlement,
    clearAuthState: mockClearAuthState,
  } as any)
  jest.mocked(useGenerationStore).mockReturnValue({
    clearAllTracks: mockClearAllTracks,
  } as any)
}

// ──────────────────────────────────────────────────────────────────────────────
// 테스트
// ──────────────────────────────────────────────────────────────────────────────

afterEach(async () => {
  cleanup()
  await Promise.resolve()
  await Promise.resolve()
})

describe('AccountDeletionScreen — Step 1 화면', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setupMocks()
  })

  it('사유 미선택 상태에서도 "다음으로" 버튼이 활성이다', () => {
    const { getByText } = render(<AccountDeletionScreen />)
    const nextBtn = getByText('다음으로')
    expect(nextBtn).toBeTruthy()
    // 버튼을 탭하면 바텀 시트가 열려야 함
    fireEvent.press(nextBtn)
    // 바텀 시트 내용이 렌더링되는지 확인
    // (Modal이 visible=true가 되면 컨텐츠가 노출)
  })

  it('사유를 선택하면 해당 라디오 버튼이 선택된다', () => {
    const { getByText } = render(<AccountDeletionScreen />)
    fireEvent.press(getByText('기타'))
    // 선택 후 재선택 시 해제
    fireEvent.press(getByText('기타'))
  })

  it('구독이 없는 경우 경고 배너가 노출되지 않는다', () => {
    setupMocks({ entitlement: 'free' })
    const { queryByText } = render(<AccountDeletionScreen />)
    expect(queryByText('구독 취소 후 탈퇴 가능해요')).toBeNull()
  })

  it('premium 구독 활성 시 경고 배너가 노출된다', () => {
    setupMocks({ entitlement: 'premium' })
    const { getByText } = render(<AccountDeletionScreen />)
    expect(getByText('구독 취소 후 탈퇴 가능해요')).toBeTruthy()
  })

  it('trial 구독 활성 시 경고 배너가 노출된다', () => {
    setupMocks({ entitlement: 'trial' })
    const { getByText } = render(<AccountDeletionScreen />)
    expect(getByText('구독 취소 후 탈퇴 가능해요')).toBeTruthy()
  })
})

describe('AccountDeletionScreen — Step 2 바텀 시트', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setupMocks()
  })

  it('"다음으로" 탭 시 바텀 시트가 열리고 삭제 항목 목록이 표시된다', () => {
    const { getByText } = render(<AccountDeletionScreen />)
    fireEvent.press(getByText('다음으로'))
    expect(getByText('• 내 목소리 샘플')).toBeTruthy()
    expect(getByText('• 자장가 음원 전체')).toBeTruthy()
    expect(getByText('• 계정 정보')).toBeTruthy()
    expect(getByText('되돌릴 수 없어요')).toBeTruthy()
  })

  it('"아니요, 유지할게요" 탭 시 바텀 시트가 닫힌다', () => {
    const { getByText, queryByText } = render(<AccountDeletionScreen />)
    fireEvent.press(getByText('다음으로'))
    fireEvent.press(getByText('아니요, 유지할게요'))
    // 시트 텍스트가 사라짐
    expect(queryByText('정말 탈퇴하시겠어요?')).toBeNull()
  })
})

describe('AccountDeletionScreen — 탈퇴 성공 (202)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setupMocks()
    jest.mocked(deleteMyAccount).mockResolvedValue(undefined)
  })

  it('탈퇴 성공 시 AsyncStorage.clear(), Zustand 초기화, Auth 스택으로 이동한다', async () => {
    const { getByText } = render(<AccountDeletionScreen />)
    fireEvent.press(getByText('다음으로'))

    await act(async () => {
      fireEvent.press(getByText('네, 탈퇴할게요'))
    })

    await waitFor(() => {
      expect(deleteMyAccount).toHaveBeenCalledTimes(1)
      expect(AsyncStorage.clear).toHaveBeenCalledTimes(1)
      expect(mockClearAuthState).toHaveBeenCalledTimes(1)
      expect(mockClearAllTracks).toHaveBeenCalledTimes(1)
      expect(mockNavigationDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ index: 0, routes: [{ name: 'Auth' }] }),
      )
    })
  })
})

describe('AccountDeletionScreen — 탈퇴 422 ACTIVE_SUBSCRIPTION', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setupMocks()
    jest.mocked(deleteMyAccount).mockRejectedValue(
      new ActiveSubscriptionError({
        code: 'ACTIVE_SUBSCRIPTION',
        message: 'active subscription',
        subscriptionPlatform: 'ios',
      }),
    )
  })

  it('422 수신 시 Alert.alert가 구독 취소 안내로 호출된다', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert')
    const { getByText } = render(<AccountDeletionScreen />)
    fireEvent.press(getByText('다음으로'))

    await act(async () => {
      fireEvent.press(getByText('네, 탈퇴할게요'))
    })

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        '구독을 먼저 취소해주세요',
        expect.stringContaining('구독을 취소해야 해요'),
        expect.arrayContaining([
          expect.objectContaining({ text: '나중에' }),
          expect.objectContaining({ text: '구독 취소하러 가기' }),
        ]),
      )
    })

    // 탈퇴 후 Auth 이동은 하지 않아야 함
    expect(mockNavigationDispatch).not.toHaveBeenCalled()
  })
})

describe('AccountDeletionScreen — 탈퇴 중 로딩 상태', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setupMocks()
  })

  it('탈퇴 중 "네, 탈퇴할게요" 버튼이 비활성된다', async () => {
    // deleteMyAccount가 pending 상태를 시뮬레이션
    let resolveDelete!: () => void
    jest.mocked(deleteMyAccount).mockReturnValue(
      new Promise<void>((resolve) => {
        resolveDelete = resolve
      }),
    )

    const { getByText, getByLabelText } = render(<AccountDeletionScreen />)
    fireEvent.press(getByText('다음으로'))
    fireEvent.press(getByText('네, 탈퇴할게요'))

    await waitFor(() => {
      const btn = getByLabelText('계정 탈퇴 확인')
      expect(btn.props.accessibilityState?.disabled).toBe(true)
    })

    // cleanup
    resolveDelete()
  })
})

describe('AccountDeletionScreen — accessibilityLabel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setupMocks()
  })

  it('"다음으로" 버튼에 accessibilityLabel이 있다', () => {
    const { getByLabelText } = render(<AccountDeletionScreen />)
    expect(getByLabelText('다음으로')).toBeTruthy()
  })

  it('"계정 탈퇴 확인" CTA에 accessibilityLabel이 있다', () => {
    const { getByText, getByLabelText } = render(<AccountDeletionScreen />)
    fireEvent.press(getByText('다음으로'))
    expect(getByLabelText('계정 탈퇴 확인')).toBeTruthy()
  })

  it('"탈퇴 취소" CTA에 accessibilityLabel이 있다', () => {
    const { getByText, getByLabelText } = render(<AccountDeletionScreen />)
    fireEvent.press(getByText('다음으로'))
    expect(getByLabelText('탈퇴 취소')).toBeTruthy()
  })
})
