import React, { useMemo, useState } from 'react';
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
import { useAuthStore } from '@store/authSlice';
import { useTheme } from '@hooks/useTheme';
import type { ColorTokens } from '../theme/tokens';

type Props = NativeStackScreenProps<MainStackParamList, 'RecordGuide'>;

const EARPHONE_WARNING_KEY = '@jajang:earphone_warning_dismissed';

const GUIDE_ITEMS = [
  '조용한 방에서 해주세요',
  '마이크를 입에서 20~30cm 거리로',
  '이어폰을 끼면 더 또렷하게 담겨요',
];

const FREE_GENERATION_LIMIT = 3;

const GUIDE_HEADLINE = '1 loop 동안 자유롭게 — 따라불러도, 허밍해도, 쉬쉬 소리만 내도 좋습니다';

const makeStyles = (colors: ColorTokens) => ({
  base: StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bgPrimary,
      paddingHorizontal: 20,
      paddingTop: 24,
    },
    header: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'flex-start' as const,
      marginBottom: 28,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 22,
      fontFamily: 'NotoSansKR-Regular',
      flex: 1,
    },
    counterChip: {
      backgroundColor: colors.surfaceHigh,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginLeft: 8,
    },
    counterText: { color: colors.textSecondary, fontSize: 13 },
    guideList: { marginBottom: 20 },
    guideItem: {
      flexDirection: 'row' as const,
      marginBottom: 14,
      alignItems: 'flex-start' as const,
    },
    checkmark: { color: colors.accentPrimary, fontSize: 16, marginRight: 10, marginTop: 1 },
    guideText: {
      color: colors.textPrimary,
      fontSize: 15,
      lineHeight: 24,
      flex: 1,
      fontFamily: 'NotoSansKR-Regular',
    },
    fallbackText: {
      color: colors.textSecondary,
      fontSize: 15,
      fontFamily: 'NotoSansKR-Regular',
      marginBottom: 24,
    },
    cta: {
      height: 56,
      backgroundColor: colors.accentPrimary,
      borderRadius: 28,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      marginTop: 'auto' as const,
      marginBottom: 32,
    },
    ctaText: {
      color: colors.bgPrimary,
      fontSize: 17,
      fontFamily: 'NotoSansKR-Regular',
    },
  }),
  chip: StyleSheet.create({
    container: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      borderWidth: 1,
      borderColor: '#82B090', // TODO(task 09 token-define): #82B090 → mutedGreen 토큰 정의 후 colors.mutedGreen 교체
      borderRadius: 20,
      paddingVertical: 8,
      paddingHorizontal: 14,
      alignSelf: 'flex-start' as const,
      marginBottom: 20,
    },
    icon: { fontSize: 14, marginRight: 6 },
    text: { color: '#82B090', fontSize: 13, fontFamily: 'NotoSansKR-Regular' }, // TODO(task 09 token-define): 동일
  }),
  modal: StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      padding: 24,
    },
    sheet: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 24,
      width: '100%' as const,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 18,
      fontFamily: 'NotoSansKR-Regular',
      marginBottom: 12,
    },
    desc: { color: colors.textSecondary, fontSize: 14, lineHeight: 22, marginBottom: 24 },
    primaryBtn: {
      height: 52,
      backgroundColor: colors.accentPrimary,
      borderRadius: 26,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      marginBottom: 12,
    },
    primaryBtnText: {
      color: colors.bgPrimary,
      fontSize: 16,
      fontFamily: 'NotoSansKR-Regular',
    },
    secondaryBtn: { height: 44, justifyContent: 'center' as const, alignItems: 'center' as const },
    secondaryBtnText: { color: colors.textSecondary, fontSize: 15 },
  }),
});

export function RecordGuideScreen({ navigation, route }: Props) {
  const { songKey } = route.params;

  const { colors } = useTheme();
  const styleSet = useMemo(() => makeStyles(colors), [colors]);

  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [showEarphoneModal, setShowEarphoneModal] = useState(false);

  const authState = useAuthStore() as unknown as {
    entitlement: 'free' | 'trial' | 'premium';
    generationCount: number;
  };
  const { entitlement, generationCount } = authState;
  const isFreeUser = entitlement === 'free';

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

  // 내부 컴포넌트 — styleSet 클로저 캡처
  function HeadphoneChip() {
    return (
      <View style={styleSet.chip.container}>
        <Text style={styleSet.chip.icon}>🎧</Text>
        <Text style={styleSet.chip.text}>이어폰을 끼면 더 또렷하게 담겨요</Text>
      </View>
    );
  }

  function PermissionModal({
    visible,
    onGoToSettings,
    onDismiss,
  }: {
    visible: boolean;
    onGoToSettings: () => void;
    onDismiss: () => void;
  }) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onDismiss}
      >
        <View style={styleSet.modal.overlay}>
          <View style={styleSet.modal.sheet}>
            <Text style={styleSet.modal.title}>마이크 접근이 필요해요</Text>
            <Text style={styleSet.modal.desc}>
              목소리를 녹음하려면 마이크 권한이 필요해요.{'\n'}
              설정에서 마이크를 허용해주세요.
            </Text>
            <Pressable style={styleSet.modal.primaryBtn} onPress={onGoToSettings}>
              <Text style={styleSet.modal.primaryBtnText}>설정으로 가기</Text>
            </Pressable>
            <Pressable style={styleSet.modal.secondaryBtn} onPress={onDismiss}>
              <Text style={styleSet.modal.secondaryBtnText}>나중에</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  function EarphoneWarningModal({
    visible,
    onProceed,
    onCancel,
  }: {
    visible: boolean;
    onProceed: () => void;
    onCancel: () => void;
  }) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onCancel}
      >
        <View style={styleSet.modal.overlay}>
          <View style={styleSet.modal.sheet}>
            <Text style={styleSet.modal.title}>이어폰을 끼면 더 잘 담겨요</Text>
            <Text style={styleSet.modal.desc}>
              이어폰 없이 녹음하면 스피커 소리가 마이크에 섞일 수 있어요.{'\n'}
              그래도 진행할까요?
            </Text>
            <Pressable
              style={styleSet.modal.primaryBtn}
              onPress={onProceed}
              accessibilityLabel="이어폰 없이 진행하기"
            >
              <Text style={styleSet.modal.primaryBtnText}>그래도 진행</Text>
            </Pressable>
            <Pressable
              style={styleSet.modal.secondaryBtn}
              onPress={onCancel}
              accessibilityLabel="돌아가기"
            >
              <Text style={styleSet.modal.secondaryBtnText}>이어폰 끼고 할게요</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <View testID="record-guide-container" style={styleSet.base.container}>
      <View style={styleSet.base.header}>
        <Text testID="record-guide-title" style={styleSet.base.title}>{GUIDE_HEADLINE}</Text>
        {isFreeUser && (
          <View style={styleSet.base.counterChip} testID="free-generation-counter">
            <Text style={styleSet.base.counterText}>생성 {generationCount}/{FREE_GENERATION_LIMIT}</Text>
          </View>
        )}
      </View>

      <View style={styleSet.base.guideList}>
        {GUIDE_ITEMS.map((item, i) => (
          <View key={i} style={styleSet.base.guideItem}>
            <Text style={styleSet.base.checkmark}>✓</Text>
            <Text style={styleSet.base.guideText}>{item}</Text>
          </View>
        ))}
      </View>

      <HeadphoneChip />

      {lyricsAvailable
        ? <LyricsBox songKey={songKey} mode="preview" />
        : <Text style={styleSet.base.fallbackText}>자유롭게 따라불러 주세요</Text>
      }

      <Pressable
        testID="record-guide-cta"
        style={styleSet.base.cta}
        onPress={handleStartRecording}
        accessibilityLabel="녹음 시작"
      >
        <Text style={styleSet.base.ctaText}>녹음 시작할게요</Text>
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

export default RecordGuideScreen;
