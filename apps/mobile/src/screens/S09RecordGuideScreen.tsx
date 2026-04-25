import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function S09RecordGuideScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.label}>[S09] 녹음 가이드</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0F1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: '#7B80A0',
    fontSize: 14,
  },
});
