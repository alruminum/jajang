// apps/mobile/src/components/GeneratingAnimation.tsx
// 달/별 float 애니메이션 — RN Animated (lottie-react-native 미설치 확인 후 Animated 채택)

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Text, StyleSheet } from 'react-native';

export default function GeneratingAnimation() {
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -10,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 10,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [floatAnim]);

  return (
    <Animated.Text
      style={[styles.emoji, { transform: [{ translateY: floatAnim }] }]}
      accessibilityLabel="달과 별 일러스트"
    >
      {'🌙✨'}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  emoji: { fontSize: 64, marginBottom: 32 },
});
