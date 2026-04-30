import React from 'react';
import { act, create } from 'react-test-renderer';

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (s: any) => s },
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('@store/auth-store', () => ({
  __esModule: true,
  useAuthStore: jest.fn(),
}));

jest.mock('@hooks/useEntitlement', () => ({
  useTrialDaysRemaining: jest.fn(),
}));

jest.mock('@hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      accentPrimary14: 'rgba(90,122,168,0.14)',
      accentPrimary: '#5A7AA8',
      textSecondary: '#aaa',
      textPrimary: '#fff',
      bgPrimary: '#0D0F1A',
      warningBg: '#3A2A1A',
      warningText: '#E0B070',
    },
    isDark: false,
  }),
}));

import { useAuthStore } from '@store/auth-store';
import { useTrialDaysRemaining } from '@hooks/useEntitlement';
import TrialExpiryBanner from '@components/TrialExpiryBanner';

function renderBanner(): ReturnType<typeof create> {
  let tree: ReturnType<typeof create>;
  act(() => {
    tree = create(<TrialExpiryBanner />);
  });
  return tree!;
}

describe('TrialExpiryBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- null 반환 조건 ---

  it('entitlement가 free이면 null을 반환한다', () => {
    jest.mocked(useAuthStore).mockReturnValue({ entitlement: 'free' } as any);
    jest.mocked(useTrialDaysRemaining).mockReturnValue(0);
    const tree = renderBanner();
    expect(tree.toJSON()).toBeNull();
  });

  it('daysRemaining이 null이면 null을 반환한다', () => {
    jest.mocked(useAuthStore).mockReturnValue({ entitlement: 'trial' } as any);
    jest.mocked(useTrialDaysRemaining).mockReturnValue(null);
    const tree = renderBanner();
    expect(tree.toJSON()).toBeNull();
  });

  it('daysRemaining=2이면 null을 반환한다 (D-2, 임계값 경계)', () => {
    jest.mocked(useAuthStore).mockReturnValue({ entitlement: 'trial' } as any);
    jest.mocked(useTrialDaysRemaining).mockReturnValue(2);
    const tree = renderBanner();
    expect(tree.toJSON()).toBeNull();
  });

  it('daysRemaining=7이면 null을 반환한다 (D-7)', () => {
    jest.mocked(useAuthStore).mockReturnValue({ entitlement: 'trial' } as any);
    jest.mocked(useTrialDaysRemaining).mockReturnValue(7);
    const tree = renderBanner();
    expect(tree.toJSON()).toBeNull();
  });

  // --- D-1 렌더 조건 ---

  it('daysRemaining=1이면 "내일 무료 체험이 끝나요" 메시지를 표시한다', () => {
    jest.mocked(useAuthStore).mockReturnValue({ entitlement: 'trial' } as any);
    jest.mocked(useTrialDaysRemaining).mockReturnValue(1);
    const tree = renderBanner();
    expect(tree.toJSON()).not.toBeNull();
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('내일 무료 체험이 끝나요');
  });

  it('daysRemaining=1이면 "구독하기" CTA를 표시한다', () => {
    jest.mocked(useAuthStore).mockReturnValue({ entitlement: 'trial' } as any);
    jest.mocked(useTrialDaysRemaining).mockReturnValue(1);
    const tree = renderBanner();
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('구독하기');
  });

  it('daysRemaining=1일 때 "구독하기" 탭 시 Subscribe 화면으로 이동한다 (D-1)', () => {
    jest.mocked(useAuthStore).mockReturnValue({ entitlement: 'trial' } as any);
    jest.mocked(useTrialDaysRemaining).mockReturnValue(1);
    const tree = renderBanner();
    const touchable = tree.root.findByType('TouchableOpacity' as any);
    touchable.props.onPress();
    expect(mockNavigate).toHaveBeenCalledWith('Subscribe');
  });

  // --- D-0 렌더 조건 ---

  it('daysRemaining=0이면 "오늘 무료 체험이 끝나요" 메시지를 표시한다', () => {
    jest.mocked(useAuthStore).mockReturnValue({ entitlement: 'trial' } as any);
    jest.mocked(useTrialDaysRemaining).mockReturnValue(0);
    const tree = renderBanner();
    expect(tree.toJSON()).not.toBeNull();
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('오늘 무료 체험이 끝나요');
  });

  it('daysRemaining=0일 때 "오늘 무료 체험이 끝나요"만 표시하고 "내일"은 포함하지 않는다', () => {
    jest.mocked(useAuthStore).mockReturnValue({ entitlement: 'trial' } as any);
    jest.mocked(useTrialDaysRemaining).mockReturnValue(0);
    const tree = renderBanner();
    const json = JSON.stringify(tree.toJSON());
    expect(json).not.toContain('내일');
  });

  it('daysRemaining=0일 때 "구독하기" 탭 시 Subscribe 화면으로 이동한다 (D-0)', () => {
    jest.mocked(useAuthStore).mockReturnValue({ entitlement: 'trial' } as any);
    jest.mocked(useTrialDaysRemaining).mockReturnValue(0);
    const tree = renderBanner();
    const touchable = tree.root.findByType('TouchableOpacity' as any);
    touchable.props.onPress();
    expect(mockNavigate).toHaveBeenCalledWith('Subscribe');
  });
});
