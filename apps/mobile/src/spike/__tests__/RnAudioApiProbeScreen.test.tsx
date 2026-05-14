/**
 * NS3 Spike — RnAudioApiProbeScreen 렌더 테스트
 *
 * 목적: spike probe 화면이 정상 렌더링되는지 확인 (TDD guard 충족).
 * 실 AudioContext 동작은 device 테스트 (MANUAL) 로 수행 — jest 에서 native 모듈 mock.
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import RnAudioApiProbeScreen from '../RnAudioApiProbeScreen';

// react-native-audio-api native 모듈 mock
jest.mock('react-native-audio-api', () => {
  class MockAudioParam {
    value = 0;
    setValueAtTime() { return this; }
    linearRampToValueAtTime() { return this; }
    exponentialRampToValueAtTime() { return this; }
    setTargetAtTime() { return this; }
    setValueCurveAtTime() { return this; }
    cancelScheduledValues() { return this; }
    cancelAndHoldAtTime() { return this; }
  }

  class MockAudioNode {
    connect() { return this; }
    disconnect() {}
  }

  class MockOscillatorNode extends MockAudioNode {
    type = 'sine';
    frequency = new MockAudioParam();
    start() {}
    stop() {}
  }

  class MockDelayNode extends MockAudioNode {
    delayTime = new MockAudioParam();
  }

  class MockGainNode extends MockAudioNode {
    gain = new MockAudioParam();
  }

  class MockAudioDestinationNode extends MockAudioNode {}

  class MockAudioContext {
    sampleRate = 44100;
    state = 'running';
    destination = new MockAudioDestinationNode();
    createOscillator() { return new MockOscillatorNode(); }
    createDelay() { return new MockDelayNode(); }
    createGain() { return new MockGainNode(); }
    close() { return Promise.resolve(); }
    resume() { return Promise.resolve(true); }
    suspend() { return Promise.resolve(true); }
  }

  return {
    AudioContext: MockAudioContext,
    OscillatorNode: MockOscillatorNode,
    DelayNode: MockDelayNode,
    GainNode: MockGainNode,
  };
});

describe('RnAudioApiProbeScreen (NS3 spike)', () => {
  it('renders title and start button', () => {
    render(<RnAudioApiProbeScreen />);
    expect(screen.getByText('NS3 — react-native-audio-api Probe')).toBeTruthy();
    expect(screen.getByText('Start Echo Demo (1-tap)')).toBeTruthy();
  });

  it('shows idle status on initial render', () => {
    render(<RnAudioApiProbeScreen />);
    expect(screen.getByText(/Status:/)).toBeTruthy();
    // initial status = 'idle'
    expect(screen.getByText('idle')).toBeTruthy();
  });

  it('shows MP3 export info in footer', () => {
    render(<RnAudioApiProbeScreen />);
    expect(screen.getByText(/MP3_EXPORT: not_found/)).toBeTruthy();
  });
});
