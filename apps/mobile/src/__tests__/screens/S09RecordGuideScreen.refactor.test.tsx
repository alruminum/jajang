/**
 * S09 RecordGuideScreen 리팩토링 테스트 (TDD — impl/13 기반)
 *
 * impl/13 변경 contract (쉬/허밍 모드 분기 완전 제거):
 *  1. route.params: { songKey: string } — mode 필드 없음
 *  2. 이어폰 chip + 가사 박스 항상 노출 (mode 조건 제거)
 *  3. 이어폰 경고 모달 1회 정책 (AsyncStorage '@jajang:earphone_warning_dismissed')
 *  4. 가사 미준비 songKey → 가사 박스 숨김 + "자유롭게 따라불러 주세요" fallback
 *  5. CTA 탭 → navigate('Record', { songKey }) — mode 없음
 *  6. challengesApi 호출 없음 (네트워크 요청 제거)
 */

import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';

import { LYRICS } from '../../data/lyrics';
import { SONG_NAMES } from '../../services/songs';

// ─── Mock: challengesApi (폐기됐으나 import 잔재 방어) ────────────────────────
const mockGetRandomPhrase = jest.fn();
jest.mock('@services/api/challenges', () => ({
  challengesApi: { getRandomPhrase: mockGetRandomPhrase },
}));

// ─── Mock: expo-audio (권한 API) ──────────────────────────────────────────────
jest.mock('expo-audio', () => ({
  getRecordingPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', canAskAgain: true, granted: true }),
  requestRecordingPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}));

// ─── Mock: @react-native-async-storage/async-storage ─────────────────────────
const mockAsyncStorageGetItem = jest.fn();
const mockAsyncStorageSetItem = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: mockAsyncStorageGetItem,
    setItem: mockAsyncStorageSetItem,
  },
}));

import { RecordGuideScreen } from '@screens/RecordGuideScreen';

const mockNavigate = jest.fn();
const mockNavigation = { navigate: mockNavigate } as any;

const EARPHONE_WARNING_KEY = '@jajang:earphone_warning_dismissed';

// mode 파라미터 없음 — songKey 만
function renderWith(songKey: string) {
  return render(
    <RecordGuideScreen
      navigation={mockNavigation}
      route={{ key: 'RecordGuide', name: 'RecordGuide', params: { songKey } } as any}
    />,
  );
}

beforeEach(() => {
  mockNavigate.mockReset();
  mockGetRandomPhrase.mockReset();
  mockAsyncStorageGetItem.mockReset();
  mockAsyncStorageSetItem.mockReset();
  mockAsyncStorageSetItem.mockResolvedValue(undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// 단일 흐름 — 이어폰 chip + 가사 박스 항상 노출 (mode 무관)
// ─────────────────────────────────────────────────────────────────────────────

describe('S09 RecordGuideScreen — 단일 흐름: 이어폰 chip 항상 노출 (impl/13 §5)', () => {
  beforeEach(() => {
    mockAsyncStorageGetItem.mockResolvedValue('true'); // 모달 건너뜀
  });

  it('songKey=brahms 진입 시 이어폰 chip 텍스트가 노출된다', () => {
    const { getByText } = renderWith('brahms');
    expect(getByText('이어폰을 끼면 더 또렷하게 담겨요')).toBeTruthy();
  });

  it('songKey=twinkle 진입 시에도 이어폰 chip 텍스트가 노출된다 (모드 조건 없음)', () => {
    const { getByText } = renderWith('twinkle');
    expect(getByText('이어폰을 끼면 더 또렷하게 담겨요')).toBeTruthy();
  });

  it('미매핑 songKey 진입 시에도 이어폰 chip은 노출된다', () => {
    const { getByText } = renderWith('__no_lyrics__');
    expect(getByText('이어폰을 끼면 더 또렷하게 담겨요')).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 단일 흐름 — 가사 박스 노출
// ─────────────────────────────────────────────────────────────────────────────

describe('S09 RecordGuideScreen — 단일 흐름: 가사 박스 노출 (impl/13 §5)', () => {
  beforeEach(() => {
    mockAsyncStorageGetItem.mockResolvedValue('true');
  });

  it('유효한 songKey(brahms) 진입 시 가사 박스 타이틀이 노출된다', () => {
    const title = SONG_NAMES['brahms'] as string;
    const { getByText } = renderWith('brahms');
    expect(getByText(title)).toBeTruthy();
  });

  it('유효한 songKey(brahms) 진입 시 가사 첫 번째 줄이 노출된다', () => {
    const lines = LYRICS['brahms'].lines;
    const { getByText } = renderWith('brahms');
    expect(getByText(lines[0])).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 가사 미준비 fallback (impl/13 §8)
// ─────────────────────────────────────────────────────────────────────────────

describe('S09 RecordGuideScreen — 가사 미준비 fallback (impl/13 §8)', () => {
  beforeEach(() => {
    mockAsyncStorageGetItem.mockResolvedValue('true');
  });

  it('미매핑 songKey 면 "자유롭게 따라불러 주세요" 텍스트가 표시된다', () => {
    const { getByText } = renderWith('__no_lyrics__');
    expect(getByText('자유롭게 따라불러 주세요')).toBeTruthy();
  });

  it('미매핑 songKey 면 가사 박스(타이틀)는 숨겨진다', () => {
    const anyTitle = SONG_NAMES['brahms'] as string;
    const { queryByText } = renderWith('__no_lyrics__');
    expect(queryByText(anyTitle)).toBeNull();
  });

  it('빈 문자열 songKey 도 fallback 처리된다 (deep-link 비정상 진입 방어)', () => {
    const { getByText } = renderWith('');
    expect(getByText('자유롭게 따라불러 주세요')).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// challengesApi 호출 없음
// ─────────────────────────────────────────────────────────────────────────────

describe('S09 RecordGuideScreen — challengesApi 호출 없음 (impl/13)', () => {
  beforeEach(() => {
    mockAsyncStorageGetItem.mockResolvedValue('true');
  });

  it('화면 진입 시 challengesApi.getRandomPhrase 가 호출되지 않는다', () => {
    renderWith('brahms');
    expect(mockGetRandomPhrase).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 이어폰 경고 모달 1회 정책 (impl/13 §5, §8)
// ─────────────────────────────────────────────────────────────────────────────

describe('S09 RecordGuideScreen — 이어폰 경고 모달: 첫 진입 시 노출 (impl/13 §5)', () => {
  beforeEach(() => {
    // dismissed 아님 → 모달 노출
    mockAsyncStorageGetItem.mockResolvedValue(null);
  });

  it('earphone_warning_dismissed 값 없음 + CTA 탭 → 이어폰 경고 모달이 노출된다', async () => {
    const { getByLabelText, findByText } = renderWith('brahms');
    fireEvent.press(getByLabelText('녹음 시작'));
    expect(await findByText('이어폰을 끼면 더 잘 담겨요')).toBeTruthy();
  });

  it('이어폰 경고 모달 노출 시 navigate는 호출되지 않는다', async () => {
    const { getByLabelText, findByText } = renderWith('brahms');
    fireEvent.press(getByLabelText('녹음 시작'));
    await findByText('이어폰을 끼면 더 잘 담겨요');
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('S09 RecordGuideScreen — 이어폰 모달: "이어폰 끼고 할게요" 탭 → 닫기만 (impl/13 §6)', () => {
  beforeEach(() => {
    mockAsyncStorageGetItem.mockResolvedValue(null);
  });

  it('"이어폰 끼고 할게요" 탭 → 모달이 닫힌다', async () => {
    const { getByLabelText, findByText, queryByText } = renderWith('brahms');
    fireEvent.press(getByLabelText('녹음 시작'));
    await findByText('이어폰을 끼면 더 잘 담겨요');
    fireEvent.press(getByLabelText('돌아가기'));
    expect(queryByText('이어폰을 끼면 더 잘 담겨요')).toBeNull();
  });

  it('"이어폰 끼고 할게요" 탭 → AsyncStorage.setItem 호출 없음 (dismissed 저장 안 함)', async () => {
    const { getByLabelText, findByText } = renderWith('brahms');
    fireEvent.press(getByLabelText('녹음 시작'));
    await findByText('이어폰을 끼면 더 잘 담겨요');
    fireEvent.press(getByLabelText('돌아가기'));
    expect(mockAsyncStorageSetItem).not.toHaveBeenCalled();
  });

  it('"이어폰 끼고 할게요" 탭 → navigate 호출 없음', async () => {
    const { getByLabelText, findByText } = renderWith('brahms');
    fireEvent.press(getByLabelText('녹음 시작'));
    await findByText('이어폰을 끼면 더 잘 담겨요');
    fireEvent.press(getByLabelText('돌아가기'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('S09 RecordGuideScreen — 이어폰 모달: "그래도 진행" 탭 (impl/13 §5)', () => {
  beforeEach(() => {
    mockAsyncStorageGetItem.mockResolvedValue(null);
  });

  it('"그래도 진행" 탭 → AsyncStorage.setItem("@jajang:earphone_warning_dismissed", "true") 호출', async () => {
    const { getByLabelText, findByText } = renderWith('brahms');
    fireEvent.press(getByLabelText('녹음 시작'));
    await findByText('이어폰을 끼면 더 잘 담겨요');
    await act(async () => {
      fireEvent.press(getByLabelText('이어폰 없이 진행하기'));
    });
    expect(mockAsyncStorageSetItem).toHaveBeenCalledWith(EARPHONE_WARNING_KEY, 'true');
  });

  it('"그래도 진행" 탭 → 모달이 닫힌다', async () => {
    const { getByLabelText, findByText, queryByText } = renderWith('brahms');
    fireEvent.press(getByLabelText('녹음 시작'));
    await findByText('이어폰을 끼면 더 잘 담겨요');
    await act(async () => {
      fireEvent.press(getByLabelText('이어폰 없이 진행하기'));
    });
    expect(queryByText('이어폰을 끼면 더 잘 담겨요')).toBeNull();
  });

  it('"그래도 진행" 탭 → navigate("Record", { songKey }) 호출 (mode 없음)', async () => {
    const { getByLabelText, findByText } = renderWith('brahms');
    fireEvent.press(getByLabelText('녹음 시작'));
    await findByText('이어폰을 끼면 더 잘 담겨요');
    await act(async () => {
      fireEvent.press(getByLabelText('이어폰 없이 진행하기'));
    });
    expect(mockNavigate).toHaveBeenCalledWith('Record', { songKey: 'brahms' });
  });

  it('"그래도 진행" 탭 navigate 인자에 mode 필드가 없다', async () => {
    const { getByLabelText, findByText } = renderWith('twinkle');
    fireEvent.press(getByLabelText('녹음 시작'));
    await findByText('이어폰을 끼면 더 잘 담겨요');
    await act(async () => {
      fireEvent.press(getByLabelText('이어폰 없이 진행하기'));
    });
    const callArgs = mockNavigate.mock.calls[0];
    expect(callArgs?.[1]).not.toHaveProperty('mode');
  });
});

describe('S09 RecordGuideScreen — 이어폰 모달: 이미 dismissed 시 미노출 (impl/13 §5, §8)', () => {
  beforeEach(() => {
    // 이미 dismissed
    mockAsyncStorageGetItem.mockResolvedValue('true');
  });

  it('dismissed=true 상태에서 CTA 탭 → 이어폰 경고 모달 미노출', async () => {
    const { getByLabelText, queryByText } = renderWith('brahms');
    fireEvent.press(getByLabelText('녹음 시작'));
    await Promise.resolve();
    await Promise.resolve();
    expect(queryByText('이어폰을 끼면 더 잘 담겨요')).toBeNull();
  });

  it('dismissed=true 상태에서 CTA 탭 → navigate("Record", { songKey }) 직행', async () => {
    const { getByLabelText } = renderWith('brahms');
    fireEvent.press(getByLabelText('녹음 시작'));
    await Promise.resolve();
    await Promise.resolve();
    expect(mockNavigate).toHaveBeenCalledWith('Record', { songKey: 'brahms' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CTA 네비게이션 — mode 제거 확인 (impl/13 §4, §8)
// ─────────────────────────────────────────────────────────────────────────────

describe('S09 RecordGuideScreen — CTA 네비게이션: mode 파라미터 없음 (impl/13 §4)', () => {
  beforeEach(() => {
    mockAsyncStorageGetItem.mockResolvedValue('true');
  });

  it('CTA 탭 → navigate("Record", { songKey }) — mode 필드 없음', async () => {
    const { getByTestId } = renderWith('brahms');
    await act(async () => {
      fireEvent.press(getByTestId('record-guide-cta'));
    });
    expect(mockNavigate).toHaveBeenCalledWith('Record', { songKey: 'brahms' });
  });

  it('다른 songKey(twinkle)로 CTA 탭 시 해당 songKey가 전달된다', async () => {
    const { getByTestId } = renderWith('twinkle');
    await act(async () => {
      fireEvent.press(getByTestId('record-guide-cta'));
    });
    expect(mockNavigate).toHaveBeenCalledWith('Record', { songKey: 'twinkle' });
  });
});
