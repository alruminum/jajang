// apps/mobile/src/screens/S12GeneratingScreen.tsx
// S12 — 생성 중 대기 화면 (폴링 + 타임아웃 + 실패 처리)

import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  AppState,
  AppStateStatus,
  Animated,
  Easing,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { MainStackParamList } from '@navigation/types'

import { generationsApi } from '@services/api/generations'
import { useGenerationStore } from '@store/generationSlice'
import { useRecordingStore } from '@store/recordingSlice'

type Props = NativeStackScreenProps<MainStackParamList, 'Generating'>

// S12 UX 상수
const POLL_INTERVAL_MS  = 5_000    // 5초 폴링 간격
const TIMEOUT_MS        = 90_000   // 90초 타임아웃 (NFR)
const COUNTDOWN_FROM_MS = 90_000   // 카운트다운 표시 기준

type Phase = 'generating' | 'queued' | 'timeout' | 'failed'

/** 간단한 UUID v4 생성 (외부 패키지 없음) */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export default function S12GeneratingScreen({ navigation, route }: Props) {
  const { sampleId, songKey, jobId: paramJobId } = route.params

  // jobId: 클라이언트가 PreviewScreen에서 생성해 전달한 UUID.
  // 아직 S11이 jobId를 전달하지 않을 경우 여기서 생성.
  const jobIdRef = useRef<string>(paramJobId ?? generateUUID())

  const { setActiveJob, setCompleted, clearActive } = useGenerationStore()
  const { resetRecordingFlow } = useRecordingStore()

  const [phase, setPhase] = useState<Phase>('generating')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [queuePosition, setQueuePosition] = useState<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [isRetrying, setIsRetrying] = useState(false)

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tickerRef       = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef    = useRef<number>(Date.now())
  const appStateRef     = useRef<AppStateStatus>(AppState.currentState)
  const phaseRef        = useRef<Phase>('generating')
  const isRetryingRef   = useRef(false)

  // 달·별 float 애니메이션
  const floatAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -10, duration: 1500,
          easing: Easing.inOut(Easing.sin), useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 10, duration: 1500,
          easing: Easing.inOut(Easing.sin), useNativeDriver: true,
        }),
      ])
    ).start()
  }, [floatAnim])

  // phaseRef를 phase 변경에 맞게 동기화 (AppState 핸들러에서 참조)
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  // ── 생성 시작 ─────────────────────────────────────────────────
  useEffect(() => {
    startGeneration()
    return () => stopPolling()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── AppState 감지: 포그라운드 복귀 시 즉시 폴링 ───────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', handleAppStateChange)
    return () => sub.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAppStateChange = useCallback((nextState: AppStateStatus) => {
    const prevState = appStateRef.current
    appStateRef.current = nextState

    if (prevState.match(/inactive|background/) && nextState === 'active') {
      if (phaseRef.current === 'generating' || phaseRef.current === 'queued') {
        pollOnce(jobIdRef.current)
      }
    }
  }, [])

  const stopPolling = () => {
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null }
    if (timeoutRef.current)      { clearTimeout(timeoutRef.current); timeoutRef.current = null }
    if (tickerRef.current)       { clearInterval(tickerRef.current); tickerRef.current = null }
  }

  // newJobId: 재시도 시 새 UUID를 전달. 초기 진입 시에는 jobIdRef.current 사용.
  const startGeneration = async (newJobId?: string) => {
    const currentJobId = newJobId ?? jobIdRef.current
    try {
      const res = await generationsApi.initGeneration({
        job_id:          currentJobId,
        voice_sample_id: sampleId,
        song_key:        songKey,
      })

      setActiveJob(currentJobId, res.track_id, songKey)

      if (res.status === 'completed' && !res.is_new) {
        // 기존 완료된 job으로 재진입 (드문 케이스)
        handleCompleted(res.track_id)
        return
      }

      startPolling(res.job_id)
    } catch (error: unknown) {
      const axiosError = error as { response?: { status?: number } }
      // 402: 횟수 초과
      if (axiosError?.response?.status === 402) {
        clearActive()
        navigation.navigate('UpgradeSheet', { variant: 'generation_exhausted' })
        return
      }
      setPhase('failed')
      setErrorMessage('생성 요청에 실패했어요. 다시 시도해주세요.')
    }
  }

  const startPolling = (targetJobId: string) => {
    // 경과 시간 카운터 (100ms 주기)
    tickerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current)
    }, 100)

    // 90초 타임아웃
    timeoutRef.current = setTimeout(() => {
      stopPolling()
      setPhase('timeout')
    }, TIMEOUT_MS)

    // 5초 폴링
    pollIntervalRef.current = setInterval(() => {
      pollOnce(targetJobId)
    }, POLL_INTERVAL_MS)
  }

  const pollOnce = async (targetJobId: string) => {
    try {
      const status = await generationsApi.getStatus(targetJobId)
      setQueuePosition(status.queue_position)

      if (status.queue_position !== null) {
        setPhase('queued')
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
    setCompleted(jobIdRef.current, completedTrackId, presignUrl ?? '')
    resetRecordingFlow()  // 녹음 관련 임시 파일/상태 정리

    // S13 재생 화면으로 이동 (replace: 뒤로가기 시 S12로 돌아오지 않도록)
    navigation.replace('Play', {
      trackId: completedTrackId,
      presignUrl,
    })
  }

  // 재시도: 새 job_id 생성 후 동일 샘플로 재시도
  // isRetryingRef: 더블탭 시 interval 누수 방지 guard (sync)
  // isRetrying state: Pressable disabled prop용 UI 차단
  const handleRetry = () => {
    if (isRetryingRef.current) return
    isRetryingRef.current = true
    setIsRetrying(true)

    const newJobId = generateUUID()
    jobIdRef.current = newJobId
    stopPolling()
    setPhase('generating')
    setElapsedMs(0)
    setQueuePosition(null)
    setErrorMessage(null)
    startTimeRef.current = Date.now()
    startGeneration(newJobId).finally(() => {
      isRetryingRef.current = false
      setIsRetrying(false)
    })
  }

  const handleGoHome = () => {
    stopPolling()
    // activeJobId는 persist됨 → 홈 화면에서 has_pending 카드로 표시
    navigation.navigate('HomeTabs')
  }

  // ── 렌더링 ────────────────────────────────────────────────────
  const remainingMs  = Math.max(0, COUNTDOWN_FROM_MS - elapsedMs)
  const remainingSec = Math.ceil(remainingMs / 1000)

  const isError = phase === 'timeout' || phase === 'failed'

  return (
    <View style={styles.container}>
      {isError ? (
        // 타임아웃 / 실패 상태
        <View style={styles.center}>
          <Text style={styles.timeoutTitle}>생각보다 오래{'\n'}걸리고 있어요</Text>
          {errorMessage != null && (
            <Text style={styles.errorSubtitle}>{errorMessage}</Text>
          )}
          <Pressable
            style={styles.primaryBtn}
            onPress={handleRetry}
            disabled={isRetrying}
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

          <Text style={styles.subtitle}>·· 약 30~90초 걸려요</Text>

          {/* 경과 시간 카운트다운 */}
          <Text
            style={styles.countdown}
            accessibilityLabel={`남은 시간 약 ${remainingSec}초`}
          >
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
  countdown:        { color: '#5A7AA8', fontSize: 48, fontVariant: ['tabular-nums'], marginBottom: 24 },
  dotRow:           { flexDirection: 'row', gap: 8, marginBottom: 32 },
  dot:              { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2A2E48' },
  queueText:        { color: '#7B80A0', fontSize: 13, textAlign: 'center', marginBottom: 16 },
  backgroundNotice: { color: '#7B80A0', fontSize: 13, textAlign: 'center', marginBottom: 32 },
  homeLink:         { color: '#C49A8A', fontSize: 15, textDecorationLine: 'underline' },

  // 타임아웃/실패 상태
  timeoutTitle:     { color: '#EEF0F8', fontSize: 22, textAlign: 'center', lineHeight: 32, fontFamily: 'NotoSansKR-Regular', marginBottom: 12 },
  errorSubtitle:    { color: '#7B80A0', fontSize: 14, textAlign: 'center', marginBottom: 32 },
  primaryBtn:       { height: 56, backgroundColor: '#5A7AA8', borderRadius: 28, paddingHorizontal: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  primaryBtnText:   { color: '#0D0F1A', fontSize: 17, fontFamily: 'NotoSansKR-Regular' },
})
