---
depth: std
design: required
---

# impl/08 — S06 홈 화면 Shell (트라이얼 배지 + D-1 배너 + 생성 완료 카드)

**Epic**: 01 — 인증 & 온보딩  
**커버 스토리**: Story 5 (트라이얼 배지, D-1 인앱 배너, 생성 완료 카드)  
**선행 조건**: impl/06 (Zustand AuthSlice), impl/07 (useTrialDaysRemaining)  
**예상 소요**: 4~5시간

---

## 1. 생성/수정할 파일 목록

```
apps/mobile/src/
├── screens/
│   └── S06HomeScreen.tsx        [수정 — 실제 홈 UI 구현]
├── components/
│   ├── TrialBadge.tsx           [신규 — 트라이얼 상태 배지]
│   ├── TrialExpiryBanner.tsx    [신규 — D-1 인앱 배너]
│   ├── CompletedTrackCard.tsx   [신규 — 백그라운드 생성 완료 카드]
│   └── EmptyTrackState.tsx      [신규 — 빈 상태 (첫 방문)]
└── services/
    └── tracks-api.ts            [신규 — 트랙 목록/완료 조회 API]
```

---

## 2. tracks-api.ts

```typescript
// src/services/tracks-api.ts
import { api } from './api';

export interface GeneratedTrack {
  id: string;
  song_key: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  s3_key: string | null;
  completed_at: string | null;
}

/**
 * 내 생성된 트랙 목록 조회
 */
export async function getMyTracks(): Promise<GeneratedTrack[]> {
  const { data } = await api.get<GeneratedTrack[]>('/tracks');
  return data;
}

/**
 * 백그라운드 생성 완료 카드용 — 마지막 확인 시각 이후 완료된 트랙
 * lastCheckedAt: ISO 8601 string
 */
export async function getNewlyCompletedTrack(
  lastCheckedAt: string,
): Promise<GeneratedTrack | null> {
  const { data } = await api.get<GeneratedTrack | null>('/tracks/newly-completed', {
    params: { since: lastCheckedAt },
  });
  return data;
}
```

**주의**: `GET /tracks`, `GET /tracks/newly-completed` 엔드포인트는 **Epic 02/03 impl**에서 구현. 이 impl에서는 API 함수 정의만. 홈 화면에서 실제 API 호출은 Epic 02 완료 후 연동.

---

## 3. TrialBadge 컴포넌트

```typescript
// src/components/TrialBadge.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTrialDaysRemaining } from '@hooks/useEntitlement';
import { useAuthStore } from '@store/auth-store';

/**
 * 홈 화면 상단에 표시. 트라이얼 유저만 노출.
 * 예: "7일 무료 체험 중 · 5일 남음"
 */
export default function TrialBadge() {
  const { entitlement } = useAuthStore();
  const daysRemaining = useTrialDaysRemaining();

  if (entitlement !== 'trial' || daysRemaining === null) return null;

  return (
    <View style={styles.badge}>
      <Text style={styles.text}>
        7일 무료 체험 중
        {daysRemaining > 0 ? ` · ${daysRemaining}일 남음` : ' · 오늘 만료'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: 'rgba(245, 201, 122, 0.15)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(245, 201, 122, 0.3)',
  },
  text: {
    color: '#F5C97A',
    fontSize: 13,
    fontWeight: '500',
  },
});
```

---

## 4. TrialExpiryBanner 컴포넌트

D-1 또는 D-0(당일) 만료 예정 시 노출. 알림 권한 거부 유저에게 앱 내 배너로 대체 안내 (PRD F14 수용 기준).

```typescript
// src/components/TrialExpiryBanner.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTrialDaysRemaining } from '@hooks/useEntitlement';
import { useAuthStore } from '@store/auth-store';
import { MainStackParamList } from '@navigation/types';

type NavProp = NativeStackNavigationProp<MainStackParamList>;

/**
 * 트라이얼 D-1 이하에서만 노출
 * "내일 무료 체험이 끝나요 — 지금 구독하기"
 */
export default function TrialExpiryBanner() {
  const { entitlement } = useAuthStore();
  const daysRemaining = useTrialDaysRemaining();
  const navigation = useNavigation<NavProp>();

  // D-1 이하에서만 표시 (daysRemaining = 0 또는 1)
  if (entitlement !== 'trial' || daysRemaining === null || daysRemaining > 1) return null;

  const message =
    daysRemaining === 0
      ? '오늘 무료 체험이 끝나요'
      : '내일 무료 체험이 끝나요';

  return (
    <View style={styles.banner}>
      <Text style={styles.message}>{message}</Text>
      <TouchableOpacity
        onPress={() => navigation.navigate('Subscribe')}
        accessibilityRole="button"
        accessibilityLabel="지금 구독하기"
      >
        <Text style={styles.cta}>구독하기</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: 'rgba(245, 201, 122, 0.1)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(245, 201, 122, 0.25)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginHorizontal: 0,
  },
  message: {
    color: '#EEF0F8',
    fontSize: 13,
    flex: 1,
  },
  cta: {
    color: '#F5C97A',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 12,
  },
});
```

---

## 5. CompletedTrackCard 컴포넌트

백그라운드 생성 완료 후 홈 재진입 시 자동 노출 (PRD F4 수용 기준: "생성 완료 카드 자동 노출").

```typescript
// src/components/CompletedTrackCard.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList } from '@navigation/types';
import { GeneratedTrack } from '@services/tracks-api';

type NavProp = NativeStackNavigationProp<MainStackParamList>;

const SONG_NAMES: Record<string, string> = {
  brahms: '브람스 자장가',
  mozart: '모차르트 자장가',
  schubert: '슈베르트 자장가',
  twinkle: 'Twinkle Twinkle',
  rockabye: 'Rock-a-bye Baby',
  hush: 'Hush Little Baby',
};

interface Props {
  track: GeneratedTrack;
  onDismiss: () => void;
}

export default function CompletedTrackCard({ track, onDismiss }: Props) {
  const navigation = useNavigation<NavProp>();

  const songName = SONG_NAMES[track.song_key] ?? track.song_key;

  return (
    <View style={styles.card}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>새 자장가 완성</Text>
      </View>
      <Text style={styles.songName}>{songName}</Text>
      <Text style={styles.subtext}>내 목소리로 만든 자장가가 준비됐어요</Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => {
            onDismiss();
            navigation.navigate('Play', { trackId: track.id });
          }}
          accessibilityRole="button"
          accessibilityLabel="들어볼게요"
        >
          <Text style={styles.primaryBtnText}>들어볼게요</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDismiss}
          style={styles.dismissBtn}
          accessibilityRole="button"
          accessibilityLabel="나중에 들을게요"
        >
          <Text style={styles.dismissText}>나중에 들을게요</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1A1D30',
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2E48',
  },
  badge: {
    backgroundColor: 'rgba(139, 174, 212, 0.15)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  badgeText: { color: '#8BAED4', fontSize: 12, fontWeight: '500' },
  songName: { color: '#EEF0F8', fontSize: 18, fontWeight: '600', marginBottom: 6 },
  subtext: { color: '#7B80A0', fontSize: 13, marginBottom: 20 },
  actions: { gap: 10 },
  primaryBtn: {
    height: 48, borderRadius: 24, backgroundColor: '#F5C97A',
    alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { color: '#0D0F1A', fontSize: 15, fontWeight: '600' },
  dismissBtn: { alignItems: 'center', padding: 10 },
  dismissText: { color: '#7B80A0', fontSize: 14 },
});
```

---

## 6. EmptyTrackState 컴포넌트

```typescript
// src/components/EmptyTrackState.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList } from '@navigation/types';

type NavProp = NativeStackNavigationProp<MainStackParamList>;

export default function EmptyTrackState() {
  const navigation = useNavigation<NavProp>();

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🎵</Text>
      <Text style={styles.title}>아직 자장가가 없어요</Text>
      <Text style={styles.subtitle}>목소리를 담아볼까요?</Text>
      <TouchableOpacity
        style={styles.btn}
        onPress={() => navigation.navigate('SongSelect')}
        accessibilityRole="button"
        accessibilityLabel="자장가 만들기"
      >
        <Text style={styles.btnText}>자장가 만들기</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emoji: { fontSize: 56, marginBottom: 24 },
  title: { color: '#EEF0F8', fontSize: 18, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  subtitle: { color: '#7B80A0', fontSize: 14, marginBottom: 32, textAlign: 'center' },
  btn: {
    height: 52, borderRadius: 26, backgroundColor: '#F5C97A',
    paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center',
  },
  btnText: { color: '#0D0F1A', fontSize: 15, fontWeight: '600' },
});
```

---

## 7. S06HomeScreen.tsx (홈 화면 Shell)

```typescript
// src/screens/S06HomeScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
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
    } catch (e) {
      // 에러 시 빈 목록 유지
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

  const SONG_NAMES: Record<string, string> = {
    brahms: '브람스 자장가',
    mozart: '모차르트 자장가',
    schubert: '슈베르트 자장가',
    twinkle: 'Twinkle Twinkle',
    rockabye: 'Rock-a-bye Baby',
    hush: 'Hush Little Baby',
  };

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
                month: 'short', day: 'numeric',
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
        ListEmptyComponent={
          !loading ? <EmptyTrackState /> : null
        }
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
    color: '#7B80A0', fontSize: 12, fontWeight: '600',
    marginHorizontal: 20, marginBottom: 8, letterSpacing: 0.5,
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
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#21253E', alignItems: 'center', justifyContent: 'center',
    marginRight: 14,
  },
  trackIconText: { fontSize: 20 },
  trackInfo: { flex: 1 },
  trackName: { color: '#EEF0F8', fontSize: 15, fontWeight: '500', marginBottom: 3 },
  trackSubtext: { color: '#7B80A0', fontSize: 12 },
  playIcon: { color: '#7B80A0', fontSize: 14 },
});
```

---

## 8. 홈 화면 상태 매트릭스

| 상태 | 표시 내용 |
|---|---|
| 신규 가입 (트랙 없음, 트라이얼) | 트라이얼 배지 + 빈 상태 + "자장가 만들기" CTA |
| 트랙 있음, 트라이얼 D-7~2 | 트라이얼 배지 + 트랙 목록 |
| 트라이얼 D-1 | D-1 배너(최상단) + 트라이얼 배지 + 트랙 목록 |
| 백그라운드 생성 완료 재진입 | 생성 완료 카드 + 트랙 목록 |
| 무료 플랜 | 트라이얼 배지 없음 + 트랙 목록 |

---

## 9. 수용 기준

- [ ] 신규 가입 직후 홈 진입: 트라이얼 배지 "7일 무료 체험 중 · 7일 남음" 노출
- [ ] 트라이얼 D-1: TrialExpiryBanner "내일 무료 체험이 끝나요" 표시 + "구독하기" 탭 → S15
- [ ] 트라이얼 D-0: "오늘 무료 체험이 끝나요" 배너 표시
- [ ] 무료 플랜: 트라이얼 배지 미노출
- [ ] 트랙 없음: EmptyTrackState "아직 자장가가 없어요. 목소리를 담아볼까요?" 표시
- [ ] "자장가 만들기" CTA 탭 → S07 SongSelect 이동
- [ ] 당겨서 새로고침 → API 재조회 (RefreshControl 동작)
- [ ] `useFocusEffect` 작동: S13 재생 후 홈 복귀 시 트랙 목록 업데이트
- [ ] VoiceOver: 트랙 아이템 `accessibilityLabel` = "[곡명] 재생"

---

## 10. 주의사항

- `getMyTracks()`, `getNewlyCompletedTrack()` API: Epic 02/03 완료 전까지 호출 시 404. 개발 중 에러 catch 후 빈 배열 반환으로 처리. `MOCK_GPU=true` 환경에서 별도 mock 함수로 교체 검토.
- `LAST_CHECKED_KEY` AsyncStorage: 앱 첫 설치 시 `null` → `getNewlyCompletedTrack` 미호출 (완료 카드 미표시). 의도된 동작 — 앱 설치 전 완료된 트랙은 목록에서 확인.
- `useFocusEffect` vs `useEffect`: `useEffect`는 컴포넌트 마운트 시 1회. `useFocusEffect`는 화면 포커스 시마다 실행. 홈 복귀 시 항상 트랙 목록 갱신 필요 → `useFocusEffect` 필수.
- C06 미니 플레이어: 재생 화면에서 홈 복귀 시 하단에 미니 플레이어 노출 (PRD F7, TRD §7). 이 impl에서는 포함하지 않음 — **Epic 04 (재생) impl**에서 추가.
