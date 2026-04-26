/**
 * TimerBottomSheet — 수면 타이머 선택 시트
 */

import React, { useMemo } from 'react';
import { Modal, View, Text, Pressable, TouchableOpacity, StyleSheet } from 'react-native';
import { setTimer, clearTimer } from '@audio/AudioEngine';
import { useTheme } from '@hooks/useTheme';

export const TIMER_OPTIONS = [
  { label: '30분',   durationMs: 30 * 60 * 1000 },
  { label: '1시간',  durationMs: 60 * 60 * 1000 },
  { label: '2시간',  durationMs: 2 * 60 * 60 * 1000 },
  { label: '6시간',  durationMs: 6 * 60 * 60 * 1000 },
  { label: '10시간', durationMs: 10 * 60 * 60 * 1000 },
] as const;

interface TimerBottomSheetProps {
  visible: boolean;
  currentEndsAt: number | null;
  onClose: () => void;
}

export default function TimerBottomSheet({ visible, currentEndsAt, onClose }: TimerBottomSheetProps) {
  const { colors } = useTheme();

  const styles = useMemo(() => StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.overlay },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 24,
      paddingBottom: 40,
      paddingHorizontal: 24,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: '600',
      marginBottom: 20,
      textAlign: 'center',
    },
    option: {
      paddingVertical: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    optionLabel: {
      color: colors.textPrimary,
      fontSize: 16,
      textAlign: 'center',
    },
    clearOption: { paddingVertical: 16, marginTop: 8 },
    clearLabel: { color: colors.accentPrimary, fontSize: 16, textAlign: 'center' },
  }), [colors]);

  const handleSelect = (durationMs: number) => { setTimer(durationMs); onClose(); };
  const handleClear = () => { clearTimer(); onClose(); };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <Text style={styles.title}>언제 꺼드릴까요?</Text>
        {TIMER_OPTIONS.map(({ label, durationMs }) => (
          <TouchableOpacity
            key={label}
            style={styles.option}
            onPress={() => handleSelect(durationMs)}
            accessibilityLabel={`${label} 후 종료`}
          >
            <Text style={styles.optionLabel}>{label}</Text>
          </TouchableOpacity>
        ))}
        {!!currentEndsAt && (
          <TouchableOpacity style={styles.clearOption} onPress={handleClear}>
            <Text style={styles.clearLabel}>타이머 끄기</Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}
