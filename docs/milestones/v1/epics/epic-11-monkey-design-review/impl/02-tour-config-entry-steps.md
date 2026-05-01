---
depth: std
---

# impl/02 — [Story 2] Track B tour 모듈 — config schema + loader + runner + entry-steps + init 서브커맨드

**Story:** Story 2 (절반 — config + runner + entry-steps)
**선행 조건:** impl/01 완료 (CLI bootstrap + adb wrapper 존재)
**후행 조건:** `tour --config <path> --only <screenId>` 가 navigate + screencap 까지 동작 (heuristic / dump 는 batch 03)

**context budget:** file edits ≤ 8 / tool uses ≤ 40

---

## 0. 시작 전 확인

- impl/01 의 `src/adb/index.ts` 의 `adbShell` / `adbExecOut` / `adbLogcat` signature 재확인 (entry-steps 가 의존)
- `commander` 가 동일 program 객체에서 다중 서브커맨드 dispatch 정상 동작 (`init`, `tour` 채울 자리)
- `zod` API: `z.object`, `z.discriminatedUnion`, `z.array`, `z.literal` (학습 데이터 hallucination 위험 — `discriminatedUnion` 의 첫 인자는 discriminator 키, 두 번째는 union 멤버 배열)

---

## 생성/수정 파일

### 신규

- `packages/mobile-qa-tour/src/config/schema.ts` — zod schema 정의
- `packages/mobile-qa-tour/src/config/load.ts` — `loadConfig(path)` (file read + parse + 친절 에러)
- `packages/mobile-qa-tour/src/tour/entry-steps.ts` — 7 step types 실행기
- `packages/mobile-qa-tour/src/tour/runner.ts` — screen 배열 순회 + screencap (heuristic stub)
- `packages/mobile-qa-tour/templates/qa.config.example.json` — init 명령 복사 대상
- `packages/mobile-qa-tour/templates/screen-registry.example.json` — 동일

### 수정

- `packages/mobile-qa-tour/src/cli.ts` — `tour` / `init` stub 자리에 실제 핸들러 박기

---

## 인터페이스

### `src/config/schema.ts`

```ts
import { z } from 'zod';

export const EntryStepSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tap'), x: z.number(), y: z.number() }),
  z.object({ type: z.literal('tapTestId'), testId: z.string() }),
  z.object({ type: z.literal('inputText'), text: z.string() }),
  z.object({ type: z.literal('keyevent'), code: z.union([z.string(), z.number()]) }),
  z.object({ type: z.literal('permissionGrant'), permission: z.string() }),
  z.object({ type: z.literal('deepLink'), uri: z.string() }),
  z.object({ type: z.literal('wait'), ms: z.number() }),
]);

export const ScreenSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  entrySteps: z.array(EntryStepSchema),
  settleMs: z.number().default(2000),
  pencilNodeIds: z.array(z.string()).optional(),
});

export const QaConfigSchema = z.object({
  appPackage: z.string(),
  outputDir: z.string().default('./qa-output'),
  uxFlowAnchor: z.string().optional(),
  screens: z.array(ScreenSchema).optional(),
  screenRegistryPath: z.string().optional(),
  pencil: z.object({
    enabled: z.boolean().default(false),
    documentPath: z.string().optional(),
    nodeIds: z.record(z.string(), z.array(z.string())).optional(),
  }).optional(),
}).refine(
  c => (c.screens && c.screens.length > 0) || c.screenRegistryPath,
  { message: 'screens 또는 screenRegistryPath 중 하나는 필수' }
);

export type QaConfig = z.infer<typeof QaConfigSchema>;
export type Screen = z.infer<typeof ScreenSchema>;
export type EntryStep = z.infer<typeof EntryStepSchema>;
```

### `src/config/load.ts`

```ts
export async function loadConfig(configPath: string): Promise<QaConfig>;
// - file read (JSON)
// - QaConfigSchema.parse — 실패 시 friendly stderr (zod issues map → 라인별 출력) + process.exit(1)
// - screenRegistryPath 가 있으면 추가 read + ScreenSchema 배열 검증 → screens 에 머지
```

### `src/tour/entry-steps.ts`

```ts
export async function executeStep(step: EntryStep, ctx: { appPackage: string }): Promise<void>;
export async function executeSteps(steps: EntryStep[], ctx: { appPackage: string }): Promise<void>;

// 매핑:
// tap         → adbShell(`input tap ${x} ${y}`)
// tapTestId   → batch 03 의 dumpUi + parseUi 후 resource-id 매칭 → tap (본 batch 는 lazy import — uiautomator 모듈 미존재 시 친절 에러)
// inputText   → adbShell(`input text "${escape(text)}"`)
// keyevent    → adbShell(`input keyevent ${code}`)
// permissionGrant → adbShell(`pm grant ${appPackage} ${permission}`)
// deepLink    → adbShell(`am start -a android.intent.action.VIEW -d "${uri}" ${appPackage}`)
// wait        → setTimeout(ms)
```

### `src/tour/runner.ts`

```ts
export interface TourOptions {
  config: QaConfig;
  output?: string;        // override config.outputDir
  only?: string;          // single screenId
  skipUiautomator?: boolean;
  skipHeuristics?: boolean;
}

export interface TourResult {
  screens: Array<{
    id: string;
    label?: string;
    screenshotPath: string;
    uiDumpPath?: string;          // batch 03 에서 채워짐
    heuristics?: HeuristicResult; // 동일
    pencilSlot?: string;          // batch 05 에서 채워짐
  }>;
  startedAt: string;
  finishedAt: string;
}

export async function runTour(opts: TourOptions): Promise<TourResult>;
// - 본 batch 에서는: entry-steps 실행 + settleMs 대기 + screencap 만 수행
// - dumpUi / heuristics / pencilSlot 은 후속 batch 에서 채워짐 (옵셔널 필드)
```

### `src/cli.ts` (수정)

```ts
program.command('init')
  .option('--out <dir>', '', '.')
  .action(async (opts) => {
    // templates/*.example.json → opts.out 에 복사
  });

program.command('tour')
  .requiredOption('--config <path>')
  .option('--output <dir>')
  .option('--only <screenId>')
  .option('--skip-uiautomator')
  .option('--skip-heuristics')
  .action(async (opts) => {
    const { loadConfig } = await import('./config/load');
    const { runTour } = await import('./tour/runner');
    const config = await loadConfig(opts.config);
    const result = await runTour({ config, output: opts.output, only: opts.only, ... });
    // 본 batch: per-screen 리포트 미생성 (batch 03 에서 추가). screenshot 만 저장된 상태.
    console.log(`tour finished. screens=${result.screens.length}`);
  });
```

---

## 의사코드

### `src/tour/runner.ts`

```ts
async function runTour(opts) {
  const { config } = opts;
  const outputDir = opts.output ?? config.outputDir;
  const screens = opts.only
    ? config.screens!.filter(s => s.id === opts.only)
    : config.screens!;

  await fs.mkdir(outputDir, { recursive: true });
  const tourSubdir = path.join(outputDir, `${date}-tour`);
  await fs.mkdir(tourSubdir, { recursive: true });

  const results = [];
  for (const screen of screens) {
    await executeSteps(screen.entrySteps, { appPackage: config.appPackage });
    await sleep(screen.settleMs);

    const screenshotPath = path.join(tourSubdir, `${screen.id}.png`);
    const png = await adbExecOut('screencap -p');
    await fs.writeFile(screenshotPath, png);

    results.push({ id: screen.id, label: screen.label, screenshotPath });
    // dumpUi / heuristics / pencilSlot 는 batch 03/05 에서 추가
  }

  return { screens: results, startedAt, finishedAt: new Date().toISOString() };
}
```

### `templates/qa.config.example.json`

```json
{
  "appPackage": "com.example.app",
  "outputDir": "./qa-output",
  "uxFlowAnchor": "docs/ux-flow.md",
  "screenRegistryPath": "./screen-registry.json"
}
```

### `templates/screen-registry.example.json`

```json
[
  {
    "id": "Home",
    "label": "Home Screen",
    "entrySteps": [],
    "settleMs": 2000
  },
  {
    "id": "Detail",
    "label": "Detail Screen",
    "entrySteps": [
      { "type": "tapTestId", "testId": "openDetail" }
    ],
    "settleMs": 1500
  }
]
```

---

## 결정 근거

**왜 `screens` 와 `screenRegistryPath` 양립?**
consumer 가 한 파일에 inline 하든, 화면 정의 별도 파일로 분리하든 자유. zod refine 으로 둘 중 하나 강제.

**왜 entry-steps 7 type 만?**
Android adb 가 즉시 매핑 가능한 최소 집합. 추후 swipe / longPress 추가 가능 (별 epic).

**왜 tapTestId 의 실제 dumpUi 호출은 batch 03?**
`uiautomator.ts` 가 batch 03 에서 신설. 본 batch 는 lazy import + friendly error ("batch 03 미완료 — 좌표 fallback 사용 권장") 로 명시적 미구현 표시.

**왜 본 batch 의 runner 는 per-screen 리포트 미생성?**
heuristic / dump / pencil 슬롯이 batch 03 / 05 에서 추가됨. 본 batch 가 리포트 템플릿 박으면 후속 batch 에서 재작업 발생. screenshot 만 저장하고 리포트는 batch 03 에서 통합 작성.

---

## 다른 모듈과의 경계

- **batch 03 (uiautomator + heuristics)**: 본 batch 의 `runner.ts` 의 빈 슬롯 (`uiDumpPath`, `heuristics`) 채움. `tapTestId` 의 실제 동작도 03 에서 활성.
- **batch 04 (jajang consumer)**: 본 batch 의 templates 가 `npm run qa:init` 의 source. consumer 가 복사해서 jajang specifics 로 덮어씀.
- **batch 05 (Pencil)**: pencil 슬롯 (`pencilSlot` 필드) 은 본 batch 가 *zod schema 에 정의만* + runner 가 미참조. 05 에서 활성.

---

## 수용 기준

- (BUILD) `npm run build` 성공
- (CLI) `npx mobile-qa-tour init --out /tmp/test-init` → `qa.config.example.json` + `screen-registry.example.json` 복사
- (CLI) `npx mobile-qa-tour tour --config /tmp/test-init/qa.config.example.json` → friendly 에러 (`screens 또는 screenRegistryPath`) 또는 (registry 가공 후) 동작
- (스키마) 잘못된 config (예: `entrySteps` 없는 screen) → zod 친절 에러 + exit 1
- (실행) jajang `qa.config.json` (batch 04 작성) 에 대해 `tour --only S06` → `screenshot` 1장 생성
- (재사용) 패키지 코드 grep `com.jajang` / `S10` → 0 occurrence
