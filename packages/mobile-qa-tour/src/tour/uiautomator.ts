import xml2js from 'xml2js';
import { adbShell } from '../adb';

export interface UiNode {
  text?: string;
  resourceId?: string;
  className?: string;
  contentDesc?: string;
  bounds: { x1: number; y1: number; x2: number; y2: number };
  clickable: boolean;
  children: UiNode[];
}

export async function dumpUi(devicePath?: string): Promise<string> {
  const target = devicePath ?? '/sdcard/window_dump.xml';
  await adbShell(`uiautomator dump ${target}`);
  return adbShell(`cat ${target}`);
}

export async function parseUi(xml: string): Promise<UiNode> {
  const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false });
  return walk(parsed.hierarchy.node);
}

function walk(raw: any): UiNode {
  const boundsStr: string = raw.$ ? raw.$.bounds : '';
  const m = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  const bounds = m
    ? { x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4] }
    : { x1: 0, y1: 0, x2: 0, y2: 0 };

  const rawNode = raw.node;
  const children: UiNode[] = rawNode
    ? (Array.isArray(rawNode) ? rawNode : [rawNode]).map(walk)
    : [];

  const attrs = raw.$ ?? {};
  return {
    text: attrs.text || undefined,
    resourceId: attrs['resource-id'] || undefined,
    className: attrs.class || undefined,
    contentDesc: attrs['content-desc'] || undefined,
    bounds,
    clickable: attrs.clickable === 'true',
    children,
  };
}

export function flattenUi(root: UiNode): UiNode[] {
  const result: UiNode[] = [root];
  for (const child of root.children) {
    result.push(...flattenUi(child));
  }
  return result;
}

export function findByResourceId(root: UiNode, id: string): UiNode | null {
  if (root.resourceId === id) return root;
  for (const child of root.children) {
    const found = findByResourceId(child, id);
    if (found) return found;
  }
  return null;
}

export function bbCenter(node: UiNode): { x: number; y: number } {
  return {
    x: Math.round((node.bounds.x1 + node.bounds.x2) / 2),
    y: Math.round((node.bounds.y1 + node.bounds.y2) / 2),
  };
}
