import { describe, it, expect } from 'vitest';
import { renderTourScreenReport } from '../tour-template';
import type { TourScreenReport } from '../tour-template';

function makeInput(overrides: Partial<TourScreenReport> = {}): TourScreenReport {
  return {
    screen: { id: 'Home', label: '홈 화면' },
    screenshotPath: 'Home.png',
    generatedAt: '2026-05-04T00:00:00.000Z',
    ...overrides,
  };
}

// ─── REQ-002: 섹션 헤더 존재 ────────────────────────────────────────────

describe('REQ-002 renderTourScreenReport — 템플릿 섹션 헤더 포함', () => {
  it('# QA Tour 헤더 포함', () => {
    const md = renderTourScreenReport(makeInput());
    expect(md).toMatch(/^# QA Tour/m);
  });

  it('## Screenshot 섹션 포함', () => {
    const md = renderTourScreenReport(makeInput());
    expect(md).toMatch(/^## Screenshot/m);
  });

  it('## UI Hierarchy 섹션 포함', () => {
    const md = renderTourScreenReport(makeInput());
    expect(md).toMatch(/^## UI Hierarchy/m);
  });

  it('## Heuristics 섹션 포함', () => {
    const md = renderTourScreenReport(makeInput());
    expect(md).toMatch(/^## Heuristics/m);
  });

  it('## Spec Reference 섹션 포함', () => {
    const md = renderTourScreenReport(makeInput());
    expect(md).toMatch(/^## Spec Reference/m);
  });

  it('## Pencil Reference 섹션 포함', () => {
    const md = renderTourScreenReport(makeInput());
    expect(md).toMatch(/^## Pencil Reference/m);
  });

  it('## LLM Review 섹션 포함', () => {
    const md = renderTourScreenReport(makeInput());
    expect(md).toMatch(/^## LLM Review/m);
  });
});

// ─── Screenshot 이미지 alt / path 정합 ──────────────────────────────────

describe('renderTourScreenReport — Screenshot 이미지 마크다운 정합', () => {
  it('![{screen.id}]({screenshotPath}) 형식으로 이미지 링크 생성', () => {
    const md = renderTourScreenReport(makeInput({ screen: { id: 'Home' }, screenshotPath: 'Home.png' }));
    expect(md).toContain('![Home](Home.png)');
  });

  it('screen.label 포함 시 헤더에 label 포함', () => {
    const md = renderTourScreenReport(makeInput({ screen: { id: 'S06', label: '홈' } }));
    expect(md).toMatch(/# QA Tour.*S06/);
  });

  it('generatedAt 값이 본문에 포함', () => {
    const md = renderTourScreenReport(makeInput({ generatedAt: '2026-05-04T00:00:00.000Z' }));
    expect(md).toContain('2026-05-04T00:00:00.000Z');
  });
});

// ─── heuristics 부재 시 ──────────────────────────────────────────────────

describe('renderTourScreenReport — heuristics 부재', () => {
  it('heuristics 없을 때 빈 표 또는 "(미수행)" 표시 (string 반환 보장)', () => {
    const md = renderTourScreenReport(makeInput({ heuristics: undefined }));
    expect(typeof md).toBe('string');
    // 빈 표 또는 "(미수행)" 등 placeholder 존재
    const heuristicsSection = md.split('## Heuristics')[1]?.split('##')[0] ?? '';
    expect(heuristicsSection.trim().length).toBeGreaterThan(0);
  });
});

// ─── uxFlowAnchor ─────────────────────────────────────────────────────────

describe('renderTourScreenReport — uxFlowAnchor 처리', () => {
  it('uxFlowAnchor 있을 때 Spec Reference 섹션에 anchor 포함', () => {
    const md = renderTourScreenReport(makeInput({ uxFlowAnchor: 'docs/ux-flow.md', screen: { id: 'Home' } }));
    expect(md).toContain('docs/ux-flow.md');
  });

  it('uxFlowAnchor 있을 때 screen.id anchor 포함 (# fragment)', () => {
    const md = renderTourScreenReport(makeInput({ uxFlowAnchor: 'docs/ux-flow.md', screen: { id: 'Home' } }));
    // "docs/ux-flow.md#Home" 또는 <!-- ux-flow ref: docs/ux-flow.md#Home --> 패턴
    expect(md).toMatch(/docs\/ux-flow\.md.*Home/);
  });

  it('uxFlowAnchor 없을 때 Spec Reference 섹션에 placeholder 또는 빈 슬롯', () => {
    const md = renderTourScreenReport(makeInput({ uxFlowAnchor: undefined }));
    const specSection = md.split('## Spec Reference')[1]?.split('##')[0] ?? '';
    // 빈 섹션이거나 placeholder 문자열 존재
    expect(typeof specSection).toBe('string');
  });
});

// ─── pencilSlot ──────────────────────────────────────────────────────────

describe('renderTourScreenReport — pencilSlot 처리', () => {
  it('pencilSlot 있을 때 Pencil Reference 섹션에 슬롯 값 포함', () => {
    const md = renderTourScreenReport(makeInput({ pencilSlot: 'node-abc-123' }));
    expect(md).toContain('node-abc-123');
  });

  it('pencilSlot 없을 때 Pencil Reference 섹션에 placeholder 포함', () => {
    const md = renderTourScreenReport(makeInput({ pencilSlot: undefined }));
    const pencilSection = md.split('## Pencil Reference')[1]?.split('##')[0] ?? '';
    // comment 또는 placeholder (batch 05 등 표시)
    expect(pencilSection.trim().length).toBeGreaterThan(0);
  });
});

// ─── REQ-PENCIL-07: impl/05 pencilSlot 렌더 — 슬롯 직접 주입 ───────────────
// tour-template 이 preparePencilSlot 반환값을 그대로 Pencil Reference 섹션에 출력.
// pencilSlot=undefined 이면 "매핑 없음" comment 출력.
//
// TDD 상태: 기존 구현은 슬롯 값을 <!-- pencil ref slot: nodeIds=[${pencilSlot}] --> 로
// 래핑. impl/05 이후 preparePencilSlot 이 이미 완성된 comment 를 반환하므로
// renderTourScreenReport 는 값을 그대로 출력해야 함.

describe('REQ-PENCIL-07 renderTourScreenReport — impl/05 pencilSlot 직접 주입 (렌더 정합)', () => {
  it('pencilSlot 이 완성된 markdown comment 일 때 그대로 본문에 포함', () => {
    const slot =
      '<!-- pencil ref slot\n  document: ../../design/jajang.pen\n  screen: S10\n  nodeIds: [llTp1, r97aM]\n  action: 메인 Claude mcp__pencil__get_screenshot 호출 후 첨부\n-->';
    const md = renderTourScreenReport(makeInput({ pencilSlot: slot }));
    // 슬롯 안의 documentPath 가 md 본문에 그대로 나타나야 함
    expect(md).toContain('../../design/jajang.pen');
    // nodeIds 값도 그대로
    expect(md).toContain('llTp1');
    expect(md).toContain('r97aM');
  });

  it('pencilSlot=undefined 이면 Pencil Reference 섹션에 "매핑 없음" 주석 포함', () => {
    const md = renderTourScreenReport(makeInput({ pencilSlot: undefined, screen: { id: 'S06' } }));
    const pencilSection = md.split('## Pencil Reference')[1]?.split('## LLM Review')[0] ?? '';
    // impl/05 인터페이스: {pencilSlot ?? '<!-- pencil ref: 매핑 없음 -->'}
    expect(pencilSection).toMatch(/매핑 없음|pencil ref|<!--/);
  });
});

// ─── uiDumpPath ──────────────────────────────────────────────────────────

describe('renderTourScreenReport — uiDumpPath 처리', () => {
  it('uiDumpPath 있을 때 UI Hierarchy 섹션에 경로 포함', () => {
    const md = renderTourScreenReport(makeInput({ uiDumpPath: 'Home.xml' }));
    expect(md).toContain('Home.xml');
  });

  it('uiDumpPath 없을 때 UI Hierarchy 섹션 존재 (경로 생략 또는 placeholder)', () => {
    const md = renderTourScreenReport(makeInput({ uiDumpPath: undefined }));
    expect(md).toMatch(/^## UI Hierarchy/m);
  });
});

// ─── LLM Review 슬롯 ─────────────────────────────────────────────────────

describe('renderTourScreenReport — LLM Review 슬롯', () => {
  it('LLM REVIEW 주석 comment 포함', () => {
    const md = renderTourScreenReport(makeInput());
    expect(md).toContain('LLM REVIEW');
  });

  it('Layout / Text / Color / Truncation / Touch targets 항목 포함', () => {
    const md = renderTourScreenReport(makeInput());
    expect(md).toContain('Layout:');
    expect(md).toContain('Text:');
    expect(md).toContain('Color:');
    expect(md).toContain('Truncation:');
    expect(md).toContain('Touch targets:');
  });
});
