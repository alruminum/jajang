import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTrialDaysRemaining } from '@hooks/useEntitlement';
import { useAuthStore } from '@store/auth-store';
import { useTheme } from '@hooks/useTheme';

export default function TrialBadge() {
  const { entitlement } = useAuthStore();
  const daysRemaining = useTrialDaysRemaining();
  const { colors } = useTheme();

  const styles = useMemo(() => StyleSheet.create({
    badge: {
      backgroundColor: colors.accentPrimary14,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 6,
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: colors.accentPrimary33,
    },
    text: {
      color: colors.accentPrimary,
      fontSize: 13,
      fontWeight: '500',
    },
  }), [colors]);

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
