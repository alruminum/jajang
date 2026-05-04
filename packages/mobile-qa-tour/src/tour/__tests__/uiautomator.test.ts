import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseUi, flattenUi, findByResourceId, bbCenter } from '../uiautomator';
import type { UiNode } from '../uiautomator';

vi.mock('../../adb', () => ({
  adbShell: vi.fn().mockResolvedValue(''),
}));

// xml2js mock — parseUi 내부에서 xml2js.parseStringPromise 를 호출하므로
// 실제 XML 파싱 대신 구조화된 객체를 반환
vi.mock('xml2js', () => ({
  default: {
    parseStringPromise: vi.fn(),
  },
}));

import xml2js from 'xml2js';
const mockParseStringPromise = vi.mocked(xml2js.parseStringPromise);

// 헬퍼: UiNode 생성 (테스트 내부에서 직접 객체 생성용)
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

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── REQ-002: parseUi ───────────────────────────────────────────────────

describe('REQ-002 parseUi — XML → UiNode 트리 변환', () => {
  it('bounds 정규식 파싱: [10,20][100,200] → { x1:10, y1:20, x2:100, y2:200 }', async () => {
    mockParseStringPromise.mockResolvedValue({
      hierarchy: {
        node: {
          $: {
            bounds: '[10,20][100,200]',
            text: '',
            'resource-id': '',
            class: 'android.widget.FrameLayout',
            'content-desc': '',
            clickable: 'false',
          },
        },
      },
    });
    const root = await parseUi('<xml/>');
    expect(root.bounds).toEqual({ x1: 10, y1: 20, x2: 100, y2: 200 });
  });

  it('text 속성 파싱: text="Hello" → node.text === "Hello"', async () => {
    mockParseStringPromise.mockResolvedValue({
      hierarchy: {
        node: {
          $: {
            bounds: '[0,0][100,50]',
            text: 'Hello',
            'resource-id': '',
            class: '',
            'content-desc': '',
            clickable: 'false',
          },
        },
      },
    });
    const root = await parseUi('<xml/>');
    expect(root.text).toBe('Hello');
  });

  it('text 속성 빈 문자열 → node.text === undefined', async () => {
    mockParseStringPromise.mockResolvedValue({
      hierarchy: {
        node: {
          $: {
            bounds: '[0,0][100,50]',
            text: '',
            'resource-id': '',
            class: '',
            'content-desc': '',
            clickable: 'false',
          },
        },
      },
    });
    const root = await parseUi('<xml/>');
    expect(root.text).toBeUndefined();
  });

  it('clickable="true" → node.clickable === true', async () => {
    mockParseStringPromise.mockResolvedValue({
      hierarchy: {
        node: {
          $: {
            bounds: '[0,0][100,100]',
            text: '',
            'resource-id': '',
            class: '',
            'content-desc': '',
            clickable: 'true',
          },
        },
      },
    });
    const root = await parseUi('<xml/>');
    expect(root.clickable).toBe(true);
  });

  it('단일 child 노드 — root.children.length === 1', async () => {
    mockParseStringPromise.mockResolvedValue({
      hierarchy: {
        node: {
          $: {
            bounds: '[0,0][1080,1920]',
            text: '',
            'resource-id': '',
            class: '',
            'content-desc': '',
            clickable: 'false',
          },
          // xml2js explicitArray:false → 단일 child 는 배열 아닌 객체
          node: {
            $: {
              bounds: '[0,0][540,100]',
              text: 'child',
              'resource-id': '',
              class: '',
              'content-desc': '',
              clickable: 'false',
            },
          },
        },
      },
    });
    const root = await parseUi('<xml/>');
    expect(root.children).toHaveLength(1);
    expect(root.children[0].text).toBe('child');
  });

  it('다중 children 배열 — root.children.length === 2', async () => {
    const childNode = (text: string) => ({
      $: {
        bounds: '[0,0][100,50]',
        text,
        'resource-id': '',
        class: '',
        'content-desc': '',
        clickable: 'false',
      },
    });
    mockParseStringPromise.mockResolvedValue({
      hierarchy: {
        node: {
          $: {
            bounds: '[0,0][1080,1920]',
            text: '',
            'resource-id': '',
            class: '',
            'content-desc': '',
            clickable: 'false',
          },
          node: [childNode('A'), childNode('B')],
        },
      },
    });
    const root = await parseUi('<xml/>');
    expect(root.children).toHaveLength(2);
    expect(root.children[0].text).toBe('A');
    expect(root.children[1].text).toBe('B');
  });

  it('resource-id 파싱: "com.test.app:id/btn_home" → node.resourceId', async () => {
    mockParseStringPromise.mockResolvedValue({
      hierarchy: {
        node: {
          $: {
            bounds: '[0,0][200,60]',
            text: '',
            'resource-id': 'com.test.app:id/btn_home',
            class: '',
            'content-desc': '',
            clickable: 'true',
          },
        },
      },
    });
    const root = await parseUi('<xml/>');
    expect(root.resourceId).toBe('com.test.app:id/btn_home');
  });

  it('bounds 파싱 실패 시 bounds === { x1:0, y1:0, x2:0, y2:0 } 폴백', async () => {
    mockParseStringPromise.mockResolvedValue({
      hierarchy: {
        node: {
          $: {
            bounds: 'INVALID',
            text: '',
            'resource-id': '',
            class: '',
            'content-desc': '',
            clickable: 'false',
          },
        },
      },
    });
    const root = await parseUi('<xml/>');
    expect(root.bounds).toEqual({ x1: 0, y1: 0, x2: 0, y2: 0 });
  });
});

// ─── flattenUi ───────────────────────────────────────────────────────────

describe('flattenUi — pre-order 순회', () => {
  it('루트만 있을 때 배열 길이 1', () => {
    const root = makeNode({ bounds: { x1: 0, y1: 0, x2: 100, y2: 100 } });
    expect(flattenUi(root)).toHaveLength(1);
  });

  it('root + 2 children → 배열 길이 3', () => {
    const child1 = makeNode({ bounds: { x1: 0, y1: 0, x2: 50, y2: 50 } });
    const child2 = makeNode({ bounds: { x1: 50, y1: 0, x2: 100, y2: 50 } });
    const root = makeNode({ bounds: { x1: 0, y1: 0, x2: 100, y2: 100 }, children: [child1, child2] });
    expect(flattenUi(root)).toHaveLength(3);
  });

  it('pre-order: 루트가 배열 첫 번째 요소', () => {
    const child = makeNode({ bounds: { x1: 0, y1: 0, x2: 50, y2: 50 }, text: 'child' });
    const root = makeNode({ bounds: { x1: 0, y1: 0, x2: 100, y2: 100 }, text: 'root', children: [child] });
    const flat = flattenUi(root);
    expect(flat[0].text).toBe('root');
    expect(flat[1].text).toBe('child');
  });

  it('3-depth 중첩 트리 → 모든 노드 포함 (깊이 우선)', () => {
    const grandchild = makeNode({ bounds: { x1: 0, y1: 0, x2: 10, y2: 10 }, text: 'gc' });
    const child = makeNode({ bounds: { x1: 0, y1: 0, x2: 50, y2: 50 }, text: 'c', children: [grandchild] });
    const root = makeNode({ bounds: { x1: 0, y1: 0, x2: 100, y2: 100 }, text: 'r', children: [child] });
    const flat = flattenUi(root);
    expect(flat).toHaveLength(3);
    expect(flat.map((n) => n.text)).toEqual(['r', 'c', 'gc']);
  });
});

// ─── findByResourceId ────────────────────────────────────────────────────

describe('findByResourceId — 트리 깊이 우선 탐색', () => {
  it('루트의 resourceId 매치 → 루트 반환', () => {
    const root = makeNode({ bounds: { x1: 0, y1: 0, x2: 100, y2: 100 }, resourceId: 'com.app:id/root' });
    const found = findByResourceId(root, 'com.app:id/root');
    expect(found).toBe(root);
  });

  it('child 의 resourceId 매치 → child 반환', () => {
    const child = makeNode({ bounds: { x1: 0, y1: 0, x2: 50, y2: 50 }, resourceId: 'com.app:id/btn' });
    const root = makeNode({ bounds: { x1: 0, y1: 0, x2: 100, y2: 100 }, children: [child] });
    expect(findByResourceId(root, 'com.app:id/btn')).toBe(child);
  });

  it('매치 없을 때 null 반환', () => {
    const root = makeNode({ bounds: { x1: 0, y1: 0, x2: 100, y2: 100 }, resourceId: 'com.app:id/other' });
    expect(findByResourceId(root, 'com.app:id/nonexistent')).toBeNull();
  });

  it('grandchild 에서 매치 — 중첩 탐색', () => {
    const grandchild = makeNode({ bounds: { x1: 5, y1: 5, x2: 20, y2: 20 }, resourceId: 'com.app:id/deep' });
    const child = makeNode({ bounds: { x1: 0, y1: 0, x2: 50, y2: 50 }, children: [grandchild] });
    const root = makeNode({ bounds: { x1: 0, y1: 0, x2: 100, y2: 100 }, children: [child] });
    expect(findByResourceId(root, 'com.app:id/deep')).toBe(grandchild);
  });

  it('resourceId 없는 노드는 무시, 다음 sibling 탐색 계속', () => {
    const sibling = makeNode({ bounds: { x1: 50, y1: 0, x2: 100, y2: 50 }, resourceId: 'com.app:id/target' });
    const noId = makeNode({ bounds: { x1: 0, y1: 0, x2: 50, y2: 50 } });
    const root = makeNode({ bounds: { x1: 0, y1: 0, x2: 100, y2: 100 }, children: [noId, sibling] });
    expect(findByResourceId(root, 'com.app:id/target')).toBe(sibling);
  });
});

// ─── bbCenter ────────────────────────────────────────────────────────────

describe('bbCenter — bounds 중앙 좌표 산술', () => {
  it('[0,0][100,200] → { x: 50, y: 100 }', () => {
    const node = makeNode({ bounds: { x1: 0, y1: 0, x2: 100, y2: 200 } });
    expect(bbCenter(node)).toEqual({ x: 50, y: 100 });
  });

  it('[10,20][110,120] → { x: 60, y: 70 }', () => {
    const node = makeNode({ bounds: { x1: 10, y1: 20, x2: 110, y2: 120 } });
    expect(bbCenter(node)).toEqual({ x: 60, y: 70 });
  });

  it('홀수 크기 bounds → 정수 반올림 (Math.round)', () => {
    const node = makeNode({ bounds: { x1: 0, y1: 0, x2: 101, y2: 201 } });
    const { x, y } = bbCenter(node);
    // 50.5 → Math.round = 51, 100.5 → 101 또는 50, 100 (impl 재량)
    // 산술 결과가 정수임만 확인
    expect(Number.isInteger(x)).toBe(true);
    expect(Number.isInteger(y)).toBe(true);
  });
});
