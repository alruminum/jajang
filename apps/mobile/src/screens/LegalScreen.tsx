/**
 * LegalScreen — 법적 정보 화면
 *
 * Epic 06 Story 4 — 개인정보처리방침 & TOS 접근
 * impl: docs/milestones/v1/epics/epic-06-privacy/impl/05-app-legal-screen.md
 *
 * - 개인정보처리방침 / 이용약관 URL을 expo-web-browser 로 열기
 * - iOS: SFSafariViewController (PAGE_SHEET)
 * - Android: Chrome Custom Tabs
 * - 앱 버전 표시 (expo-constants)
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { LEGAL_URLS } from '../config/legalUrls';

// ─── 타입 ──────────────────────────────────────────────────────────────────────

interface LegalItem {
  label: string;
  url: string;
  accessibilityLabel: string;
}

// ─── 상수 ──────────────────────────────────────────────────────────────────────

const LEGAL_ITEMS: LegalItem[] = [
  {
    label: '개인정보처리방침',
    url: LEGAL_URLS.privacyPolicy,
    accessibilityLabel: '개인정보처리방침 보기',
  },
  {
    label: '이용약관',
    url: LEGAL_URLS.termsOfService,
    accessibilityLabel: '이용약관 보기',
  },
];

function getAppVersion(): string {
  return Constants.expoConfig?.version ?? '1.0.0';
}

// ─── LegalScreen ───────────────────────────────────────────────────────────────

export function LegalScreen() {
  const handleOpenUrl = useCallback(async (url: string) => {
    await WebBrowser.openBrowserAsync(url, {
      // iOS: SFSafariViewController 스타일
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      // 앱 테마 컬러 적용
      toolbarColor: '#0D0F1A',
      controlsColor: '#F5C97A',
    });
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>법적 정보</Text>

      {LEGAL_ITEMS.map((item) => (
        <TouchableOpacity
          key={item.url}
          style={styles.row}
          onPress={() => handleOpenUrl(item.url)}
          accessibilityLabel={item.accessibilityLabel}
          accessibilityRole="link"
        >
          <Text style={styles.label}>{item.label}</Text>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>
      ))}

      <Text style={styles.appVersion}>버전 {getAppVersion()}</Text>
    </View>
  );
}

export default LegalScreen;

// ─── 스타일 ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0F1A',
    paddingTop: 16,
  },
  header: {
    color: '#EEF0F8',
    fontSize: 20,
    fontWeight: '600',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2E48',
  },
  label: {
    flex: 1,
    color: '#EEF0F8',
    fontSize: 16,
  },
  arrow: {
    color: '#7B80A0',
    fontSize: 20,
  },
  appVersion: {
    color: '#7B80A0',
    fontSize: 13,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
});
