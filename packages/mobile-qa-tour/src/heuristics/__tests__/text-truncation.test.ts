import { describe, it, expect } from 'vitest';
import { detectTextTruncation } from '../text-truncation';
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

// bounds: width = x2 - x1

describe('detectTextTruncation — ellipsis 검출', () => {
  it('텍스트가 "…" 로 끝나면 reason: "ellipsis" 반환', () => {
    const node = makeNode({ bounds: { x1: 0, y1: 0, x2: 200, y2: 30 }, text: '아주 긴 텍스트…' });
    const result = detectTextTruncation([node]);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('ellipsis');
    expect(result[0].text).toBe('아주 긴 텍스트…');
  });

  it('텍스트가 "..." 로 끝나면 reason: "ellipsis" 반환', () => {
    const node = makeNode({ bounds: { x1: 0, y1: 0, x2: 200, y2: 30 }, text: 'Long text...' });
    const result = detectTextTruncation([node]);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('ellipsis');
  });

  it('ellipsis 노드의 bounds 가 결과에 그대로 포함', () => {
    const bounds = { x1: 10, y1: 20, x2: 300, y2: 50 };
    const node = makeNode({ bounds, text: 'Truncated…' });
    const result = detectTextTruncation([node]);
    expect(result[0].bounds).toEqual(bounds);
  });
});

describe('detectTextTruncation — too-narrow 검출', () => {
  it('text.length * 8 > width * 1.2 조건 충족 시 reason: "too-narrow" 반환', () => {
    // width = 50, text = "ABCDEFGHIJ" (10 chars * 8 = 80), threshold = 50 * 1.2 = 60
    // 80 > 60 → too-narrow
    const node = makeNode({
      bounds: { x1: 0, y1: 0, x2: 50, y2: 30 },
      text: 'ABCDEFGHIJ',
    });
    const result = detectTextTruncation([node]);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('too-narrow');
  });

  it('width 가 충분히 넓으면 too-narrow 검출 안 함', () => {
    // width = 500, text = "Hi" (2 chars * 8 = 16), threshold = 500 * 1.2 = 600
    // 16 > 600 → false
    const node = makeNode({
      bounds: { x1: 0, y1: 0, x2: 500, y2: 30 },
      text: 'Hi',
    });
    const result = detectTextTruncation([node]);
    expect(result).toHaveLength(0);
  });

  it('width = 0 인 노드 — too-narrow 검출 안 함 (widthPx <= 0 가드)', () => {
    const node = makeNode({
      bounds: { x1: 50, y1: 0, x2: 50, y2: 30 }, // width = 0
      text: 'ABCDE',
    });
    const result = detectTextTruncation([node]);
    // widthPx = 0, 조건 widthPx > 0 이 false → skip
    expect(result).toHaveLength(0);
  });
});

describe('detectTextTruncation — text 부재 노드 skip', () => {
  it('text 가 undefined 인 노드 → 결과에 포함 안 됨', () => {
    const node = makeNode({ bounds: { x1: 0, y1: 0, x2: 50, y2: 30 } }); // text undefined
    expect(detectTextTruncation([node])).toHaveLength(0);
  });

  it('text 가 빈 문자열인 노드 → 결과에 포함 안 됨', () => {
    const node = makeNode({ bounds: { x1: 0, y1: 0, x2: 50, y2: 30 }, text: '' });
    expect(detectTextTruncation([node])).toHaveLength(0);
  });

  it('빈 배열 입력 → 빈 배열 반환', () => {
    expect(detectTextTruncation([])).toEqual([]);
  });
});

describe('detectTextTruncation — 혼합 노드 배열', () => {
  it('ellipsis 1개 + 정상 1개 → 결과 1개만', () => {
    const ellipsis = makeNode({ bounds: { x1: 0, y1: 0, x2: 200, y2: 30 }, text: 'Short…' });
    const normal = makeNode({ bounds: { x1: 0, y1: 50, x2: 500, y2: 80 }, text: 'Normal text' });
    expect(detectTextTruncation([ellipsis, normal])).toHaveLength(1);
  });

  it('ellipsis 가 too-narrow 보다 우선: 두 조건 모두 해당하면 ellipsis 로 반환', () => {
    // ellipsis 패턴이 먼저 검사되므로 too-narrow 에 해당해도 ellipsis 로 분류
    const node = makeNode({
      bounds: { x1: 0, y1: 0, x2: 30, y2: 30 }, // narrow + ellipsis
      text: 'ABCDEFGHIJ…',
    });
    const result = detectTextTruncation([node]);
    expect(result[0].reason).toBe('ellipsis');
  });
});
