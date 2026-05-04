import { describe, it, expect } from 'vitest';
import { detectSmallTouchTargets } from '../touch-target';
import type { UiNode } from '../../tour/uiautomator';

function makeNode(overrides: Partial<UiNode> & { bounds: UiNode['bounds'] }): UiNode {
  return {
    text: undefined,
    resourceId: undefined,
    className: undefined,
    contentDesc: undefined,
    clickable: false,
    children: [],
    ...overrides,
  };
}

// dpr default = 3 → threshold = 44 * 3 = 132 px

describe('REQ-003 detectSmallTouchTargets — clickable + 크기 < threshold 검출', () => {
  it('clickable=true + width=100 < 132 → flag 1건', () => {
    const node = makeNode({
      bounds: { x1: 0, y1: 0, x2: 100, y2: 200 }, // width=100, height=200
      clickable: true,
    });
    const result = detectSmallTouchTargets([node], 3);
    expect(result).toHaveLength(1);
  });

  it('clickable=true + height=100 < 132 → flag 1건', () => {
    const node = makeNode({
      bounds: { x1: 0, y1: 0, x2: 200, y2: 100 }, // width=200, height=100
      clickable: true,
    });
    const result = detectSmallTouchTargets([node], 3);
    expect(result).toHaveLength(1);
  });

  it('flag 된 결과에 widthPx / heightPx / threshold 필드 포함', () => {
    const node = makeNode({
      bounds: { x1: 0, y1: 0, x2: 80, y2: 80 },
      clickable: true,
      resourceId: 'com.test:id/small_btn',
      className: 'android.widget.Button',
    });
    const [result] = detectSmallTouchTargets([node], 3);
    expect(result.widthPx).toBe(80);
    expect(result.heightPx).toBe(80);
    expect(result.threshold).toBe(132);
    expect(result.resourceId).toBe('com.test:id/small_btn');
    expect(result.className).toBe('android.widget.Button');
  });

  it('clickable=true + width=132 (threshold 경계) → flag 안 됨', () => {
    // 132 < 132 는 false
    const node = makeNode({
      bounds: { x1: 0, y1: 0, x2: 132, y2: 132 },
      clickable: true,
    });
    expect(detectSmallTouchTargets([node], 3)).toHaveLength(0);
  });

  it('clickable=true + width=133 height=133 → flag 안 됨', () => {
    const node = makeNode({
      bounds: { x1: 0, y1: 0, x2: 133, y2: 133 },
      clickable: true,
    });
    expect(detectSmallTouchTargets([node], 3)).toHaveLength(0);
  });
});

describe('detectSmallTouchTargets — clickable=false 노드 skip', () => {
  it('clickable=false 인 노드는 크기 무관하게 결과에 포함 안 됨', () => {
    const node = makeNode({
      bounds: { x1: 0, y1: 0, x2: 10, y2: 10 }, // 매우 작지만 clickable=false
      clickable: false,
    });
    expect(detectSmallTouchTargets([node], 3)).toHaveLength(0);
  });

  it('clickable=false 노드 여러 개 → 모두 skip', () => {
    const nodes = [
      makeNode({ bounds: { x1: 0, y1: 0, x2: 20, y2: 20 }, clickable: false }),
      makeNode({ bounds: { x1: 0, y1: 0, x2: 30, y2: 30 }, clickable: false }),
    ];
    expect(detectSmallTouchTargets(nodes, 3)).toHaveLength(0);
  });
});

describe('detectSmallTouchTargets — dpr 옵션 적용', () => {
  it('dpr=1 → threshold=44: width=43 + clickable → flag', () => {
    const node = makeNode({
      bounds: { x1: 0, y1: 0, x2: 43, y2: 44 },
      clickable: true,
    });
    const result = detectSmallTouchTargets([node], 1);
    expect(result).toHaveLength(1);
    expect(result[0].threshold).toBe(44);
  });

  it('dpr=2 → threshold=88: width=80 + clickable → flag', () => {
    const node = makeNode({
      bounds: { x1: 0, y1: 0, x2: 80, y2: 200 },
      clickable: true,
    });
    const result = detectSmallTouchTargets([node], 2);
    expect(result).toHaveLength(1);
    expect(result[0].threshold).toBe(88);
  });

  it('dpr=3 (default) → threshold=132: 132px 짜리는 flag 안 됨', () => {
    const node = makeNode({
      bounds: { x1: 0, y1: 0, x2: 132, y2: 132 },
      clickable: true,
    });
    expect(detectSmallTouchTargets([node], 3)).toHaveLength(0);
  });
});

describe('detectSmallTouchTargets — 빈 배열 / 혼합', () => {
  it('빈 배열 입력 → 빈 배열 반환', () => {
    expect(detectSmallTouchTargets([], 3)).toEqual([]);
  });

  it('clickable=true 작은 1개 + clickable=false 작은 1개 → 결과 1개만', () => {
    const small = makeNode({ bounds: { x1: 0, y1: 0, x2: 50, y2: 50 }, clickable: true });
    const skipped = makeNode({ bounds: { x1: 0, y1: 0, x2: 50, y2: 50 }, clickable: false });
    expect(detectSmallTouchTargets([small, skipped], 3)).toHaveLength(1);
  });
});
