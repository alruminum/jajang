import type { UiNode } from '../tour/uiautomator';

export interface TextTruncation {
  text: string;
  bounds: UiNode['bounds'];
  reason: 'ellipsis' | 'too-narrow';
}

export function detectTextTruncation(nodes: UiNode[]): TextTruncation[] {
  return nodes.filter((n) => n.text && n.text.length > 0).flatMap((n): TextTruncation[] => {
    const text = n.text!;
    if (text.endsWith('…') || text.endsWith('...')) {
      return [{ text, bounds: n.bounds, reason: 'ellipsis' }];
    }
    const widthPx = n.bounds.x2 - n.bounds.x1;
    const estTextPx = text.length * 8;
    if (widthPx > 0 && estTextPx > widthPx * 1.2) {
      return [{ text, bounds: n.bounds, reason: 'too-narrow' }];
    }
    return [];
  });
}
