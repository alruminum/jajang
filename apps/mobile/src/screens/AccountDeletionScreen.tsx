/**
 * AccountDeletionScreen — 계정 탈퇴 2단계 확인 화면
 *
 * 커버 스토리: Epic 06 Story 3 — 계정 탈퇴 & 전체 데이터 삭제 (클라이언트)
 * impl: docs/milestones/v1/epics/epic-06-privacy/impl/04-app-account-deletion-flow.md
 *
 * 모듈 경계:
 * - AccountDeletionScreen → @services/accountApi: deleteMyAccount
 * - AccountDeletionScreen → @store: useAuthStore (entitlement, clearAuthState)
 * - AccountDeletionScreen → @store/generationSlice: clearAllTracks
 * - AccountDeletionScreen → @audio/AudioEngine: stopPlayback (TrackPlayer 큐 초기화)
 * - navigation.dispatch(CommonActions.reset) → 'Auth' 루트로 스택 초기화
 */

import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ScrollView,
  StyleSheet,
  Linking,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useNavigation, CommonActions } from '@react-navigation/native'
import * as FileSystem from 'expo-file-system'

import { deleteMyAccount, ActiveSubscriptionError } from '@services/accountApi'
import { useAuthStore } from '@store'
import { useGenerationStore } from '@store/generationSlice'
import { stopPlayback } from '@audio/AudioEngine'

// ─── 탈퇴 사유 타입 ───────────────────────────────────────────────────────────

type DeletionReason =
  | 'not_using'
  | 'missing_features'
  | 'privacy_concerns'
  | 'other'
  | null

interface ReasonOption {
  key: DeletionReason
  label: string
}

const DELETION_REASONS: ReasonOption[] = [
  { key: 'not_using', label: '더 이상 사용하지 않아요' },
  { key: 'missing_features', label: '원하는 기능이 없어요' },
  { key: 'privacy_concerns', label: '개인정보가 걱정돼요' },
  { key: 'other', label: '기타' },
]

// ─── 구독 취소 안내 Alert ─────────────────────────────────────────────────────

function showSubscriptionCancelGuide(platform: 'ios' | 'android') {
  const url =
    platform === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions'

  Alert.alert(
    '구독을 먼저 취소해주세요',
    '계정을 삭제하려면 먼저 구독을 취소해야 해요.\n앱스토어에서 구독을 취소한 뒤 다시 시도해주세요.',
    [
      { text: '나중에', style: 'cancel' },
      {
        text: '구독 취소하러 가기',
        onPress: () => Linking.openURL(url),
      },
    ],
  )
}

// ─── 앱스토어 구독 URL (구독 활성 배너용) ─────────────────────────────────────

const SUBSCRIPTION_MANAGE_URL =
  Platform.OS === 'ios'
    ? 'https://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions'

// ─── AccountDeletionScreen ────────────────────────────────────────────────────

export default function AccountDeletionScreen() {
  const navigation = useNavigation()

  const [selectedReason, setSelectedReason] = useState<DeletionReason>(null)
  const [isConfirmVisible, setIsConfirmVisible] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const { entitlement, clearAuthState } = useAuthStore()
  const { clearAllTracks } = useGenerationStore()

  // 구독 활성 여부 (클라이언트 사전 경고 — 서버 422도 반드시 처리)
  const hasActiveSubscription = entitlement === 'premium' || entitlement === 'trial'

  // ─── 로컬 데이터 초기화 ────────────────────────────────────────────────────

  const clearLocalData = useCallback(async () => {
    // 1. AudioEngine 통해 TrackPlayer 큐 + 재생 상태 초기화
    try {
      await stopPlayback()
    } catch {
      // 재생 중이 아닌 경우 무시
    }

    // 2. Zustand 상태 초기화
    clearAuthState()
    clearAllTracks()

    // 3. AsyncStorage 전체 삭제 (토큰, 캐시, 오프라인 큐 등)
    await AsyncStorage.clear()

    // 4. expo-file-system 로컬 mp3 캐시 삭제
    if (FileSystem.cacheDirectory) {
      await FileSystem.deleteAsync(FileSystem.cacheDirectory, { idempotent: true }).catch(
        () => {
          // 캐시 삭제 실패는 무시
        },
      )
    }
  }, [clearAuthState, clearAllTracks])

  // ─── 탈퇴 확인 핸들러 ──────────────────────────────────────────────────────

  const handleConfirmDeletion = useCallback(async () => {
    setIsDeleting(true)
    try {
      await deleteMyAccount()
      await clearLocalData()
      // 뒤로가기 불가 하도록 스택 초기화 후 Auth 루트로 이동
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'Auth' }],
        }),
      )
    } catch (err) {
      if (err instanceof ActiveSubscriptionError) {
        setIsConfirmVisible(false)
        showSubscriptionCancelGuide(err.detail.subscriptionPlatform)
      } else {
        Alert.alert('오류', '탈퇴 처리 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.')
      }
    } finally {
      setIsDeleting(false)
    }
  }, [navigation, clearLocalData])

  // ─── 렌더 ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityLabel="뒤로가기"
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>계정 탈퇴</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 구독 활성 배너 */}
        {hasActiveSubscription && (
          <View style={styles.subscriptionBanner}>
            <Text style={styles.subscriptionBannerText}>
              구독 취소 후 탈퇴 가능해요
            </Text>
            <TouchableOpacity
              onPress={() => Linking.openURL(SUBSCRIPTION_MANAGE_URL)}
              accessibilityLabel="앱스토어에서 구독 취소하기"
            >
              <Text style={styles.subscriptionBannerLink}>앱스토어에서 취소하기 →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 탈퇴 사유 선택 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>탈퇴 사유를 알려주세요</Text>
          <Text style={styles.sectionSubtitle}>(선택사항이에요)</Text>

          {DELETION_REASONS.map((reason) => (
            <TouchableOpacity
              key={reason.key}
              style={styles.reasonRow}
              onPress={() =>
                setSelectedReason(selectedReason === reason.key ? null : reason.key)
              }
              accessibilityLabel={reason.label}
              accessibilityState={{ selected: selectedReason === reason.key }}
            >
              <View
                style={[
                  styles.radio,
                  selectedReason === reason.key && styles.radioSelected,
                ]}
              >
                {selectedReason === reason.key && (
                  <View style={styles.radioDot} />
                )}
              </View>
              <Text style={styles.reasonLabel}>{reason.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* 다음으로 버튼 — 항상 활성 */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.nextBtn}
          onPress={() => setIsConfirmVisible(true)}
          accessibilityLabel="다음으로"
        >
          <Text style={styles.nextBtnText}>다음으로</Text>
        </TouchableOpacity>
      </View>

      {/* Step 2 — 최종 확인 바텀 시트 */}
      <Modal
        visible={isConfirmVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsConfirmVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>정말 탈퇴하시겠어요?</Text>
            <Text style={styles.modalSubtitle}>
              탈퇴하면 아래 데이터가{'\n'}모두 삭제돼요
            </Text>

            <View style={styles.deleteItemList}>
              <Text style={styles.deleteItem}>• 내 목소리 샘플</Text>
              <Text style={styles.deleteItem}>• 자장가 음원 전체</Text>
              <Text style={styles.deleteItem}>• 계정 정보</Text>
            </View>

            <Text style={styles.irreversibleText}>되돌릴 수 없어요</Text>

            {/* 탈퇴 확인 버튼 */}
            <TouchableOpacity
              style={[styles.confirmDeleteBtn, isDeleting && styles.confirmDeleteBtnDisabled]}
              onPress={handleConfirmDeletion}
              disabled={isDeleting}
              accessibilityLabel="계정 탈퇴 확인"
              accessibilityState={{ disabled: isDeleting }}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmDeleteText}>네, 탈퇴할게요</Text>
              )}
            </TouchableOpacity>

            {/* 취소 버튼 */}
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setIsConfirmVisible(false)}
              disabled={isDeleting}
              accessibilityLabel="탈퇴 취소"
            >
              <Text style={styles.cancelText}>아니요, 유지할게요</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

// ─── 스타일 ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0F1A',
  },

  // 헤더
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1D35',
  },
  backBtn: {
    marginRight: 12,
    padding: 4,
  },
  backIcon: {
    color: '#F5F5F5',
    fontSize: 20,
  },
  headerTitle: {
    color: '#F5F5F5',
    fontSize: 18,
    fontWeight: '700',
  },

  // 스크롤
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },

  // 구독 활성 배너
  subscriptionBanner: {
    backgroundColor: '#2A1A0F',
    borderWidth: 1,
    borderColor: '#F5C97A',
    borderRadius: 10,
    padding: 14,
    marginBottom: 24,
  },
  subscriptionBannerText: {
    color: '#F5C97A',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  subscriptionBannerLink: {
    color: '#F5C97A',
    fontSize: 13,
    textDecorationLine: 'underline',
  },

  // 섹션
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#F5F5F5',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: '#7B80A0',
    fontSize: 13,
    marginBottom: 16,
  },

  // 탈퇴 사유 라디오
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#4A4E68',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: '#F5C97A',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F5C97A',
  },
  reasonLabel: {
    color: '#E0E2F0',
    fontSize: 15,
  },

  // 하단 버튼
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#1A1D35',
  },
  nextBtn: {
    backgroundColor: '#4A6FFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  nextBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // 모달 오버레이
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#12152B',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 40,
  },
  modalTitle: {
    color: '#F5F5F5',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  modalSubtitle: {
    color: '#B0B4CC',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  deleteItemList: {
    backgroundColor: '#1A1D35',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    gap: 8,
  },
  deleteItem: {
    color: '#E0E2F0',
    fontSize: 14,
    lineHeight: 22,
  },
  irreversibleText: {
    color: '#FF6B6B',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 24,
  },

  // 탈퇴 확인 버튼
  confirmDeleteBtn: {
    backgroundColor: '#FF6B6B',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 14,
  },
  confirmDeleteBtnDisabled: {
    opacity: 0.6,
  },
  confirmDeleteText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // 취소 버튼
  cancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: {
    color: '#7B80A0',
    fontSize: 15,
  },
})
