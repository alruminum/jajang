import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { getLyrics } from '../data/lyrics';
import { SONG_NAMES } from '../services/songs';

interface LyricsBoxProps {
  songKey: string;
  mode: 'preview' | 'recording';
}

export function LyricsBox({ songKey, mode }: LyricsBoxProps): React.ReactElement | null {
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

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1A1D30',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#2A2E48',
  },
  title: {
    color: '#EEF0F8',
    fontSize: 16,
    fontFamily: 'NotoSansKR-Regular',
    marginBottom: 10,
  },
  divider: {
    height: 1,
    backgroundColor: '#2A2E48',
    marginBottom: 12,
  },
  line: {
    color: '#EEF0F8',
    fontSize: 15,
    lineHeight: 24,
    fontFamily: 'NotoSansKR-Regular',
    marginBottom: 4,
  },
});
