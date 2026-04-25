---
depth: std
design: skipped
---

# impl/07 — 앱: 녹음 화면 (S10)

**Epic**: 02 — 목소리 녹음 & 품질 검증  
**커버 스토리**: Story 3 (실시간 녹음 — 파형, 카운트다운, 자동 종료, 무음 감지)  
**선행 조건**: impl/06 완료 (RecordGuideScreen, 마이크 권한 획득)  
**예상 소요**: 5~6시간

---

## 1. 생성/수정할 파일 목록

```
apps/mobile/src/
├── screens/
│   └── RecordScreen.tsx         [신규 — S10 녹음 화면]
├── components/
│   └── WaveformVisualizer.tsx   [신규 — 실시간 파형 시각화 컴포넌트]
└── store/
    └── recordingSlice.ts        [수정 — localAudioUri setter 확인]
```

---

## 2. WaveformVisualizer 컴포넌트

```typescript
// apps/mobile/src/components/WaveformVisualizer.tsx

/**
 * 두 모드:
 *   mode='realtime'  → levels 배열 (Float32Array 또는 number[])을 props로 받아 실시간 렌더
 *   mode='static'    → audioUri 파일 전체를 사전 분석해 파형 그리기 (S11에서 사용)
 *
 * S10에서는 mode='realtime' 사용.
 * 실제 PCM 데이터 대신 메타 레벨(AudioRecording.metering)을 활용.
 */

import React from 'react'
import { View, StyleSheet } from 'react-native'

const BAR_COUNT = 40
const MIN_HEIGHT = 4
const MAX_HEIGHT = 60

interface WaveformVisualizerProps {
  mode: 'realtime'
  levels: number[]    // 0~1 정규화된 dB 레벨 (최근 BAR_COUNT개)
  color?: string
  height?: number
}

export function WaveformVisualizer({
  levels,
  color = '#F5C97A',
  height = 80,
}: WaveformVisualizerProps) {
  // levels 배열 → BAR_COUNT 개로 샘플링 또는 패딩
  const bars = React.useMemo(() => {
    const result: number[] = []
    for (let i = 0; i < BAR_COUNT; i++) {
      const level = levels[levels.length - BAR_COUNT + i] ?? 0
      result.push(MIN_HEIGHT + level * (MAX_HEIGHT - MIN_HEIGHT))
    }
    return result
  }, [levels])

  return (
    <View style={[styles.container, { height }]}>
      {bars.map((barHeight, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            {
              height: barHeight,
              backgroundColor: color,
              opacity: 0.5 + (barHeight / MAX_HEIGHT) * 0.5,  // 높이에 따라 투명도 조정
            },
          ]}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  bar: {
    width: 4,
    borderRadius: 2,
  },
})
```

---

## 3. RecordScreen 핵심 로직

```typescript
// apps/mobile/src/screens/RecordScreen.tsx

import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  View, Text, Pressable, StyleSheet, Alert, BackHandler
} from 'react-native'
import { Audio } from 'expo-av'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import { WaveformVisualizer } from '../components/WaveformVisualizer'
import { useRecordingStore } from '../store/recordingSlice'

type Props = NativeStackScreenProps<RootStackParamList, 'Record'>

// ─────────────────────────────────────
// 상수
// ─────────────────────────────────────
const COUNTDOWN_START    = 3        // 카운트다운 초
const MIN_DURATION_SEC   = 30       // 최소 녹음 시간
const MAX_DURATION_SEC   = 60       // 최대 녹음 시간 (자동 종료)
const SILENCE_THRESHOLD  = 0.02     // 무음 감지 임계값 (정규화 레벨)
const SILENCE_WARN_SEC   = 10       // 무음 경고 표시 시간

type ScreenPhase = 'countdown' | 'recording' | 'short_warning'

// ─────────────────────────────────────
// expo-audio metering → 0~1 레벨 변환
// ─────────────────────────────────────
function meteringToLevel(metering: number | undefined): number {
  if (metering === undefined || metering === 0) return 0
  // expo-av metering: 0~-160 dBFS 범위
  // -60dB 이상을 1.0으로 클리핑 (실용 범위)
  const clamped = Math.max(-60, metering)
  return (clamped + 60) / 60
}

export function RecordScreen({ navigation }: Props) {
  const { setLocalAudioUri, recordingMode } = useRecordingStore()

  // 화면 단계
  const [phase, setPhase] = useState<ScreenPhase>('countdown')
  const [countdown, setCountdown] = useState(COUNTDOWN_START)

  // 녹음 상태
  const [elapsedSec, setElapsedSec] = useState(0)
  const [levels, setLevels] = useState<number[]>([])
  const [showSilenceWarning, setShowSilenceWarning] = useState(false)

  // refs (렌더 사이클 외부 상태)
  const recordingRef     = useRef<Audio.Recording | null>(null)
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null)
  const silenceTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const silentSecRef     = useRef(0)   // 무음 누적 시간

  // ── 카운트다운 ──────────────────────
  useEffect(() => {
    if (phase !== 'countdown') return

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          startRecording()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [phase])

  // ── 녹음 시작 ──────────────────────
  const startRecording = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      })

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
        // metering 콜백: 100ms 주기
        (status) => {
          if (!status.isRecording) return

          const level = meteringToLevel(status.metering)

          setLevels(prev => [...prev.slice(-39), level])

          // 무음 감지
          if (level < SILENCE_THRESHOLD) {
            silentSecRef.current += 0.1
            if (silentSecRef.current >= SILENCE_WARN_SEC) {
              setShowSilenceWarning(true)
            }
          } else {
            silentSecRef.current = 0
            setShowSilenceWarning(false)
          }
        },
        100,   // 100ms 주기 metering
      )

      recordingRef.current = recording
      setPhase('recording')

      // 경과 시간 타이머
      timerRef.current = setInterval(() => {
        setElapsedSec(prev => {
          if (prev + 1 >= MAX_DURATION_SEC) {
            // 자동 종료
            clearInterval(timerRef.current!)
            handleAutoStop()
          }
          return prev + 1
        })
      }, 1000)

    } catch (e) {
      Alert.alert('', '녹음을 시작할 수 없어요. 마이크 권한을 확인해주세요')
      navigation.goBack()
    }
  }

  // ── 자동 종료 (60초) ───────────────
  const handleAutoStop = useCallback(async () => {
    await stopAndNavigate()
  }, [])

  // ── 수동 종료 버튼 탭 ──────────────
  const handleStopPress = async () => {
    if (elapsedSec < MIN_DURATION_SEC) {
      // 30초 미만 → 연장 유도 다이얼로그
      setPhase('short_warning')
      Alert.alert(
        '조금 더 녹음해주세요',
        '30초 이상 녹음하면 더 좋은 자장가를 만들 수 있어요',
        [
          { text: '이어서 할게요', onPress: () => setPhase('recording') },
          { text: '다시 시작', onPress: restartRecording },
        ],
      )
    } else {
      await stopAndNavigate()
    }
  }

  // ── 취소 버튼 탭 ───────────────────
  const handleCancel = () => {
    Alert.alert(
      '녹음을 취소할까요?',
      '',
      [
        { text: '계속 녹음', style: 'cancel' },
        {
          text: '취소',
          style: 'destructive',
          onPress: async () => {
            await cleanupRecording()
            navigation.navigate('RecordMode')
          },
        },
      ],
    )
  }

  // ── 공통: 녹음 종료 + S11 이동 ─────
  const stopAndNavigate = async () => {
    const uri = await cleanupRecording()
    if (uri) {
      setLocalAudioUri(uri)
      navigation.navigate('Preview')
    }
  }

  // ── 재시작 ─────────────────────────
  const restartRecording = async () => {
    await cleanupRecording()
    setElapsedSec(0)
    setLevels([])
    setCountdown(COUNTDOWN_START)
    setPhase('countdown')
    silentSecRef.current = 0
  }

  // ── 녹음 정리 ─────────────────────
  const cleanupRecording = async (): Promise<string | null> => {
    clearInterval(timerRef.current!)
    clearTimeout(silenceTimerRef.current!)

    const rec = recordingRef.current
    if (!rec) return null

    try {
      await rec.stopAndUnloadAsync()
      const uri = rec.getURI()
      recordingRef.current = null
      return uri ?? null
    } catch {
      return null
    }
  }

  // ── Android 뒤로 가기 가로채기 ─────
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleCancel()
      return true
    })
    return () => sub.remove()
  }, [elapsedSec])

  // ── 언마운트 정리 ──────────────────
  useEffect(() => {
    return () => {
      cleanupRecording()
    }
  }, [])

  // ────────────────────────────────────
  // 렌더
  // ────────────────────────────────────
  if (phase === 'countdown') {
    return (
      <View style={styles.countdownContainer}>
        <Pressable style={styles.cancelBtn} onPress={handleCancel}>
          <Text style={styles.cancelText}>✕ 취소</Text>
        </Pressable>
        <Text style={styles.countdownNumber}>{countdown}</Text>
        <Text style={styles.countdownLabel}>녹음을 시작해요</Text>
      </View>
    )
  }

  const formatTime = (sec: number) => {
    const m = String(Math.floor(sec / 60)).padStart(2, '0')
    const s = String(sec % 60).padStart(2, '0')
    return `${m}:${s}`
  }

  return (
    <View style={styles.container}>
      {/* 상단 바 */}
      <View style={styles.topBar}>
        <Pressable onPress={handleCancel} accessibilityLabel="녹음 취소">
          <Text style={styles.cancelText}>✕ 취소</Text>
        </Pressable>
        <Text style={styles.timer}>
          {formatTime(elapsedSec)} / {formatTime(MAX_DURATION_SEC)}
        </Text>
      </View>

      {/* 실시간 파형 */}
      <View style={styles.waveformContainer}>
        <WaveformVisualizer mode="realtime" levels={levels} />
      </View>

      {/* 30초 미달 안내 */}
      {elapsedSec < MIN_DURATION_SEC && (
        <Text style={styles.durationHint}>30초 채워주세요</Text>
      )}

      {/* 무음 경고 */}
      {showSilenceWarning && (
        <Text style={styles.silenceWarning}>소리가 감지되지 않아요</Text>
      )}

      {/* 중지 버튼 */}
      <Pressable
        style={styles.stopBtn}
        onPress={handleStopPress}
        accessibilityLabel="녹음 중지"
      >
        <View style={styles.stopIcon} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  countdownContainer: {
    flex: 1, backgroundColor: '#0D0F1A',
    justifyContent: 'center', alignItems: 'center',
  },
  countdownNumber: {
    color: '#F5C97A', fontSize: 96,
    fontVariant: ['tabular-nums'],   // 흔들림 방지 tabular numbers
    fontFamily: 'NotoSansKR-Regular',
  },
  countdownLabel:   { color: '#7B80A0', fontSize: 16, marginTop: 12 },

  container:        { flex: 1, backgroundColor: '#0D0F1A', paddingHorizontal: 20 },
  topBar:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 20, paddingBottom: 12 },
  cancelText:       { color: '#7B80A0', fontSize: 15 },
  cancelBtn:        { position: 'absolute', top: 48, left: 20 },
  timer:            { color: '#7B80A0', fontSize: 15, fontVariant: ['tabular-nums'] },

  waveformContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 24,
  },

  durationHint:     { color: '#7B80A0', fontSize: 14, textAlign: 'center', marginBottom: 16 },
  silenceWarning:   { color: '#E8A94A', fontSize: 14, textAlign: 'center', marginBottom: 8 },

  stopBtn: {
    width: 72, height: 72,
    borderRadius: 36,
    backgroundColor: '#FF4444',
    justifyContent: 'center', alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 48,
    // pulse 링 효과는 Animated API로 구현 (별도 Animated.View + border)
  },
  stopIcon: {
    width: 26, height: 26,
    backgroundColor: '#fff',
    borderRadius: 4,
  },
})
```

---

## 4. 네비게이션 타입 추가

```typescript
// apps/mobile/src/navigation/types.ts 에 추가

Preview: undefined
```

---

## 5. 설계 결정 근거

### expo-av vs expo-audio

`expo-audio`(Expo SDK 52+에 새로 추가된 패키지)를 사용할 경우 metering API 확인이 필요하다.  
trd.md §1 기재: `expo-av / expo-audio` 병기. V1에서 `Audio.Recording.createAsync`의 metering 콜백 방식은 `expo-av`에서 검증된 패턴이므로 `expo-av` 사용. `expo-audio`로 전환 시 metering 콜백 시그니처 확인 필요.

### metering 콜백 주기 100ms

`AudioRecording.createAsync` 세 번째 인자로 100ms 지정.  
더 짧은 주기(16ms)는 JS bridge 부하 증가 → 파형 시각화 목적에 100ms 충분.

### 파형 레벨 배열 최대 40개 유지

`levels.slice(-39)` + 신규 1개 = 최대 40개 유지. 메모리 무한 증가 방지.

---

## 6. 수용 기준

- [ ] S10 진입 시 3초 카운트다운 자동 시작 (3→2→1, 대형 앰버 숫자)
- [ ] 카운트다운 완료 후 자동 녹음 시작 (expo-av Recording.createAsync)
- [ ] 녹음 중 실시간 파형 시각화 (100ms 주기 metering 기반)
- [ ] 타이머 표시: MM:SS / 01:00 포맷 (tabular numbers)
- [ ] 30초 미만: "30초 채워주세요" 안내 텍스트 표시
- [ ] 30초 이상: 안내 텍스트 숨김
- [ ] 60초 도달: 자동 종료 + S11(Preview) 이동
- [ ] ⏹ 탭 (30초+): S11 이동 + localAudioUri 저장
- [ ] ⏹ 탭 (30초 미만): "조금 더 녹음해주세요" 다이얼로그 → 이어서/다시 시작
- [ ] ✕ 취소 탭: 확인 팝업 → 확인 시 S08(RecordMode) 이동
- [ ] 10초 무음 지속 → "소리가 감지되지 않아요" 경고 텍스트 표시 (녹음 계속)
- [ ] 화면 언마운트 시 recording cleanup (stopAndUnloadAsync)

---

## 7. 주의사항

- `Audio.setAudioModeAsync({ allowsRecordingIOS: true })` 호출은 녹음 시작 전 필수. 미호출 시 iOS에서 RNTP(AudioEngine) 재생 음질이 저하될 수 있다. 녹음 완료 후 `allowsRecordingIOS: false`로 복원 — 단, S11에서 미리듣기 전에도 복원 필요 (impl/08에서 처리).
- 무음 감지는 누적 카운터(`silentSecRef`)로 구현한다. 무음 → 유음 → 무음 패턴에서 카운터가 리셋되므로 연속 무음만 감지.
- `BackHandler`는 Android 전용. iOS의 네비게이션 제스처(swipe back)는 `navigation.addListener('beforeRemove', ...)` 가로채기 필요. V1 simple 대응: iOS에서 헤더 뒤로 버튼 대신 ✕ 취소 버튼만 노출하고 swipe-back 제스처 disable.
  ```typescript
  // RecordScreen 진입 시 navigation options
  navigation.setOptions({ gestureEnabled: false })
  ```
- 녹음 파일 포맷: `Audio.RecordingOptionsPresets.HIGH_QUALITY`는 iOS: `.m4a`(AAC), Android: `.3gp`(AMR) 기본값. 서버 업로드는 impl/02에서 `content_type` 필드로 구분. iOS `.m4a`는 `audio/m4a`, Android `.3gp`는 별도 처리 필요 → `RecordingOptionsPresets.HIGH_QUALITY` 대신 WAV 명시 고려:
  ```typescript
  const RECORDING_OPTIONS: Audio.RecordingOptions = {
    android: {
      extension: '.wav',
      outputFormat: Audio.AndroidOutputFormat.DEFAULT,
      audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
      sampleRate: 16000,
      numberOfChannels: 1,
      bitRate: 256000,
    },
    ios: {
      extension: '.wav',
      outputFormat: Audio.IOSOutputFormat.LINEARPCM,
      audioQuality: Audio.IOSAudioQuality.MAX,
      sampleRate: 16000,
      numberOfChannels: 1,
      bitRate: 256000,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    },
    web: {},
  }
  ```
  WAV PCM 선택 이유: librosa SNR 분석(impl/03)이 WAV PCM에서 가장 안정적. 파일 크기(60초 16kHz 16bit mono ≈ 1.9MB)는 5G/LTE 업로드 무리 없음.
