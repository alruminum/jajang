import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTrialDaysRemaining } from '@hooks/useEntitlement';
import { useAuthStore } from '@store/auth-store';

/**
 * 홈 화면 상단에 표시. 트라이얼 유저만 노출.
 * 예: "7일 무료 체험 중 · 5일 남음"
 */
export default function TrialBadge() {
  const { entitlement } = useAuthStore();
  const daysRemaining = useTrialDaysRemaining();

  if (entitlement !== 'trial' || daysRemaining === null) return null;

  return (
    <View style={styles.badge}>
      <Text style={styles.text}>
        7일 무료 체험 중
        {daysRemaining > 0 ? ` · ${daysRemaining}일 남음` : ' · 오늘 만료'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: 'rgba(130, 176, 144, 0.15)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(130, 176, 144, 0.3)',
  },
  text: {
    color: '#82B090',
    fontSize: 13,
    fontWeight: '500',
  },
});
