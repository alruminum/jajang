import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function S02PrivacyScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.label}>[S02] 개인정보처리방침</Text>
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
