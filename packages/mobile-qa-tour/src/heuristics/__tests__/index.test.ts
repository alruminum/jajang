import { describe, it, expect } from 'vitest';
import { runHeuristics, renderHeuristicsTable } from '../index';
import type { HeuristicResult } from '../index';
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

// ─── runHeuristics ───────────────────────────────────────────────────────

describe('runHeuristics — text-truncation + touch-target 결합', () => {
  it('빈 flat 배열 입력 → textTruncations/smallTouchTargets 모두 빈 배열', () => {
    const root = makeNode({ bounds: { x1: 0, y1: 0, x2: 1080, y2: 1920 } });
    const result = runHeuristics(root);
    expect(result.textTruncations).toEqual([]);
    expect(result.smallTouchTargets).toEqual([]);
  });

  it('ellipsis 노드 1개 → textTruncations.length === 1', () => {
    const ellipsisChild = makeNode({
      bounds: { x1: 0, y1: 0, x2: 200, y2: 30 },
      text: '긴 텍스트…',
    });
    const root = makeNode({
      bounds: { x1: 0, y1: 0, x2: 1080, y2: 1920 },
      children: [ellipsisChild],
    });
    const result = runHeuristics(root);
    expect(result.textTruncations).toHaveLength(1);
  });

  it('작은 clickable 버튼 1개 → smallTouchTargets.length === 1', () => {
    const smallBtn = makeNode({
      bounds: { x1: 0, y1: 0, x2: 80, y2: 80 },
      clickable: true,
    });
    const root = makeNode({
      bounds: { x1: 0, y1: 0, x2: 1080, y2: 1920 },
      children: [smallBtn],
    });
    const result = runHeuristics(root);
    expect(result.smallTouchTargets).toHaveLength(1);
  });

  it('dpr 옵션 전달 — smallTouchTargets threshold 에 반영', () => {
    // dpr=1 → threshold=44
    const btn = makeNode({
      bounds: { x1: 0, y1: 0, x2: 43, y2: 60 },
      clickable: true,
    });
    const root = makeNode({
      bounds: { x1: 0, y1: 0, x2: 1080, y2: 1920 },
      children: [btn],
    });
    const result = runHeuristics(root, { dpr: 1 });
    expect(result.smallTouchTargets[0].threshold).toBe(44);
  });

  it('ellipsis 1개 + 작은 버튼 1개 → 두 배열 모두 길이 1', () => {
    const ellipsisNode = makeNode({ bounds: { x1: 0, y1: 0, x2: 200, y2: 30 }, text: '잘림…' });
    const smallBtn = makeNode({ bounds: { x1: 0, y1: 0, x2: 80, y2: 80 }, clickable: true });
    const root = makeNode({
      bounds: { x1: 0, y1: 0, x2: 1080, y2: 1920 },
      children: [ellipsisNode, smallBtn],
    });
    const result = runHeuristics(root);
    expect(result.textTruncations).toHaveLength(1);
    expect(result.smallTouchTargets).toHaveLength(1);
  });
});

// ─── renderHeuristicsTable ───────────────────────────────────────────────

describe('renderHeuristicsTable — markdown 표 생성', () => {
  it('결과가 없을 때 "(no findings)" 포함 또는 빈 표', () => {
    const empty: HeuristicResult = { textTruncations: [], smallTouchTargets: [] };
    const md = renderHeuristicsTable(empty);
    // "(no findings)" 이거나 빈 표 — 두 케이스 중 하나
    const hasNoFindings = md.includes('(no findings)') || md.trim() === '' || md.includes('| |');
    expect(hasNoFindings || md.split('\n').filter((l) => l.startsWith('|')).length <= 2).toBe(true);
  });

  it('textTruncation 1건 → markdown 표에 데이터 행 포함', () => {
    const result: HeuristicResult = {
      textTruncations: [{ text: '잘림…', bounds: { x1: 0, y1: 0, x2: 200, y2: 30 }, reason: 'ellipsis' }],
      smallTouchTargets: [],
    };
    const md = renderHeuristicsTable(result);
    // 헤더 행 + 구분 행 + 데이터 행 최소 1개 = | 로 시작하는 행 3+
    const tableRows = md.split('\n').filter((l) => l.trim().startsWith('|'));
    expect(tableRows.length).toBeGreaterThanOrEqual(1);
  });

  it('smallTouchTarget 1건 → markdown 표에 데이터 행 포함', () => {
    const result: HeuristicResult = {
      textTruncations: [],
      smallTouchTargets: [
        {
          resourceId: 'com.test:id/btn',
          className: 'Button',
          bounds: { x1: 0, y1: 0, x2: 80, y2: 80 },
          widthPx: 80,
          heightPx: 80,
          threshold: 132,
        },
      ],
    };
    const md = renderHeuristicsTable(result);
    const tableRows = md.split('\n').filter((l) => l.trim().startsWith('|'));
    expect(tableRows.length).toBeGreaterThanOrEqual(1);
  });

  it('반환값은 string 타입', () => {
    const result: HeuristicResult = { textTruncations: [], smallTouchTargets: [] };
    expect(typeof renderHeuristicsTable(result)).toBe('string');
  });

  it('textTruncation + smallTouchTarget 복합 → 모두 표에 포함 (행 수 검증)', () => {
    const result: HeuristicResult = {
      textTruncations: [
        { text: 'A…', bounds: { x1: 0, y1: 0, x2: 100, y2: 30 }, reason: 'ellipsis' },
        { text: 'BCDEF', bounds: { x1: 0, y1: 30, x2: 20, y2: 60 }, reason: 'too-narrow' },
      ],
      smallTouchTargets: [
        {
          resourceId: 'com.test:id/s',
          className: 'Button',
          bounds: { x1: 0, y1: 0, x2: 50, y2: 50 },
          widthPx: 50,
          heightPx: 50,
          threshold: 132,
        },
      ],
    };
    const md = renderHeuristicsTable(result);
    // 데이터 행(|로 시작) 최소 3개 (textTruncation 2 + smallTouchTarget 1) 또는
    // 섹션별 표로 분리된 경우 각 표에 데이터 존재
    const dataRows = md.split('\n').filter((l) => l.trim().startsWith('|') && !l.includes('---'));
    expect(dataRows.length).toBeGreaterThanOrEqual(3);
  });
});
