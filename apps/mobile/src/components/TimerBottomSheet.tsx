/**
 * TimerBottomSheet — 수면 타이머 선택 시트
 *
 * 커버 스토리: Story 4 (수면 타이머)
 * impl: docs/milestones/v1/epics/epic-04-playback/impl/03-app-timer-bottomsheet.md
 *
 * 모듈 경계:
 * - TimerBottomSheet → AudioEngine: setTimer, clearTimer 호출
 * - TimerBottomSheet → PlayerSlice: currentEndsAt (read-only, props로 전달받음)
 * - S13 PlayScreen → TimerBottomSheet: visible, onClose, currentEndsAt props 전달
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { setTimer, clearTimer } from '@audio/AudioEngine';

// ─── 타이머 옵션 상수 ──────────────────────────────────────────────────────────

export const TIMER_OPTIONS = [
  { label: '30분',   durationMs: 30 * 60 * 1000 },
  { label: '1시간',  durationMs: 60 * 60 * 1000 },
  { label: '2시간',  durationMs: 2 * 60 * 60 * 1000 },
  { label: '6시간',  durationMs: 6 * 60 * 60 * 1000 },
  { label: '10시간', durationMs: 10 * 60 * 60 * 1000 },
] as const;

// ─── Props ─────────────────────────────────────────────────────────────────────

interface TimerBottomSheetProps {
  visible: boolean;
  /** PlayerSlice.timerEndsAt */
  currentEndsAt: number | null;
  onClose: () => void;
}

// ─── TimerBottomSheet ──────────────────────────────────────────────────────────

export default function TimerBottomSheet({
  visible,
  currentEndsAt,
  onClose,
}: TimerBottomSheetProps) {
  const handleSelect = (durationMs: number) => {
    setTimer(durationMs);
    onClose();
  };

  const handleClear = () => {
    clearTimer();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
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

// ─── 스타일 ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // 반투명 배경 오버레이
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },

  // 바텀시트 컨테이너
  sheet: {
    backgroundColor: '#1A1D2E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 24,
    paddingBottom: 40,
    paddingHorizontal: 24,
  },

  // 제목
  title: {
    color: '#EEF0F8',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },

  // 타이머 옵션 행
  option: {
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2D3050',
  },
  optionLabel: {
    color: '#EEF0F8',
    fontSize: 16,
    textAlign: 'center',
  },

  // 타이머 끄기 행
  clearOption: {
    paddingVertical: 16,
    marginTop: 8,
  },
  clearLabel: {
    color: '#5A7AA8',
    fontSize: 16,
    textAlign: 'center',
  },
});
