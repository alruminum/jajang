/**
 * WaveformVisualizer — 파형 시각화 컴포넌트
 *
 * mode='realtime' : levels 배열(0~1 정규화 dB)을 props로 받아 실시간 렌더 (S10)
 * mode='static'   : 녹음 중 수집한 levels 배열로 정적 파형 렌더 (S11)
 *                   playbackPosition(0~1)에 따라 재생된 부분/미재생 부분 색상 구분
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';

const BAR_COUNT = 40;
const MIN_HEIGHT = 4;
const MAX_HEIGHT = 60;
const OPACITY_BASE = 0.5;   // 무음 상태 최소 불투명도
const OPACITY_RANGE = 0.5;  // 레벨에 따라 추가되는 불투명도 범위

type WaveformVisualizerProps =
  | {
      mode: 'realtime';
      levels: number[];  // 0~1 정규화된 dB 레벨 (최근 BAR_COUNT개)
      color?: string;
      height?: number;
      playbackPosition?: never;
    }
  | {
      mode: 'static';
      levels: number[];  // 0~1 정규화된 dB 레벨 (V1: recordingSlice의 recordingLevels)
      color?: string;
      height?: number;
      playbackPosition?: number;  // 0~1 재생 진행도 (재생된 부분 앰버, 나머지 dim)
    };

export function WaveformVisualizer({
  mode,
  levels,
  color = '#82B090',
  height = 80,
  playbackPosition,
}: WaveformVisualizerProps) {
  // levels 배열 → BAR_COUNT개로 샘플링 또는 패딩
  const bars = React.useMemo(() => {
    const result: number[] = [];
    for (let i = 0; i < BAR_COUNT; i++) {
      const level = levels[levels.length - BAR_COUNT + i] ?? 0;
      result.push(MIN_HEIGHT + level * (MAX_HEIGHT - MIN_HEIGHT));
    }
    return result;
  }, [levels]);

  const playedUpTo = mode === 'static' && playbackPosition != null
    ? Math.round(playbackPosition * BAR_COUNT)
    : BAR_COUNT;

  return (
    <View style={[styles.container, { height }]}>
      {bars.map((barHeight, i) => {
        const isPlayed = mode === 'static' && i < playedUpTo;
        const barColor = mode === 'static'
          ? (isPlayed ? '#82B090' : color)
          : color;
        return (
          <View
            key={i}
            style={[
              styles.bar,
              {
                height: barHeight,
                backgroundColor: barColor,
                opacity: OPACITY_BASE + (barHeight / MAX_HEIGHT) * OPACITY_RANGE,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  bar: {
    width: 4,
    borderRadius: 2,
  },
});
