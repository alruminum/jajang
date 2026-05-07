import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Linking,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../navigation/types';
import { LyricsBox } from '../components/LyricsBox';
import { getLyrics } from '../data/lyrics';
import { SONG_NAMES } from '../services/songs';

type Props = NativeStackScreenProps<MainStackParamList, 'RecordGuide'>;

const EARPHONE_WARNING_KEY = '@jajang:earphone_warning_dismissed';

const GUIDE_ITEMS = [
  '조용한 방에서 해주세요',
  '마이크를 입에서 20~30cm 거리로',
  '이어폰을 끼면 더 또렷하게 담겨요',
];

const GUIDE_HEADLINE = '1 loop 동안 자유롭게\n따라불러도, 허밍해도, 쉬쉬 소리만 내도 좋습니다\n더 많이 녹음할수록 더 풍성해집니다';

export function RecordGuideScreen({ navigation, route }: Props) {
  const { songKey } = route.params;

  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [showEarphoneModal, setShowEarphoneModal] = useState(false);

  const lyricsAvailable = !!getLyrics(songKey) && !!SONG_NAMES[songKey];

  const checkEarphoneAndNavigate = async () => {
    const warningDismissed = await AsyncStorage.getItem(EARPHONE_WARNING_KEY);
    if (!warningDismissed) {
      setShowEarphoneModal(true);
      return;
    }
    navigation.navigate('Record', { songKey });
  };

  const handleStartRecording = async () => {
    const current = await getRecordingPermissionsAsync();

    if (current.status === 'granted') {
      // 이어폰 경고 1회 정책 체크 (자동 감지 없음 — PRD §위험/완화)
      await checkEarphoneAndNavigate();
      return;
    }

    if (current.canAskAgain) {
      const { status } = await requestRecordingPermissionsAsync();
      if (status === 'granted') {
        await checkEarphoneAndNavigate();
      } else {
        const after = await getRecordingPermissionsAsync();
        if (!after.canAskAgain) {
          setShowPermissionModal(true);
        }
      }
      return;
    }

    setShowPermissionModal(true);
  };

  const handleProceedWithoutEarphones = async () => {
    await AsyncStorage.setItem(EARPHONE_WARNING_KEY, 'true');
    setShowEarphoneModal(false);
    navigation.navigate('Record', { songKey });
  };

  const handleCancelEarphoneModal = () => {
    setShowEarphoneModal(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{GUIDE_HEADLINE}</Text>

      <View style={styles.guideList}>
        {GUIDE_ITEMS.map((item, i) => (
          <View key={i} style={styles.guideItem}>
            <Text style={styles.checkmark}>✓</Text>
            <Text style={styles.guideText}>{item}</Text>
          </View>
        ))}
      </View>

      <HeadphoneChip />

      {lyricsAvailable
        ? <LyricsBox songKey={songKey} mode="preview" />
        : <Text style={styles.fallbackText}>자유롭게 따라불러 주세요</Text>
      }

      <Pressable
        style={styles.cta}
        onPress={handleStartRecording}
        accessibilityLabel="녹음 시작"
        testID="record-guide-cta"
      >
        <Text style={styles.ctaText}>녹음 시작할게요</Text>
      </Pressable>

      <PermissionModal
        visible={showPermissionModal}
        onGoToSettings={() => {
          setShowPermissionModal(false);
          Linking.openSettings();
        }}
        onDismiss={() => setShowPermissionModal(false)}
      />

      <EarphoneWarningModal
        visible={showEarphoneModal}
        onProceed={handleProceedWithoutEarphones}
        onCancel={handleCancelEarphoneModal}
      />
    </View>
  );
}

function HeadphoneChip() {
  return (
    <View style={chipStyles.container}>
      <Text style={chipStyles.icon}>🎧</Text>
      <Text style={chipStyles.text}>이어폰을 끼면 더 또렷하게 담겨요</Text>
    </View>
  );
}

interface PermissionModalProps {
  visible: boolean;
  onGoToSettings: () => void;
  onDismiss: () => void;
}

function PermissionModal({
  visible,
  onGoToSettings,
  onDismiss,
}: PermissionModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={modal.overlay}>
        <View style={modal.sheet}>
          <Text style={modal.title}>마이크 접근이 필요해요</Text>
          <Text style={modal.desc}>
            목소리를 녹음하려면 마이크 권한이 필요해요.{'\n'}
            설정에서 마이크를 허용해주세요.
          </Text>
          <Pressable style={modal.primaryBtn} onPress={onGoToSettings}>
            <Text style={modal.primaryBtnText}>설정으로 가기</Text>
          </Pressable>
          <Pressable style={modal.secondaryBtn} onPress={onDismiss}>
            <Text style={modal.secondaryBtnText}>나중에</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

interface EarphoneWarningModalProps {
  visible: boolean;
  onProceed: () => void;
  onCancel: () => void;
}

function EarphoneWarningModal({ visible, onProceed, onCancel }: EarphoneWarningModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={modal.overlay}>
        <View style={modal.sheet}>
          <Text style={modal.title}>이어폰을 끼면 더 잘 담겨요</Text>
          <Text style={modal.desc}>
            이어폰 없이 녹음하면 스피커 소리가 마이크에 섞일 수 있어요.{'\n'}
            그래도 진행할까요?
          </Text>
          <Pressable
            style={modal.primaryBtn}
            onPress={onProceed}
            accessibilityLabel="이어폰 없이 진행하기"
          >
            <Text style={modal.primaryBtnText}>그래도 진행</Text>
          </Pressable>
          <Pressable
            style={modal.secondaryBtn}
            onPress={onCancel}
            accessibilityLabel="돌아가기"
          >
            <Text style={modal.secondaryBtnText}>이어폰 끼고 할게요</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0F1A',
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  title: {
    color: '#EEF0F8',
    fontSize: 22,
    fontFamily: 'NotoSansKR-Regular',
    marginBottom: 28,
  },
  guideList: { marginBottom: 20 },
  guideItem: {
    flexDirection: 'row',
    marginBottom: 14,
    alignItems: 'flex-start',
  },
  checkmark: { color: '#5A7AA8', fontSize: 16, marginRight: 10, marginTop: 1 },
  guideText: {
    color: '#EEF0F8',
    fontSize: 15,
    lineHeight: 24,
    flex: 1,
    fontFamily: 'NotoSansKR-Regular',
  },
  fallbackText: {
    color: '#7B80A0',
    fontSize: 15,
    fontFamily: 'NotoSansKR-Regular',
    marginBottom: 24,
  },
  cta: {
    height: 56,
    backgroundColor: '#5A7AA8',
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 'auto',
    marginBottom: 32,
  },
  ctaText: {
    color: '#0D0F1A',
    fontSize: 17,
    fontFamily: 'NotoSansKR-Regular',
  },
});

const chipStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#82B090',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    marginBottom: 20,
  },
  icon: { fontSize: 14, marginRight: 6 },
  text: { color: '#82B090', fontSize: 13, fontFamily: 'NotoSansKR-Regular' },
});

const modal = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: '#1A1D30',
    borderRadius: 20,
    padding: 24,
    width: '100%',
  },
  title: {
    color: '#EEF0F8',
    fontSize: 18,
    fontFamily: 'NotoSansKR-Regular',
    marginBottom: 12,
  },
  desc: { color: '#7B80A0', fontSize: 14, lineHeight: 22, marginBottom: 24 },
  primaryBtn: {
    height: 52,
    backgroundColor: '#5A7AA8',
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryBtnText: {
    color: '#0D0F1A',
    fontSize: 16,
    fontFamily: 'NotoSansKR-Regular',
  },
  secondaryBtn: { height: 44, justifyContent: 'center', alignItems: 'center' },
  secondaryBtnText: { color: '#7B80A0', fontSize: 15 },
});
