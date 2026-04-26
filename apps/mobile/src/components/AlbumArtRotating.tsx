/**
 * AlbumArtRotating — 느린 회전 원형 앨범 아트
 *
 * impl: docs/milestones/v1/epics/epic-04-playback/impl/02-app-play-screen.md
 * - isPlaying=true → 120초 1회전 루프 애니메이션 시작
 * - isPlaying=false → 현재 위치에서 정지
 */

import React, { useEffect, useRef, useMemo } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { useTheme } from '@hooks/useTheme';

export interface AlbumArtRotatingProps {
  isPlaying: boolean;
  size?: number;
}

const ALBUM_ART_URI = 'https://assets.jajang.app/album-art.png';

export default function AlbumArtRotating({ isPlaying, size = 240 }: AlbumArtRotatingProps) {
  const { colors } = useTheme();
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  const styles = useMemo(() => StyleSheet.create({
    base: {
      backgroundColor: colors.surface,
    },
  }), [colors]);

  useEffect(() => {
    if (isPlaying) {
      animRef.current = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 120_000, // 120초 1회전 (ux-flow.md 명시값)
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      animRef.current.start();
    } else {
      animRef.current?.stop();
    }
  }, [isPlaying, rotateAnim]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.Image
      source={{ uri: ALBUM_ART_URI }}
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        { transform: [{ rotate }] },
      ]}
      accessibilityLabel="앨범 아트"
    />
  );
}
