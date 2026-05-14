// apps/mobile/src/audio/local-dsp/DspPipeline.ts
//
// Pure function — returns the fixed 4-step DSP chain matching server DspService constants.
// ⚠️ SSOT = apps/api/app/services/dsp/ffmpeg_service.py DspService class constants (2026-05-13 snapshot)
// NS2 spike script read the server code directly to confirm parity.

import type { DspStep } from './types';

/**
 * Returns the fixed 4-step DSP pipeline matching the server DspService constants.
 * Parameters (inputUri, songKey, outputUri) are accepted for caller ergonomics
 * but the returned step array is always identical — the pipeline is input-independent.
 *
 * Returned steps:
 *   highpass(f=80) → eq(f=2500,width_type=h,width=200,g=3) →
 *   echo(delay_ms=100,decay=0.3,in_gain=0.6,out_gain=0.3) → crossfade-tri(d_sec=0.3)
 */
export function buildSteps(_params: {
  inputUri: string;
  songKey: string;
  outputUri: string;
}): DspStep[] {
  return [
    { type: 'highpass', f: 80 },
    { type: 'eq', f: 2500, width_type: 'h', width: 200, g: 3 },
    { type: 'echo', delay_ms: 100, decay: 0.3, in_gain: 0.6, out_gain: 0.3 },
    { type: 'crossfade-tri', d_sec: 0.3 },
  ];
}
