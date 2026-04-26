import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTrialDaysRemaining } from '@hooks/useEntitlement';
import { useAuthStore } from '@store/auth-store';
import { MainStackParamList } from '@navigation/types';
import { useTheme } from '@hooks/useTheme';

type NavProp = NativeStackNavigationProp<MainStackParamList>;

export default function TrialExpiryBanner() {
  const { entitlement } = useAuthStore();
  const daysRemaining = useTrialDaysRemaining();
  const navigation = useNavigation<NavProp>();
  const { colors } = useTheme();

  const styles = useMemo(() => StyleSheet.create({
    banner: {
      backgroundColor: colors.accentPrimary14,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.accentPrimary20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 12,
      marginHorizontal: 0,
    },
    message: {
      color: colors.textPrimary,
      fontSize: 13,
      flex: 1,
    },
    cta: {
      color: colors.accentPrimary,
      fontSize: 13,
      fontWeight: '600',
      marginLeft: 12,
    },
  }), [colors]);

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
