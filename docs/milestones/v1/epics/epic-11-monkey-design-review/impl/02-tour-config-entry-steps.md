---
depth: std
---

# impl/02 — [Story 2 절반] tour config schema + loader + runner + entry-steps + init 서브커맨드

**Story:** Story 2 (절반 — config + tour runner + entry-steps + init. uiautomator dump / heuristics / per-screen 리포트는 batch 03)
**선행 조건:** impl/01 완료 (`src/cli.ts` commander root, `src/adb/index.ts` 의 `adbShell` / `adbExecOut` / `adbLogcat` / `listDevices` export 존재)
**후행 조건:** `npx mobile-qa-tour init [--out <dir>]` 동작 / `npx mobile-qa-tour tour --config <path> [--only <id>]` 가 entry-steps 실행 + settle + screencap 까지 동작 (uiDumpPath / heuristics / pencilSlot 슬롯은 빈 상태로 통과)
**context budget:** file edits ≤ 9 / tool uses ≤ 50

---

## 0. 시작 전 확인 (DCN-30-35 외부 의존 검증)

- batch 01 의 `src/adb/index.ts` 시그니처 재확인: `adbShell(cmd: string, opts?: AdbExecOptions): Promise<string>`, `adbExecOut(cmd: string, opts?: AdbExecOptions): Promise<Buffer>`. 본 batch 는 이 두 함수만 의존.
- `commander` 동일 program 객체에서 다중 서브커맨드 (`monkey` / `tour` / `init`) dispatch 정상 동작 — batch 01 에서 이미 `tour` / `init` placeholder 가 등록돼 있음. 본 batch 는 `.action(...)` 만 교체.
- `zod` v3.23+ API:
  - `z.discriminatedUnion(discriminator: string, options: ZodObject[])` ← 첫 인자는 discriminator key (literal). 두 번째는 모든 멤버가 같은 key 의 `z.literal` 을 갖는 ZodObject 배열.
  - `z.infer<typeof Schema>` 로 TS 타입 추출.
  - `.refine(predicate, { message })` / `.default(value)` 사용.
- `xml2js` 는 batch 03 (uiautomator dump 파싱) 영역. 본 batch 미사용.
- 표준 `node:fs/promises` (`mkdir`, `writeFile`, `readFile`, `stat`, `copyFile`) + `node:path` 만 사용.
- batch 01 의 `package.json` 에 `zod` 가 이미 들어가 있는지 확인 (Story 1 dependencies 에 명시). 누락 시 `npm i zod` 추가.

---

## 1. 도메인 모델 정합

- `docs/domain-model.md` 는 jajang 앱 도메인 (자장가 / 녹음 / 사용자) 모델. 본 batch 는 *재사용 가능 standalone QA 패키지* (`packages/mobile-qa-tour/`) 에 작성하므로 jajang 도메인 entity 와 무관. 패키지의 도메인은 `QaConfig` / `Screen` / `EntryStep` 만 (zod schema 가 SSOT).
- 본 모듈의 entity:
  - `QaConfig` (root config) — appPackage / outputDir / screens 또는 screenRegistryPath / pencil(optional)
  - `Screen` (value object) — id / label / entrySteps / settleMs / pencilNodeIds(optional)
  - `EntryStep` (discriminated union, 7 variants) — tap / tapTestId / inputText / keyevent / permissionGrant / deepLink / wait

---

## 2. 모듈 = 테스트 단위 정합 (DCN-CHG-20260430-16 self-check)

| 영역 | 단위 테스트 가능? | 의존 mock |
|---|---|---|
| `config/schema.ts` | ✅ valid / invalid 입력 → parse 결과만 검증 | 의존 없음 |
| `config/load.ts` | ✅ 파일 존재 / JSON 파싱 / zod fail / registry 머지 4 분기 | `node:fs/promises` mock (vi.mock) |
| `tour/entry-steps.ts` | ✅ 각 step 7종 → adb 호출 1회 sequence | `../adb` mock |
| `tour/runner.ts` | ✅ 2 화면 시뮬레이션 → executeSteps + sleep + screencap 호출 sequence | `./entry-steps`, `../adb`, `node:fs/promises` mock |
| `cli/init.ts` | ✅ 템플릿 파일 복사 + 기존 파일 거부 분기 | `node:fs/promises` mock |

각 모듈 단일 책임 + 의존 명시적 import 라 mock 가능 → 테스트 단위 정합 ✓.

본 batch 는 너무 큼 분할 후보? — `config` (schema + load) / `tour` (runner + entry-steps) / `cli/init` 3 영역이지만 모두 같은 Story 2 의 "tour 동작 골격" 이라 분리 시 batch 03 에서 entry-steps + runner 가 다시 동시 수정되며 충돌. 합쳐 진행이 정합.

---

## 3. 생성/수정 파일

### 신규

- `packages/mobile-qa-tour/src/config/schema.ts` — zod schema (QaConfigSchema / ScreenSchema / EntryStepSchema) + TS 타입 export
- `packages/mobile-qa-tour/src/config/load.ts` — `loadConfig(path)` (file read + JSON parse + zod parse + screenRegistry 머지 + 친절 에러)
- `packages/mobile-qa-tour/src/tour/entry-steps.ts` — `executeStep(step, ctx)` + `executeSteps(steps, ctx)` (7종 dispatch)
- `packages/mobile-qa-tour/src/tour/runner.ts` — `runTour(opts): Promise<TourResult>` (screen 순회 + entry-steps + settle + screencap)
- `packages/mobile-qa-tour/src/cli/init.ts` — `runInit({ outDir })` (templates 복사 + 기존 파일 거부)
- `packages/mobile-qa-tour/templates/qa.config.example.json` — init 명령 복사 대상
- `packages/mobile-qa-tour/templates/screen-registry.example.json` — 동일

### 신규 (TEST)

- `packages/mobile-qa-tour/src/config/__tests__/schema.test.ts`
- `packages/mobile-qa-tour/src/config/__tests__/load.test.ts`
- `packages/mobile-qa-tour/src/tour/__tests__/entry-steps.test.ts`
- `packages/mobile-qa-tour/src/tour/__tests__/runner.test.ts`
- `packages/mobile-qa-tour/src/cli/__tests__/init.test.ts`

### 수정

- `packages/mobile-qa-tour/src/cli.ts` — `tour` 와 `init` 서브커맨드의 `.action(placeholder)` 를 실제 핸들러로 교체. 옵션 추가.
- `packages/mobile-qa-tour/src/index.ts` (이미 있으면) — `runTour`, `loadConfig`, `QaConfigSchema`, type re-export 추가. 없으면 신규 생성.
- `packages/mobile-qa-tour/package.json` — `zod` dependency 확인 (없으면 추가). `files` 배열에 `templates/` 추가 (CLI init 가 패키지 설치 후에도 템플릿 read 가능하도록).

---

## 4. 인터페이스

### 4.1 `src/config/schema.ts`

```ts
import { z } from 'zod';

export const EntryStepSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('tap'),
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    label: z.string().optional(),
  }),
  z.object({
    type: z.literal('tapTestId'),
    testId: z.string().min(1),
    label: z.string().optional(),
  }),
  z.object({
    type: z.literal('inputText'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('keyevent'),
    code: z.union([z.string(), z.number()]), // "BACK" | "HOME" | "ENTER" | 4 | 3 | 66
  }),
  z.object({
    type: z.literal('permissionGrant'),
    permission: z.string().min(1), // e.g. "android.permission.RECORD_AUDIO"
  }),
  z.object({
    type: z.literal('deepLink'),
    uri: z.string().min(1),
  }),
  z.object({
    type: z.literal('wait'),
    ms: z.number().int().positive(),
  }),
]);

export const ScreenSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  entrySteps: z.array(EntryStepSchema),
  settleMs: z.number().int().nonnegative().default(2000),
  pencilNodeIds: z.array(z.string()).optional(),
});

export const QaConfigSchema = z.object({
  appPackage: z.string().min(1),
  outputDir: z.string().default('./qa-output'),
  uxFlowAnchor: z.string().optional(),
  screens: z.array(ScreenSchema).optional(),
  screenRegistryPath: z.string().optional(),
  pencil: z
    .object({
      enabled: z.boolean().default(false),
      documentPath: z.string().optional(),
      nodeIds: z.record(z.string(), z.array(z.string())).optional(),
    })
    .optional(),
}).refine(
  (c) => (c.screens && c.screens.length > 0) || !!c.screenRegistryPath,
  { message: 'screens (non-empty array) 또는 screenRegistryPath 중 하나는 필수' },
);

export type EntryStep = z.infer<typeof EntryStepSchema>;
export type Screen = z.infer<typeof ScreenSchema>;
export type QaConfig = z.infer<typeof QaConfigSchema>;
```

### 4.2 `src/config/load.ts`

```ts
import { QaConfig } from './schema';

export class ConfigLoadError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ConfigLoadError';
  }
}

export async function loadConfig(configPath: string): Promise<QaConfig>;
// 동작:
// 1) fs.readFile(configPath, 'utf8') — ENOENT → ConfigLoadError("config not found: <path>")
// 2) JSON.parse — SyntaxError → ConfigLoadError("invalid JSON: <path> — <reason>")
// 3) QaConfigSchema.safeParse(raw) — fail → ConfigLoadError(zod issues 를 lines 로 직렬화)
// 4) parsed.screenRegistryPath 있으면:
//    - path.resolve(path.dirname(configPath), parsed.screenRegistryPath)
//    - readFile + JSON.parse + z.array(ScreenSchema).safeParse
//    - parsed.screens 와 머지 (registry 우선, parsed.screens 가 있으면 append) — 단순화: registry 가 있으면 screens = registry 로 덮어씀 (consumer 가 둘 다 채울 일은 없음)
// 5) 최종 QaConfig 반환
```

### 4.3 `src/tour/entry-steps.ts`

```ts
import type { EntryStep } from '../config/schema';

export interface EntryStepCtx {
  appPackage: string;
}

export async function executeStep(step: EntryStep, ctx: EntryStepCtx): Promise<void>;
export async function executeSteps(steps: EntryStep[], ctx: EntryStepCtx): Promise<void>;

// 매핑 (모든 분기 adbShell 호출 — 결과 무시):
// - tap            → adbShell(`input tap ${x} ${y}`)
// - tapTestId      → throw new Error('tapTestId requires uiautomator dump (batch 03 미완료) — 좌표 step 사용 권장')
//                    (batch 03 에서 dumpUi import 활성)
// - inputText      → adbShell(`input text ${shellEscape(text)}`)
//                    shellEscape: ' ' → '%s', '"' → escape, 기타 적절히
// - keyevent       → adbShell(`input keyevent ${code}`)
// - permissionGrant → adbShell(`pm grant ${ctx.appPackage} ${permission}`)
// - deepLink       → adbShell(`am start -a android.intent.action.VIEW -d ${shellQuote(uri)} ${ctx.appPackage}`)
// - wait           → await new Promise(r => setTimeout(r, ms))
```

### 4.4 `src/tour/runner.ts`

```ts
import type { QaConfig } from '../config/schema';

export interface TourOptions {
  config: QaConfig;
  output?: string;        // override config.outputDir
  only?: string;          // single screenId (콤마 구분 다중은 batch 03 에서 확장)
  skipUiautomator?: boolean; // batch 03 의 dump 스킵
  skipHeuristics?: boolean;  // batch 03 의 heuristic 스킵
}

export interface TourScreenResult {
  id: string;
  label?: string;
  screenshotPath: string;
  uiDumpPath?: string;          // batch 03 에서 채워짐
  heuristics?: unknown;         // batch 03 의 HeuristicResult
  pencilSlot?: string;          // batch 05 에서 채워짐
}

export interface TourResult {
  screens: TourScreenResult[];
  outputDir: string;             // 실제 사용된 output (date-tour subdir)
  startedAt: string;             // ISO
  finishedAt: string;            // ISO
}

export async function runTour(opts: TourOptions): Promise<TourResult>;
```

### 4.5 `src/cli/init.ts`

```ts
export interface InitOptions {
  outDir: string;       // cwd 기준 또는 absolute
  force?: boolean;      // (현재는 false 로 고정 — 기존 파일이 있으면 거부)
}

export interface InitResult {
  copied: string[];     // 복사된 파일 절대경로
  skipped: string[];    // 이미 존재해서 skip 된 파일
}

export async function runInit(opts: InitOptions): Promise<InitResult>;
// 동작:
// 1) outDir mkdir -p
// 2) templates/qa.config.example.json → outDir/qa.config.example.json
// 3) templates/screen-registry.example.json → outDir/screen-registry.example.json
// 4) 각 대상 파일이 이미 있으면 skipped 에 추가 (overwrite 거부)
// 5) 결과 반환. CLI 핸들러는 결과를 console.log
//
// templates 경로 해결: __dirname (compiled dist/cli/init.js) 기준 '../../templates' 또는
//   import.meta.url 기반. NodeNext + cjs 출력이라 __dirname 사용 가능. (tsconfig 확인 필요)
```

### 4.6 `src/cli.ts` (수정)

```ts
program
  .command('tour')
  .description('Driven screenshot tour')
  .requiredOption('--config <path>', 'qa.config.json path')
  .option('--output <dir>', 'override config.outputDir')
  .option('--only <screenId>', 'run a single screen by id')
  .option('--skip-uiautomator', 'skip uiautomator dump (batch 03)')
  .option('--skip-heuristics', 'skip heuristic checks (batch 03)')
  .action(async (opts) => {
    const { loadConfig } = await import('./config/load');
    const { runTour } = await import('./tour/runner');
    const config = await loadConfig(path.resolve(opts.config));
    const result = await runTour({
      config,
      output: opts.output ? path.resolve(opts.output) : undefined,
      only: opts.only,
      skipUiautomator: !!opts.skipUiautomator,
      skipHeuristics: !!opts.skipHeuristics,
    });
    console.log(`tour finished. screens=${result.screens.length} outputDir=${result.outputDir}`);
  });

program
  .command('init')
  .description('Generate qa.config.example.json + screen-registry.example.json in target dir')
  .option('--out <dir>', 'output directory', '.')
  .action(async (opts) => {
    const { runInit } = await import('./cli/init');
    const result = await runInit({ outDir: path.resolve(opts.out) });
    for (const f of result.copied) console.log(`created: ${f}`);
    for (const f of result.skipped) console.warn(`skipped (already exists): ${f}`);
    if (result.copied.length === 0) process.exit(1);
  });
```

---

## 5. 핵심 의사코드

### 5.1 `src/config/load.ts`

```ts
export async function loadConfig(configPath: string): Promise<QaConfig> {
  let raw: string;
  try {
    raw = await fs.readFile(configPath, 'utf8');
  } catch (e: any) {
    if (e?.code === 'ENOENT') throw new ConfigLoadError(`config not found: ${configPath}`);
    throw new ConfigLoadError(`failed to read config: ${configPath}`, e);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e: any) {
    throw new ConfigLoadError(`invalid JSON: ${configPath} — ${e?.message ?? 'parse error'}`, e);
  }

  const result = QaConfigSchema.safeParse(parsed);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  - ${i.path.join('.') || '<root>'}: ${i.message}`,
    );
    throw new ConfigLoadError(`config validation failed:\n${lines.join('\n')}`);
  }
  const config = result.data;

  if (config.screenRegistryPath) {
    const registryPath = path.resolve(path.dirname(configPath), config.screenRegistryPath);
    let registryRaw: string;
    try {
      registryRaw = await fs.readFile(registryPath, 'utf8');
    } catch (e: any) {
      throw new ConfigLoadError(`screenRegistry not found: ${registryPath}`, e);
    }
    let registryParsed: unknown;
    try {
      registryParsed = JSON.parse(registryRaw);
    } catch (e: any) {
      throw new ConfigLoadError(`invalid JSON: ${registryPath} — ${e?.message}`, e);
    }
    const screens = z.array(ScreenSchema).safeParse(registryParsed);
    if (!screens.success) {
      const lines = screens.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
      throw new ConfigLoadError(`screenRegistry validation failed:\n${lines.join('\n')}`);
    }
    config.screens = screens.data;
  }

  return config;
}
```

### 5.2 `src/tour/entry-steps.ts`

```ts
import { adbShell } from '../adb';

function shellEscapeText(text: string): string {
  // adb shell input text — ' ' → '%s', escape ' " \ etc.
  return text.replace(/ /g, '%s').replace(/(["\\$`])/g, '\\$1');
}

function shellQuoteUri(uri: string): string {
  return `'${uri.replace(/'/g, "'\\''")}'`;
}

export async function executeStep(step: EntryStep, ctx: EntryStepCtx): Promise<void> {
  switch (step.type) {
    case 'tap':
      await adbShell(`input tap ${step.x} ${step.y}`);
      return;
    case 'tapTestId':
      throw new Error(
        `tapTestId requires uiautomator dump (batch 03 미완료). testId=${step.testId} — 좌표 tap 사용 권장 또는 batch 03 완료 후 재실행.`,
      );
    case 'inputText':
      await adbShell(`input text ${shellEscapeText(step.text)}`);
      return;
    case 'keyevent':
      await adbShell(`input keyevent ${step.code}`);
      return;
    case 'permissionGrant':
      await adbShell(`pm grant ${ctx.appPackage} ${step.permission}`);
      return;
    case 'deepLink':
      await adbShell(`am start -a android.intent.action.VIEW -d ${shellQuoteUri(step.uri)} ${ctx.appPackage}`);
      return;
    case 'wait':
      await new Promise((r) => setTimeout(r, step.ms));
      return;
    default: {
      // exhaustive check
      const _exhaustive: never = step;
      throw new Error(`unknown step type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export async function executeSteps(steps: EntryStep[], ctx: EntryStepCtx): Promise<void> {
  for (const step of steps) await executeStep(step, ctx);
}
```

### 5.3 `src/tour/runner.ts`

```ts
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { adbExecOut } from '../adb';
import { executeSteps } from './entry-steps';

export async function runTour(opts: TourOptions): Promise<TourResult> {
  const startedAt = new Date().toISOString();
  const { config } = opts;

  if (!config.screens || config.screens.length === 0) {
    throw new Error('runTour: config.screens is empty (loadConfig 결과 검증 누락)');
  }

  const screens = opts.only
    ? config.screens.filter((s) => s.id === opts.only)
    : config.screens;

  if (opts.only && screens.length === 0) {
    throw new Error(`runTour: --only "${opts.only}" matched no screen`);
  }

  const baseOutput = opts.output ?? config.outputDir;
  const dateStr = startedAt.slice(0, 10);
  const tourSubdir = path.join(baseOutput, `${dateStr}-tour`);
  await fs.mkdir(tourSubdir, { recursive: true });

  const results: TourScreenResult[] = [];
  for (const screen of screens) {
    await executeSteps(screen.entrySteps, { appPackage: config.appPackage });
    if (screen.settleMs > 0) {
      await new Promise((r) => setTimeout(r, screen.settleMs));
    }

    const screenshotPath = path.join(tourSubdir, `${screen.id}.png`);
    const png = await adbExecOut('screencap -p');
    await fs.writeFile(screenshotPath, png);

    results.push({
      id: screen.id,
      label: screen.label,
      screenshotPath,
      // uiDumpPath / heuristics / pencilSlot 는 후속 batch 에서 채워짐
    });
  }

  return {
    screens: results,
    outputDir: tourSubdir,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}
```

### 5.4 `src/cli/init.ts`

```ts
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const TEMPLATE_FILES = [
  'qa.config.example.json',
  'screen-registry.example.json',
];

function templatesDir(): string {
  // dist/cli/init.js 기준 -> ../../templates
  return path.resolve(__dirname, '..', '..', 'templates');
}

export async function runInit(opts: InitOptions): Promise<InitResult> {
  await fs.mkdir(opts.outDir, { recursive: true });
  const copied: string[] = [];
  const skipped: string[] = [];

  for (const name of TEMPLATE_FILES) {
    const src = path.join(templatesDir(), name);
    const dst = path.join(opts.outDir, name);
    try {
      await fs.stat(dst);
      skipped.push(dst);
      continue;
    } catch {
      // not exist → copy
    }
    await fs.copyFile(src, dst);
    copied.push(dst);
  }

  return { copied, skipped };
}
```

### 5.5 `templates/qa.config.example.json`

```json
{
  "appPackage": "com.example.app",
  "outputDir": "./qa-output",
  "uxFlowAnchor": "docs/ux-flow.md",
  "screenRegistryPath": "./screen-registry.example.json"
}
```

### 5.6 `templates/screen-registry.example.json`

```json
[
  {
    "id": "Home",
    "label": "Home Screen",
    "entrySteps": [],
    "settleMs": 2000
  },
  {
    "id": "Settings",
    "label": "Settings Screen",
    "entrySteps": [
      { "type": "tap", "x": 540, "y": 1800, "label": "Settings tab" },
      { "type": "wait", "ms": 500 }
    ],
    "settleMs": 1500
  }
]
```

---

## 6. 테스트 매트릭스 (test-engineer 가 즉시 진입)

### 6.1 `config/__tests__/schema.test.ts`

- **valid root**: `{ appPackage: 'com.x', screens: [{ id, entrySteps: [] }] }` → success, defaults `outputDir='./qa-output'`, `settleMs=2000`
- **invalid — neither screens nor screenRegistryPath**: `{ appPackage: 'com.x' }` → fail with refine message
- **invalid — empty screens array**: `{ appPackage: 'com.x', screens: [] }` → fail
- **valid — screenRegistryPath only**: `{ appPackage: 'com.x', screenRegistryPath: './r.json' }` → success
- **EntryStep tap valid / invalid (negative x)** → tap{x:-1} fail
- **EntryStep discriminator invalid type**: `{ type: 'bogus' }` → fail
- **EntryStep keyevent string + number 둘 다 허용** → "BACK" / 4 둘 다 success

### 6.2 `config/__tests__/load.test.ts` (vi.mock `node:fs/promises`)

- **ENOENT**: `loadConfig('/no.json')` → throw `ConfigLoadError` matching `/config not found/`
- **invalid JSON**: readFile returns `'{'` → throw matching `/invalid JSON/`
- **zod fail**: readFile returns `'{}'` → throw matching `/config validation failed/`
- **screenRegistryPath success**: 2 readFile mock (config + registry) → return config with screens 머지
- **screenRegistryPath ENOENT**: → throw `/screenRegistry not found/`

### 6.3 `tour/__tests__/entry-steps.test.ts` (vi.mock `../adb`)

- **tap**: `executeStep({ type: 'tap', x: 100, y: 200 }, ctx)` → `adbShell` called with `'input tap 100 200'`
- **tapTestId**: → throw matching `/batch 03/`
- **inputText**: `text: 'hello world'` → `adbShell` called with `'input text hello%sworld'`
- **inputText escape**: `text: 'a"b'` → `'input text a\\"b'`
- **keyevent string**: code 'BACK' → `'input keyevent BACK'`
- **keyevent number**: code 4 → `'input keyevent 4'`
- **permissionGrant**: → `'pm grant com.x.app android.permission.RECORD_AUDIO'`
- **deepLink**: uri `'jajang://home'` → `'am start -a android.intent.action.VIEW -d \'jajang://home\' com.x.app'`
- **wait**: `ms: 50` → resolves, no adb call (vi.useFakeTimers + advanceTimersByTime)
- **executeSteps**: 3 step 배열 → adbShell 3회 in order

### 6.4 `tour/__tests__/runner.test.ts` (vi.mock `./entry-steps`, `../adb`, `node:fs/promises`)

- **2 screens**: config 에 2 화면 → `executeSteps` 2회, `adbExecOut('screencap -p')` 2회, `fs.writeFile` 2회 (screenshot path: `<outputDir>/<date>-tour/<id>.png`)
- **only filter**: `opts.only = 'Detail'` → 1 화면만 처리, executeSteps 1회
- **only no match**: `opts.only = 'Bogus'` → throw matching `/matched no screen/`
- **empty screens**: → throw matching `/screens is empty/`
- **mkdir recursive 호출 확인**: `<outputDir>/<date>-tour` 생성

### 6.5 `cli/__tests__/init.test.ts` (vi.mock `node:fs/promises`)

- **fresh dir**: stat 둘 다 ENOENT → copyFile 2회, copied.length === 2, skipped.length === 0
- **partial existing**: `qa.config.example.json` stat success → copyFile 1회 (registry 만), skipped.length === 1
- **all existing**: stat 둘 다 success → copyFile 0회, skipped.length === 2
- **mkdir recursive**: outDir mkdir 호출 확인

---

## 7. 결정 근거

**왜 `screens` 와 `screenRegistryPath` 양립?** consumer 가 한 파일에 inline 하든, 화면 정의 별도 파일로 분리하든 자유. zod refine 으로 둘 중 하나 강제. 둘 다 채우면 registry 가 screens 를 덮어씀 (단순화 — 둘 다 채우는 사용자 시나리오 없음).

**왜 entry-steps 7 type 만?** Android adb 즉시 매핑 가능 최소 집합. swipe / longPress / scrollUntil 은 plan 의 7 화면에 불필요. 추후 별 epic 에서 확장.

**왜 `tapTestId` 의 실제 dumpUi 호출은 batch 03?** `uiautomator.ts` 가 batch 03 신설 + xml2js 의존 추가도 batch 03. 본 batch 는 명시적 throw 로 "미구현" 표시 → batch 03 에서 import + 좌표 추출 활성. 수용 기준에 throw 메시지 매처 박아 행동 잠금.

**왜 본 batch 의 runner 가 per-screen 리포트 미생성?** heuristic / dump / pencil 슬롯이 batch 03 / 05 에서 추가됨. 본 batch 가 리포트 템플릿 박으면 후속 batch 에서 재작업 발생. screenshot 만 저장하고 리포트는 batch 03 에서 통합 작성. `TourScreenResult` 의 optional 필드가 슬롯.

**왜 `ConfigLoadError` 를 별도 클래스로?** validator/test-engineer 가 `expect(...).rejects.toBeInstanceOf(ConfigLoadError)` 패턴으로 검증 + CLI 에서 `instanceof` 분기로 친절 메시지 vs unexpected error 구분 가능.

**왜 `init` 이 overwrite 거부?** consumer 가 `qa.config.example.json` 을 이미 수정했을 수 있음. overwrite 로 수동 작업 증발 위험. `--force` 는 본 batch 미지원 (필요 시 후속).

---

## 8. 다른 모듈과의 경계

- **batch 01 (CLI bootstrap + adb wrapper + monkey)**: 본 batch 는 `src/adb` 의 `adbShell` / `adbExecOut` 만 import. `monkey/*` 미수정. cli.ts 의 `monkey` 핸들러는 그대로.
- **batch 03 (uiautomator + heuristics + tour-template)**: 본 batch 의 `runner.ts` 의 빈 슬롯 (`uiDumpPath`, `heuristics`) 채움. `tapTestId` 의 실제 동작 (entry-steps 의 throw → dumpUi import 로 교체) 도 03 에서 활성. `--skip-uiautomator` / `--skip-heuristics` 옵션은 본 batch 에서 받기만 하고 (no-op).
- **batch 04 (jajang consumer 통합)**: 본 batch 의 templates 가 `npm run qa:init` 의 source. consumer 가 복사해서 jajang specifics (`com.jajang.app`, S06/S07/...) 로 덮어씀.
- **batch 05 (Pencil)**: pencil 슬롯 (`pencilSlot` 필드) 은 본 batch 가 *zod schema 에 정의만* + runner 가 미참조. 05 에서 `runTour` 가 pencil 블록 read 후 슬롯 채움.

**의존 부재 시 graceful 동작**:
- `src/adb` 미존재 시 → import 시점 에러. 정상 (batch 01 선행 필수).
- emulator 미연결 시 → `adbShell` / `adbExecOut` 의 execa 가 throw → runner 가 그대로 throw. CLI 가 stderr 출력 후 exit 1.

---

## 9. 주의사항

- **DB 영향도**: 영향 없음. 본 batch 는 standalone npm 패키지 (DB 스키마 무관).
- **Breaking Change**: 없음. batch 01 의 `cli.ts` 의 placeholder action 만 교체 — 사용자 facing 동작 추가뿐.
- **shellEscape 한계**: `inputText` 의 한글·특수문자 escape 가 100% 안전하진 않음. adb `input text` 는 ASCII 권장. 한글 입력 필요 시 batch 03 이후 `adb shell ime` 또는 `IME_ACTION_DONE` 검토. 본 batch 는 영문 + space 만 보장 (운영 SOP 명시).
- **templates 패키징**: `package.json` 의 `files` 에 `templates/` 가 포함돼야 npm install 후 `runInit` 가 templates 를 찾을 수 있음. workspace 환경 (현 jajang 모노레포) 에선 source 그대로 read 되니 dev 시점엔 무관.
- **TypeScript 타입 정합**: `loadConfig` 반환 `QaConfig` 에서 `screenRegistryPath` 를 통해 머지된 후 `config.screens` 가 보장되지 않음 (zod refine 만 강제). `runTour` 가 진입 시 `config.screens` empty 체크 강제 (의사코드 §5.3 첫 줄).
- **`cli.ts` 의 `path` import**: batch 01 에서 `import path from 'node:path';` 이미 존재. 추가 import 불필요.
- **`runInit` 의 `__dirname`**: tsconfig 의 `module: 'commonjs'` 또는 `NodeNext` + 출력 cjs 일 때만 사용 가능. ESM 출력이면 `import.meta.url` + `fileURLToPath`. batch 01 의 tsconfig 확인 후 둘 중 하나 선택.

---

## 10. 수용 기준

| ID | 내용 | 검증 | 통과 조건 |
|---|---|---|---|
| REQ-001 | `QaConfigSchema.parse` 는 `screens` / `screenRegistryPath` 둘 다 없으면 fail | (TEST) `schema.test.ts` | refine message 일치 |
| REQ-002 | `EntryStepSchema` 는 7 type discriminatedUnion + 잘못된 type fail | (TEST) `schema.test.ts` | discriminator error |
| REQ-003 | `loadConfig` 가 ENOENT / invalid JSON / zod fail / valid 4 분기 모두 정확 분기 | (TEST) `load.test.ts` | 각 분기 `ConfigLoadError` 매처 |
| REQ-004 | `loadConfig` 가 `screenRegistryPath` read + zod 검증 + 머지 | (TEST) `load.test.ts` | 결과 `config.screens` 가 registry 내용 |
| REQ-005 | `executeStep` 7 type 각각이 정확한 adb 명령 1회 호출 (tapTestId 만 throw) | (TEST) `entry-steps.test.ts` | adbShell mock call args 일치 |
| REQ-006 | `executeStep('inputText', ...)` 가 space → `%s`, `"` → escape | (TEST) `entry-steps.test.ts` | adb 명령 문자열 매처 |
| REQ-007 | `runTour` 가 N 화면에 대해 executeSteps + sleep + screencap N회 호출 | (TEST) `runner.test.ts` | mock call count + writeFile path 형식 |
| REQ-008 | `runTour` 의 `--only` 가 매칭 1 화면만 처리, 매칭 없으면 throw | (TEST) `runner.test.ts` | 1회 호출 / throw 매처 |
| REQ-009 | `runTour` 결과의 screenshotPath 가 `<output>/<YYYY-MM-DD>-tour/<id>.png` 형식 | (TEST) `runner.test.ts` | path 매처 |
| REQ-010 | `runInit` 가 templates 2개 복사, 기존 파일 skip | (TEST) `init.test.ts` | copied/skipped 배열 매처 |
| REQ-011 | `npx mobile-qa-tour --help` 에 `tour` + `init` 서브커맨드 + 옵션 노출 | (MANUAL) `npx mobile-qa-tour --help` | tour + init 행 표시 (자동화 비용 > 가치) |
| REQ-012 | `npm run build` 성공 (TS strict, exhaustive switch never check 통과) | (MANUAL) `cd packages/mobile-qa-tour && npm run build` | exit 0 (build 결과는 수동 검증) |
| REQ-013 | 패키지 코드에 jajang 특정 문자열 누설 0 (`com.jajang` / `S06`-`S16` / `AccountDeletion`) | (TEST) `entry-steps`/`runner` 테스트 + grep | 패키지 src 내 grep 결과 0 — `__tests__` 외 |

---

## 결론

batch 02 는 standalone QA 패키지의 *config + tour 골격* — zod schema (3 layer: QaConfig / Screen / EntryStep × 7 variants) + 친절 에러 loader + 7 step adb dispatch + screen 순회 runner + init 템플릿 복사. tapTestId 는 명시적 throw 로 batch 03 의존 명시. heuristics / uiautomator / per-screen markdown 은 batch 03, pencil 슬롯은 batch 05 에서 채움. 본 batch 의 runner 의 `TourScreenResult` optional 필드가 후속 batch 의 인계 슬롯. 모든 모듈이 단일 의존 mock 가능 (adb / fs) 라 test-engineer 가 vitest + vi.mock 으로 즉시 진입 가능. consumer-agnostic 보장 (`com.jajang` / `S06` 등 grep 0). `READY_FOR_IMPL`.
