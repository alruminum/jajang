import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  Animated,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { MainStackParamList } from '@navigation/types';
import { useAuthStore } from '@store/auth-store';
import TrialBadge from '@components/TrialBadge';
import TrialExpiryBanner from '@components/TrialExpiryBanner';
import { TrackCard } from '@components/TrackCard';
import { tracksApi, TrackItem } from '@services/api/tracks';
import { generationsApi } from '@services/api/generations';
import { useGenerationStore } from '@store/generationSlice';

type NavProp = NativeStackNavigationProp<MainStackParamList>;

const LAST_CHECKED_KEY = 'home_last_checked_at';

export default function S06HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const { entitlement } = useAuthStore();
  const { clearCompleted } = useGenerationStore();

  const [tracks, setTracks]                      = useState<TrackItem[]>([]);
  const [completedTrack, setCompletedTrack]       = useState<TrackItem | null>(null);
  const [showCompletedCard, setShowCompletedCard] = useState(false);
  const [loading, setLoading]                    = useState(false);
  const [refreshing, setRefreshing]              = useState(false);
  const [generationCount, setGenerationCount]    = useState<number | null>(null);

  const isFreeUser = entitlement === 'free';

  // "생성 완료 카드" pulse 애니메이션
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const startPulseAnimation = () => {
    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.03, duration: 400, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1.0,  duration: 400, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1.03, duration: 400, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1.0,  duration: 400, useNativeDriver: true }),
    ]).start();
  };

  const loadTracks = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const lastChecked = await AsyncStorage.getItem(LAST_CHECKED_KEY);

      const res = await tracksApi.listTracks({
        lastCheckedAt:   lastChecked ?? undefined,
        includePresigned: true,
      });

      setTracks(res.tracks);

      // 백그라운드 생성 완료 카드
      if (res.completed_since_last_check) {
        const newlyCompleted = res.tracks.find(t => t.status === 'completed');
        if (newlyCompleted) {
          setCompletedTrack(newlyCompleted);
          setShowCompletedCard(true);
          startPulseAnimation();
        }
      }

      // 무료 유저 생성 횟수 조회
      if (isFreeUser) {
        try {
          const counter = await generationsApi.getCounter();
          setGenerationCount(counter.count);
        } catch {
          // 카운터 조회 실패는 무시
        }
      }
    } catch (_e) {
      // 에러 시 기존 상태 유지
    } finally {
      setLoading(false);
      setRefreshing(false);
      await AsyncStorage.setItem(LAST_CHECKED_KEY, new Date().toISOString());
    }
  }, [isFreeUser]);

  // 화면 포커스 시 재조회
  useFocusEffect(
    useCallback(() => {
      loadTracks();
    }, [loadTracks]),
  );

  const handlePlayTrack = (track: TrackItem) => {
    navigation.navigate('Play', {
      trackId:    track.id,
      presignUrl: track.presigned_url ?? undefined,
    });
  };

  const handleRetryPending = (track: TrackItem) => {
    // 생성 중 카드 탭 → S12 복귀 (동일 job_id로 재진입)
    navigation.navigate('Generating', {
      sampleId: '',       // 이미 서버에서 job 진행 중 — sampleId 불필요
      songKey:  track.song_key,
      jobId:    track.job_id,
    });
  };

  const handleDeleteTrack = (track: TrackItem) => {
    // pending 트랙 삭제 불가 — 선제적 안내
    if (track.status === 'pending' || track.status === 'processing') {
      Alert.alert('삭제할 수 없어요', '생성 중인 트랙은 삭제할 수 없어요.');
      return;
    }

    Alert.alert(
      '자장가를 삭제할까요?',
      `"${track.song_name}"을 삭제하면 되돌릴 수 없어요.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await tracksApi.deleteTrack(track.id);
              setTracks(prev => prev.filter(t => t.id !== track.id));
              if (completedTrack?.id === track.id) {
                setShowCompletedCard(false);
                setCompletedTrack(null);
              }
            } catch {
              Alert.alert('삭제에 실패했어요', '잠시 후 다시 시도해주세요.');
            }
          },
        },
      ],
    );
  };

  const handleDismissCompletedCard = () => {
    setShowCompletedCard(false);
    setCompletedTrack(null);
    clearCompleted();
  };

  const completedTracks = tracks.filter(t => t.status === 'completed');
  const pendingTracks   = tracks.filter(t => t.status === 'pending' || t.status === 'processing');
  const failedTracks    = tracks.filter(t => t.status === 'failed');

  // 표시 순서: pending → completed (최신순) → failed
  const displayTracks = [...pendingTracks, ...completedTracks, ...failedTracks];

  const isEmpty = displayTracks.length === 0 && !loading;

  return (
    <SafeAreaView style={styles.container}>
      {/* D-1 배너 (최상단) */}
      <TrialExpiryBanner />

      <FlatList
        data={displayTracks}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadTracks(true)}
            tintColor="#F5C97A"
          />
        }
        ListHeaderComponent={
          <View>
            {/* 헤더 */}
            <View style={styles.header}>
              <View>
                <Text style={styles.greeting}>안녕하세요</Text>
                <Text style={styles.headerTitle}>내 자장가</Text>
              </View>
              {/* 트라이얼 배지 */}
              <TrialBadge />
            </View>

            {/* 생성 횟수 배지 (무료 유저만) */}
            {isFreeUser && generationCount !== null && (
              <View style={styles.counterBadge}>
                <Text style={styles.counterText}>생성 {generationCount}/3</Text>
              </View>
            )}

            {/* 백그라운드 생성 완료 카드 */}
            {showCompletedCard && completedTrack && (
              <Animated.View style={[styles.completedCard, { transform: [{ scale: pulseAnim }] }]}>
                <TouchableOpacity
                  style={styles.completedCardInner}
                  onPress={() => {
                    handleDismissCompletedCard();
                    handlePlayTrack(completedTrack);
                  }}
                  accessibilityLabel="새 자장가 완성! 들어보기"
                >
                  <Text style={styles.completedCardTitle}>🎵 새 자장가 완성!</Text>
                  <Text style={styles.completedCardSub}>들어볼까요? →</Text>
                </TouchableOpacity>
                <Pressable
                  style={styles.completedCardDismiss}
                  onPress={handleDismissCompletedCard}
                  accessibilityLabel="닫기"
                >
                  <Text style={styles.dismissText}>✕</Text>
                </Pressable>
              </Animated.View>
            )}

            {/* 스켈레톤 (로딩 중) */}
            {loading && (
              <View style={styles.skeletonWrap}>
                {[0, 1, 2].map(i => (
                  <View key={i} style={styles.skeletonItem} />
                ))}
              </View>
            )}

            {/* 빈 상태 */}
            {isEmpty && (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyEmoji}>🌙</Text>
                <Text style={styles.emptyTitle}>아직 자장가가 없어요</Text>
                <Text style={styles.emptySub}>목소리를 담아볼까요?</Text>
                <TouchableOpacity
                  style={styles.emptyCtaBtn}
                  onPress={() => navigation.navigate('SongSelect')}
                  accessibilityLabel="자장가 만들기"
                >
                  <Text style={styles.emptyCtaBtnText}>자장가 만들기</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 섹션 헤더 */}
            {!loading && !isEmpty && (
              <Text style={styles.sectionLabel}>
                내 자장가 ({completedTracks.length})
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.trackItemWrap}>
            <TrackCard
              track={item}
              onPlay={handlePlayTrack}
              onRetryPending={handleRetryPending}
              onDelete={handleDeleteTrack}
            />
          </View>
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* FAB — 새 자장가 */}
      {!isEmpty && !loading && (
        <Pressable
          style={styles.fab}
          onPress={() => navigation.navigate('SongSelect')}
          accessibilityLabel="새 자장가 만들기"
        >
          <Text style={styles.fabIcon}>+</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0F1A' },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  greeting:    { color: '#7B80A0', fontSize: 13, marginBottom: 4 },
  headerTitle: { color: '#EEF0F8', fontSize: 24, fontWeight: '700' },

  counterBadge: {
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: '#1A1D30',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  counterText: { color: '#7B80A0', fontSize: 13 },

  completedCard:       { marginHorizontal: 20, marginBottom: 16, backgroundColor: '#21253E', borderRadius: 16, overflow: 'hidden' },
  completedCardInner:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  completedCardTitle:  { color: '#F5C97A', fontSize: 16, fontFamily: 'NotoSansKR-Regular' },
  completedCardSub:    { color: '#8BAED4', fontSize: 14 },
  completedCardDismiss: { position: 'absolute', top: 12, right: 12, padding: 4 },
  dismissText:         { color: '#7B80A0', fontSize: 16 },

  sectionLabel: {
    color: '#7B80A0',
    fontSize: 12,
    fontWeight: '600',
    marginHorizontal: 20,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  listContent:    { flexGrow: 1, paddingBottom: 100 },
  trackItemWrap:  { paddingHorizontal: 20 },

  skeletonWrap: { paddingHorizontal: 20, paddingTop: 8 },
  skeletonItem: { height: 76, backgroundColor: '#1A1D30', borderRadius: 16, marginBottom: 10 },

  emptyWrap:       { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, paddingTop: 60 },
  emptyEmoji:      { fontSize: 56, marginBottom: 20 },
  emptyTitle:      { color: '#EEF0F8', fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptySub:        { color: '#7B80A0', fontSize: 15, textAlign: 'center', marginBottom: 32 },
  emptyCtaBtn:     { height: 56, backgroundColor: '#F5C97A', borderRadius: 28, paddingHorizontal: 40, justifyContent: 'center', alignItems: 'center' },
  emptyCtaBtnText: { color: '#0D0F1A', fontSize: 17, fontWeight: '600' },

  fab:     { position: 'absolute', bottom: 32, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#F5C97A', justifyContent: 'center', alignItems: 'center', elevation: 4 },
  fabIcon: { color: '#0D0F1A', fontSize: 28, lineHeight: 32 },
});
