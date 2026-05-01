---
depth: std
---

# impl/03 — [Story 2] uiautomator dump 파서 + 휴리스틱 + tour 리포트 템플릿 + programmatic API export

**Story:** Story 2 (나머지 — uiautomator + heuristics + tour report)
**선행 조건:** impl/02 완료 (runner + entry-steps 동작, screencap 저장)
**후행 조건:** `tour` 가 per-screen markdown 리포트 + 휴리스틱 표 + LLM 검수 슬롯 생성

**context budget:** file edits ≤ 7 / tool uses ≤ 35

---

## 0. 시작 전 확인

- `xml2js` API: `parseStringPromise(xml)` (학습 데이터 hallucination 위험 — callback 버전 vs promise 버전. promise 사용 권장)
- uiautomator dump XML 구조 (`<hierarchy><node bounds="[x1,y1][x2,y2]" text="..." resource-id="..." class="..." clickable="true">...</node></hierarchy>`)
- impl/02 의 `TourResult.screens[].uiDumpPath` / `heuristics` 옵셔널 필드 — 본 batch 가 채움

---

## 생성/수정 파일

### 신규

- `packages/mobile-qa-tour/src/tour/uiautomator.ts` — `dumpUi`, `parseUi` (xml2js)
- `packages/mobile-qa-tour/src/heuristics/text-truncation.ts` — text 잘림 검출
- `packages/mobile-qa-tour/src/heuristics/touch-target.ts` — < 44dp flag
- `packages/mobile-qa-tour/src/heuristics/index.ts` — `runHeuristics` 진입점 + 표 markdown 생성
- `packages/mobile-qa-tour/src/report/tour-template.ts` — per-screen markdown 템플릿
- `packages/mobile-qa-tour/src/index.ts` — programmatic API export

### 수정

- `packages/mobile-qa-tour/src/tour/runner.ts` — dumpUi + runHeuristics + writeTourReport 통합
- `packages/mobile-qa-tour/src/tour/entry-steps.ts` — `tapTestId` 가 실제 dumpUi → resource-id → bounds 중앙 좌표 → tap 동작
- `packages/mobile-qa-tour/package.json` — `xml2js`, `@types/xml2js` 추가

---

## 인터페이스

### `src/tour/uiautomator.ts`

```ts
export interface UiNode {
  text?: string;
  resourceId?: string;
  className?: string;
  contentDesc?: string;
  bounds: { x1: number; y1: number; x2: number; y2: number };  // px
  clickable: boolean;
  children: UiNode[];
}

export async function dumpUi(devicePath?: string): Promise<string>;     // raw XML
// 1. adbShell('uiautomator dump /sdcard/window_dump.xml')
// 2. adbShell('cat /sdcard/window_dump.xml')
// 3. return xml string

export async function parseUi(xml: string): Promise<UiNode>;            // 트리 root
export function flattenUi(root: UiNode): UiNode[];                      // pre-order traversal
export function findByResourceId(root: UiNode, id: string): UiNode | null;
export function bbCenter(node: UiNode): { x: number; y: number };
```

### `src/heuristics/text-truncation.ts`

```ts
export interface TextTruncation {
  text: string;
  bounds: UiNode['bounds'];
  reason: 'ellipsis' | 'too-narrow';   // ellipsis: 텍스트 끝 ‘…’, too-narrow: width < text 글자수 * 8 (휴리스틱)
}

export function detectTextTruncation(nodes: UiNode[]): TextTruncation[];
```

### `src/heuristics/touch-target.ts`

```ts
export interface SmallTouchTarget {
  resourceId?: string;
  className?: string;
  bounds: UiNode['bounds'];
  widthPx: number;
  heightPx: number;
  threshold: number;       // 44 * dpr
}

export function detectSmallTouchTargets(nodes: UiNode[], dpr: number): SmallTouchTarget[];
// dpr default 3 (1080×1920 / 360×640 = 3)  → 44dp = 132px
```

### `src/heuristics/index.ts`

```ts
export interface HeuristicResult {
  textTruncations: TextTruncation[];
  smallTouchTargets: SmallTouchTarget[];
}

export function runHeuristics(root: UiNode, opts?: { dpr?: number }): HeuristicResult;
export function renderHeuristicsTable(result: HeuristicResult): string;     // markdown table
```

### `src/report/tour-template.ts`

```ts
export interface TourScreenReport {
  screen: { id: string; label?: string };
  screenshotPath: string;            // relative to outputDir
  uiDumpPath?: string;
  heuristics?: HeuristicResult;
  uxFlowAnchor?: string;             // "docs/ux-flow.md"
  pencilSlot?: string;               // batch 05 가 채움
  generatedAt: string;
}

export function renderTourScreenReport(input: TourScreenReport): string;
```

템플릿 outline:
```markdown
# QA Tour — {screen.id} {screen.label}

> Generated: {generatedAt}

## Screenshot
![{screen.id}]({screenshotPath})

## UI Hierarchy
- dump: {uiDumpPath}

## Heuristics
{renderHeuristicsTable(heuristics)}

## Spec Reference
<!-- ux-flow ref: {uxFlowAnchor}#{screen.id} -->

## Pencil Reference
<!-- pencil ref slot: nodeIds=[...] -->   (batch 05)

## LLM Review
<!-- LLM REVIEW HERE -->
- Layout:
- Text:
- Color:
- Truncation:
- Touch targets:
```

### `src/index.ts` (programmatic API)

```ts
export { runMonkey } from './monkey/run';
export { runTour } from './tour/runner';
export { loadConfig, QaConfigSchema } from './config/load';
export { runHeuristics } from './heuristics';
export type { QaConfig, Screen, EntryStep } from './config/schema';
export type { TourResult } from './tour/runner';
```

---

## 의사코드

### `src/tour/uiautomator.ts`

```ts
import xml2js from 'xml2js';

export async function dumpUi() {
  await adbShell('uiautomator dump /sdcard/window_dump.xml');
  return adbShell('cat /sdcard/window_dump.xml');
}

export async function parseUi(xml: string): Promise<UiNode> {
  const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false });
  // hierarchy.node 가 root. bounds 파싱 정규식: /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/
  return walk(parsed.hierarchy.node);
}

function walk(raw: any): UiNode {
  const m = (raw.$.bounds as string).match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  const bounds = m ? { x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4] } : { x1:0, y1:0, x2:0, y2:0 };
  const children = raw.node ? (Array.isArray(raw.node) ? raw.node : [raw.node]).map(walk) : [];
  return {
    text: raw.$.text || undefined,
    resourceId: raw.$['resource-id'] || undefined,
    className: raw.$.class || undefined,
    contentDesc: raw.$['content-desc'] || undefined,
    bounds,
    clickable: raw.$.clickable === 'true',
    children,
  };
}
```

### `src/heuristics/touch-target.ts`

```ts
export function detectSmallTouchTargets(nodes, dpr = 3) {
  const threshold = 44 * dpr;
  return nodes.filter(n => n.clickable).flatMap(n => {
    const w = n.bounds.x2 - n.bounds.x1;
    const h = n.bounds.y2 - n.bounds.y1;
    if (w < threshold || h < threshold) {
      return [{ resourceId: n.resourceId, className: n.className, bounds: n.bounds, widthPx: w, heightPx: h, threshold }];
    }
    return [];
  });
}
```

### `src/heuristics/text-truncation.ts`

```ts
export function detectTextTruncation(nodes) {
  return nodes.filter(n => n.text && n.text.length > 0).flatMap(n => {
    if (n.text!.endsWith('…') || n.text!.endsWith('...')) {
      return [{ text: n.text!, bounds: n.bounds, reason: 'ellipsis' }];
    }
    const widthPx = n.bounds.x2 - n.bounds.x1;
    const estTextPx = n.text!.length * 8;          // very rough heuristic — 운영 SOP 에서 수동 검증 강조
    if (widthPx > 0 && estTextPx > widthPx * 1.2) {
      return [{ text: n.text!, bounds: n.bounds, reason: 'too-narrow' }];
    }
    return [];
  });
}
```

### `src/tour/runner.ts` (수정)

```ts
async function runTour(opts) {
  // ... batch 02 동일 (entry-steps + screencap) ...

  for (const screen of screens) {
    // ... screencap 저장 ...

    let uiDumpPath: string | undefined;
    let heuristics: HeuristicResult | undefined;
    if (!opts.skipUiautomator) {
      const xml = await dumpUi();
      uiDumpPath = path.join(tourSubdir, `${screen.id}.xml`);
      await fs.writeFile(uiDumpPath, xml);
      if (!opts.skipHeuristics) {
        const root = await parseUi(xml);
        const flat = flattenUi(root);
        heuristics = {
          textTruncations: detectTextTruncation(flat),
          smallTouchTargets: detectSmallTouchTargets(flat, 3),
        };
      }
    }

    const md = renderTourScreenReport({
      screen,
      screenshotPath: relPath(screenshotPath, tourSubdir),
      uiDumpPath: uiDumpPath ? relPath(uiDumpPath, tourSubdir) : undefined,
      heuristics,
      uxFlowAnchor: opts.config.uxFlowAnchor,
      generatedAt: new Date().toISOString(),
    });
    await fs.writeFile(path.join(tourSubdir, `${screen.id}.md`), md);

    results.push({ id: screen.id, label: screen.label, screenshotPath, uiDumpPath, heuristics });
  }
}
```

### `src/tour/entry-steps.ts` (수정 — tapTestId 실제 동작)

```ts
case 'tapTestId': {
  const xml = await dumpUi();
  const root = await parseUi(xml);
  const node = findByResourceId(root, step.testId);
  if (!node) throw new Error(`tapTestId: resource-id="${step.testId}" not found in current dump`);
  const { x, y } = bbCenter(node);
  await adbShell(`input tap ${x} ${y}`);
  break;
}
```

---

## 결정 근거

**왜 휴리스틱 단순?**
정확도보다 *false positive 허용 + 수동 검증 강조* 가 본 epic 의 운영 모델. 텍스트 잘림 검출은 width 추정이 진짜 정확하려면 폰트 metrics 필요 — 본 단계엔 ellipsis 패턴 + 길이 추정만으로 P0 위주 검출.

**왜 dpr 3 default?**
1080×1920 (jajang 기본 emulator 해상도) ÷ 360×640 (Android dp baseline) = 3. consumer 가 다른 해상도 사용 시 overrride 필요 — 향후 config 에 추가 옵션.

**왜 LLM REVIEW 슬롯을 markdown comment 로?**
메인 Claude 가 후속 step 으로 슬롯을 채움. comment 로 명확히 placeholder 표시 + git diff 에서 후 채움 확인 쉬움.

**왜 programmatic API export?**
다른 모노레포에서 Node script 로 호출 가능 (예: GitHub Actions 에서 직접 import). CLI + library 양면 노출이 npm 패키지 표준.

---

## 다른 모듈과의 경계

- **batch 02**: 본 batch 가 02 의 `runner.ts` / `entry-steps.ts` 를 *확장*. 02 의 baseline (screencap + 기본 navigate) 위에 dump + heuristic + report 추가.
- **batch 04**: 본 batch 의 `tour-template.ts` 가 jajang consumer 의 첫 풀 tour 산출물 형식. SOP 에 LLM 슬롯 채우기 가이드 명시.
- **batch 05**: 본 batch 의 `renderTourScreenReport` 의 `pencilSlot` 필드는 *옵셔널 입력*. 05 가 `preparePencilSlot` 결과를 주입.

---

## 수용 기준

- (BUILD) `npm run build` 성공
- (실행) `tour --only <screenId>` → `<output>/<date>-tour/<screenId>.{png,xml,md}` 3 산출물
- (휴리스틱) jajang 의 의도된 작은 터치 타겟 (예: settings 의 작은 toggle) 화면에서 < 132px flag 1건 이상
- (재사용) 패키지 grep `com.jajang` / `S10` → 0 occurrence
- (programmatic) `import { runTour } from 'mobile-qa-tour'` Node script 동작
