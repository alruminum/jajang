// apps/mobile/src/utils/audio-quality.ts
// 클라이언트 1차 품질 검증 (RMS, 피크, 길이)
// 설계 상세 → docs/voice-pipeline.md §2

export interface QualityResult {
  passed: boolean
  reason?: 'too_short' | 'too_quiet' | 'too_loud' | 'clipping'
}

/**
 * PCM 기반 품질 검증.
 * durationSec: expo-audio useAudioRecorderState().durationMillis / 1000
 * pcmSamples:  Float32Array [-1, 1] 정규화 PCM 데이터
 *
 * 주의: expo-audio는 직접 PCM Float32Array를 반환하지 않는다.
 * 실용적 V1 대안: durationSec + metering 기반 RMS 추정 (validateFromMetadata 참조).
 * 이 함수는 PCM 이용 가능한 경우를 가정한 full 구현체.
 */
export function validateAudioQuality(
  durationSec: number,
  pcmSamples: Float32Array,
): QualityResult {
  if (durationSec < 30) return { passed: false, reason: 'too_short' }

  const rms = Math.sqrt(
    pcmSamples.reduce((sum, s) => sum + s * s, 0) / pcmSamples.length,
  )
  const rmsDb = 20 * Math.log10(rms + 1e-10)

  if (rmsDb < -40) return { passed: false, reason: 'too_quiet' }
  if (rmsDb > -6) return { passed: false, reason: 'too_loud' }

  const peakCount = Array.from(pcmSamples).filter(s => Math.abs(s) > 0.95).length
  if (peakCount > 3) return { passed: false, reason: 'clipping' }

  return { passed: true }
}

/**
 * expo-audio metering 기반 실용적 V1 검증 (PCM 없이).
 * meteringLevels: useAudioRecorderState() 중 수집된 dBFS 레벨 배열 (metering → 0~-160 범위)
 * durationSec: 녹음 총 길이
 */
export function validateFromMetadata(
  durationSec: number,
  meteringLevels: number[], // dBFS 값 배열
): QualityResult {
  // 길이 체크
  if (durationSec < 30) return { passed: false, reason: 'too_short' }

  if (meteringLevels.length === 0) return { passed: true } // 메타 없으면 통과 (서버 검증 위임)

  // RMS dB 추정 (metering 평균)
  const validLevels = meteringLevels.filter(v => v < 0 && v > -160)
  if (validLevels.length === 0) return { passed: false, reason: 'too_quiet' }

  const avgDb = validLevels.reduce((sum, v) => sum + v, 0) / validLevels.length

  if (avgDb < -40) return { passed: false, reason: 'too_quiet' }
  if (avgDb > -6) return { passed: false, reason: 'too_loud' }

  // 클리핑: metering 0dBFS(또는 -1 이상) 샘플 3개 초과
  const clippingCount = meteringLevels.filter(v => v >= -1).length
  if (clippingCount > 3) return { passed: false, reason: 'clipping' }

  return { passed: true }
}

export const QUALITY_FAIL_MESSAGES: Record<NonNullable<QualityResult['reason']>, string> = {
  too_short: '30초 이상 녹음이 필요해요',
  too_quiet: '조금 더 크게 녹음해주세요',
  too_loud: '마이크에 너무 가까이 계셨어요 — 조금 멀리서 다시 해봐요',
  clipping: '마이크에 너무 가까이 계셨어요 — 조금 멀리서 다시 해봐요',
}
