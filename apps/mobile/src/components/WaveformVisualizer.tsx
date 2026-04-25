/**
 * WaveformVisualizer — 실시간 파형 시각화 컴포넌트
 *
 * mode='realtime' : levels 배열(0~1 정규화 dB)을 props로 받아 실시간 렌더
 * mode='static'   : audioUri 전체를 사전 분석해 파형 그리기 (S11에서 사용 예정)
 *
 * S10에서는 mode='realtime' 사용.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';

const BAR_COUNT = 40;
const MIN_HEIGHT = 4;
const MAX_HEIGHT = 60;
const OPACITY_BASE = 0.5;   // 무음 상태 최소 불투명도
const OPACITY_RANGE = 0.5;  // 레벨에 따라 추가되는 불투명도 범위

interface WaveformVisualizerProps {
  mode: 'realtime';
  levels: number[]; // 0~1 정규화된 dB 레벨 (최근 BAR_COUNT개)
  color?: string;
  height?: number;
}

export function WaveformVisualizer({
  levels,
  color = '#F5C97A',
  height = 80,
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

  return (
    <View style={[styles.container, { height }]}>
      {bars.map((barHeight, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            {
              height: barHeight,
              backgroundColor: color,
              // 높이에 따라 투명도 조정
              opacity: OPACITY_BASE + (barHeight / MAX_HEIGHT) * OPACITY_RANGE,
            },
          ]}
        />
      ))}
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
