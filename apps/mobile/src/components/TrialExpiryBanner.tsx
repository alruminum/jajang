import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTrialDaysRemaining } from '@hooks/useEntitlement';
import { useAuthStore } from '@store/auth-store';
import { MainStackParamList } from '@navigation/types';

type NavProp = NativeStackNavigationProp<MainStackParamList>;

/**
 * 트라이얼 D-1 이하에서만 노출
 * "내일 무료 체험이 끝나요 — 지금 구독하기"
 * PRD F14: 알림 권한 거부 유저에게 앱 내 배너로 대체 안내
 */
export default function TrialExpiryBanner() {
  const { entitlement } = useAuthStore();
  const daysRemaining = useTrialDaysRemaining();
  const navigation = useNavigation<NavProp>();

  // D-1 이하에서만 표시 (daysRemaining = 0 또는 1)
  if (entitlement !== 'trial' || daysRemaining === null || daysRemaining > 1) return null;

  const message =
    daysRemaining === 0
      ? '오늘 무료 체험이 끝나요'
      : '내일 무료 체험이 끝나요';

  return (
    <View style={styles.banner}>
      <Text style={styles.message}>{message}</Text>
      <TouchableOpacity
        onPress={() => navigation.navigate('Subscribe')}
        accessibilityRole="button"
        accessibilityLabel="지금 구독하기"
      >
        <Text style={styles.cta}>구독하기</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: 'rgba(130, 176, 144, 0.1)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(130, 176, 144, 0.25)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginHorizontal: 0,
  },
  message: {
    color: '#EEF0F8',
    fontSize: 13,
    flex: 1,
  },
  cta: {
    color: '#5A7AA8',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 12,
  },
});
