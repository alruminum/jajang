import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Linking,
  Modal,
} from 'react-native';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../navigation/types';
import { LyricsBox } from '../components/LyricsBox';
import { getLyrics } from '../data/lyrics';
import { SONG_NAMES } from '../services/songs';
import { challengesApi } from '../services/api/challenges';

type Mode = 'humming' | 'shush';
type Props = NativeStackScreenProps<MainStackParamList, 'RecordGuide'>;

const GUIDE_ITEMS_HUMMING = [
  '조용한 방에서 해주세요',
  '마이크를 입에서 20~30cm 거리로',
  '30초 이상 이어주세요',
];

const GUIDE_ITEMS_SHUSH = [
  '조용한 방에서 해주세요',
  '마이크를 입에서 20~30cm 거리로',
  '쉬이이~ 길게 30초 이상 해주세요',
];

const MODE_LABEL: Record<Mode, string> = {
  humming: '허밍 모드',
  shush: '쉿 모드',
};

export function RecordGuideScreen({ navigation, route }: Props) {
  const { mode, songKey: rawSongKey } = route.params;
  const songKey = rawSongKey ?? '';

  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [challengePhrase, setChallengePhrase] = useState<string | null>(null);

  const guideItems = mode === 'humming' ? GUIDE_ITEMS_HUMMING : GUIDE_ITEMS_SHUSH;
  const showHeadphoneChip = mode === 'humming';
  const showLyricsBox = mode === 'humming';
  const lyricsAvailable = !!getLyrics(songKey) && !!SONG_NAMES[songKey];

  useEffect(() => {
    if (mode !== 'humming') return;
    challengesApi.getRandomPhrase().then((res) => {
      setChallengePhrase(res.phrase);
    }).catch(() => {
      // 로드 실패 시 무시
    });
  }, [mode]);

  const handleStartRecording = async () => {
    const current = await getRecordingPermissionsAsync();

    if (current.status === 'granted') {
      navigation.navigate('Record', { mode, songKey });
      return;
    }

    if (current.canAskAgain) {
      const { status } = await requestRecordingPermissionsAsync();
      if (status === 'granted') {
        navigation.navigate('Record', { mode, songKey });
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

  return (
    <View style={styles.container}>
      <Text style={styles.modeLabel}>[{MODE_LABEL[mode]}]</Text>
      <Text style={styles.title}>이렇게 해주세요</Text>

      <View style={styles.guideList}>
        {guideItems.map((item, i) => (
          <View key={i} style={styles.guideItem}>
            <Text style={styles.checkmark}>✓</Text>
            <Text style={styles.guideText}>{item}</Text>
          </View>
        ))}
      </View>

      {showHeadphoneChip && <HeadphoneChip />}

      {showLyricsBox && (
        lyricsAvailable
          ? <LyricsBox songKey={songKey} mode="preview" />
          : <Text style={styles.fallbackText}>허밍해 주세요</Text>
      )}

      {mode === 'humming' && challengePhrase != null && (
        <Text style={styles.challengePhrase}>{`"${challengePhrase}"`}</Text>
      )}

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
  challengePhrase: {
    color: '#EEF0F8',
    fontSize: 16,
    fontFamily: 'NotoSansKR-Regular',
    textAlign: 'center',
    marginBottom: 20,
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
