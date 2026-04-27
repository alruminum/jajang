import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Linking,
  Modal,
} from 'react-native';
import { Audio } from 'expo-av';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../navigation/types';
import { challengesApi } from '../services/api/challenges';

type Props = NativeStackScreenProps<MainStackParamList, 'RecordGuide'>;

const GUIDE_ITEMS = [
  '조용한 방에서 해주세요',
  '마이크를 입에서 20~30cm 거리로',
  '30초 이상 이어주세요',
];

const MODE_LABEL: Record<'humming' | 'shush', string> = {
  humming: '허밍 모드',
  shush: '쉿 모드',
};

export function RecordGuideScreen({ navigation, route }: Props) {
  const { mode } = route.params;
  const [challengePhrase, setChallengePhrase] = useState<string | null>(null);
  const [showPermissionModal, setShowPermissionModal] = useState(false);

  useEffect(() => {
    challengesApi
      .getRandomPhrase()
      .then((r) => setChallengePhrase(r.phrase))
      .catch(() => {
        setChallengePhrase('자장 자장 우리 아기');
      });
  }, []);

  const handleStartRecording = async () => {
    // 1차: 현재 권한 상태 확인 (팝업 없이)
    const current = await Audio.getPermissionsAsync();

    if (current.status === 'granted') {
      navigation.navigate('Record', { mode, songKey: '' });
      return;
    }

    // canAskAgain === true → OS 팝업 요청 가능
    if (current.canAskAgain) {
      const { status } = await Audio.requestPermissionsAsync();
      if (status === 'granted') {
        navigation.navigate('Record', { mode, songKey: '' });
      } else {
        // 거부 후 canAskAgain 재확인
        const after = await Audio.getPermissionsAsync();
        if (!after.canAskAgain) {
          setShowPermissionModal(true);
        }
      }
      return;
    }

    // canAskAgain === false → OS 팝업 불가, 설정 유도
    setShowPermissionModal(true);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.modeLabel}>[{MODE_LABEL[mode]}]</Text>
      <Text style={styles.title}>이렇게 해주세요</Text>

      <View style={styles.guideList}>
        {GUIDE_ITEMS.map((item, i) => (
          <View key={i} style={styles.guideItem}>
            <Text style={styles.checkmark}>✓</Text>
            <Text style={styles.guideText}>{item}</Text>
          </View>
        ))}
      </View>

      {challengePhrase != null && (
        <View style={styles.challengeBox}>
          <Text style={styles.challengeLabel}>지금 직접 따라 읽어주세요:</Text>
          <Text style={styles.challengePhrase}>"{challengePhrase}"</Text>
        </View>
      )}

      <Pressable
        style={styles.cta}
        onPress={handleStartRecording}
        accessibilityLabel="녹음 시작"
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0F1A',
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  modeLabel: { color: '#5A7AA8', fontSize: 13, marginBottom: 6 },
  title: {
    color: '#EEF0F8',
    fontSize: 22,
    fontFamily: 'NotoSansKR-Regular',
    marginBottom: 28,
  },
  guideList: { marginBottom: 28 },
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
  challengeBox: {
    backgroundColor: '#1A1D30',
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#2A2E48',
  },
  challengeLabel: { color: '#7B80A0', fontSize: 13, marginBottom: 8 },
  challengePhrase: {
    color: '#EEF0F8',
    fontSize: 18,
    fontFamily: 'NotoSansKR-Regular',
    lineHeight: 28,
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
