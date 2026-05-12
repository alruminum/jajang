import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { getLyrics } from '../data/lyrics';
import { SONG_NAMES } from '../services/songs';
import { useTheme } from '@hooks/useTheme';
import type { ColorTokens } from '../theme/tokens';

interface LyricsBoxProps {
  songKey: string;
  mode: 'preview' | 'recording';
}

export function LyricsBox({ songKey, mode }: LyricsBoxProps): React.ReactElement | null {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const lyrics = getLyrics(songKey);
  const title = SONG_NAMES[songKey];
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [opacity, songKey]);

  if (!lyrics || !title) {
    return null;
  }

  return (
    <Animated.View
      style={[styles.container, { opacity }]}
      accessibilityLabel={`가사 ${mode === 'preview' ? '미리보기' : '안내'} ${title}`}
    >
      <Text style={styles.title}>{title}</Text>
      <View style={styles.divider} />
      {lyrics.lines.map((line, i) => (
        <Text key={i} style={styles.line}>{line}</Text>
      ))}
    </Animated.View>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 16,
    fontFamily: 'NotoSansKR-Regular',
    marginBottom: 10,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  line: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 24,
    fontFamily: 'NotoSansKR-Regular',
    marginBottom: 4,
  },
});
