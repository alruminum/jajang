/**
 * S07SongSelectScreen.test.tsx
 * S07 자장가 선택 화면 — 수용 기준 전체 검증
 * impl: docs/milestones/v1/epics/epic-02-recording/impl/04-app-song-select-screen.md §5,7
 *
 * 수용 기준 매핑:
 * AC-01 진입 시 6곡 목록 표시
 * AC-02 미리듣기 재생 완료 시 자동 정지 + 상태 리셋
 * AC-03 두 곡 미리듣기 동시 시도 → 이전 곡 정지
 * AC-04 곡 탭 → CTA 활성화 (opacity 0.4 → 1.0)
 * AC-05 미선택 상태에서 CTA disabled
 * AC-06 무료 유저 횟수 소진 → UpgradeSheet 이동
 * AC-07 무료 유저 생성 카운트 칩 표시
 * AC-08 곡 선택 후 CTA → RecordMode 이동
 * AC-09 언마운트 시 Audio.Sound unload
 */

import React from 'react'
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react-native'
import { Alert } from 'react-native'

// ────────────────────────────────────────────
// 모듈 mock
// ────────────────────────────────────────────
jest.mock('@services/api/songs', () => ({
  songsApi: {
    listSongs: jest.fn(),
    getPreviewUrl: jest.fn(),
  },
}))

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
}))

jest.mock('@store/recordingSlice', () => ({
  __esModule: true,
  useRecordingStore: jest.fn(),
}))

jest.mock('@store/authSlice', () => ({
  __esModule: true,
  useAuthStore: jest.fn(),
}))

// useFocusEffect mock — focus 콜백을 즉시 실행하고, cleanup을 외부에서 호출 가능하게 노출.
// unmount 시에도 cleanup이 호출되도록 React.useEffect의 cleanup return으로 위임 (AC-09 호환).
const mockUseFocusEffect = {
  cleanup: null as (() => void) | null,
}

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react')
    useEffect(() => {
      const cleanup = cb()
      if (typeof cleanup === 'function') {
        mockUseFocusEffect.cleanup = cleanup
      }
      return () => {
        if (typeof cleanup === 'function') {
          cleanup()
        }
      }
    }, [])
  },
}))

import { songsApi } from '@services/api/songs'
import { createAudioPlayer } from 'expo-audio'
import { useRecordingStore } from '@store/recordingSlice'
import { useAuthStore } from '@store/authSlice'
import { SongSelectScreen } from '@screens/S07SongSelectScreen'

// ────────────────────────────────────────────
// 공통 픽스처
// ────────────────────────────────────────────
const MOCK_SONGS = [
  { key: 'brahms',   title_ko: '자장가',         title_en: 'Lullaby',         composer: 'Brahms',    duration_seconds: 180 },
  { key: 'mozart',   title_ko: '모차르트 자장가', title_en: 'Mozart Lullaby',  composer: 'Mozart',    duration_seconds: 120 },
  { key: 'schubert', title_ko: '슈베르트 자장가', title_en: 'Cradle Song',     composer: 'Schubert',  duration_seconds: 150 },
  { key: 'twinkle',  title_ko: '반짝반짝 작은 별', title_en: 'Twinkle Twinkle', composer: 'Traditional', duration_seconds: 90 },
  { key: 'rockabye', title_ko: '록어바이',         title_en: 'Rock-a-bye Baby', composer: 'Traditional', duration_seconds: 100 },
  { key: 'hush',     title_ko: '허쉬 리틀 베이비', title_en: 'Hush Little Baby', composer: 'Traditional', duration_seconds: 110 },
]

// mock player 객체
function makeMockPlayer() {
  return {
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  }
}

// mock navigation 객체
function makeMockNavigation() {
  return {
    navigate: jest.fn(),
    goBack: jest.fn(),
  }
}

// 스토어 mock 기본값 (비로그인/유료/0회 사용)
function setupStoreMocks({
  selectedSongKey = null as string | null,
  entitlement = 'premium' as string,
  generationCount = 0,
} = {}) {
  const setSelectedSong = jest.fn()
  const resetRecordingFlow = jest.fn()

  jest.mocked(useRecordingStore).mockReturnValue({
    selectedSongKey,
    setSelectedSong,
    resetRecordingFlow,
    recordingMode: null,
    localAudioUri: null,
    uploadedSampleId: null,
    qualityValidationPassed: null,
    setRecordingMode: jest.fn(),
    setLocalAudioUri: jest.fn(),
    setUploadedSampleId: jest.fn(),
    setQualityValidationPassed: jest.fn(),
  })

  jest.mocked(useAuthStore).mockReturnValue({
    entitlement,
    generationCount,
  })

  return { setSelectedSong, resetRecordingFlow }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUseFocusEffect.cleanup = null
  // 기본: 곡 목록 API 성공
  jest.mocked(songsApi.listSongs).mockResolvedValue({ songs: MOCK_SONGS })
})

afterEach(async () => {
  cleanup()
  await Promise.resolve()
  await Promise.resolve()
})

// ────────────────────────────────────────────
// AC-01: 진입 시 곡 목록 표시
// ────────────────────────────────────────────
describe('S07SongSelectScreen — AC-01: 진입 시 곡 목록 표시', () => {
  it('화면 진입 시 songsApi.listSongs를 호출한다', async () => {
    setupStoreMocks()
    const navigation = makeMockNavigation()
    render(<SongSelectScreen navigation={navigation as any} route={{} as any} />)

    await waitFor(() => {
      expect(songsApi.listSongs).toHaveBeenCalledTimes(1)
    })
  })

  it('API 응답의 곡 목록을 모두 렌더링한다 (6곡)', async () => {
    setupStoreMocks()
    const navigation = makeMockNavigation()
    render(<SongSelectScreen navigation={navigation as any} route={{} as any} />)

    await waitFor(() => {
      expect(screen.getByText('자장가')).toBeTruthy()
      expect(screen.getByText('모차르트 자장가')).toBeTruthy()
      expect(screen.getByText('슈베르트 자장가')).toBeTruthy()
      expect(screen.getByText('반짝반짝 작은 별')).toBeTruthy()
      expect(screen.getByText('록어바이')).toBeTruthy()
      expect(screen.getByText('허쉬 리틀 베이비')).toBeTruthy()
    })
  })

  it('API 실패 시 Alert.alert를 호출한다', async () => {
    setupStoreMocks()
    jest.mocked(songsApi.listSongs).mockRejectedValueOnce(new Error('Network Error'))
    const alertSpy = jest.spyOn(Alert, 'alert')
    const navigation = makeMockNavigation()

    render(<SongSelectScreen navigation={navigation as any} route={{} as any} />)

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('', '목록을 불러오지 못했어요. 다시 시도해주세요')
    })
  })
})

// ────────────────────────────────────────────
// AC-05: 미선택 상태에서 CTA disabled
// ────────────────────────────────────────────
describe('S07SongSelectScreen — AC-05: 미선택 시 CTA 비활성화', () => {
  it('selectedSongKey=null 일 때 CTA 버튼이 disabled다', async () => {
    setupStoreMocks({ selectedSongKey: null })
    const navigation = makeMockNavigation()
    render(<SongSelectScreen navigation={navigation as any} route={{} as any} />)

    await waitFor(() => screen.getByText('이 곡으로 시작'))

    const cta = screen.getByLabelText('이 곡으로 시작')
    expect(cta).toHaveAccessibilityState({ disabled: true })
  })

  it('selectedSongKey=null 일 때 CTA 탭해도 navigate가 호출되지 않는다', async () => {
    setupStoreMocks({ selectedSongKey: null })
    const navigation = makeMockNavigation()
    render(<SongSelectScreen navigation={navigation as any} route={{} as any} />)

    await waitFor(() => screen.getByText('이 곡으로 시작'))
    fireEvent.press(screen.getByLabelText('이 곡으로 시작'))

    expect(navigation.navigate).not.toHaveBeenCalled()
  })
})

// ────────────────────────────────────────────
// AC-04, AC-08: 곡 선택 → CTA 활성화 → RecordMode 이동
// ────────────────────────────────────────────
describe('S07SongSelectScreen — AC-04/AC-08: 곡 선택 후 CTA', () => {
  it('selectedSongKey 설정 시 CTA 버튼이 활성화된다', async () => {
    setupStoreMocks({ selectedSongKey: 'brahms' })
    const navigation = makeMockNavigation()
    render(<SongSelectScreen navigation={navigation as any} route={{} as any} />)

    await waitFor(() => screen.getByText('이 곡으로 시작'))

    const cta = screen.getByLabelText('이 곡으로 시작')
    expect(cta).toHaveAccessibilityState({ disabled: false })
  })

  it('곡 선택 후 CTA 탭 시 RecordMode 화면으로 이동한다', async () => {
    setupStoreMocks({ selectedSongKey: 'brahms', entitlement: 'premium' })
    const navigation = makeMockNavigation()
    render(<SongSelectScreen navigation={navigation as any} route={{} as any} />)

    await waitFor(() => screen.getByText('이 곡으로 시작'))
    fireEvent.press(screen.getByLabelText('이 곡으로 시작'))

    expect(navigation.navigate).toHaveBeenCalledWith('RecordMode')
  })
})

// ────────────────────────────────────────────
// AC-07: 무료 유저 생성 카운트 칩 표시
// ────────────────────────────────────────────
describe('S07SongSelectScreen — AC-07: 무료 유저 카운트 칩', () => {
  it('isFreeUser=true 일 때 생성 카운트 칩을 표시한다', async () => {
    setupStoreMocks({ entitlement: 'free', generationCount: 1 })
    const navigation = makeMockNavigation()
    render(<SongSelectScreen navigation={navigation as any} route={{} as any} />)

    await waitFor(() => {
      expect(screen.getByText('생성 1/3')).toBeTruthy()
    })
  })

  it('isFreeUser=true 이고 0회 사용 시 "생성 0/3"을 표시한다', async () => {
    setupStoreMocks({ entitlement: 'free', generationCount: 0 })
    const navigation = makeMockNavigation()
    render(<SongSelectScreen navigation={navigation as any} route={{} as any} />)

    await waitFor(() => {
      expect(screen.getByText('생성 0/3')).toBeTruthy()
    })
  })

  it('isFreeUser=false (premium) 일 때 카운트 칩을 표시하지 않는다', async () => {
    setupStoreMocks({ entitlement: 'premium', generationCount: 0 })
    const navigation = makeMockNavigation()
    render(<SongSelectScreen navigation={navigation as any} route={{} as any} />)

    await waitFor(() => screen.getByText('이 곡으로 시작'))
    expect(screen.queryByText(/생성 \d\/3/)).toBeFalsy()
  })
})

// ────────────────────────────────────────────
// AC-06: 무료 유저 횟수 소진 시 UpgradeSheet 이동
// ────────────────────────────────────────────
describe('S07SongSelectScreen — AC-06: 무료 유저 횟수 소진', () => {
  it('free 유저 3/3 소진 시 CTA 탭 → UpgradeSheet(generation_exhausted)로 이동한다', async () => {
    setupStoreMocks({ selectedSongKey: 'brahms', entitlement: 'free', generationCount: 3 })
    const navigation = makeMockNavigation()
    render(<SongSelectScreen navigation={navigation as any} route={{} as any} />)

    await waitFor(() => screen.getByText('이 곡으로 시작'))
    fireEvent.press(screen.getByLabelText('이 곡으로 시작'))

    expect(navigation.navigate).toHaveBeenCalledWith('UpgradeSheet', { variant: 'generation_exhausted' })
  })

  it('free 유저 3/3 소진 시 RecordMode로 이동하지 않는다', async () => {
    setupStoreMocks({ selectedSongKey: 'brahms', entitlement: 'free', generationCount: 3 })
    const navigation = makeMockNavigation()
    render(<SongSelectScreen navigation={navigation as any} route={{} as any} />)

    await waitFor(() => screen.getByText('이 곡으로 시작'))
    fireEvent.press(screen.getByLabelText('이 곡으로 시작'))

    expect(navigation.navigate).not.toHaveBeenCalledWith('RecordMode')
  })

  it('free 유저 2/3 사용 시(잔여 1회) CTA 탭 → RecordMode로 이동한다', async () => {
    setupStoreMocks({ selectedSongKey: 'brahms', entitlement: 'free', generationCount: 2 })
    const navigation = makeMockNavigation()
    render(<SongSelectScreen navigation={navigation as any} route={{} as any} />)

    await waitFor(() => screen.getByText('이 곡으로 시작'))
    fireEvent.press(screen.getByLabelText('이 곡으로 시작'))

    expect(navigation.navigate).toHaveBeenCalledWith('RecordMode')
  })
})

// ────────────────────────────────────────────
// AC-02: 미리듣기 재생 완료 시 자동 정지 + 상태 리셋
// ────────────────────────────────────────────
describe('S07SongSelectScreen — AC-02: 미리듣기 재생 완료 자동 정지', () => {
  it('재생 완료(didJustFinish) 콜백 시 player.remove를 호출한다', async () => {
    setupStoreMocks()
    const mockPlayer = makeMockPlayer()
    jest.mocked(createAudioPlayer).mockReturnValueOnce(mockPlayer as any)
    jest.mocked(songsApi.getPreviewUrl).mockResolvedValueOnce({
      song_key: 'brahms',
      preview_url: 'https://cdn.example.com/brahms.mp3',
      expires_in_seconds: 3600,
    })

    const navigation = makeMockNavigation()
    render(<SongSelectScreen navigation={navigation as any} route={{} as any} />)
    await waitFor(() => screen.getByText('자장가'))

    // 미리듣기 버튼 탭
    await act(async () => {
      fireEvent.press(screen.getByLabelText('자장가 미리듣기'))
    })

    // addListener 콜백에서 didJustFinish 시뮬레이션
    const listenerCall = mockPlayer.addListener.mock.calls[0]
    if (listenerCall) {
      const [, statusCallback] = listenerCall
      await act(async () => {
        statusCallback({ didJustFinish: true })
      })
    }

    expect(mockPlayer.remove).toHaveBeenCalled()
  })
})

// ────────────────────────────────────────────
// AC-03: 두 곡 미리듣기 동시 재생 불가
// ────────────────────────────────────────────
describe('S07SongSelectScreen — AC-03: 동시 미리듣기 방지', () => {
  it('두 번째 곡 미리듣기 시 첫 번째 곡의 remove가 먼저 호출된다', async () => {
    setupStoreMocks()

    const mockPlayer1 = makeMockPlayer()
    const mockPlayer2 = makeMockPlayer()

    jest.mocked(createAudioPlayer)
      .mockReturnValueOnce(mockPlayer1 as any)
      .mockReturnValueOnce(mockPlayer2 as any)

    jest.mocked(songsApi.getPreviewUrl)
      .mockResolvedValueOnce({ song_key: 'brahms',  preview_url: 'https://cdn.example.com/brahms.mp3',  expires_in_seconds: 3600 })
      .mockResolvedValueOnce({ song_key: 'mozart',  preview_url: 'https://cdn.example.com/mozart.mp3',  expires_in_seconds: 3600 })

    const navigation = makeMockNavigation()
    render(<SongSelectScreen navigation={navigation as any} route={{} as any} />)
    await waitFor(() => screen.getByText('자장가'))

    // 첫 번째 곡 미리듣기
    await act(async () => {
      fireEvent.press(screen.getByLabelText('자장가 미리듣기'))
    })

    // 두 번째 곡 미리듣기
    await act(async () => {
      fireEvent.press(screen.getByLabelText('모차르트 자장가 미리듣기'))
    })

    // 첫 번째 player가 remove됐어야 한다
    expect(mockPlayer1.remove).toHaveBeenCalled()
  })

  it('같은 곡을 다시 탭하면 재생 정지 후 previewingKey가 null이 된다', async () => {
    setupStoreMocks()

    const mockPlayer = makeMockPlayer()
    jest.mocked(createAudioPlayer).mockReturnValue(mockPlayer as any)
    jest.mocked(songsApi.getPreviewUrl).mockResolvedValue({
      song_key: 'brahms',
      preview_url: 'https://cdn.example.com/brahms.mp3',
      expires_in_seconds: 3600,
    })

    const navigation = makeMockNavigation()
    render(<SongSelectScreen navigation={navigation as any} route={{} as any} />)
    await waitFor(() => screen.getByText('자장가'))

    // 재생 시작
    await act(async () => {
      fireEvent.press(screen.getByLabelText('자장가 미리듣기'))
    })

    // 같은 곡 다시 탭 → 정지
    await act(async () => {
      fireEvent.press(screen.getByLabelText('자장가 미리듣기 정지'))
    })

    expect(mockPlayer.remove).toHaveBeenCalled()
  })
})

// ────────────────────────────────────────────
// AC-09: 언마운트 시 Audio.Sound unload
// ────────────────────────────────────────────
describe('S07SongSelectScreen — AC-09: 언마운트 시 사운드 정리', () => {
  it('화면 언마운트 시 재생 중인 player.remove를 호출한다', async () => {
    setupStoreMocks()

    const mockPlayer = makeMockPlayer()
    jest.mocked(createAudioPlayer).mockReturnValue(mockPlayer as any)
    jest.mocked(songsApi.getPreviewUrl).mockResolvedValue({
      song_key: 'brahms',
      preview_url: 'https://cdn.example.com/brahms.mp3',
      expires_in_seconds: 3600,
    })

    const navigation = makeMockNavigation()
    const { unmount } = render(<SongSelectScreen navigation={navigation as any} route={{} as any} />)
    await waitFor(() => screen.getByText('자장가'))

    // 미리듣기 시작
    await act(async () => {
      fireEvent.press(screen.getByLabelText('자장가 미리듣기'))
    })

    // 언마운트
    unmount()

    expect(mockPlayer.remove).toHaveBeenCalled()
  })
})

// ────────────────────────────────────────────
// #129: 화면 blur 시 미리듣기 정리
// ────────────────────────────────────────────
describe('S07SongSelectScreen — #129: blur 시 미리듣기 정리', () => {
  it('다른 화면으로 이동(blur)하면 player.remove와 상태 리셋이 호출된다', async () => {
    setupStoreMocks()

    const mockPlayer = makeMockPlayer()
    jest.mocked(createAudioPlayer).mockReturnValue(mockPlayer as any)
    jest.mocked(songsApi.getPreviewUrl).mockResolvedValue({
      song_key: 'brahms',
      preview_url: 'https://cdn.example.com/brahms.mp3',
      expires_in_seconds: 3600,
    })

    const navigation = makeMockNavigation()
    render(<SongSelectScreen navigation={navigation as any} route={{} as any} />)
    await waitFor(() => screen.getByText('자장가'))

    // 미리듣기 시작
    await act(async () => {
      fireEvent.press(screen.getByLabelText('자장가 미리듣기'))
    })
    expect(mockPlayer.play).toHaveBeenCalled()

    // blur 시뮬레이션 — useFocusEffect cleanup 강제 실행
    await act(async () => {
      mockUseFocusEffect.cleanup?.()
    })

    expect(mockPlayer.pause).toHaveBeenCalled()
    expect(mockPlayer.remove).toHaveBeenCalled()
  })
})

// ────────────────────────────────────────────
// 미리듣기 API 실패 처리
// ────────────────────────────────────────────
describe('S07SongSelectScreen — 미리듣기 API 실패 처리', () => {
  it('getPreviewUrl 실패 시 Alert.alert를 호출한다', async () => {
    setupStoreMocks()
    jest.mocked(songsApi.getPreviewUrl).mockRejectedValueOnce(new Error('Forbidden'))
    const alertSpy = jest.spyOn(Alert, 'alert')

    const navigation = makeMockNavigation()
    render(<SongSelectScreen navigation={navigation as any} route={{} as any} />)
    await waitFor(() => screen.getByText('자장가'))

    await act(async () => {
      fireEvent.press(screen.getByLabelText('자장가 미리듣기'))
    })

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('', '미리듣기를 불러오지 못했어요')
    })
  })
})
