import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { MainStackParamList } from '@navigation/types';
import { useAuthStore } from '@store/auth-store';
import TrialBadge from '@components/TrialBadge';
import TrialExpiryBanner from '@components/TrialExpiryBanner';
import CompletedTrackCard from '@components/CompletedTrackCard';
import EmptyTrackState from '@components/EmptyTrackState';
import {
  getMyTracks,
  getNewlyCompletedTrack,
  GeneratedTrack,
} from '@services/tracks-api';
import { SONG_NAMES } from '@services/songs';

type NavProp = NativeStackNavigationProp<MainStackParamList>;

const LAST_CHECKED_KEY = 'home_last_checked_at';

export default function S06HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const { entitlement } = useAuthStore();

  const [tracks, setTracks] = useState<GeneratedTrack[]>([]);
  const [completedTrack, setCompletedTrack] = useState<GeneratedTrack | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadTracks = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // 완료된 트랙 목록 (Epic 02/03 구현 후 실제 연동)
      const data = await getMyTracks();
      setTracks(data.filter(t => t.status === 'completed'));

      // 백그라운드 생성 완료 카드 체크
      const lastChecked = await AsyncStorage.getItem(LAST_CHECKED_KEY);
      if (lastChecked) {
        const newlyCompleted = await getNewlyCompletedTrack(lastChecked);
        if (newlyCompleted) setCompletedTrack(newlyCompleted);
      }
    } catch (_e) {
      // 에러 시 빈 목록 유지 (Epic 02/03 구현 전 404 정상)
    } finally {
      setLoading(false);
      setRefreshing(false);
      // 현재 시각 기록
      await AsyncStorage.setItem(LAST_CHECKED_KEY, new Date().toISOString());
    }
  }, []);

  // 화면 포커스 시 재조회 (생성 완료 후 복귀 시 카드 노출)
  useFocusEffect(
    useCallback(() => {
      loadTracks();
    }, [loadTracks]),
  );

  const renderTrackItem = ({ item }: { item: GeneratedTrack }) => (
    <TouchableOpacity
      style={styles.trackItem}
      onPress={() => navigation.navigate('Play', { trackId: item.id })}
      accessibilityRole="button"
      accessibilityLabel={`${SONG_NAMES[item.song_key] ?? item.song_key} 재생`}
    >
      <View style={styles.trackIcon}>
        <Text style={styles.trackIconText}>🎵</Text>
      </View>
      <View style={styles.trackInfo}>
        <Text style={styles.trackName}>{SONG_NAMES[item.song_key] ?? item.song_key}</Text>
        <Text style={styles.trackSubtext}>
          {item.completed_at
            ? new Date(item.completed_at).toLocaleDateString('ko-KR', {
                month: 'short',
                day: 'numeric',
              }) + ' 완성'
            : ''}
        </Text>
      </View>
      <Text style={styles.playIcon}>▶</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* D-1 배너 (최상단) */}
      <TrialExpiryBanner />

      <FlatList
        data={tracks}
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

            {/* 백그라운드 생성 완료 카드 */}
            {completedTrack && (
              <CompletedTrackCard
                track={completedTrack}
                onDismiss={() => setCompletedTrack(null)}
              />
            )}

            {/* 새 자장가 만들기 CTA */}
            <TouchableOpacity
              style={styles.createBtn}
              onPress={() => navigation.navigate('SongSelect')}
              accessibilityRole="button"
              accessibilityLabel="새 자장가 만들기"
            >
              <Text style={styles.createBtnText}>+ 새 자장가 만들기</Text>
            </TouchableOpacity>

            {tracks.length > 0 && (
              <Text style={styles.sectionLabel}>내 자장가 목록</Text>
            )}
          </View>
        }
        ListEmptyComponent={!loading ? <EmptyTrackState /> : null}
        renderItem={renderTrackItem}
        contentContainerStyle={styles.listContent}
      />
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
  greeting: { color: '#7B80A0', fontSize: 13, marginBottom: 4 },
  headerTitle: { color: '#EEF0F8', fontSize: 24, fontWeight: '700' },
  createBtn: {
    marginHorizontal: 20,
    marginBottom: 20,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F5C97A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtnText: { color: '#0D0F1A', fontSize: 16, fontWeight: '600' },
  sectionLabel: {
    color: '#7B80A0',
    fontSize: 12,
    fontWeight: '600',
    marginHorizontal: 20,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  listContent: { flexGrow: 1, paddingBottom: 32 },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: '#1A1D30',
    borderRadius: 16,
    padding: 16,
  },
  trackIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#21253E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  trackIconText: { fontSize: 20 },
  trackInfo: { flex: 1 },
  trackName: { color: '#EEF0F8', fontSize: 15, fontWeight: '500', marginBottom: 3 },
  trackSubtext: { color: '#7B80A0', fontSize: 12 },
  playIcon: { color: '#7B80A0', fontSize: 14 },
});
