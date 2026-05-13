/**
 * NS2 Spike — Pure-JS DSP 처리시간 측정 스크립트
 *
 * 목적: Galaxy Android (저사양 기준) 에서 Hermes JS engine 으로
 *       30s WAV 입력 → DSP 4 효과 체인 처리시간 측정 (C1 viability gate)
 *
 * 실행 방법:
 *   방법 A: apps/mobile/index.js 임시 교체 → runSpike() 호출 → adb logcat
 *   방법 B: SpikeNs2Screen.tsx (DevMenu 진입) → useEffect/버튼으로 runSpike()
 *   adb 필터: adb logcat | grep -E "SPIKE_NS2|RESULT:"
 *
 * ⚠️  PROD 번들 포함 금지 — 측정 완료 후 navigator import 제거
 *
 * =============================================================================
 * DSP 파라미터 SSOT 스냅샷 (2026-05-13)
 * 출처: apps/api/app/services/dsp/ffmpeg_service.py DspService 클래스 상수
 * =============================================================================
 *   HIGHPASS   : cutoff=80Hz (1차 IIR, afftdn 강등 대체)
 *                y[n] = a*(y[n-1] + x[n] - x[n-1]), a = exp(-2π·fc/sr)
 *   EQ         : f=2500Hz, width_type=h (Hz 단위), width=200Hz → Q=f/width=12.5
 *                gain=+3dB. RBJ Audio EQ Cookbook peakingEQ 공식
 *   AECHO      : in=0.6, out=0.3, delay=100ms, decay=0.3
 *                단일 1-tap delay line 구현 (multiple echo X)
 *   CROSSFADE  : d=300ms (fadeMs=300), c=tri (triangular linear)
 *   SPECTRAL   : AFFTDN_NR=10dB, AFFTDN_NF=-25dBFS
 *                fft.js 1024-window, Hann window, 50% overlap
 * =============================================================================
 *
 * 주의:
 *   - 모든 DSP 함수는 입력 Float32Array 를 변형하지 않음 (새 배열 반환).
 *     이유: 측정 루프에서 동일 입력으로 각 효과를 독립 측정.
 *   - biquad q 인자는 plan 시그니처 호환용이나 본 구현에서 무시됨.
 *     내부적으로 Q = EQ_FREQ / EQ_WIDTH (=12.5) 를 사용 (width_type=h SSOT 정합).
 */

import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';

// fft.js is available via package.json fft.js@^4.0.4
// eslint-disable-next-line @typescript-eslint/no-var-requires
const FFT = require('fft.js');

// ---------------------------------------------------------------------------
// Public type exports (used by tests)
// ---------------------------------------------------------------------------

/** fft.js constructor type */
export type FFTLib = typeof FFT;

/** 타이밍 측정 결과 */
export interface TimingResult {
  effectName: string;
  durationMs: number;
  inputSamples: number;
}

// ---------------------------------------------------------------------------
// SSOT 파라미터 상수 (DspService 2026-05-13 스냅샷)
// ---------------------------------------------------------------------------

const HIGHPASS_CUTOFF_HZ = 80;
const EQ_FREQ = 2500;
const EQ_WIDTH_HZ = 200;   // width_type=h → Q = EQ_FREQ / EQ_WIDTH_HZ = 12.5
const EQ_GAIN_DB = 3;
const AECHO_IN = 0.6;
const AECHO_OUT = 0.3;
const AECHO_DELAY_MS = 100;
const AECHO_DECAY = 0.3;
const CROSSFADE_D_MS = 300;
const AFFTDN_NR = 10;      // noiseReductionDb
const AFFTDN_NF = -25;     // noiseFloorDb (dBFS)

const SAMPLE_RATE = 44100;
const FFT_WINDOW = 1024;
const WAV_HEADER_BYTES = 44;

// ---------------------------------------------------------------------------
// 1. applyHighpass — 1차 IIR highpass (afftdn 강등 대체)
//    y[n] = a * (y[n-1] + x[n] - x[n-1])
//    a = exp(-2π·fc/sr)
// ---------------------------------------------------------------------------

export function applyHighpass(
  samples: Float32Array,
  cutoffHz: number,
  sampleRate: number,
): Float32Array {
  const a = Math.exp(-2 * Math.PI * cutoffHz / sampleRate);
  const out = new Float32Array(samples.length);
  let prev_x = 0.0;
  let prev_y = 0.0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = a * (prev_y + x - prev_x);
    out[i] = y;
    prev_x = x;
    prev_y = y;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2. applyBiquadEq — RBJ peakingEQ (Direct Form I)
//    width_type=h → Q = freq / EQ_WIDTH_HZ (SSOT 정합)
//    ⚠️ q 인자는 plan 시그니처 호환용이나 내부에서 무시됨.
//       Q = EQ_FREQ / EQ_WIDTH_HZ = 12.5 고정 (서버 width_type=h 정합)
// ---------------------------------------------------------------------------

export function applyBiquadEq(
  samples: Float32Array,
  freq: number,
  gain: number,
  // q is kept for interface compatibility with the plan spec but is ignored.
  // Internally Q = freq / EQ_WIDTH_HZ (width_type=h SSOT).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _q: number,
  sampleRate: number,
): Float32Array {
  const Q = freq / EQ_WIDTH_HZ;          // width_type=h → Q = f / width_Hz
  const w0 = 2 * Math.PI * freq / sampleRate;
  const alpha = Math.sin(w0) / (2 * Q);
  const A = Math.pow(10, gain / 40);     // 10^(g/40)

  const b0 = 1 + alpha * A;
  const b1 = -2 * Math.cos(w0);
  const b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A;
  const a1 = -2 * Math.cos(w0);
  const a2 = 1 - alpha / A;

  // Normalize by a0
  const nb0 = b0 / a0;
  const nb1 = b1 / a0;
  const nb2 = b2 / a0;
  const na1 = a1 / a0;
  const na2 = a2 / a0;

  const out = new Float32Array(samples.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;

  for (let i = 0; i < samples.length; i++) {
    const x0 = samples[i];
    const y0 = nb0 * x0 + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
    out[i] = y0;
    x2 = x1; x1 = x0;
    y2 = y1; y1 = y0;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3. applyDelay — 단일 1-tap delay line (aecho 등가)
//    out[n] = inGain*x[n] + wet*decay*delayBuf[n - delaySamples]
// ---------------------------------------------------------------------------

export function applyDelay(
  samples: Float32Array,
  delayMs: number,
  decay: number,
  wet: number,
  inGain: number,
  sampleRate: number,
): Float32Array {
  const delaySamples = Math.round(delayMs * sampleRate / 1000);
  const out = new Float32Array(samples.length);
  // delayBuf = virtual buffer; we read from 'samples' offset by delaySamples
  for (let i = 0; i < samples.length; i++) {
    const direct = inGain * samples[i];
    const echoIdx = i - delaySamples;
    const echo = echoIdx >= 0 ? wet * decay * samples[echoIdx] : 0;
    out[i] = direct + echo;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4. applyCrossfade — triangular linear crossfade
//    α = i / fadeSamples (linear ramp = tri shape)
//    output = seg1.slice(0, seg1.len-fadeSamples) + cross + seg2.slice(fadeSamples)
//    length = seg1.len + seg2.len - fadeSamples
// ---------------------------------------------------------------------------

export function applyCrossfade(
  seg1: Float32Array,
  seg2: Float32Array,
  fadeMs: number,
  sampleRate: number,
): Float32Array {
  const fadeSamples = Math.round(fadeMs * sampleRate / 1000);
  const totalLen = seg1.length + seg2.length - fadeSamples;
  const out = new Float32Array(totalLen);

  // Copy seg1 non-crossfade region
  const seg1Tail = seg1.length - fadeSamples;
  for (let i = 0; i < seg1Tail; i++) {
    out[i] = seg1[i];
  }

  // Crossfade region
  for (let i = 0; i < fadeSamples; i++) {
    const alpha = i / fadeSamples;                  // 0 → 1 linear
    const s1Val = seg1[seg1Tail + i] ?? 0;
    const s2Val = seg2[i] ?? 0;
    out[seg1Tail + i] = (1 - alpha) * s1Val + alpha * s2Val;
  }

  // Copy seg2 non-crossfade region
  for (let i = fadeSamples; i < seg2.length; i++) {
    out[seg1Tail + fadeSamples + (i - fadeSamples)] = seg2[i];
  }

  return out;
}

// ---------------------------------------------------------------------------
// 5. applySpectralGate — afftdn JS 구현
//    1024-window, Hann window, 50% overlap, magnitude < threshold → mute
//    threshold = linear(noiseFloorDb) applied per-bin
//    gain reduction = noiseReductionDb linear factor for passing bins
// ---------------------------------------------------------------------------

export function applySpectralGate(
  samples: Float32Array,
  noiseReductionDb: number,
  noiseFloorDb: number,
  fftLib: typeof FFT,
): Float32Array {
  const N = FFT_WINDOW;
  const hop = N / 2;                                // 50% overlap
  const fft = new fftLib(N);
  const out = new Float32Array(samples.length);
  const norm = new Float32Array(samples.length);   // accumulate window weights

  // Hann window
  const hann = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));
  }

  // Noise floor threshold in linear amplitude
  const noiseFloorLinear = Math.pow(10, noiseFloorDb / 20);
  // Gate reduction factor for bins above threshold
  const reductionFactor = Math.pow(10, -Math.abs(noiseReductionDb) / 20);

  const complexIn = fft.createComplexArray();
  const complexOut = fft.createComplexArray();
  const realIn = new Array(N);

  for (let pos = 0; pos + N <= samples.length; pos += hop) {
    // Apply Hann window to real input
    for (let i = 0; i < N; i++) {
      realIn[i] = samples[pos + i] * hann[i];
    }

    // Forward FFT (realTransform fills first N complex values)
    fft.realTransform(complexIn, realIn);
    fft.completeSpectrum(complexIn);

    // Spectral gating: bins below floor → multiply by reductionFactor
    for (let k = 0; k < N * 2; k += 2) {
      const re = complexIn[k];
      const im = complexIn[k + 1];
      const mag = Math.sqrt(re * re + im * im);
      if (mag < noiseFloorLinear) {
        complexIn[k] *= reductionFactor;
        complexIn[k + 1] *= reductionFactor;
      }
      // Bins above threshold pass through unchanged
    }

    // Inverse FFT
    fft.inverseTransform(complexOut, complexIn);

    // Overlap-add (real part only, apply Hann synthesis window)
    for (let i = 0; i < N; i++) {
      out[pos + i] += complexOut[i * 2] * hann[i];
      norm[pos + i] += hann[i] * hann[i];
    }
  }

  // Normalize by accumulated window
  for (let i = 0; i < out.length; i++) {
    if (norm[i] > 1e-8) {
      out[i] /= norm[i];
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// WAV parser — 44-byte header skip + Int16 LE → Float32
// ---------------------------------------------------------------------------

function parseWav(buffer: ArrayBuffer): Float32Array {
  const view = new DataView(buffer);
  const sampleCount = (buffer.byteLength - WAV_HEADER_BYTES) / 2;
  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const int16 = view.getInt16(WAV_HEADER_BYTES + i * 2, true); // little-endian
    samples[i] = int16 / 32768.0;
  }
  return samples;
}

// ---------------------------------------------------------------------------
// runSpike — spike 실행 진입점
// ---------------------------------------------------------------------------

function log(msg: string): void {
  console.log(`SPIKE_NS2 ${msg}`);
}

export async function runSpike(): Promise<void> {
  log('=== NS2 spike start ===');

  // --- Hermes 환경 확인 ---
  const isHermes = typeof (global as Record<string, unknown>).HermesInternal !== 'undefined';
  log(`hermes: ${isHermes}`);
  if (!isHermes) {
    log('WARNING: Not running on Hermes — measurements may not represent device reality');
  }

  // --- Device 정보 ---
  log(`platform: ${Platform.OS} ${Platform.Version}`);
  // expo-device 미설치 → manual placeholder
  log('device: (record manually — brand/model for result validity)');

  // --- WAV 로드 ---
  // expo-file-system v55 new API: File class + arrayBuffer()
  // WAV는 bundle assets 경로가 아닌 scripts/ 하위에 위치하므로
  // document directory 기준으로 상대 경로 접근 시도. 실기기에서
  // Metro bundler 번들 asset 경로는 다를 수 있으므로 fallback 포함.
  const wavFile = new File(Paths.document, '../../scripts/input_30s.wav');
  log(`loading WAV: ${wavFile.uri}`);

  let samples: Float32Array;
  try {
    const buffer = await wavFile.arrayBuffer();
    samples = parseWav(buffer);
  } catch (e) {
    log(`ERROR loading WAV: ${e}`);
    log('Falling back to synthetic 30s sine (440Hz) for measurement');
    // Synthetic fallback: 30s sine at 440Hz
    const n = SAMPLE_RATE * 30;
    samples = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      samples[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / SAMPLE_RATE);
    }
  }

  log(`inputSamples: ${samples.length}`);
  log(`fft-lib: fft.js@4.x (npm)`);

  const results: TimingResult[] = [];

  // --- 効果별 독립 측정 ---

  // 1. highpass
  let t0 = performance.now();
  const hpOut = applyHighpass(samples, HIGHPASS_CUTOFF_HZ, SAMPLE_RATE);
  let t1 = performance.now();
  results.push({ effectName: 'highpass', durationMs: t1 - t0, inputSamples: samples.length });
  log(`highpass: ${(t1 - t0).toFixed(2)}ms, outputSamples: ${hpOut.length}`);

  // 2. biquadEq
  t0 = performance.now();
  const eqOut = applyBiquadEq(samples, EQ_FREQ, EQ_GAIN_DB, EQ_FREQ / EQ_WIDTH_HZ, SAMPLE_RATE);
  t1 = performance.now();
  results.push({ effectName: 'biquadEq', durationMs: t1 - t0, inputSamples: samples.length });
  log(`biquadEq: ${(t1 - t0).toFixed(2)}ms, outputSamples: ${eqOut.length}`);

  // 3. delay
  t0 = performance.now();
  const delayOut = applyDelay(samples, AECHO_DELAY_MS, AECHO_DECAY, AECHO_OUT, AECHO_IN, SAMPLE_RATE);
  t1 = performance.now();
  results.push({ effectName: 'delay', durationMs: t1 - t0, inputSamples: samples.length });
  log(`delay: ${(t1 - t0).toFixed(2)}ms, outputSamples: ${delayOut.length}`);

  // 4. crossfade (split 30s into two 15s segments)
  const seg1 = samples.slice(0, Math.floor(samples.length / 2));
  const seg2 = samples.slice(Math.floor(samples.length / 2));
  t0 = performance.now();
  const cfOut = applyCrossfade(seg1, seg2, CROSSFADE_D_MS, SAMPLE_RATE);
  t1 = performance.now();
  results.push({ effectName: 'crossfade', durationMs: t1 - t0, inputSamples: samples.length });
  log(`crossfade: ${(t1 - t0).toFixed(2)}ms, outputSamples: ${cfOut.length}`);

  // --- 4-effect chain (serial pipeline) ---
  const tChainStart = performance.now();
  const chain1 = applyHighpass(samples, HIGHPASS_CUTOFF_HZ, SAMPLE_RATE);
  const chain2 = applyBiquadEq(chain1, EQ_FREQ, EQ_GAIN_DB, EQ_FREQ / EQ_WIDTH_HZ, SAMPLE_RATE);
  const chain3 = applyDelay(chain2, AECHO_DELAY_MS, AECHO_DECAY, AECHO_OUT, AECHO_IN, SAMPLE_RATE);
  const chainSeg1 = chain3.slice(0, Math.floor(chain3.length / 2));
  const chainSeg2 = chain3.slice(Math.floor(chain3.length / 2));
  applyCrossfade(chainSeg1, chainSeg2, CROSSFADE_D_MS, SAMPLE_RATE);
  const tChainEnd = performance.now();
  const chain4Ms = tChainEnd - tChainStart;
  results.push({ effectName: 'chain4', durationMs: chain4Ms, inputSamples: samples.length });
  log(`chain4: ${chain4Ms.toFixed(2)}ms`);

  // --- spectralGate-JS (独立 측정) ---
  t0 = performance.now();
  applySpectralGate(samples, AFFTDN_NR, AFFTDN_NF, FFT);
  t1 = performance.now();
  const spectralMs = t1 - t0;
  results.push({ effectName: 'spectralGate-JS', durationMs: spectralMs, inputSamples: samples.length });
  log(`spectralGate-JS: ${spectralMs.toFixed(2)}ms`);

  // --- 4-effect + afftdn chain ---
  const tFullStart = performance.now();
  const full1 = applySpectralGate(samples, AFFTDN_NR, AFFTDN_NF, FFT);
  const full2 = applyBiquadEq(full1, EQ_FREQ, EQ_GAIN_DB, EQ_FREQ / EQ_WIDTH_HZ, SAMPLE_RATE);
  const full3 = applyDelay(full2, AECHO_DELAY_MS, AECHO_DECAY, AECHO_OUT, AECHO_IN, SAMPLE_RATE);
  const fullSeg1 = full3.slice(0, Math.floor(full3.length / 2));
  const fullSeg2 = full3.slice(Math.floor(full3.length / 2));
  applyCrossfade(fullSeg1, fullSeg2, CROSSFADE_D_MS, SAMPLE_RATE);
  const tFullEnd = performance.now();
  const fullChainMs = tFullEnd - tFullStart;
  results.push({ effectName: 'chain4+afftdn', durationMs: fullChainMs, inputSamples: samples.length });
  log(`chain4+afftdn: ${fullChainMs.toFixed(2)}ms`);

  // --- RESULT 판정 ---
  const LIMIT_MS = 30000;
  let result: string;
  if (chain4Ms <= LIMIT_MS && fullChainMs <= LIMIT_MS) {
    result = `C1 viable (full JS) — chain4=${chain4Ms.toFixed(0)}ms, chain4+afftdn=${fullChainMs.toFixed(0)}ms`;
  } else if (chain4Ms <= LIMIT_MS && fullChainMs > LIMIT_MS) {
    result = `C1 partial (afftdn degraded only) — chain4=${chain4Ms.toFixed(0)}ms viable, chain4+afftdn=${fullChainMs.toFixed(0)}ms too slow`;
  } else {
    result = `C1 NO_GO — chain4=${chain4Ms.toFixed(0)}ms > 30000ms`;
  }

  log(`RESULT: ${result}`);
  log('=== NS2 spike end ===');

  // Log structured results
  log(`timings: ${JSON.stringify(results.map(r => ({ e: r.effectName, ms: r.durationMs.toFixed(2) })))}`);
}
