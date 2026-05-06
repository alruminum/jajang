import { describe, it, expect } from 'vitest';
import { preparePencilSlot } from '../adapter';
import type { Screen, QaConfig } from '../../config/schema';

// ---------------------------------------------------------------------------
// REQ-PENCIL-01 ~ REQ-PENCIL-06 — preparePencilSlot unit tests
//
// TDD 상태: RED (adapter.ts 미존재). engineer 가 impl/05 산출 후 GREEN 전환.
// ---------------------------------------------------------------------------

function makeScreen(overrides: Partial<Screen> = {}): Screen {
  return {
    id: 'S10',
    label: '녹음 화면',
    entrySteps: [],
    settleMs: 2000,
    ...overrides,
  };
}

function makePencilConfig(
  overrides: Partial<NonNullable<QaConfig['pencil']>> = {},
): NonNullable<QaConfig['pencil']> {
  return {
    enabled: true,
    documentPath: '../../design/jajang.pen',
    nodeIds: { S10: ['llTp1', 'r97aM'] },
    ...overrides,
  };
}

// ─── REQ-PENCIL-01: enabled=false → undefined ───────────────────────────────

describe('REQ-PENCIL-01 preparePencilSlot — pencil.enabled=false', () => {
  it('pencil.enabled === false 이면 undefined 반환', () => {
    const result = preparePencilSlot(makeScreen(), makePencilConfig({ enabled: false }));
    expect(result).toBeUndefined();
  });
});

// ─── REQ-PENCIL-02: enabled=true + config 레벨 nodeIds 매핑 있음 ─────────────

describe('REQ-PENCIL-02 preparePencilSlot — config 레벨 nodeIds 매핑', () => {
  it('config.pencil.nodeIds[screen.id] 매핑 있으면 undefined 아님', () => {
    const result = preparePencilSlot(makeScreen({ id: 'S10' }), makePencilConfig());
    expect(result).toBeDefined();
  });

  it('반환 문자열에 documentPath 포함', () => {
    const result = preparePencilSlot(makeScreen({ id: 'S10' }), makePencilConfig());
    expect(result).toContain('../../design/jajang.pen');
  });

  it('반환 문자열에 screen.id 포함', () => {
    const result = preparePencilSlot(makeScreen({ id: 'S10' }), makePencilConfig());
    expect(result).toContain('S10');
  });

  it('반환 문자열에 nodeIds 배열 원소 llTp1 포함', () => {
    const result = preparePencilSlot(makeScreen({ id: 'S10' }), makePencilConfig());
    expect(result).toContain('llTp1');
  });

  it('반환 문자열에 nodeIds 배열 원소 r97aM 포함', () => {
    const result = preparePencilSlot(makeScreen({ id: 'S10' }), makePencilConfig());
    expect(result).toContain('r97aM');
  });

  it('반환 문자열이 markdown comment 형식 (<!-- ... -->) 으로 시작', () => {
    const result = preparePencilSlot(makeScreen({ id: 'S10' }), makePencilConfig());
    expect(result).toMatch(/^<!--/);
    expect(result).toMatch(/-->$/s);
  });
});

// ─── REQ-PENCIL-03: enabled=true + screen.pencilNodeIds 매핑 ─────────────────

describe('REQ-PENCIL-03 preparePencilSlot — screen 단위 pencilNodeIds 매핑', () => {
  it('screen.pencilNodeIds 있고 config.nodeIds 없을 때 undefined 아님', () => {
    const screen = makeScreen({ id: 'S06', pencilNodeIds: ['nodeA', 'nodeB'] });
    const pencilCfg = makePencilConfig({ nodeIds: undefined });
    const result = preparePencilSlot(screen, pencilCfg);
    expect(result).toBeDefined();
  });

  it('screen.pencilNodeIds 원소가 반환 문자열에 포함', () => {
    const screen = makeScreen({ id: 'S06', pencilNodeIds: ['nodeA', 'nodeB'] });
    const pencilCfg = makePencilConfig({ nodeIds: undefined });
    const result = preparePencilSlot(screen, pencilCfg);
    expect(result).toContain('nodeA');
    expect(result).toContain('nodeB');
  });
});

// ─── REQ-PENCIL-04: union — screen 단위 + config 레벨 둘 다 있음 ─────────────

describe('REQ-PENCIL-04 preparePencilSlot — union (screen 단위 + config 레벨 동시)', () => {
  it('screen.pencilNodeIds 와 config.nodeIds[screen.id] 둘 다 있으면 모두 포함', () => {
    const screen = makeScreen({ id: 'S10', pencilNodeIds: ['inlineNode'] });
    const pencilCfg = makePencilConfig({ nodeIds: { S10: ['configNode'] } });
    const result = preparePencilSlot(screen, pencilCfg);
    // union 결과 — 두 원소 모두 존재
    expect(result).toContain('inlineNode');
    expect(result).toContain('configNode');
  });
});

// ─── REQ-PENCIL-05: 매핑 없음 → undefined ──────────────────────────────────

describe('REQ-PENCIL-05 preparePencilSlot — 매핑 없음', () => {
  it('screen.pencilNodeIds 없고 config.nodeIds[screen.id] 없으면 undefined', () => {
    const screen = makeScreen({ id: 'S06', pencilNodeIds: undefined });
    const pencilCfg = makePencilConfig({ nodeIds: { S10: ['llTp1'] } }); // S06 매핑 없음
    const result = preparePencilSlot(screen, pencilCfg);
    expect(result).toBeUndefined();
  });

  it('nodeIds 자체가 undefined 이고 screen.pencilNodeIds 도 없으면 undefined', () => {
    const screen = makeScreen({ id: 'S06', pencilNodeIds: undefined });
    const pencilCfg = makePencilConfig({ nodeIds: undefined });
    const result = preparePencilSlot(screen, pencilCfg);
    expect(result).toBeUndefined();
  });
});

// ─── REQ-PENCIL-06: placeholder — action 안내 문구 포함 ─────────────────────

describe('REQ-PENCIL-06 preparePencilSlot — placeholder 본문 action 안내', () => {
  it('반환 문자열에 mcp__pencil 또는 action 안내 문구 포함 (메인 Claude SOP 연결)', () => {
    const result = preparePencilSlot(makeScreen({ id: 'S10' }), makePencilConfig());
    // impl 의사코드: "action: 메인 Claude 가 mcp__pencil__get_screenshot 호출 후 ..."
    expect(result).toMatch(/action|mcp__pencil/i);
  });
});
