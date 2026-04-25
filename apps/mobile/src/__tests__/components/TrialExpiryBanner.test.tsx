import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create } from 'react-test-renderer';

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (s: any) => s },
}));

const mockNavigate = vi.fn();
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

vi.mock('@store/auth-store', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('@hooks/useEntitlement', () => ({
  useTrialDaysRemaining: vi.fn(),
}));

import { useAuthStore } from '@store/auth-store';
import { useTrialDaysRemaining } from '@hooks/useEntitlement';
import TrialExpiryBanner from '@components/TrialExpiryBanner';

describe('TrialExpiryBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- null 반환 조건 ---

  it('entitlement가 free이면 null을 반환한다', () => {
    vi.mocked(useAuthStore).mockReturnValue({ entitlement: 'free' } as any);
    vi.mocked(useTrialDaysRemaining).mockReturnValue(0);
    const tree = create(<TrialExpiryBanner />);
    expect(tree.toJSON()).toBeNull();
  });

  it('daysRemaining이 null이면 null을 반환한다', () => {
    vi.mocked(useAuthStore).mockReturnValue({ entitlement: 'trial' } as any);
    vi.mocked(useTrialDaysRemaining).mockReturnValue(null);
    const tree = create(<TrialExpiryBanner />);
    expect(tree.toJSON()).toBeNull();
  });

  it('daysRemaining=2이면 null을 반환한다 (D-2, 임계값 경계)', () => {
    vi.mocked(useAuthStore).mockReturnValue({ entitlement: 'trial' } as any);
    vi.mocked(useTrialDaysRemaining).mockReturnValue(2);
    const tree = create(<TrialExpiryBanner />);
    expect(tree.toJSON()).toBeNull();
  });

  it('daysRemaining=7이면 null을 반환한다 (D-7)', () => {
    vi.mocked(useAuthStore).mockReturnValue({ entitlement: 'trial' } as any);
    vi.mocked(useTrialDaysRemaining).mockReturnValue(7);
    const tree = create(<TrialExpiryBanner />);
    expect(tree.toJSON()).toBeNull();
  });

  // --- D-1 렌더 조건 ---

  it('daysRemaining=1이면 "내일 무료 체험이 끝나요" 메시지를 표시한다', () => {
    vi.mocked(useAuthStore).mockReturnValue({ entitlement: 'trial' } as any);
    vi.mocked(useTrialDaysRemaining).mockReturnValue(1);
    const tree = create(<TrialExpiryBanner />);
    expect(tree.toJSON()).not.toBeNull();
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('내일 무료 체험이 끝나요');
  });

  it('daysRemaining=1이면 "구독하기" CTA를 표시한다', () => {
    vi.mocked(useAuthStore).mockReturnValue({ entitlement: 'trial' } as any);
    vi.mocked(useTrialDaysRemaining).mockReturnValue(1);
    const tree = create(<TrialExpiryBanner />);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('구독하기');
  });

  it('daysRemaining=1일 때 "구독하기" 탭 시 Subscribe 화면으로 이동한다 (D-1)', () => {
    vi.mocked(useAuthStore).mockReturnValue({ entitlement: 'trial' } as any);
    vi.mocked(useTrialDaysRemaining).mockReturnValue(1);
    const tree = create(<TrialExpiryBanner />);
    const touchable = tree.root.findByType('TouchableOpacity' as any);
    touchable.props.onPress();
    expect(mockNavigate).toHaveBeenCalledWith('Subscribe');
  });

  // --- D-0 렌더 조건 ---

  it('daysRemaining=0이면 "오늘 무료 체험이 끝나요" 메시지를 표시한다', () => {
    vi.mocked(useAuthStore).mockReturnValue({ entitlement: 'trial' } as any);
    vi.mocked(useTrialDaysRemaining).mockReturnValue(0);
    const tree = create(<TrialExpiryBanner />);
    expect(tree.toJSON()).not.toBeNull();
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('오늘 무료 체험이 끝나요');
  });

  it('daysRemaining=0일 때 "오늘 무료 체험이 끝나요"만 표시하고 "내일"은 포함하지 않는다', () => {
    vi.mocked(useAuthStore).mockReturnValue({ entitlement: 'trial' } as any);
    vi.mocked(useTrialDaysRemaining).mockReturnValue(0);
    const tree = create(<TrialExpiryBanner />);
    const json = JSON.stringify(tree.toJSON());
    expect(json).not.toContain('내일');
  });

  it('daysRemaining=0일 때 "구독하기" 탭 시 Subscribe 화면으로 이동한다 (D-0)', () => {
    vi.mocked(useAuthStore).mockReturnValue({ entitlement: 'trial' } as any);
    vi.mocked(useTrialDaysRemaining).mockReturnValue(0);
    const tree = create(<TrialExpiryBanner />);
    const touchable = tree.root.findByType('TouchableOpacity' as any);
    touchable.props.onPress();
    expect(mockNavigate).toHaveBeenCalledWith('Subscribe');
  });
});
