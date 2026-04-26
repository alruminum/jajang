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
import EmptyTrackState from '@components/EmptyTrackState';
import CompletedTrackCard from '@components/CompletedTrackCard';
import { getMyTracks, getNewlyCompletedTrack, GeneratedTrack } from '@services/tracks-api';
import { SONG_NAMES } from '@services/songs';

type NavProp = NativeStackNavigationProp<MainStackParamList>;

const LAST_CHECKED_KEY = 'home_last_checked_at';

export default function S06HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const { entitlement } = useAuthStore();

  const [tracks, setTracks]                      = useState<GeneratedTrack[]>([]);
  const [completedTrack, setCompletedTrack]       = useState<GeneratedTrack | null>(null);
  const [showCompletedCard, setShowCompletedCard] = useState(false);
  const [refreshing, setRefreshing]              = useState(false);

  const isFreeUser = entitlement === 'free';

  const loadTracks = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);

    try {
      // 트랙 목록 조회 — completed만 표시
      const allTracks = await getMyTracks();
      const completedTracks = allTracks.filter(t => t.status === 'completed');
      setTracks(completedTracks);

      // 백그라운드 생성 완료 카드 — lastChecked 있을 때만
      const lastChecked = await AsyncStorage.getItem(LAST_CHECKED_KEY);
      if (lastChecked) {
        const newTrack = await getNewlyCompletedTrack(lastChecked);
        if (newTrack) {
          setCompletedTrack(newTrack);
          setShowCompletedCard(true);
        }
      }
    } catch (_e) {
      // 에러 시 기존 상태 유지 (throw 금지)
    } finally {
      setRefreshing(false);
      await AsyncStorage.setItem(LAST_CHECKED_KEY, new Date().toISOString());
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTracks();
    }, [loadTracks]),
  );

  const handleDismissCompletedCard = () => {
    setShowCompletedCard(false);
    setCompletedTrack(null);
  };

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
              <TrialBadge />
            </View>

            {/* 무료 유저 생성 횟수 배지 */}
            {isFreeUser && (
              <View style={styles.counterBadge}>
                <Text style={styles.counterText}>생성 횟수 확인</Text>
              </View>
            )}

            {/* 백그라운드 생성 완료 카드 */}
            {showCompletedCard && completedTrack && (
              <CompletedTrackCard
                track={completedTrack}
                onDismiss={handleDismissCompletedCard}
              />
            )}
          </View>
        }
        ListEmptyComponent={<EmptyTrackState />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.trackItem}
            testID={item.id}
            onPress={() => navigation.navigate('Play', { trackId: item.id })}
            accessibilityLabel={`${SONG_NAMES[item.song_key] ?? item.song_key} 재생`}
          >
            <View style={styles.trackIcon}>
              <Text style={styles.trackIconText}>♫</Text>
            </View>
            <View style={styles.trackText}>
              <Text style={styles.trackName}>
                {SONG_NAMES[item.song_key] ?? item.song_key}
              </Text>
              {item.completed_at && (
                <Text style={styles.trackDate}>
                  {formatDate(item.completed_at)}
                </Text>
              )}
            </View>
            <Text style={styles.playIcon}>▶</Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* FAB — 새 자장가 만들기 (항상 노출) */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('SongSelect')}
        accessibilityLabel="새 자장가 만들기"
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
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

  listContent: { flexGrow: 1, paddingBottom: 100 },

  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1D30',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 10,
  },
  trackIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#21253E',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  trackIconText: { color: '#8BAED4', fontSize: 20 },
  trackText:     { flex: 1 },
  trackName:     { color: '#EEF0F8', fontSize: 16, marginBottom: 4 },
  trackDate:     { color: '#7B80A0', fontSize: 13 },
  playIcon:      { color: '#F5C97A', fontSize: 18 },

  fab:     { position: 'absolute', bottom: 32, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#F5C97A', justifyContent: 'center', alignItems: 'center', elevation: 4 },
  fabIcon: { color: '#0D0F1A', fontSize: 28, lineHeight: 32 },
});
