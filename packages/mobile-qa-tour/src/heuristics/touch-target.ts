import type { UiNode } from '../tour/uiautomator';

export interface SmallTouchTarget {
  resourceId?: string;
  className?: string;
  bounds: UiNode['bounds'];
  widthPx: number;
  heightPx: number;
  threshold: number;
}

export function detectSmallTouchTargets(nodes: UiNode[], dpr = 3): SmallTouchTarget[] {
  const threshold = 44 * dpr;
  return nodes.filter((n) => n.clickable).flatMap((n) => {
    const w = n.bounds.x2 - n.bounds.x1;
    const h = n.bounds.y2 - n.bounds.y1;
    if (w < threshold || h < threshold) {
      return [
        {
          resourceId: n.resourceId,
          className: n.className,
          bounds: n.bounds,
          widthPx: w,
          heightPx: h,
          threshold,
        },
      ];
    }
    return [];
  });
}
