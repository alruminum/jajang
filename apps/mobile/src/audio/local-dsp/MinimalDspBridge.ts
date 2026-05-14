// apps/mobile/src/audio/local-dsp/MinimalDspBridge.ts
//
// C3 pure-JS DSP bridge (Hermes typed-array arithmetic).
// DSP functions copied verbatim from scripts/spike-ns2-pure-js-perf.ts — do NOT import that file;
// it is a dev-only spike script excluded from the prod bundle.

import { readAsStringAsync, writeAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import type { DspStep, DspResult } from './types';

// ---------------------------------------------------------------------------
// DIP interface
// ---------------------------------------------------------------------------

/** Abstraction layer for DSP execution — allows mock injection in tests and future accelerator swap. */
export interface IDspBridge {
  execute(
    steps: DspStep[],
    inputUri: string,
    outputUri: string,
  ): Promise<DspResult>;
}

// ---------------------------------------------------------------------------
// SSOT constants (snapshotted from scripts/spike-ns2-pure-js-perf.ts — do not import)
// ---------------------------------------------------------------------------

const EQ_WIDTH_HZ = 200; // width_type=h → Q = EQ_FREQ / EQ_WIDTH_HZ = 12.5
const SAMPLE_RATE = 44100;
const WAV_HEADER_BYTES = 44;

// ---------------------------------------------------------------------------
// 1. applyHighpass — copied from scripts/spike-ns2-pure-js-perf.ts (do not import — spike script is excluded from prod bundle)
//    1차 IIR highpass: y[n] = a*(y[n-1] + x[n] - x[n-1]), a = exp(-2π·fc/sr)
// ---------------------------------------------------------------------------

function applyHighpass(
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
// 2. applyBiquadEq — copied from scripts/spike-ns2-pure-js-perf.ts (do not import — spike script is excluded from prod bundle)
//    RBJ peakingEQ (Direct Form I), width_type=h → Q = freq / EQ_WIDTH_HZ
// ---------------------------------------------------------------------------

function applyBiquadEq(
  samples: Float32Array,
  freq: number,
  gain: number,
  sampleRate: number,
): Float32Array {
  const Q = freq / EQ_WIDTH_HZ;
  const w0 = 2 * Math.PI * freq / sampleRate;
  const alpha = Math.sin(w0) / (2 * Q);
  const A = Math.pow(10, gain / 40);

  const b0 = 1 + alpha * A;
  const b1 = -2 * Math.cos(w0);
  const b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A;
  const a1 = -2 * Math.cos(w0);
  const a2 = 1 - alpha / A;

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
// 3. applyDelay — copied from scripts/spike-ns2-pure-js-perf.ts (do not import — spike script is excluded from prod bundle)
//    단일 1-tap delay line (aecho 등가)
// ---------------------------------------------------------------------------

function applyDelay(
  samples: Float32Array,
  delayMs: number,
  decay: number,
  wet: number,
  inGain: number,
  sampleRate: number,
): Float32Array {
  const delaySamples = Math.round(delayMs * sampleRate / 1000);
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const direct = inGain * samples[i];
    const echoIdx = i - delaySamples;
    const echo = echoIdx >= 0 ? wet * decay * samples[echoIdx] : 0;
    out[i] = direct + echo;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4. applyCrossfade — copied from scripts/spike-ns2-pure-js-perf.ts (do not import — spike script is excluded from prod bundle)
//    Triangular linear crossfade between two segments
// ---------------------------------------------------------------------------

function applyCrossfade(
  seg1: Float32Array,
  seg2: Float32Array,
  fadeMs: number,
  sampleRate: number,
): Float32Array {
  const fadeSamples = Math.round(fadeMs * sampleRate / 1000);
  const totalLen = seg1.length + seg2.length - fadeSamples;
  const out = new Float32Array(totalLen);

  const seg1Tail = seg1.length - fadeSamples;
  for (let i = 0; i < seg1Tail; i++) {
    out[i] = seg1[i];
  }

  for (let i = 0; i < fadeSamples; i++) {
    const alpha = i / fadeSamples;
    const s1Val = seg1[seg1Tail + i] ?? 0;
    const s2Val = seg2[i] ?? 0;
    out[seg1Tail + i] = (1 - alpha) * s1Val + alpha * s2Val;
  }

  for (let i = fadeSamples; i < seg2.length; i++) {
    out[seg1Tail + fadeSamples + (i - fadeSamples)] = seg2[i];
  }

  return out;
}

// ---------------------------------------------------------------------------
// WAV helpers
// ---------------------------------------------------------------------------

/** Decode base64 string to Uint8Array without relying on Node Buffer (RN env). */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

/** Parse 44-byte PCM WAV header, return Float32Array of samples. */
function parseWav(buffer: ArrayBuffer): Float32Array {
  const view = new DataView(buffer);
  const sampleCount = (buffer.byteLength - WAV_HEADER_BYTES) / 2;
  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const int16 = view.getInt16(WAV_HEADER_BYTES + i * 2, true);
    samples[i] = int16 / 32768.0;
  }
  return samples;
}

/** Encode Float32Array PCM + 44-byte WAV header to ArrayBuffer. */
function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const dataByteLength = samples.length * 2;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataByteLength);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  view.setUint8(0, 0x52); view.setUint8(1, 0x49); view.setUint8(2, 0x46); view.setUint8(3, 0x46); // "RIFF"
  view.setUint32(4, 36 + dataByteLength, true);
  view.setUint8(8, 0x57); view.setUint8(9, 0x41); view.setUint8(10, 0x56); view.setUint8(11, 0x45); // "WAVE"
  // fmt sub-chunk
  view.setUint8(12, 0x66); view.setUint8(13, 0x6d); view.setUint8(14, 0x74); view.setUint8(15, 0x20); // "fmt "
  view.setUint32(16, 16, true);    // sub-chunk size
  view.setUint16(20, 1, true);     // PCM format
  view.setUint16(22, 1, true);     // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);     // block align
  view.setUint16(34, 16, true);    // bits per sample
  // data sub-chunk
  view.setUint8(36, 0x64); view.setUint8(37, 0x61); view.setUint8(38, 0x74); view.setUint8(39, 0x61); // "data"
  view.setUint32(40, dataByteLength, true);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(WAV_HEADER_BYTES + i * 2, Math.round(clamped * 32767), true);
  }

  return buffer;
}

/** Encode ArrayBuffer to base64 string (RN env — no Buffer). */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// MinimalDspBridgeImpl
// ---------------------------------------------------------------------------

/** C3 pure-JS implementation (Hermes typed-array arithmetic). Zero native deps. */
export class MinimalDspBridgeImpl implements IDspBridge {
  async execute(
    steps: DspStep[],
    inputUri: string,
    outputUri: string,
  ): Promise<DspResult> {
    const t0 = Date.now();

    // Read WAV via expo-file-system readAsStringAsync + base64
    // (FileSystemFile.bytes path resolution fails on device — confirmed in NS2 spike log)
    let samples: Float32Array;
    try {
      const b64 = await readAsStringAsync(inputUri, {
        encoding: EncodingType.Base64,
      });
      const bytes = base64ToUint8Array(b64);
      samples = parseWav(bytes.buffer);
    } catch (err) {
      throw new Error(
        `MinimalDspBridge: failed to read input WAV at ${inputUri}: ${(err as Error).message}`,
      );
    }

    // Execute each DSP step serially
    let current = samples;
    for (const step of steps) {
      switch (step.type) {
        case 'highpass':
          current = applyHighpass(current, step.f, SAMPLE_RATE);
          break;
        case 'eq':
          current = applyBiquadEq(current, step.f, step.g, SAMPLE_RATE);
          break;
        case 'echo':
          current = applyDelay(
            current,
            step.delay_ms,
            step.decay,
            step.out_gain,
            step.in_gain,
            SAMPLE_RATE,
          );
          break;
        case 'crossfade-tri': {
          // Split into two halves and crossfade (d_sec * 1000 = fadeMs)
          const mid = Math.floor(current.length / 2);
          const seg1 = current.slice(0, mid);
          const seg2 = current.slice(mid);
          current = applyCrossfade(seg1, seg2, step.d_sec * 1000, SAMPLE_RATE);
          break;
        }
        default: {
          const _exhaustive: never = step;
          throw new Error(`Unknown DSP step type: ${(_exhaustive as DspStep).type}`);
        }
      }
    }

    // Write output WAV
    try {
      const outBuffer = encodeWav(current, SAMPLE_RATE);
      const outB64 = arrayBufferToBase64(outBuffer);
      await writeAsStringAsync(outputUri, outB64, {
        encoding: EncodingType.Base64,
      });
    } catch (err) {
      throw new Error(
        `MinimalDspBridge: failed to write output WAV at ${outputUri}: ${(err as Error).message}`,
      );
    }

    return {
      outputUri,
      durationMs: Date.now() - t0,
    };
  }
}

/** Default singleton — inject into LocalDspService for production use. */
export const defaultDspBridge: IDspBridge = new MinimalDspBridgeImpl();
