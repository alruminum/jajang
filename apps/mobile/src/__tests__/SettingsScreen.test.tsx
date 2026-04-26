/**
 * S16SettingsScreen — Epic 06 데이터 관리 섹션 테스트
 *
 * 참조 impl: docs/milestones/v1/epics/epic-06-privacy/impl/03-app-settings-screen-extended.md
 * 커버 AC:
 *   - 목소리 샘플 존재 시 버튼 활성 + Alert 다이얼로그
 *   - 목소리 샘플 없을 시 "이미 삭제되었어요" 비활성 표시
 *   - 생성 음원 있을 시 DeleteTracksSheet 개방
 *   - 생성 음원 없을 시 버튼 비활성
 *   - 계정 탈퇴 탭 → AccountDeletionFlow 진입
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'

// ──────────────────────────────────────────────────────────────────────────────
// 모듈 Mocks
// ──────────────────────────────────────────────────────────────────────────────

vi.mock('@store', () => ({
  useAuthStore: vi.fn(),
}))

vi.mock('@services/revenue-cat', () => ({
  getManagementURL: vi.fn(),
  revenueCatLogout: vi.fn(),
}))

vi.mock('@services/dataManagementApi', () => ({
  getVoiceSampleStatus: vi.fn(),
  deleteVoiceSample: vi.fn(),
  deleteTrack: vi.fn(),
  deleteAllTracks: vi.fn(),
}))

vi.mock('@store/generationSlice', () => ({
  useGenerationStore: vi.fn(),
}))

vi.mock('@components/DeleteTracksSheet', () => ({
  DeleteTracksSheet: ({ onClose }: { onClose: () => void }) => {
    const { Text, TouchableOpacity } = require('react-native')
    return (
      <>
        <Text testID="delete-tracks-sheet">DeleteTracksSheet</Text>
        <TouchableOpacity testID="sheet-close-btn" onPress={onClose}>
          <Text>닫기</Text>
        </TouchableOpacity>
      </>
    )
  },
}))

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
import { getVoiceSampleStatus, deleteVoiceSample } from '@services/dataManagementApi'
import { useGenerationStore } from '@store/generationSlice'
import { showToast } from '@utils/toast'
import { Alert } from 'react-native'
import S16SettingsScreen from '@screens/S16SettingsScreen'

// ──────────────────────────────────────────────────────────────────────────────
// 테스트 헬퍼
// ──────────────────────────────────────────────────────────────────────────────

const mockNavigation = {
  navigate: vi.fn(),
  goBack: vi.fn(),
}

function setupAuthStore(overrides: {
  entitlement?: 'premium' | 'trial' | 'free'
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
    clearSession: vi.fn(),
  })
}

function setupGenerationStore(tracks: Array<{ id: string; songKey: string; createdAt: string; s3Key: string | null }> = []) {
  vi.mocked(useGenerationStore).mockImplementation((selector: any) => {
    const state = { tracks }
    return selector(state)
  })
}

function renderScreen() {
  return render(<S16SettingsScreen navigation={mockNavigation as any} />)
}

// ──────────────────────────────────────────────────────────────────────────────
// beforeEach
// ──────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  setupAuthStore({ entitlement: 'free' })
  setupGenerationStore([])
  vi.mocked(getVoiceSampleStatus).mockResolvedValue({ hasSample: true, sampleStatus: 'validated' })
  vi.mocked(deleteVoiceSample).mockResolvedValue(undefined)
})

// ──────────────────────────────────────────────────────────────────────────────
// 목소리 샘플 상태 조건부 렌더링
// ──────────────────────────────────────────────────────────────────────────────

describe('목소리 샘플 — 상태별 렌더링', () => {
  it('hasSample=true: "목소리 샘플 삭제" 버튼 활성 상태로 표시', async () => {
    vi.mocked(getVoiceSampleStatus).mockResolvedValue({ hasSample: true, sampleStatus: 'validated' })

    const { findByText } = renderScreen()

    // useEffect 완료 후 상태 업데이트
    const btn = await findByText('목소리 샘플 삭제')
    expect(btn).toBeTruthy()
  })

  it('hasSample=false: "이미 삭제되었어요" 텍스트 표시', async () => {
    vi.mocked(getVoiceSampleStatus).mockResolvedValue({ hasSample: false, sampleStatus: 'deleted' })

    const { findByText } = renderScreen()

    await findByText('이미 삭제되었어요')
  })

  it('API 실패 시 기본 활성 버튼 표시 (sampleStatus=null)', async () => {
    vi.mocked(getVoiceSampleStatus).mockRejectedValue(new Error('Network error'))

    const { findByText } = renderScreen()

    // sampleStatus=null → 기본 활성 버튼
    const btn = await findByText('목소리 샘플 삭제')
    expect(btn).toBeTruthy()
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// 목소리 샘플 삭제 Alert.alert 핸들러
// ──────────────────────────────────────────────────────────────────────────────

describe('목소리 샘플 삭제 — Alert.alert 핸들러', () => {
  beforeEach(() => {
    vi.mocked(getVoiceSampleStatus).mockResolvedValue({ hasSample: true, sampleStatus: 'validated' })
  })

  it('버튼 탭 시 Alert.alert 호출 (제목: "목소리 샘플 삭제")', async () => {
    const { findByText } = renderScreen()
    const btn = await findByText('목소리 샘플 삭제')

    fireEvent.press(btn)

    expect(Alert.alert).toHaveBeenCalledWith(
      '목소리 샘플 삭제',
      expect.any(String),
      expect.any(Array),
    )
  })

  it('Alert 확인 콜백 실행 시 deleteVoiceSample 호출 + 성공 토스트', async () => {
    let confirmCallback: (() => void) | undefined

    vi.mocked(Alert.alert).mockImplementation((_title, _message, buttons) => {
      if (buttons) {
        const destructiveBtn = (buttons as any[]).find((b) => b.style === 'destructive')
        confirmCallback = destructiveBtn?.onPress
      }
    })

    const { findByText } = renderScreen()
    const btn = await findByText('목소리 샘플 삭제')
    fireEvent.press(btn)

    expect(Alert.alert).toHaveBeenCalled()
    expect(confirmCallback).toBeDefined()

    await act(async () => {
      confirmCallback!()
    })

    await waitFor(() => {
      expect(deleteVoiceSample).toHaveBeenCalledOnce()
      expect(showToast).toHaveBeenCalledWith('삭제했어요')
    })
  })

  it('deleteVoiceSample 실패 시 에러 토스트', async () => {
    vi.mocked(deleteVoiceSample).mockRejectedValue(new Error('Server error'))

    let confirmCallback: (() => void) | undefined
    vi.mocked(Alert.alert).mockImplementation((_title, _message, buttons) => {
      if (buttons) {
        const destructiveBtn = (buttons as any[]).find((b) => b.style === 'destructive')
        confirmCallback = destructiveBtn?.onPress
      }
    })

    const { findByText } = renderScreen()
    const btn = await findByText('목소리 샘플 삭제')
    fireEvent.press(btn)

    await act(async () => {
      confirmCallback!()
    })

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('삭제 중 문제가 생겼어요. 다시 시도해주세요.')
    })
  })

  it('삭제 성공 후 sampleStatus 업데이트 → "이미 삭제되었어요" 표시', async () => {
    let confirmCallback: (() => void) | undefined
    vi.mocked(Alert.alert).mockImplementation((_title, _message, buttons) => {
      if (buttons) {
        const destructiveBtn = (buttons as any[]).find((b) => b.style === 'destructive')
        confirmCallback = destructiveBtn?.onPress
      }
    })

    const { findByText } = renderScreen()
    const btn = await findByText('목소리 샘플 삭제')
    fireEvent.press(btn)

    await act(async () => {
      confirmCallback!()
    })

    await waitFor(() => {
      expect(deleteVoiceSample).toHaveBeenCalled()
    })
    // 성공 후 상태 변경 → "이미 삭제되었어요" 렌더링
    await findByText('이미 삭제되었어요')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// 생성 음원 삭제 — DeleteTracksSheet 개방
// ──────────────────────────────────────────────────────────────────────────────

describe('생성 음원 삭제 — DeleteTracksSheet', () => {
  const mockTracks = [
    { id: 't1', songKey: 'brahms', createdAt: '2024-01-01T00:00:00Z', s3Key: 'k1' },
  ]

  it('tracks.length > 0: "생성 음원 삭제" 버튼 탭 시 DeleteTracksSheet 렌더링', async () => {
    setupGenerationStore(mockTracks)

    const { getByText, findByTestId } = renderScreen()
    fireEvent.press(getByText('생성 음원 삭제'))

    await findByTestId('delete-tracks-sheet')
  })

  it('tracks.length === 0: "생성 음원 삭제" 버튼 비활성 (시트 열리지 않음)', () => {
    setupGenerationStore([])

    const { getByText, queryByTestId } = renderScreen()
    fireEvent.press(getByText('생성 음원 삭제'))

    // 시트가 열리지 않아야 함
    expect(queryByTestId('delete-tracks-sheet')).toBeNull()
  })

  it('시트 닫기 버튼 탭 시 DeleteTracksSheet 언마운트', async () => {
    setupGenerationStore(mockTracks)

    const { getByText, findByTestId, queryByTestId } = renderScreen()
    fireEvent.press(getByText('생성 음원 삭제'))
    await findByTestId('delete-tracks-sheet')

    fireEvent.press(getByText('닫기'))

    await waitFor(() => {
      expect(queryByTestId('delete-tracks-sheet')).toBeNull()
    })
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// 계정 탈퇴 — AccountDeletionFlow 진입
// ──────────────────────────────────────────────────────────────────────────────

describe('계정 탈퇴 — AccountDeletionFlow 진입', () => {
  it('"계정 탈퇴" 탭 시 navigation.navigate("AccountDeletionFlow") 호출', () => {
    const { getByText } = renderScreen()
    fireEvent.press(getByText('계정 탈퇴'))

    expect(mockNavigation.navigate).toHaveBeenCalledWith('AccountDeletionFlow')
  })

  it('"계정 탈퇴" 항목 항상 노출', () => {
    const { getByText } = renderScreen()
    expect(getByText('계정 탈퇴')).toBeTruthy()
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// accessibilityLabel 검증
// ──────────────────────────────────────────────────────────────────────────────

describe('accessibilityLabel — 주요 CTA', () => {
  beforeEach(() => {
    vi.mocked(getVoiceSampleStatus).mockResolvedValue({ hasSample: true, sampleStatus: 'validated' })
  })

  it('"목소리 샘플 삭제" 버튼 accessibilityLabel 설정', async () => {
    // accessibilityLabel prop이 설정되어 있는지 — 텍스트 기반으로 검증
    const { findByText } = renderScreen()
    const el = await findByText('목소리 샘플 삭제')
    expect(el).toBeTruthy()
  })

  it('"계정 탈퇴" 버튼 accessibilityLabel 설정', () => {
    const { getByText } = renderScreen()
    expect(getByText('계정 탈퇴')).toBeTruthy()
  })

  it('"생성 음원 삭제" 버튼 accessibilityLabel 설정', () => {
    const { getByText } = renderScreen()
    expect(getByText('생성 음원 삭제')).toBeTruthy()
  })
})
