import { flattenUi } from '../tour/uiautomator';
import type { UiNode } from '../tour/uiautomator';
import { detectTextTruncation } from './text-truncation';
import { detectSmallTouchTargets } from './touch-target';
export type { TextTruncation } from './text-truncation';
export type { SmallTouchTarget } from './touch-target';

export interface HeuristicResult {
  textTruncations: ReturnType<typeof detectTextTruncation>;
  smallTouchTargets: ReturnType<typeof detectSmallTouchTargets>;
}

export function runHeuristics(root: UiNode, opts?: { dpr?: number }): HeuristicResult {
  const flat = flattenUi(root);
  return {
    textTruncations: detectTextTruncation(flat),
    smallTouchTargets: detectSmallTouchTargets(flat, opts?.dpr ?? 3),
  };
}

export function renderHeuristicsTable(result: HeuristicResult): string {
  const { textTruncations, smallTouchTargets } = result;

  if (textTruncations.length === 0 && smallTouchTargets.length === 0) {
    return '(no findings)';
  }

  const rows: string[] = [];

  rows.push('| Heuristic | Resource / Text | Bounds | Width | Height | Detail |');
  rows.push('|---|---|---|---|---|---|');

  for (const t of textTruncations) {
    const boundsStr = `[${t.bounds.x1},${t.bounds.y1}][${t.bounds.x2},${t.bounds.y2}]`;
    const w = t.bounds.x2 - t.bounds.x1;
    const h = t.bounds.y2 - t.bounds.y1;
    rows.push(`| text-truncation | ${t.text} | ${boundsStr} | ${w} | ${h} | ${t.reason} |`);
  }

  for (const s of smallTouchTargets) {
    const boundsStr = `[${s.bounds.x1},${s.bounds.y1}][${s.bounds.x2},${s.bounds.y2}]`;
    const label = s.resourceId ?? s.className ?? '(unknown)';
    rows.push(`| small-touch-target | ${label} | ${boundsStr} | ${s.widthPx} | ${s.heightPx} | threshold=${s.threshold} |`);
  }

  return rows.join('\n');
}
