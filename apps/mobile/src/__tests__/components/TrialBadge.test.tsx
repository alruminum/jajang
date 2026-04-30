import React from 'react';
import { act, create } from 'react-test-renderer';

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (s: any) => s },
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
    },
    isDark: false,
  }),
}));

import { useAuthStore } from '@store/auth-store';
import { useTrialDaysRemaining } from '@hooks/useEntitlement';
import TrialBadge from '@components/TrialBadge';

function renderBadge(): ReturnType<typeof create> {
  let tree: ReturnType<typeof create>;
  act(() => {
    tree = create(<TrialBadge />);
  });
  return tree!;
}

describe('TrialBadge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- null 반환 조건 ---

  it('entitlement가 free이면 null을 반환한다 (트라이얼 아님)', () => {
    jest.mocked(useAuthStore).mockReturnValue({ entitlement: 'free' } as any);
    jest.mocked(useTrialDaysRemaining).mockReturnValue(5);
    const tree = renderBadge();
    expect(tree.toJSON()).toBeNull();
  });

  it('entitlement가 paid이면 null을 반환한다', () => {
    jest.mocked(useAuthStore).mockReturnValue({ entitlement: 'paid' } as any);
    jest.mocked(useTrialDaysRemaining).mockReturnValue(3);
    const tree = renderBadge();
    expect(tree.toJSON()).toBeNull();
  });

  it('daysRemaining이 null이면 null을 반환한다', () => {
    jest.mocked(useAuthStore).mockReturnValue({ entitlement: 'trial' } as any);
    jest.mocked(useTrialDaysRemaining).mockReturnValue(null);
    const tree = renderBadge();
    expect(tree.toJSON()).toBeNull();
  });

  // --- 정상 렌더 조건 ---

  it('트라이얼 daysRemaining=7이면 "7일 무료 체험 중" 텍스트를 포함한다', () => {
    jest.mocked(useAuthStore).mockReturnValue({ entitlement: 'trial' } as any);
    jest.mocked(useTrialDaysRemaining).mockReturnValue(7);
    const tree = renderBadge();
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('7일 무료 체험 중');
  });

  it('daysRemaining=7이면 "7일 남음" 텍스트를 포함한다', () => {
    jest.mocked(useAuthStore).mockReturnValue({ entitlement: 'trial' } as any);
    jest.mocked(useTrialDaysRemaining).mockReturnValue(7);
    const tree = renderBadge();
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('7일 남음');
  });

  it('daysRemaining=5이면 "5일 남음" 텍스트를 포함한다', () => {
    jest.mocked(useAuthStore).mockReturnValue({ entitlement: 'trial' } as any);
    jest.mocked(useTrialDaysRemaining).mockReturnValue(5);
    const tree = renderBadge();
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('5일 남음');
  });

  it('daysRemaining=1이면 "1일 남음" 텍스트를 포함한다 (D-1 경계값)', () => {
    jest.mocked(useAuthStore).mockReturnValue({ entitlement: 'trial' } as any);
    jest.mocked(useTrialDaysRemaining).mockReturnValue(1);
    const tree = renderBadge();
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('1일 남음');
  });

  it('daysRemaining=0이면 "오늘 만료" 텍스트를 포함한다 (D-0)', () => {
    jest.mocked(useAuthStore).mockReturnValue({ entitlement: 'trial' } as any);
    jest.mocked(useTrialDaysRemaining).mockReturnValue(0);
    const tree = renderBadge();
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('오늘 만료');
  });

  it('daysRemaining=0이면 "일 남음" 텍스트를 포함하지 않는다', () => {
    jest.mocked(useAuthStore).mockReturnValue({ entitlement: 'trial' } as any);
    jest.mocked(useTrialDaysRemaining).mockReturnValue(0);
    const tree = renderBadge();
    const json = JSON.stringify(tree.toJSON());
    expect(json).not.toContain('일 남음');
  });
});
