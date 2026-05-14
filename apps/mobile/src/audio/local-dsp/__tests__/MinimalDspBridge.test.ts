// REQ-012 (MANUAL / task-10) — MinimalDspBridge interface contract
//
// MinimalDspBridge.execute() runtime behaviour requires a real device + expo-file-system.
// Per impl plan REQ-012: "(MANUAL) — task 10 연동 시 확인 (task 10 범위로 이관 가능)"
//
// This file verifies the static contract only:
//   - IDspBridge interface shape is exported
//   - defaultDspBridge instance implements IDspBridge
//   - MinimalDspBridgeImpl is instantiable

// Mock expo-file-system/legacy so the module can be imported in the Jest (Node) environment.
jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
}));

import { MinimalDspBridgeImpl, defaultDspBridge } from '../MinimalDspBridge';
import type { IDspBridge } from '../MinimalDspBridge';

describe('MinimalDspBridge — static contract (REQ-012 partial)', () => {
  it('MinimalDspBridgeImpl is instantiable', () => {
    const bridge = new MinimalDspBridgeImpl();
    expect(bridge).toBeInstanceOf(MinimalDspBridgeImpl);
  });

  it('defaultDspBridge has execute method', () => {
    expect(typeof defaultDspBridge.execute).toBe('function');
  });

  it('defaultDspBridge satisfies IDspBridge interface', () => {
    // Type-level assertion — if this compiles, the contract is met.
    const _typed: IDspBridge = defaultDspBridge;
    expect(_typed).toBeDefined();
  });
});
