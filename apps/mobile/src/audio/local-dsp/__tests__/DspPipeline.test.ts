// REQ-001, REQ-002 — DspPipeline.buildSteps 서버 SSOT 정합 검증
// DspPipeline 은 외부 의존 0 (pure function). real buildSteps 직접 호출.

import { buildSteps } from '../DspPipeline';

const FIXED_INPUT = {
  inputUri: 'file:///in.wav',
  songKey: 'lullaby-A',
  outputUri: 'file:///out.wav',
};

const EXPECTED_STEPS = [
  { type: 'highpass', f: 80 },
  { type: 'eq', f: 2500, width_type: 'h', width: 200, g: 3 },
  { type: 'echo', delay_ms: 100, decay: 0.3, in_gain: 0.6, out_gain: 0.3 },
  { type: 'crossfade-tri', d_sec: 0.3 },
] as const;

describe('REQ-001 / REQ-002 — DspPipeline.buildSteps', () => {
  beforeEach(() => jest.clearAllMocks());

  it('REQ-001: buildSteps returns 4 steps matching server SSOT', () => {
    const steps = buildSteps(FIXED_INPUT);
    expect(steps).toEqual(EXPECTED_STEPS);
  });

  it('REQ-002: buildSteps is pure — same input yields identical output on second call', () => {
    const first = buildSteps(FIXED_INPUT);
    const second = buildSteps(FIXED_INPUT);
    expect(first).toEqual(second);
  });

  it('REQ-002: buildSteps snapshot — step array matches stored snapshot', () => {
    const steps = buildSteps(FIXED_INPUT);
    expect(steps).toMatchSnapshot();
  });

  it('REQ-002: returned step array is independent of input params — different inputs yield same steps', () => {
    const stepsA = buildSteps({
      inputUri: 'file:///recording-A.wav',
      songKey: 'brahms',
      outputUri: 'file:///out-A.wav',
    });
    const stepsB = buildSteps({
      inputUri: 'file:///recording-B.wav',
      songKey: 'mozart',
      outputUri: 'file:///out-B.wav',
    });
    expect(stepsA).toEqual(stepsB);
  });
});
