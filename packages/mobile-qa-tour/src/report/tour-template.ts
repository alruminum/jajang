import { renderHeuristicsTable } from '../heuristics';
import type { HeuristicResult } from '../heuristics';

export interface TourScreenReport {
  screen: { id: string; label?: string };
  screenshotPath: string;
  uiDumpPath?: string;
  heuristics?: HeuristicResult;
  uxFlowAnchor?: string;
  pencilSlot?: string;
  generatedAt: string;
}

export function renderTourScreenReport(input: TourScreenReport): string {
  const { screen, screenshotPath, uiDumpPath, heuristics, uxFlowAnchor, pencilSlot, generatedAt } =
    input;

  const title = screen.label ? `# QA Tour — ${screen.id} ${screen.label}` : `# QA Tour — ${screen.id}`;

  const heuristicsContent = heuristics
    ? renderHeuristicsTable(heuristics)
    : '(미수행)';

  const uiHierarchyContent = uiDumpPath ? `- dump: ${uiDumpPath}` : '- dump: (없음)';

  const specRefContent = uxFlowAnchor
    ? `<!-- ux-flow ref: ${uxFlowAnchor}#${screen.id} -->`
    : '<!-- ux-flow ref: (없음) -->';

  const pencilRefContent = pencilSlot ?? '<!-- pencil ref: 매핑 없음 -->';

  return `${title}

> Generated: ${generatedAt}

## Screenshot
![${screen.id}](${screenshotPath})

## UI Hierarchy
${uiHierarchyContent}

## Heuristics
${heuristicsContent}

## Spec Reference
${specRefContent}

## Pencil Reference
${pencilRefContent}

## LLM Review
<!-- LLM REVIEW HERE -->
- Layout:
- Text:
- Color:
- Truncation:
- Touch targets:
`;
}
