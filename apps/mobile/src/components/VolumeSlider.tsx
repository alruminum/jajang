/**
 * VolumeSlider — 볼륨 조절 슬라이더 (0.0 ~ 1.0)
 *
 * impl: docs/milestones/v1/epics/epic-04-playback/impl/02-app-play-screen.md
 * - disabled=true (crossfade 중) → 터치 무시
 * - PanResponder로 드래그 + 탭 모두 처리
 * - @react-native-community/slider 미사용 — 외부 패키지 없는 커스텀 구현
 */

import React, { useEffect, useRef, useMemo } from 'react';
import { View, PanResponder, StyleSheet } from 'react-native';
import type {
  GestureResponderEvent,
  PanResponderGestureState,
  LayoutChangeEvent,
} from 'react-native';
import { useTheme } from '@hooks/useTheme';

export interface VolumeSliderProps {
  value: number;       // 0.0 ~ 1.0
  disabled: boolean;   // crossfade 중 잠금
  onChange: (v: number) => void;
}

const THUMB_SIZE = 22;
const TRACK_HEIGHT = 4;

export default function VolumeSlider({ value, disabled, onChange }: VolumeSliderProps) {
  const { colors } = useTheme();
  const widthRef = useRef(0);
  const disabledRef = useRef(disabled);
  const onChangeRef = useRef(onChange);

  const styles = useMemo(() => StyleSheet.create({
    container: {
      height: 48,
      justifyContent: 'center',
      paddingHorizontal: THUMB_SIZE / 2,
    },
    containerDisabled: {
      opacity: 0.4,
    },
    trackBackground: {
      position: 'absolute',
      left: THUMB_SIZE / 2,
      right: THUMB_SIZE / 2,
      height: TRACK_HEIGHT,
      borderRadius: TRACK_HEIGHT / 2,
      backgroundColor: colors.border,
    },
    trackFill: {
      position: 'absolute',
      left: THUMB_SIZE / 2,
      height: TRACK_HEIGHT,
      borderRadius: TRACK_HEIGHT / 2,
      backgroundColor: colors.accentPrimary,
    },
    thumb: {
      position: 'absolute',
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      borderRadius: THUMB_SIZE / 2,
      backgroundColor: colors.accentPrimary,
      top: '50%',
      marginTop: -THUMB_SIZE / 2,
    },
  }), [colors]);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const computeValue = (locationX: number): number =>
    Math.max(0, Math.min(1, locationX / Math.max(widthRef.current, 1)));

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current,
      onMoveShouldSetPanResponder: () => !disabledRef.current,

      onPanResponderGrant: (e: GestureResponderEvent) => {
        if (disabledRef.current) return;
        onChangeRef.current(computeValue(e.nativeEvent.locationX));
      },

      onPanResponderMove: (e: GestureResponderEvent, _gs: PanResponderGestureState) => {
        if (disabledRef.current) return;
        onChangeRef.current(computeValue(e.nativeEvent.locationX));
      },
    }),
  ).current;

  const handleLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
  };

  const fillPercent = `${Math.round(value * 100)}%` as const;

  return (
    <View
      style={[styles.container, disabled && styles.containerDisabled]}
      onLayout={handleLayout}
      {...panResponder.panHandlers}
      accessibilityRole="adjustable"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      accessibilityLabel="볼륨"
    >
      <View style={styles.trackBackground} />
      <View style={[styles.trackFill, { width: fillPercent }]} />
      <View
        style={[
          styles.thumb,
          {
            left: fillPercent,
            marginLeft: -THUMB_SIZE / 2,
          },
        ]}
      />
    </View>
  );
}
