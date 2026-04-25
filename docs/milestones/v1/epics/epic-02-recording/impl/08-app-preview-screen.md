---
depth: std
design: skipped
---

# impl/08 — 앱: 녹음 미리듣기 화면 (S11)

**Epic**: 02 — 목소리 녹음 & 품질 검증  
**커버 스토리**: Story 4 (미리듣기 + 재녹음), Story 5 (클라이언트 1차 검증 + 업로드 + 서버 2차 검증)  
**선행 조건**: impl/07 완료 (RecordScreen, localAudioUri), impl/02~03 서버 완료 (업로드 + 검증 API)  
**예상 소요**: 5~6시간

---

## 1. 생성/수정할 파일 목록

```
apps/mobile/src/
├── screens/
│   └── PreviewScreen.tsx        [신규 — S11 녹음 미리듣기]
├── services/
│   └── api/recordings.ts        [신규 — /recordings/init, /complete, /validate API 클라이언트]
├── utils/
│   └── audio-quality.ts         [신규 — 클라이언트 1차 품질 검증 (RMS, 피크, 길이)]
└── components/
    └── WaveformVisualizer.tsx   [수정 — mode='static' 지원 추가]
```

---

## 2. 클라이언트 1차 품질 검증

```typescript
// apps/mobile/src/utils/audio-quality.ts
// 설계 상세 → docs/voice-pipeline.md §2

export interface QualityResult {
  passed: boolean
  reason?: 'too_short' | 'too_quiet' | 'too_loud' | 'clipping'
}

/**
 * durationSec: expo-av Recording.getStatusAsync().durationMillis / 1000
 * pcmSamples:  Float32Array [-1, 1] 정규화 PCM 데이터
 *
 * 주의: expo-av는 직접 PCM Float32Array를 반환하지 않는다.
 * 실용적 V1 대안:
 *   - durationSec + metering 기반 RMS 추정 (실제 PCM 불필요)
 *   - 실제 PCM 분석이 필요하면 expo-audio AudioBuffer API 또는 네이티브 모듈 필요
 * 이 함수는 PCM 이용 가능한 경우를 가정한 full 구현체.
 * V1 실제 호출 방식은 §3 PreviewScreen의 validateFromMetadata 참조.
 */
export function validateAudioQuality(
  durationSec: number,
  pcmSamples: Float32Array,
): QualityResult {
  if (durationSec < 30) return { passed: false, reason: 'too_short' }

  const rms = Math.sqrt(
    pcmSamples.reduce((sum, s) => sum + s * s, 0) / pcmSamples.length
  )
  const rmsDb = 20 * Math.log10(rms + 1e-10)

  if (rmsDb < -40) return { passed: false, reason: 'too_quiet' }
  if (rmsDb > -6)  return { passed: false, reason: 'too_loud' }

  const peakCount = Array.from(pcmSamples).filter(s => Math.abs(s) > 0.95).length
  if (peakCount > 3) return { passed: false, reason: 'clipping' }

  return { passed: true }
}

/**
 * expo-av metering 기반 실용적 V1 검증 (PCM 없이).
 * metering: Recording 중 수집된 dBFS 레벨 배열 (0~-160 범위)
 * durationSec: 녹음 총 길이
 */
export function validateFromMetadata(
  durationSec: number,
  meteringLevels: number[],  // dBFS 값 배열
): QualityResult {
  // 길이 체크
  if (durationSec < 30) return { passed: false, reason: 'too_short' }

  if (meteringLevels.length === 0) return { passed: true }  // 메타 없으면 통과 (서버 검증 위임)

  // RMS dB 추정 (metering 평균)
  const validLevels = meteringLevels.filter(v => v < 0 && v > -160)
  if (validLevels.length === 0) return { passed: false, reason: 'too_quiet' }

  const avgDb = validLevels.reduce((sum, v) => sum + v, 0) / validLevels.length

  if (avgDb < -40) return { passed: false, reason: 'too_quiet' }
  if (avgDb > -6)  return { passed: false, reason: 'too_loud' }

  // 클리핑: metering 0dBFS(또는 -1 이상) 샘플 3개 초과
  const clippingCount = meteringLevels.filter(v => v >= -1).length
  if (clippingCount > 3) return { passed: false, reason: 'clipping' }

  return { passed: true }
}

export const QUALITY_FAIL_MESSAGES: Record<NonNullable<QualityResult['reason']>, string> = {
  too_short:  '30초 이상 녹음이 필요해요',
  too_quiet:  '조금 더 크게 녹음해주세요',
  too_loud:   '마이크에 너무 가까이 계셨어요 — 조금 멀리서 다시 해봐요',
  clipping:   '마이크에 너무 가까이 계셨어요 — 조금 멀리서 다시 해봐요',
}
```

---

## 3. recordings API 클라이언트

```typescript
// apps/mobile/src/services/api/recordings.ts

import { apiClient } from './client'
import * as FileSystem from 'expo-file-system'

export interface UploadInitResponse {
  sample_id: string
  upload_url: string
  s3_key: string
  expires_in_seconds: number
}

export interface UploadCompleteResponse {
  sample_id: string
  status: string
  message: string
}

export interface ValidateResponse {
  sample_id: string
  passed: boolean
  snr_db?: number
  fail_reason?: string
  message: string
}

export const recordingsApi = {
  initUpload: (params: {
    song_key: string
    file_size_bytes: number
    content_type: string
  }): Promise<UploadInitResponse> =>
    apiClient.post('/recordings/init', params).then(r => r.data),

  /**
   * S3 presigned PUT URL로 파일 직접 업로드.
   * axios 인터셉터(JWT) 우회 — presigned URL은 S3로 직접 전송.
   */
  uploadToS3: async (
    presignedUrl: string,
    fileUri: string,
    contentType: string,
  ): Promise<void> => {
    const result = await FileSystem.uploadAsync(presignedUrl, fileUri, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Type': contentType },
    })
    if (result.status !== 200 && result.status !== 204) {
      throw new Error(`S3 upload failed: ${result.status}`)
    }
  },

  completeUpload: (
    sampleId: string,
    params: { sample_id: string; duration_seconds: number; rms_db: number; peak_count: number }
  ): Promise<UploadCompleteResponse> =>
    apiClient.post(`/recordings/${sampleId}/complete`, params).then(r => r.data),

  validateSample: (sampleId: string): Promise<ValidateResponse> =>
    apiClient.post(`/recordings/${sampleId}/validate`).then(r => r.data),
}
```

---

## 4. WaveformVisualizer 정적 모드 추가

```typescript
// apps/mobile/src/components/WaveformVisualizer.tsx (수정 — mode='static' 분기 추가)

// 기존 realtime 모드 유지 + static 모드 추가

interface StaticWaveformProps {
  mode: 'static'
  audioUri: string    // 로컬 파일 URI
  color?: string
  height?: number
  playbackPosition?: number   // 0~1 (재생 진행도, 재생된 부분 앰버 / 나머지 dim)
}

// 정적 파형: expo-av getStatusAsync()로 duration 조회 후 metering 히스토리 기반으로 그리기
// V1 단순화: recordingSlice에 저장된 levels 배열을 props로 전달받아 렌더
// (실제 오디오 파일 파싱은 복잡하고 expo-av에서 직접 PCM 접근 불가)
```

> **V1 단순화 결정**: S11 정적 파형은 S10 녹음 중 수집한 `levels` 배열을 RecordingSlice에 저장해 재사용한다. 별도 파일 파싱 라이브러리 불필요. 시각적으로 동일한 결과.

RecordingSlice 수정 필요:
```typescript
// recordingSlice.ts 에 추가
recordingLevels: number[]
setRecordingLevels: (levels: number[]) => void
```

RecordScreen.tsx에서 cleanup 전 levels 저장:
```typescript
useRecordingStore.getState().setRecordingLevels(levels)
```

---

## 5. PreviewScreen 핵심 로직

```typescript
// apps/mobile/src/screens/PreviewScreen.tsx

import React, { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import { Audio } from 'expo-av'
import * as FileSystem from 'expo-file-system'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import { recordingsApi } from '../services/api/recordings'
import { validateFromMetadata, QUALITY_FAIL_MESSAGES } from '../utils/audio-quality'
import { WaveformVisualizer } from '../components/WaveformVisualizer'
import { useRecordingStore } from '../store/recordingSlice'
import { useAuthStore } from '../store/authSlice'

type Props = NativeStackScreenProps<RootStackParamList, 'Preview'>
type UploadPhase = 'idle' | 'validating_client' | 'uploading' | 'validating_server' | 'error'

export function PreviewScreen({ navigation }: Props) {
  const {
    localAudioUri,
    selectedSongKey,
    recordingLevels,
    setUploadedSampleId,
    setQualityValidationPassed,
    resetRecordingFlow,
  } = useRecordingStore()

  const { entitlement, generationCount } = useAuthStore()
  const isFreeUser = entitlement === 'free'
  const isGenerationExhausted = isFreeUser && generationCount >= 3

  const [phase, setPhase] = useState<UploadPhase>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [durationSec, setDurationSec] = useState(0)
  const [positionSec, setPositionSec] = useState(0)

  const soundRef = useRef<Audio.Sound | null>(null)

  // 녹음 파일 로드 + 길이 조회
  useEffect(() => {
    if (!localAudioUri) {
      navigation.goBack()
      return
    }

    // expo-av allowsRecordingIOS 복원 (RecordScreen에서 true로 설정됨)
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    })

    loadSound()
    return () => {
      soundRef.current?.unloadAsync()
    }
  }, [])

  const loadSound = async () => {
    if (!localAudioUri) return
    const { sound, status } = await Audio.Sound.createAsync(
      { uri: localAudioUri },
      { shouldPlay: false },
      (s) => {
        if (s.isLoaded) {
          setPositionSec((s.positionMillis ?? 0) / 1000)
          if (s.didJustFinish) {
            setIsPlaying(false)
            sound.setPositionAsync(0)
          }
        }
      },
    )
    soundRef.current = sound
    if (status.isLoaded) {
      setDurationSec((status.durationMillis ?? 0) / 1000)
    }
  }

  // 재생/정지 토글
  const handlePlayToggle = async () => {
    const sound = soundRef.current
    if (!sound) return

    if (isPlaying) {
      await sound.pauseAsync()
      setIsPlaying(false)
    } else {
      await sound.playAsync()
      setIsPlaying(true)
    }
  }

  // 다시 녹음
  const handleReRecord = async () => {
    await soundRef.current?.unloadAsync()
    // 로컬 파일 삭제
    if (localAudioUri) {
      await FileSystem.deleteAsync(localAudioUri, { idempotent: true })
    }
    resetRecordingFlow()
    navigation.navigate('Record', { mode: useRecordingStore.getState().recordingMode ?? 'humming' })
  }

  // 사용하기 → 클라이언트 검증 + 업로드 + 서버 검증
  const handleUseRecording = async () => {
    if (!localAudioUri || !selectedSongKey) return

    // 횟수 소진 체크
    if (isGenerationExhausted) {
      navigation.navigate('UpgradeSheet', { variant: 'generation_exhausted' })
      return
    }

    setPhase('validating_client')
    setErrorMessage(null)

    // ── 1. 클라이언트 1차 검증 ──────────
    const clientResult = validateFromMetadata(durationSec, recordingLevels.map(l => l * -60 - 1))
    // levels [0~1] → 근사 dBFS 변환 (metering 역산)

    if (!clientResult.passed && clientResult.reason) {
      setPhase('error')
      setErrorMessage(QUALITY_FAIL_MESSAGES[clientResult.reason])
      return
    }

    // ── 2. S3 업로드 presigned URL 요청 ─
    setPhase('uploading')
    let sampleId: string
    let uploadUrl: string

    try {
      const fileInfo = await FileSystem.getInfoAsync(localAudioUri)
      const fileSize = fileInfo.exists ? (fileInfo as any).size ?? 1_000_000 : 1_000_000

      const initRes = await recordingsApi.initUpload({
        song_key: selectedSongKey,
        file_size_bytes: fileSize,
        content_type: 'audio/wav',
      })
      sampleId = initRes.sample_id
      uploadUrl = initRes.upload_url
    } catch {
      setPhase('error')
      setErrorMessage('업로드 준비에 실패했어요. 네트워크를 확인해주세요')
      return
    }

    // ── 3. S3 직접 업로드 ───────────────
    try {
      await recordingsApi.uploadToS3(uploadUrl, localAudioUri, 'audio/wav')
    } catch {
      setPhase('error')
      setErrorMessage('파일 업로드에 실패했어요. 다시 시도해주세요')
      return
    }

    // ── 4. 업로드 완료 통보 ─────────────
    try {
      await recordingsApi.completeUpload(sampleId, {
        sample_id: sampleId,
        duration_seconds: durationSec,
        rms_db: -20,       // metering 기반 추정값 (V1 단순화)
        peak_count: 0,
      })
    } catch {
      // 통보 실패는 치명적이지 않음 — 계속 진행
    }

    // ── 5. 서버 2차 검증 (SNR) ──────────
    setPhase('validating_server')
    try {
      const validateRes = await recordingsApi.validateSample(sampleId)
      if (!validateRes.passed) {
        setPhase('error')
        setErrorMessage(validateRes.message)
        return
      }

      setUploadedSampleId(sampleId)
      setQualityValidationPassed(true)

      // Epic 03 연동: navigation.navigate('Generating', { sampleId, songKey: selectedSongKey })
      // V1 placeholder: 검증 통과 후 다음 화면으로
      navigation.navigate('Generating' as any, { sampleId, songKey: selectedSongKey })
    } catch {
      setPhase('error')
      setErrorMessage('네트워크를 확인해주세요')
    }
  }

  const isProcessing = phase !== 'idle' && phase !== 'error'
  const phaseMessages: Record<UploadPhase, string> = {
    idle:               '',
    validating_client:  '녹음 품질을 확인하고 있어요',
    uploading:          '목소리를 업로드하고 있어요',
    validating_server:  '샘플을 분석하고 있어요…',
    error:              '',
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>이 목소리로 만들게요</Text>

      {/* 정적 파형 + 재생 컨트롤 */}
      <View style={styles.waveformCard}>
        <WaveformVisualizer
          mode="realtime"  // static 구현 전 임시로 realtime prop 재활용 (levels=recordingLevels)
          levels={recordingLevels}
          color="#8BAED4"
        />
        <View style={styles.playbackRow}>
          <Pressable onPress={handlePlayToggle} accessibilityLabel={isPlaying ? '일시정지' : '재생'}>
            <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
          </Pressable>
          <Text style={styles.timecode}>
            {formatTime(positionSec)} / {formatTime(durationSec)}
          </Text>
        </View>
      </View>

      {/* 에러 메시지 */}
      {phase === 'error' && errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      {/* 처리 중 상태 */}
      {isProcessing && (
        <View style={styles.processingBanner}>
          <ActivityIndicator size="small" color="#F5C97A" style={{ marginRight: 8 }} />
          <Text style={styles.processingText}>{phaseMessages[phase]}</Text>
        </View>
      )}

      {/* 횟수 소진 배너 */}
      {isGenerationExhausted && (
        <View style={styles.exhaustedBanner}>
          <Text style={styles.exhaustedText}>⚠ 3회를 모두 썼어요</Text>
          <Text style={styles.exhaustedSub}>구독하면 계속 만들 수 있어요</Text>
        </View>
      )}

      {/* 버튼 영역 */}
      <View style={styles.buttonGroup}>
        <Pressable
          style={[styles.secondaryBtn, isProcessing && styles.btnDisabled]}
          onPress={handleReRecord}
          disabled={isProcessing}
          accessibilityLabel="다시 녹음"
        >
          <Text style={styles.secondaryBtnText}>다시 녹음할게요</Text>
        </Pressable>

        {isGenerationExhausted ? (
          <Pressable
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('Subscribe' as any)}
            accessibilityLabel="구독하기"
          >
            <Text style={styles.primaryBtnText}>구독하기 →</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.primaryBtn, isProcessing && styles.btnDisabled]}
            onPress={handleUseRecording}
            disabled={isProcessing}
            accessibilityLabel="이 목소리로 만들기"
          >
            <Text style={styles.primaryBtnText}>이 목소리로 만들기</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

function formatTime(sec: number): string {
  const m = String(Math.floor(sec / 60)).padStart(2, '0')
  const s = String(Math.floor(sec % 60)).padStart(2, '0')
  return `${m}:${s}`
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#0D0F1A', paddingHorizontal: 20, paddingTop: 24 },
  title:            { color: '#EEF0F8', fontSize: 20, fontFamily: 'NotoSansKR-Regular', marginBottom: 24 },
  waveformCard:     { backgroundColor: '#1A1D30', borderRadius: 16, padding: 20, marginBottom: 20 },
  playbackRow:      { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  playIcon:         { color: '#8BAED4', fontSize: 22, marginRight: 12 },
  timecode:         { color: '#7B80A0', fontSize: 13, fontVariant: ['tabular-nums'] },
  errorBanner:      { backgroundColor: '#2A1A1A', borderRadius: 12, padding: 14, marginBottom: 16 },
  errorText:        { color: '#FF6B6B', fontSize: 14 },
  processingBanner: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  processingText:   { color: '#7B80A0', fontSize: 14 },
  exhaustedBanner:  { backgroundColor: '#21253E', borderRadius: 12, padding: 14, marginBottom: 16 },
  exhaustedText:    { color: '#E8A94A', fontSize: 14, marginBottom: 4 },
  exhaustedSub:     { color: '#7B80A0', fontSize: 13 },
  buttonGroup:      { gap: 12, marginTop: 'auto', marginBottom: 32 },
  primaryBtn:       { height: 56, backgroundColor: '#F5C97A', borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  primaryBtnText:   { color: '#0D0F1A', fontSize: 17, fontFamily: 'NotoSansKR-Regular' },
  secondaryBtn:     { height: 52, backgroundColor: '#1A1D30', borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  secondaryBtnText: { color: '#8BAED4', fontSize: 15 },
  btnDisabled:      { opacity: 0.4 },
})
```

---

## 6. 설계 결정 근거

### expo-av FileSystem.uploadAsync (presigned PUT)

axios 인터셉터가 붙은 `apiClient`를 사용하면 JWT Authorization 헤더가 S3 presigned URL에 전송되어 S3에서 403 오류가 발생한다. `FileSystem.uploadAsync`는 헤더를 명시적으로 지정하므로 S3 직접 업로드에 적합. 대안: axios에서 interceptor skip 로직 추가 — 복잡도 증가, FileSystem.uploadAsync가 더 단순.

### 클라이언트 검증: PCM 없이 metering 기반

expo-av은 녹음 중 metering 값을 제공하지만 PCM Float32Array는 직접 접근 불가. V1에서 `validateFromMetadata`가 metering 히스토리로 RMS 추정. 정밀도는 PCM 방식보다 낮지만 명백한 음량 이상(너무 조용함/클리핑)은 충분히 감지 가능. 서버 SNR 검증이 2차 방어선 역할.

### rms_db 서버 전달값 단순화

impl/02 `complete_upload` 엔드포인트의 `rms_db` 필드는 실제 PCM 없이는 정밀 계산 불가. V1에서 `-20`(추정값) 전달. 서버는 이 값을 DB에 저장하지만, 실제 품질 판단은 S3 다운로드 후 librosa로 별도 계산. 추후 expo-audio AudioBuffer API 도입 시 실제값으로 교체.

---

## 7. 수용 기준

- [ ] S11 진입 시 녹음 파형(levels 기반) + 재생/일시정지 컨트롤 표시
- [ ] ▶ 탭 → 녹음본 재생, ⏸ 탭 → 일시정지
- [ ] 재생 완료 시 위치 초기화 (0:00으로 복귀)
- [ ] "다시 녹음할게요" 탭 → 로컬 파일 삭제 + RecordScreen 이동
- [ ] "이 목소리로 만들기" 탭 (횟수 여유) → 클라이언트 검증 → 업로드 → 서버 검증 → 통과 시 Generating 이동
- [ ] 클라이언트 검증 실패 (too_quiet) → 에러 배너 "조금 더 크게 녹음해주세요" + "다시 녹음할게요" 버튼
- [ ] 서버 SNR 검증 실패 → 에러 배너 "조용한 공간에서 다시 해봐요" + "다시 녹음할게요" 버튼
- [ ] 횟수 소진 상태 → 소진 배너 + "이 목소리로 만들기" 비활성 + "구독하기 →" CTA
- [ ] 처리 중(uploading/validating) 상태 → 버튼 비활성 + 로딩 표시
- [ ] Audio.setAudioModeAsync allowsRecordingIOS=false 복원 확인 (미리듣기 음질 정상)

---

## 8. 주의사항

- `navigation.navigate('Generating', ...)` 은 Epic 03 구현 완료 전까지 동작하지 않는다. V1 빌드에서 타입 오류 방지를 위해 `as any` 임시 사용. Epic 03 완료 후 타입 정의 추가 + `as any` 제거 필수.
- `FileSystem.getInfoAsync`의 `size` 필드는 expo SDK 버전에 따라 타입이 다를 수 있다. `(fileInfo as any).size` 패턴 사용. engineer가 실제 SDK 버전에서 타입을 확인해 캐스팅 정리.
- `rms_db: -20` 하드코딩은 V1 임시값임을 코드 주석으로 명시 (`// TODO: replace with actual PCM RMS after expo-audio migration`).
- 업로드 실패 시 로컬 파일은 유지한다. 사용자가 재시도하면 동일 로컬 파일을 다시 업로드. 재녹음을 탭했을 때만 로컬 파일 삭제.
- `Generating` 화면은 Epic 03 범위다. 이 impl은 네비게이션 호출까지만 구현하고 화면 자체는 구현하지 않는다.
