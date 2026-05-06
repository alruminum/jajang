---
depth: std
design: skipped
---

# impl/06 — 앱: 생성 중 대기 화면 (S12)

**Epic**: 03 — AI 음원 생성  
**커버 스토리**: Story 1 (생성 중 대기 화면), Story 3 (생성 실패 처리)  
**선행 조건**: impl/04 서버 완료 (POST /generations/init, GET /generations/{job_id})  
**예상 소요**: 4~5시간

---

## 1. 생성/수정할 파일 목록

```
apps/mobile/src/
├── screens/
│   └── GeneratingScreen.tsx         [신규 — S12 생성 중 대기]
├── services/
│   └── api/generations.ts           [신규 — /generations API 클라이언트]
├── store/
│   └── generationSlice.ts           [신규 — 생성 상태 Zustand slice]
└── navigation/
    └── types.ts                     [수정 — 'Generating' screen 타입 추가]
```

---

## 2. generations API 클라이언트

```typescript
// apps/mobile/src/services/api/generations.ts

import { apiClient } from './client'

export type GenerationStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface GenerationInitRequest {
  job_id:          string   // UUID (클라이언트 생성)
  voice_sample_id: string
  song_key:        string
}

export interface GenerationInitResponse {
  job_id:   string
  track_id: string
  status:   GenerationStatus
  is_new:   boolean
}

export interface GenerationStatusResponse {
  job_id:          string
  track_id:        string
  status:          GenerationStatus
  presigned_url:   string | null
  error_message:   string | null
  queue_position:  number | null
}

export interface CounterStatusResponse {
  count:        number
  limit:        number
  remaining:    number
  is_free_tier: boolean
}

export const generationsApi = {
  initGeneration: (
    params: GenerationInitRequest,
  ): Promise<GenerationInitResponse> =>
    apiClient.post('/generations/init', params).then(r => r.data),

  getStatus: (jobId: string): Promise<GenerationStatusResponse> =>
    apiClient.get(`/generations/${jobId}`).then(r => r.data),

  getCounter: (): Promise<CounterStatusResponse> =>
    apiClient.get('/generations/counter/me').then(r => r.data),
}
```

---

## 3. Zustand generationSlice

```typescript
// apps/mobile/src/store/generationSlice.ts

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface GenerationState {
  // 현재 진행 중인 job
  activeJobId:    string | null
  activeTrackId:  string | null
  activeSongKey:  string | null

  // 완료된 job 결과 (S12 → S13 이동 또는 홈 복귀 후 카드 표시)
  completedJobId:      string | null
  completedTrackId:    string | null
  completedPresignUrl: string | null

  // 액션
  setActiveJob:    (jobId: string, trackId: string, songKey: string) => void
  setCompleted:    (jobId: string, trackId: string, presignUrl: string) => void
  clearActive:     () => void
  clearCompleted:  () => void
}

export const useGenerationStore = create<GenerationState>()(
  persist(
    (set) => ({
      activeJobId:    null,
      activeTrackId:  null,
      activeSongKey:  null,
      completedJobId:      null,
      completedTrackId:    null,
      completedPresignUrl: null,

      setActiveJob: (jobId, trackId, songKey) =>
        set({ activeJobId: jobId, activeTrackId: trackId, activeSongKey: songKey }),

      setCompleted: (jobId, trackId, presignUrl) =>
        set({
          activeJobId: null, activeTrackId: null, activeSongKey: null,
          completedJobId: jobId, completedTrackId: trackId, completedPresignUrl: presignUrl,
        }),

      clearActive:    () => set({ activeJobId: null, activeTrackId: null, activeSongKey: null }),
      clearCompleted: () => set({ completedJobId: null, completedTrackId: null, completedPresignUrl: null }),
    }),
    {
      name: 'jajang-generation',
      storage: createJSONStorage(() => AsyncStorage),
      // persist 이유: 앱 재시작 후에도 activeJobId 복원 → 홈에서 has_pending 카드 표시
    },
  ),
)
```

---

## 4. GeneratingScreen 핵심 로직

```typescript
// apps/mobile/src/screens/GeneratingScreen.tsx

import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  View, Text, Pressable, StyleSheet, AppState, AppStateStatus,
  Animated, Easing,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigation/types'

import { generationsApi, GenerationStatus } from '../services/api/generations'
import { useGenerationStore } from '../store/generationSlice'
import { useRecordingStore } from '../store/recordingSlice'

type Props = NativeStackScreenProps<RootStackParamList, 'Generating'>

// S12 UX 상수
const POLL_INTERVAL_MS  = 5_000     // 5초 폴링 간격
const TIMEOUT_MS        = 90_000    // 90초 타임아웃 (NFR)
const COUNTDOWN_FROM_MS = 90_000    // 카운트다운 표시 기준

type Phase = 'generating' | 'queued' | 'timeout' | 'failed'

export function GeneratingScreen({ navigation, route }: Props) {
  const { sampleId, songKey, jobId } = route.params
  // jobId: 클라이언트가 PreviewScreen에서 생성해 전달한 UUID

  const { setActiveJob, setCompleted, clearActive } = useGenerationStore()
  const { resetRecordingFlow } = useRecordingStore()

  const [phase, setPhase] = useState<Phase>('generating')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [queuePosition, setQueuePosition] = useState<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [trackId, setTrackId] = useState<string | null>(null)

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startTimeRef    = useRef<number>(Date.now())
  const appStateRef     = useRef<AppStateStatus>(AppState.currentState)

  // 달·별 float 애니메이션
  const floatAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: -10, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 10,  duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start()
  }, [])

  // ── 생성 시작 ─────────────────────────────────────────────────
  useEffect(() => {
    startGeneration()
    return () => stopPolling()
  }, [])

  // ── AppState 감지: 포그라운드 복귀 시 폴링 재개 ───────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', handleAppStateChange)
    return () => sub.remove()
  }, [phase])

  const handleAppStateChange = useCallback((nextState: AppStateStatus) => {
    const prevState = appStateRef.current
    appStateRef.current = nextState

    if (prevState.match(/inactive|background/) && nextState === 'active') {
      // 포그라운드 복귀 시 phase가 generating이면 폴링 재개
      if (phase === 'generating') {
        pollOnce()  // 즉시 1회 확인
      }
    }
  }, [phase])

  const startGeneration = async () => {
    try {
      const res = await generationsApi.initGeneration({
        job_id: jobId,
        voice_sample_id: sampleId,
        song_key: songKey,
      })

      setTrackId(res.track_id)
      setActiveJob(jobId, res.track_id, songKey)

      if (res.status === 'completed' && res.is_new === false) {
        // 기존 완료된 job으로 재진입 (드문 케이스)
        handleCompleted(res.track_id)
        return
      }

      // 폴링 시작
      startPolling(res.job_id)
    } catch (error: any) {
      // 402: 횟수 초과
      if (error?.response?.status === 402) {
        clearActive()
        navigation.navigate('UpgradeSheet' as any, { variant: 'generation_exhausted' })
        return
      }
      setPhase('failed')
      setErrorMessage('생성 요청에 실패했어요. 다시 시도해주세요.')
    }
  }

  const startPolling = (targetJobId: string) => {
    // 경과 시간 카운터 (100ms 주기)
    const ticker = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current)
    }, 100)

    // 90초 타임아웃
    timeoutRef.current = setTimeout(() => {
      clearInterval(ticker)
      stopPolling()
      setPhase('timeout')
    }, TIMEOUT_MS)

    // 5초 폴링
    pollIntervalRef.current = setInterval(() => {
      pollOnce(targetJobId)
    }, POLL_INTERVAL_MS)
  }

  const stopPolling = () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    if (timeoutRef.current)      clearTimeout(timeoutRef.current)
    pollIntervalRef.current = null
    timeoutRef.current      = null
  }

  const pollOnce = async (targetJobId?: string) => {
    const jid = targetJobId ?? jobId
    try {
      const status = await generationsApi.getStatus(jid)
      setQueuePosition(status.queue_position)

      if (status.queue_position !== null) {
        setPhase('queued')  // 큐 대기 표시
      }

      if (status.status === 'completed' && status.presigned_url) {
        stopPolling()
        handleCompleted(status.track_id, status.presigned_url)
      } else if (status.status === 'failed') {
        stopPolling()
        setPhase('failed')
        setErrorMessage(status.error_message ?? '생성에 실패했어요. 다시 시도해주세요.')
        clearActive()
      }
    } catch {
      // 네트워크 오류는 조용히 무시 — 다음 폴링에서 재시도
    }
  }

  const handleCompleted = (completedTrackId: string, presignUrl?: string) => {
    stopPolling()
    setCompleted(jobId, completedTrackId, presignUrl ?? '')
    resetRecordingFlow()  // 녹음 관련 임시 파일/상태 정리

    // S13 재생 화면으로 이동
    navigation.replace('Play' as any, {
      trackId: completedTrackId,
      presignUrl,
    })
  }

  // 재시도: 새 job_id 생성 후 동일 샘플로 재시도
  const handleRetry = () => {
    import('uuid').then(({ v4 }) => {
      const newJobId = v4()
      stopPolling()
      setPhase('generating')
      setElapsedMs(0)
      startTimeRef.current = Date.now()
      // 현재 화면에서 새 jobId로 다시 시작
      startGenerationWithJobId(newJobId)
    })
  }

  const startGenerationWithJobId = async (newJobId: string) => {
    try {
      const res = await generationsApi.initGeneration({
        job_id: newJobId,
        voice_sample_id: sampleId,
        song_key: songKey,
      })
      setActiveJob(newJobId, res.track_id, songKey)
      startPolling(res.job_id)
    } catch {
      setPhase('failed')
    }
  }

  const handleGoHome = () => {
    stopPolling()
    // activeJobId는 persist됨 → 홈 화면에서 has_pending 카드로 표시
    navigation.navigate('Home' as any)
  }

  // ── 렌더링 ────────────────────────────────────────────────────
  const remainingMs = Math.max(0, COUNTDOWN_FROM_MS - elapsedMs)
  const remainingSec = Math.ceil(remainingMs / 1000)

  return (
    <View style={styles.container}>
      {phase === 'timeout' || phase === 'failed' ? (
        // 타임아웃 / 실패 상태
        <View style={styles.center}>
          <Text style={styles.timeoutTitle}>생각보다 오래{'\n'}걸리고 있어요</Text>
          {errorMessage && (
            <Text style={styles.errorSubtitle}>{errorMessage}</Text>
          )}
          <Pressable
            style={styles.primaryBtn}
            onPress={handleRetry}
            accessibilityLabel="다시 시도"
          >
            <Text style={styles.primaryBtnText}>다시 시도</Text>
          </Pressable>
          <Pressable
            onPress={handleGoHome}
            accessibilityLabel="홈으로 이동"
          >
            <Text style={styles.homeLink}>홈으로 이동하기</Text>
          </Pressable>
        </View>
      ) : (
        // 생성 중 / 큐 대기 상태
        <View style={styles.center}>
          {/* 달·별 float 애니메이션 */}
          <Animated.Text
            style={[styles.floatEmoji, { transform: [{ translateY: floatAnim }] }]}
            accessibilityLabel="달과 별 일러스트"
          >
            🌙✨
          </Animated.Text>

          <Text style={styles.mainTitle}>
            아기를 위한 목소리를{'\n'}만들고 있어요
          </Text>

          <Text style={styles.subtitle}>
            ·· 약 30~90초 걸려요
          </Text>

          {/* 경과 시간 카운트다운 */}
          <Text style={styles.countdown} accessibilityLabel={`남은 시간 약 ${remainingSec}초`}>
            {remainingSec}초
          </Text>

          {/* 점 로딩 */}
          <View style={styles.dotRow}>
            {[0, 1, 2].map(i => (
              <View key={i} style={styles.dot} />
            ))}
          </View>

          {/* 큐 대기 안내 */}
          {phase === 'queued' && queuePosition !== null && (
            <Text style={styles.queueText}>
              잠시 기다려주세요, {queuePosition}명이 기다리고 있어요
            </Text>
          )}

          <Text style={styles.backgroundNotice}>
            앱을 닫아도 계속 만들고 있어요 ☁
          </Text>

          <Pressable
            onPress={handleGoHome}
            accessibilityLabel="홈으로 돌아가기"
          >
            <Text style={styles.homeLink}>홈으로 돌아가기</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#0D0F1A' },
  center:           { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  floatEmoji:       { fontSize: 64, marginBottom: 32 },
  mainTitle:        { color: '#EEF0F8', fontSize: 22, textAlign: 'center', lineHeight: 32, fontFamily: 'NotoSansKR-Regular', marginBottom: 12 },
  subtitle:         { color: '#7B80A0', fontSize: 15, textAlign: 'center', marginBottom: 24 },
  countdown:        { color: '#F5C97A', fontSize: 48, fontVariant: ['tabular-nums'], marginBottom: 24 },
  dotRow:           { flexDirection: 'row', gap: 8, marginBottom: 32 },
  dot:              { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2A2E48' },
  queueText:        { color: '#7B80A0', fontSize: 13, textAlign: 'center', marginBottom: 16 },
  backgroundNotice: { color: '#7B80A0', fontSize: 13, textAlign: 'center', marginBottom: 32 },
  homeLink:         { color: '#8BAED4', fontSize: 15, textDecorationLine: 'underline' },

  // 타임아웃/실패 상태
  timeoutTitle:     { color: '#EEF0F8', fontSize: 22, textAlign: 'center', lineHeight: 32, fontFamily: 'NotoSansKR-Regular', marginBottom: 12 },
  errorSubtitle:    { color: '#7B80A0', fontSize: 14, textAlign: 'center', marginBottom: 32 },
  primaryBtn:       { height: 56, backgroundColor: '#F5C97A', borderRadius: 28, paddingHorizontal: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  primaryBtnText:   { color: '#0D0F1A', fontSize: 17, fontFamily: 'NotoSansKR-Regular' },
})
```

---

## 5. navigation/types.ts 수정

```typescript
// apps/mobile/src/navigation/types.ts (수정 — Generating 화면 타입 추가)

export type RootStackParamList = {
  // ... 기존 화면 유지 ...
  Generating: {
    sampleId: string    // voice_sample_id (서버 검증 완료)
    songKey:  string
    jobId:    string    // 클라이언트 생성 UUID (멱등성 키)
  }
  // ... 이후 화면 ...
}
```

> PreviewScreen.tsx에서 `navigation.navigate('Generating' as any, ...)` → `as any` 제거 가능.

---

## 6. 폴링 상태 다이어그램

```
진입 (jobId, sampleId, songKey 전달)
      │
      ├─ POST /generations/init
      │         ├─ 402 → UpgradeSheet
      │         └─ 201 → 폴링 시작
      │
      ├─ 5초 간격 GET /generations/{jobId}
      │         ├─ status='completed' → handleCompleted → S13
      │         ├─ status='failed' → phase='failed'
      │         └─ queue_position > 0 → phase='queued'
      │
      ├─ 90초 타임아웃 → phase='timeout'
      │         ├─ "다시 시도" → 새 job_id 생성 + 재시도 (카운터 미차감)
      │         └─ "홈으로 이동" → Home + activeJobId persist
      │
      └─ AppState 'background' → polling 유지 (백그라운드 OK)
         AppState 'active' 복귀 → pollOnce() 즉시 실행
```

---

## 7. 결정 근거

### 재시도 시 새 job_id 생성 이유

impl/02 설계: `status='failed'` 레코드에 동일 job_id로 재시도 → 서버는 `is_new=false` + `status='failed'` 반환 (새 Celery task 미큐). 따라서 클라이언트가 재시도 시 **새 UUID를 생성**해야 실제 재생성이 이루어진다. 이는 "재시도 = 횟수 차감 없음" 요건과 호환된다: 새 job_id이지만 서버 counter는 최종 성공 시에만 +1.

### 타임아웃 90초 카운트다운 표시

UX Flow S12 명시: 경과 시간 카운터 표시. `Date.now() - startTime`으로 클라이언트 타이머 구현. 서버 응답 시간과 완전히 일치하지 않지만 사용자에게 대기 인지를 준다. 100ms 주기 업데이트는 UI 부하 최소.

### 백그라운드에서 폴링 유지

React Native에서 `setInterval`은 백그라운드 전환 시 iOS에서 약 3분 후 일시 정지됨. 그러나 이 화면은 백그라운드 전환을 유도 ("홈으로 돌아가기" 링크). 백그라운드 생성 완료는 홈 재진입 시 `/tracks?last_checked_at=...` 응답의 `completed_since_last_check`로 감지 (impl/05). S12에서의 폴링은 S12가 포그라운드에 있는 동안에만 의미 있음.

---

## 8. 수용 기준

- [ ] S12 진입 → "아기를 위한 목소리를 만들고 있어요" + 달·별 애니메이션 + 카운트다운 노출
- [ ] 5초 간격 폴링 확인 (network request 로그 기준)
- [ ] `MOCK_GPU=true` (3초 mock) → 3초 후 status='completed' 폴링 → S13 자동 이동
- [ ] "홈으로 돌아가기" 탭 → S06 이동, activeJobId AsyncStorage 저장 확인
- [ ] 90초 경과 → 타임아웃 상태: "생각보다 오래 걸리고 있어요" + "다시 시도" + "홈으로 이동"
- [ ] "다시 시도" 탭 → 새 job_id로 POST /generations/init (이전 job_id와 다른 UUID 확인)
- [ ] status='failed' 폴링 응답 → 실패 상태: error_message 표시
- [ ] 앱 백그라운드 → 포그라운드 복귀 → pollOnce() 즉시 호출 확인
- [ ] navigation.navigate('Generating', ...) 타입 에러 없음 (`as any` 제거 후)

---

## 9. 주의사항

- `uuid` 패키지는 React Native에서 `react-native-uuid` 또는 `uuid` + `react-native-get-random-values` polyfill 조합이 필요하다. Epic 01에서 이미 설정됐으면 재사용. 없으면 engineer가 의존성 추가.
- 점 로딩 애니메이션 (`dotRow`)은 현재 정적 렌더링. Animated.Value 3개로 순차 pulse 구현 권장 (ux-flow.md 명시: "순차 opacity pulse 200ms"). V1에서는 정적 허용, V2에서 개선.
- `navigation.replace('Play', ...)` 사용 이유: S12에서 성공 후 뒤로가기로 다시 S12로 돌아오지 않도록. replace로 스택에서 S12 제거.
- `import('uuid').then(...)` 동적 import: 재시도 핸들러에서만 사용. bundle에 포함되므로 성능 차이 없음. 정적 import로 변경 가능.
