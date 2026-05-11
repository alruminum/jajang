import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { MainStackParamList } from '@navigation/types';
import { useAuthStore } from '@store/auth-store';
import { usePlayerStore } from '@store/player-store';
import TrialBadge from '@components/TrialBadge';
import TrialExpiryBanner from '@components/TrialExpiryBanner';
import MiniPlayer from '@components/MiniPlayer';
import MasterAudioCard from '@components/MasterAudioCard';
import EmptyMastersState from '@components/EmptyMastersState';
import JustArrivedMasterCard from '@components/JustArrivedMasterCard';
import { useMastersStore } from '@store/mastersSlice';
import { useTrialExpiredGuard } from '@hooks/useTrialExpiredGuard';
import type { MasterItem } from '@services/api/masters';
import { loadPendingSession, clearPendingSession } from '@services/storage/pendingSession';
import { getSessionStatus } from '@services/api/sessions';
import { useTheme } from '@hooks/useTheme';
import type { ColorTokens } from '../theme/tokens';

type NavProp = NativeStackNavigationProp<MainStackParamList>;

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },

    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 16,
    },
    greeting:    { color: colors.textSecondary, fontSize: 13, marginBottom: 4 },
    headerTitle: { color: colors.textPrimary, fontSize: 24, fontWeight: '700' },

    counterBadge: {
      marginHorizontal: 20,
      marginBottom: 8,
      backgroundColor: colors.surface,
      borderRadius: 8,
      paddingVertical: 6,
      paddingHorizontal: 12,
      alignSelf: 'flex-start',
    },
    counterText: { color: colors.textSecondary, fontSize: 13 },

    pendingCard: {
      marginHorizontal: 20,
      marginBottom: 12,
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pendingText: { color: colors.textSecondary, fontSize: 14 },

    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
    },

    listContent: { flexGrow: 1, paddingBottom: 100 },
    listContentWithMiniPlayer: { paddingBottom: 172 },

    miniPlayerWrapper: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
    },

    fab: {
      position: 'absolute',
      bottom: 32,
      right: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.accentPrimary,
      justifyContent: 'center',
      alignItems: 'center',
      elevation: 4,
    },
    fabIcon: { color: colors.bgPrimary, fontSize: 28, lineHeight: 32 },
  });

export default function S06HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const { entitlement } = useAuthStore();
  const { currentTrackId } = usePlayerStore();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // 트라이얼 만료 감지 → S17 자동 진입
  useTrialExpiredGuard(navigation);

  // Premium/Trial 유저이고 trackId가 있을 때만 미니 플레이어 노출
  const showMiniPlayer = (entitlement === 'premium' || entitlement === 'trial') && !!currentTrackId;

  const isFreeUser = entitlement === 'free';

  const { items, hasPending, nextCursor, isLoading, loadMasters, loadMore } = useMastersStore();

  // pending session 복원 — impl/07 §3
  const [justArrived, setJustArrived] = useState<{ sessionId: string; presignedUrl: string } | null>(null);

  useEffect(() => {
    (async () => {
      const sid = await loadPendingSession();
      if (!sid) return;

      try {
        const res = await getSessionStatus(sid);
        if (res.status === 'completed' && res.presigned_url) {
          setJustArrived({ sessionId: sid, presignedUrl: res.presigned_url });
          await clearPendingSession();
        } else if (res.status === 'failed') {
          await clearPendingSession();
          // 실패 케이스 — SecureStore 클리어 (toast는 추후 cycle)
        }
        // generating 상태 — hasPending 카드로 표현 (별도 처리 X)
      } catch (e: any) {
        if (e?.response?.status === 404 || e?.status === 404) {
          // orphan session — SecureStore 클리어
          await clearPendingSession();
        }
      }
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMasters();
    }, [loadMasters]),
  );

  const renderItem = useCallback(
    ({ item }: { item: MasterItem }) => (
      <MasterAudioCard
        songKey={item.song_key}
        completedAt={item.completed_at}
        onPlay={() =>
          navigation.navigate('Play', {
            trackId: item.session_id,
            presignUrl: item.presigned_url,
          })
        }
      />
    ),
    [navigation],
  );

  const ListHeaderComponent = (
    <View>
      {/* 헤더 */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>안녕하세요</Text>
          <Text testID="s06-header-title" style={styles.headerTitle}>내 자장가</Text>
        </View>
        <TrialBadge />
      </View>

      {/* 무료 유저 생성 횟수 배지 */}
      {isFreeUser && (
        <View style={styles.counterBadge}>
          <Text style={styles.counterText}>생성 횟수 확인</Text>
        </View>
      )}

      {/* "방금 도착" 카드 — pending session 복원 후 completed 시 (impl/07) */}
      {justArrived && (
        <JustArrivedMasterCard
          songKey="lullaby"
          onPlay={() =>
            navigation.navigate('Play', {
              trackId: justArrived.sessionId,
              presignUrl: justArrived.presignedUrl,
            })
          }
          onDismiss={() => setJustArrived(null)}
        />
      )}

      {/* 처리 중 세션 존재 카드 */}
      {hasPending && (
        <View style={styles.pendingCard}>
          <Text style={styles.pendingText}>자장가를 만들고 있어요…</Text>
        </View>
      )}
    </View>
  );

  const ListEmptyComponent =
    isLoading && items.length === 0 ? (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={colors.accentPrimary} />
      </View>
    ) : (
      <EmptyMastersState onCta={() => navigation.navigate('SongSelect')} />
    );

  return (
    <SafeAreaView testID="s06-container" style={styles.container} edges={['top', 'left', 'right']}>
      {/* D-1 배너 (최상단) */}
      <TrialExpiryBanner />

      <FlatList
        data={items}
        keyExtractor={item => item.session_id}
        renderItem={renderItem}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        onEndReached={() => { if (nextCursor) loadMore(); }}
        onEndReachedThreshold={0.5}
        contentContainerStyle={[
          styles.listContent,
          showMiniPlayer && styles.listContentWithMiniPlayer,
        ]}
        showsVerticalScrollIndicator={false}
      />

      {/* FAB — 새 자장가 만들기 (항상 노출) */}
      <TouchableOpacity
        testID="s06-fab"
        style={styles.fab}
        onPress={() => navigation.navigate('SongSelect')}
        accessibilityLabel="새 자장가 만들기"
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      {/* C06 미니 플레이어 — 하단 고정 오버레이 */}
      {showMiniPlayer && (
        <View style={styles.miniPlayerWrapper}>
          <MiniPlayer />
        </View>
      )}
    </SafeAreaView>
  );
}
