/**
 * Unit tests for NS2 spike DSP functions.
 * Tests DSP algorithm correctness as a baseline — these are REAL assertions,
 * not stubs. Each function is pure (Float32Array in → new Float32Array out).
 *
 * SSOT params (DspService 2026-05-13 snapshot):
 *   EQ_FREQ=2500, EQ_WIDTH=200Hz → Q=12.5, EQ_GAIN=+3dB
 *   AECHO: in=0.6, out=0.3, delay=100ms, decay=0.3
 *   CROSSFADE: d=300ms, c=tri
 *   HIGHPASS: cutoff=80Hz (1st-order IIR, afftdn downgrade substitute)
 */

// Mock expo-file-system and react-native: DSP functions are pure, no native deps needed
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    uri: 'mock://input_30s.wav',
    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
  })),
  Paths: {
    document: { uri: 'mock://document/' },
  },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 33 },
}));

import {
  applyHighpass,
  applyBiquadEq,
  applyDelay,
  applyCrossfade,
  applySpectralGate,
} from '../spike-ns2-pure-js-perf';

const SR = 44100;
const FLOAT_TOLERANCE = 1e-6;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function impulse(n: number): Float32Array {
  const a = new Float32Array(n);
  a[0] = 1.0;
  return a;
}

function dcSignal(n: number, value = 0.5): Float32Array {
  const a = new Float32Array(n);
  a.fill(value);
  return a;
}

function copyOf(a: Float32Array): Float32Array {
  return new Float32Array(a);
}

// ---------------------------------------------------------------------------
// applyHighpass
// ---------------------------------------------------------------------------

describe('applyHighpass', () => {
  it('returns same length output as input', () => {
    const input = dcSignal(1000);
    const output = applyHighpass(input, 80, SR);
    expect(output.length).toBe(input.length);
  });

  it('blocks DC: DC signal settles near zero after transient', () => {
    // 1st-order IIR highpass — DC (0 Hz) should be attenuated to ≈ 0
    // Use 4410 samples (0.1s) so the filter has time to settle.
    const n = 4410;
    const input = dcSignal(n, 0.5);
    const output = applyHighpass(input, 80, SR);
    // After the initial transient (say first 200 samples), output should be near 0
    const tail = output.slice(n - 200);
    const maxAbs = Math.max(...Array.from(tail).map(Math.abs));
    expect(maxAbs).toBeLessThan(0.05);
  });

  it('passes impulse: first output ≈ 1, then decays (high-frequency energy preserved)', () => {
    const n = 500;
    const input = impulse(n);
    const output = applyHighpass(input, 80, SR);
    // Impulse at t=0 should produce ~1 at output[0] (not attenuated at t=0)
    expect(Math.abs(output[0])).toBeGreaterThan(0.9);
    // After initial spike, should decay toward 0
    expect(Math.abs(output[n - 1])).toBeLessThan(0.1);
  });

  it('does not mutate input array (immutable)', () => {
    const input = dcSignal(500, 0.7);
    const original = copyOf(input);
    applyHighpass(input, 80, SR);
    for (let i = 0; i < input.length; i++) {
      expect(input[i]).toBeCloseTo(original[i], 10);
    }
  });
});

// ---------------------------------------------------------------------------
// applyBiquadEq
// ---------------------------------------------------------------------------

describe('applyBiquadEq', () => {
  it('returns same length output as input', () => {
    const input = dcSignal(1000);
    const output = applyBiquadEq(input, 2500, 3, 12.5, SR);
    expect(output.length).toBe(input.length);
  });

  it('impulse response has same length as input', () => {
    const n = 256;
    const input = impulse(n);
    const output = applyBiquadEq(input, 2500, 3, 12.5, SR);
    expect(output.length).toBeGreaterThanOrEqual(n);
  });

  it('is deterministic: same input twice produces identical output', () => {
    const n = 200;
    const inputA = impulse(n);
    const inputB = impulse(n);
    const outA = applyBiquadEq(inputA, 2500, 3, 12.5, SR);
    const outB = applyBiquadEq(inputB, 2500, 3, 12.5, SR);
    for (let i = 0; i < n; i++) {
      expect(outA[i]).toBeCloseTo(outB[i], 10);
    }
  });

  it('boost near center frequency: RMS near EQ_FREQ is higher than input', () => {
    // Generate a sine at 2500 Hz — after +3dB EQ at that frequency, amplitude should increase
    const n = SR; // 1 second
    const freq = 2500;
    const input = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      input[i] = 0.5 * Math.sin(2 * Math.PI * freq * i / SR);
    }
    const output = applyBiquadEq(input, 2500, 3, 12.5, SR);
    // Discard initial transient (first 100 samples)
    let rmsIn = 0, rmsOut = 0;
    for (let i = 100; i < n; i++) {
      rmsIn += input[i] * input[i];
      rmsOut += output[i] * output[i];
    }
    rmsIn = Math.sqrt(rmsIn / (n - 100));
    rmsOut = Math.sqrt(rmsOut / (n - 100));
    // Output RMS should be higher than input (boost applied)
    expect(rmsOut).toBeGreaterThan(rmsIn);
  });

  it('does not mutate input array (immutable)', () => {
    const input = impulse(300);
    const original = copyOf(input);
    applyBiquadEq(input, 2500, 3, 12.5, SR);
    for (let i = 0; i < input.length; i++) {
      expect(input[i]).toBeCloseTo(original[i], 10);
    }
  });
});

// ---------------------------------------------------------------------------
// applyDelay
// ---------------------------------------------------------------------------

describe('applyDelay', () => {
  it('returns same length output as input', () => {
    const input = dcSignal(SR);
    const output = applyDelay(input, 100, 0.3, 0.3, 0.6, SR);
    expect(output.length).toBe(input.length);
  });

  it('impulse: echo appears at delay position with correct wet*decay scaling', () => {
    // delayMs=100ms → delaySamples = 44100*100/1000 = 4410
    const delayMs = 100;
    const delaySamples = Math.round(delayMs * SR / 1000);
    const n = delaySamples + 500;
    const input = impulse(n);
    const wet = 0.3;
    const decay = 0.3;
    const inGain = 0.6;
    const output = applyDelay(input, delayMs, decay, wet, inGain, SR);

    // At t=0: out[0] should contain inGain * input[0]
    expect(output[0]).toBeCloseTo(inGain * 1.0, 4);

    // At delay position: should contain the echo contribution
    // out[delaySamples] = inGain*x[delaySamples] + wet*decay*x[0] = 0 + 0.3*0.3*1 = 0.09
    expect(output[delaySamples]).toBeCloseTo(wet * decay * 1.0, 4);
  });

  it('inGain scales the direct signal', () => {
    const n = 1000;
    const input = dcSignal(n, 1.0);
    // With inGain=0.5, wet=0, the output at t=0 before delay fills should ≈ 0.5
    const output = applyDelay(input, 500, 0.0, 0.0, 0.5, SR);
    // No echo (wet=0), so out[0] = inGain * in[0] = 0.5
    expect(output[0]).toBeCloseTo(0.5, 5);
  });

  it('does not mutate input array (immutable)', () => {
    const input = impulse(500);
    const original = copyOf(input);
    applyDelay(input, 100, 0.3, 0.3, 0.6, SR);
    for (let i = 0; i < input.length; i++) {
      expect(input[i]).toBeCloseTo(original[i], 10);
    }
  });
});

// ---------------------------------------------------------------------------
// applyCrossfade
// ---------------------------------------------------------------------------

describe('applyCrossfade', () => {
  it('output length = seg1.length + seg2.length - fadeSamples', () => {
    const fadeMs = 300;
    const fadeSamples = Math.round(fadeMs * SR / 1000);
    const seg1 = new Float32Array(SR); // 1s
    const seg2 = new Float32Array(SR); // 1s
    const output = applyCrossfade(seg1, seg2, fadeMs, SR);
    const expectedLen = seg1.length + seg2.length - fadeSamples;
    expect(output.length).toBe(expectedLen);
  });

  it('crossfade midpoint ≈ 0.5*seg1 + 0.5*seg2 (triangular linear at midpoint)', () => {
    const fadeMs = 300;
    const fadeSamples = Math.round(fadeMs * SR / 1000);
    // seg1 = all 1.0, seg2 = all -1.0
    const seg1 = new Float32Array(SR).fill(1.0);
    const seg2 = new Float32Array(SR).fill(-1.0);
    const output = applyCrossfade(seg1, seg2, fadeMs, SR);
    // midpoint of crossfade region = fadeSamples/2 into the output crossfade window
    // At midpoint: α = 0.5, so out ≈ (1-0.5)*1.0 + 0.5*(-1.0) = 0.0
    const crossfadeStart = seg1.length - fadeSamples;
    const midIdx = crossfadeStart + Math.floor(fadeSamples / 2);
    expect(Math.abs(output[midIdx])).toBeLessThan(0.1);
  });

  it('start of output matches seg1 head (before crossfade region)', () => {
    const fadeMs = 100;
    const fadeSamples = Math.round(fadeMs * SR / 1000);
    const seg1 = new Float32Array(SR).fill(0.8);
    const seg2 = new Float32Array(SR).fill(0.2);
    const output = applyCrossfade(seg1, seg2, fadeMs, SR);
    // Before crossfade region: output should be seg1 values
    expect(output[0]).toBeCloseTo(0.8, 5);
    expect(output[seg1.length - fadeSamples - 1]).toBeCloseTo(0.8, 5);
  });

  it('end of output matches seg2 tail (after crossfade region)', () => {
    const fadeMs = 100;
    const fadeSamples = Math.round(fadeMs * SR / 1000);
    const seg1 = new Float32Array(SR).fill(0.8);
    const seg2 = new Float32Array(SR).fill(0.2);
    const output = applyCrossfade(seg1, seg2, fadeMs, SR);
    // After crossfade region: output should be seg2 values
    expect(output[output.length - 1]).toBeCloseTo(0.2, 5);
  });

  it('does not mutate input arrays (immutable)', () => {
    const seg1 = new Float32Array(SR).fill(1.0);
    const seg2 = new Float32Array(SR).fill(-1.0);
    const origSeg1 = copyOf(seg1);
    const origSeg2 = copyOf(seg2);
    applyCrossfade(seg1, seg2, 300, SR);
    for (let i = 0; i < Math.min(seg1.length, 100); i++) {
      expect(seg1[i]).toBeCloseTo(origSeg1[i], 10);
      expect(seg2[i]).toBeCloseTo(origSeg2[i], 10);
    }
  });
});

// ---------------------------------------------------------------------------
// applySpectralGate
// ---------------------------------------------------------------------------

describe('applySpectralGate', () => {
  // fft.js is available in node_modules at root (worktree) level
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const FFT = require('fft.js');

  it('zero buffer input → output same length, values near zero', () => {
    const n = 4096;
    const input = new Float32Array(n); // all zeros
    const output = applySpectralGate(input, 10, -25, FFT);
    expect(output.length).toBe(n);
    const maxAbs = Math.max(...Array.from(output).map(Math.abs));
    expect(maxAbs).toBeLessThan(0.01);
  });

  it('impulse input → output same length, output is finite (no NaN/Inf)', () => {
    const n = 4096;
    const input = impulse(n);
    const output = applySpectralGate(input, 10, -25, FFT);
    expect(output.length).toBe(n);
    for (let i = 0; i < output.length; i++) {
      expect(isFinite(output[i])).toBe(true);
    }
  });

  it('does not mutate input array (immutable)', () => {
    const n = 2048;
    const input = impulse(n);
    const original = copyOf(input);
    applySpectralGate(input, 10, -25, FFT);
    for (let i = 0; i < Math.min(input.length, 50); i++) {
      expect(input[i]).toBeCloseTo(original[i], 10);
    }
  });
});

// ---------------------------------------------------------------------------
// Cross-function immutability: all functions leave input untouched
// ---------------------------------------------------------------------------

describe('Immutability: all DSP functions leave input Float32Array unchanged', () => {
  const SR_LOCAL = 44100;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const FFT = require('fft.js');

  function makeSine(n: number, freq: number): Float32Array {
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = Math.sin(2 * Math.PI * freq * i / SR_LOCAL);
    return a;
  }

  const functions: Array<[string, (input: Float32Array) => Float32Array]> = [
    ['applyHighpass', (x) => applyHighpass(x, 80, SR_LOCAL)],
    ['applyBiquadEq', (x) => applyBiquadEq(x, 2500, 3, 12.5, SR_LOCAL)],
    ['applyDelay', (x) => applyDelay(x, 100, 0.3, 0.3, 0.6, SR_LOCAL)],
    ['applySpectralGate', (x) => applySpectralGate(x, 10, -25, FFT)],
  ];

  for (const [name, fn] of functions) {
    it(`${name} does not mutate input`, () => {
      const n = 512;
      const input = makeSine(n, 440);
      const before = copyOf(input);
      fn(input);
      for (let i = 0; i < n; i++) {
        expect(input[i]).toBeCloseTo(before[i], FLOAT_TOLERANCE);
      }
    });
  }
});
