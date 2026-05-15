/**
 * Unit test for SpikeNs2Screen.
 * Verifies static render: "Run Spike" button + log area present.
 * runSpike is mocked — no actual DSP execution in tests.
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';

// Mock the spike script so no real DSP / FileSystem calls happen in tests
jest.mock('../../../scripts/spike-ns2-pure-js-perf', () => ({
  runSpike: jest.fn().mockResolvedValue(undefined),
  applyHighpass: jest.fn(),
  applyBiquadEq: jest.fn(),
  applyDelay: jest.fn(),
  applyCrossfade: jest.fn(),
  applySpectralGate: jest.fn(),
}));

// Mock expo-file-system (not needed for render test but imported transitively)
jest.mock('expo-file-system', () => ({
  readAsStringAsync: jest.fn().mockResolvedValue(''),
  documentDirectory: '/mock/',
  EncodingType: { Base64: 'base64' },
}));

import SpikeNs2Screen from '../SpikeNs2Screen';

describe('SpikeNs2Screen', () => {
  it('renders the "Run Spike" button', () => {
    render(<SpikeNs2Screen />);
    const btn = screen.getByTestId('run-spike-button');
    expect(btn).toBeTruthy();
  });

  it('renders the screen container', () => {
    render(<SpikeNs2Screen />);
    expect(screen.getByTestId('spike-ns2-screen')).toBeTruthy();
  });

  it('renders the log output area', () => {
    render(<SpikeNs2Screen />);
    expect(screen.getByTestId('spike-log-area')).toBeTruthy();
  });

  it('shows idle status text initially', () => {
    render(<SpikeNs2Screen />);
    const status = screen.getByTestId('spike-status');
    expect(status.props.children).toMatch(/Ready|idle|tap/i);
  });

  it('shows empty log placeholder before spike runs', () => {
    render(<SpikeNs2Screen />);
    expect(screen.getByTestId('spike-log-empty')).toBeTruthy();
  });

  it('Run Spike button is not disabled initially', () => {
    render(<SpikeNs2Screen />);
    const btn = screen.getByTestId('run-spike-button');
    // accessibilityState disabled should be falsy when status is idle
    expect(btn.props.accessibilityState?.disabled).toBeFalsy();
  });
});
