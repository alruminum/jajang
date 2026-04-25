import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Alert, ScrollView,
  StyleSheet, Linking, Platform, BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '@navigation/types';
import { setConsentFlag } from '@hooks/useConsentFlag';

type NavProp = NativeStackNavigationProp<AuthStackParamList, 'Privacy'>;

const PRIVACY_URL = 'https://jajang.app/privacy';  // 실제 URL로 교체 필요

export default function S02PrivacyScreen() {
  const navigation = useNavigation<NavProp>();
  const [agreed, setAgreed] = useState(false);

  const handleAgree = async () => {
    await setConsentFlag();
    navigation.navigate('Onboarding');
  };

  const handleDecline = () => {
    Alert.alert(
      '동의가 필요해요',
      '목소리 수집에 동의해야 자장가를 만들 수 있어요. 동의 없이는 앱을 사용하기 어려워요.',
      [
        { text: '다시 생각해볼게요', style: 'cancel' },
        { text: '앱 종료', style: 'destructive', onPress: () => {
          if (Platform.OS === 'android') BackHandler.exitApp();
        }},
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>목소리 수집 동의</Text>
        <Text style={styles.subtitle}>자장가를 만들기 위해 아래 내용을 확인해주세요</Text>

        <View style={styles.card}>
          {CONSENT_ITEMS.map((item, i) => (
            <View key={i} style={styles.row}>
              <Text style={styles.bullet}>·</Text>
              <View style={styles.rowContent}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemDesc}>{item.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity
          onPress={() => Linking.openURL(PRIVACY_URL)}
          accessibilityRole="link"
          accessibilityLabel="개인정보처리방침 전문 보기"
        >
          <Text style={styles.link}>개인정보처리방침 전문 보기 →</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.checkRow}
          onPress={() => setAgreed(!agreed)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreed }}
          accessibilityLabel="[필수] 목소리 수집 및 처리에 동의해요"
        >
          <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
            {agreed && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkLabel}>[필수] 목소리 수집 및 처리에 동의해요</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryBtn, !agreed && styles.primaryBtnDisabled]}
          onPress={handleAgree}
          disabled={!agreed}
          accessibilityRole="button"
          accessibilityLabel="동의하고 시작할게요"
          accessibilityState={{ disabled: !agreed }}
        >
          <Text style={[styles.primaryBtnText, !agreed && styles.primaryBtnTextDisabled]}>
            동의하고 시작할게요
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleDecline}
          style={styles.secondaryBtn}
          accessibilityRole="button"
          accessibilityLabel="동의하지 않을게요"
        >
          <Text style={styles.secondaryBtnText}>동의하지 않을게요</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const CONSENT_ITEMS = [
  { title: '수집 항목', desc: '음성 샘플 (30~60초 녹음)' },
  { title: '보관 기간', desc: '자장가 생성 완료 후 24시간 이내 서버에서 자동 삭제' },
  { title: '이용 목적', desc: 'AI 자장가 생성에만 사용, 다른 목적 불가' },
  { title: '제3자 제공', desc: '없음' },
  { title: '목소리 주의', desc: '본인 목소리만 녹음해주세요. 제3자 목소리 업로드는 금지돼요' },
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0F1A' },
  scroll: { padding: 24, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '600', color: '#F5C97A', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#7B80A0', marginBottom: 24, lineHeight: 20 },
  card: { backgroundColor: '#1A1D30', borderRadius: 16, padding: 20, marginBottom: 16 },
  row: { flexDirection: 'row', marginBottom: 14 },
  bullet: { color: '#F5C97A', marginRight: 8, marginTop: 2 },
  rowContent: { flex: 1 },
  itemTitle: { color: '#EEF0F8', fontSize: 14, fontWeight: '500', marginBottom: 2 },
  itemDesc: { color: '#7B80A0', fontSize: 13, lineHeight: 18 },
  link: { color: '#8BAED4', fontSize: 13, marginBottom: 24 },
  checkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
    borderColor: '#7B80A0', marginRight: 12, alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#F5C97A', borderColor: '#F5C97A' },
  checkmark: { color: '#0D0F1A', fontSize: 13, fontWeight: '700' },
  checkLabel: { color: '#EEF0F8', fontSize: 14, flex: 1 },
  footer: { padding: 24, paddingTop: 8 },
  primaryBtn: {
    backgroundColor: '#F5C97A', height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  primaryBtnDisabled: { backgroundColor: '#2A2E48' },
  primaryBtnText: { color: '#0D0F1A', fontSize: 16, fontWeight: '600' },
  primaryBtnTextDisabled: { color: '#7B80A0' },
  secondaryBtn: { alignItems: 'center', padding: 12 },
  secondaryBtnText: { color: '#7B80A0', fontSize: 14 },
});
