---
depth: std
---

# impl/01 — [Story 1] 패키지 골격 + Track A monkey 모듈 (`mobile-qa-tour` workspace 추가)

**Story:** Story 1 (패키지 골격 + monkey)
**선행 조건:** 없음 (Epic 10 merge 완료 상태)
**후행 조건:** `npx mobile-qa-tour --help` 동작 + `monkey --package <pkg> --events 100` 으로 markdown 리포트 생성
**도메인 모델 참조:** `docs/domain-model.md` 부재 (jajang 아직 명시적 도메인 모델 문서 X) — 본 패키지는 *consumer-agnostic 인프라* 이므로 jajang 도메인 entity 미참조. 본 패키지가 다루는 자체 도메인은 §자체 도메인 명시 절 참조.

**context budget:** file edits ≤ 12 / tool uses ≤ 50

---

## 자체 도메인 명시 (테스트 단위 정합)

본 패키지의 핵심 도메인 객체:
- `MonkeyOptions` (입력) — appPackage / events / throttle / pcts / output / seed
- `MonkeyResult` (출력) — events / durationMs / monkeyStdout / crashes[] / screenshotPath
- `Crash` (도메인 VO) — type (`FATAL`|`ANR`|`CRASH`) + excerpt
- `MonkeyReportData` (리포트 입력) — appPackage / events / crashes / screenshotPath / durationMs / generatedAt
- `AdbResult` (얇은 wrapper 결과) — stdout: string 또는 Buffer

테스트 단위 정합 self-check:
- `extractCrashes(logcatRaw)` — pure function, fixture string in / `Crash[]` out — vitest 단위 테스트 명료
- `renderMonkeyReport(data)` — pure function, struct in / markdown string out — vitest 명료
- `runMonkey(opts)` — adb wrapper 의존, vitest 에서 `vi.mock('execa')` + adb 호출 sequence assertion 으로 가능
- `cli` — commander 가 process.argv 파싱하므로 `commander.parseAsync(['node', 'cli', '--help'])` 형태로 smoke 가능
- `adb/index.ts` — execa 직접 호출, vitest 에서 `vi.mock('execa')` mock 후 호출 인자 assertion

→ 모든 모듈이 mock-able + pure boundary 명확 → test-engineer 가 PASS/FAIL 명확 작성 가능. ✅

---

## 0. 시작 전 환경 확인

```bash
adb --version                                       # adb PATH 확인
node --version                                      # >= 18 (vitest 3 필요)
cat /Users/dc.kim/project/jajang/package.json       # 루트 workspaces: ["apps/mobile"] 현재
ls /Users/dc.kim/project/jajang/packages 2>&1       # 디렉토리 부재 — 본 batch 가 첫 추가
```

---

## 생성/수정 파일

### 신규 (패키지 내부)

| 경로 | 책임 |
|---|---|
| `packages/mobile-qa-tour/package.json` | npm package 메타 — name `mobile-qa-tour`, version `0.1.0`, bin / main / types / scripts (build, test, type-check) |
| `packages/mobile-qa-tour/tsconfig.json` | strict, target ES2022, module **commonjs** (bin 호환 우선 — §결정 근거 §C), outDir `dist`, rootDir `src` |
| `packages/mobile-qa-tour/.gitignore` | `dist/`, `node_modules/`, `qa-output/` |
| `packages/mobile-qa-tour/README.md` | 설치 / CLI usage / config 스키마 outline (스키마 본체는 batch 02 에서 정밀화) |
| `packages/mobile-qa-tour/src/cli.ts` | commander root + `monkey` 서브커맨드 dispatch (tour / init 은 stub — `console.error` + `exit 2`) |
| `packages/mobile-qa-tour/src/index.ts` | programmatic API barrel — `runMonkey`, `extractCrashes`, type re-exports |
| `packages/mobile-qa-tour/src/adb/index.ts` | adb wrapper — `adbShell`, `adbExecOut`, `adbLogcat`, `listDevices` (execa) |
| `packages/mobile-qa-tour/src/monkey/run.ts` | `runMonkey(opts: MonkeyOptions): Promise<MonkeyResult>` |
| `packages/mobile-qa-tour/src/monkey/crash-detect.ts` | `extractCrashes(logcatRaw: string): Crash[]` (pure) |
| `packages/mobile-qa-tour/src/report/monkey-template.ts` | `renderMonkeyReport(data: MonkeyReportData): string` (pure) |
| `packages/mobile-qa-tour/src/report/writer.ts` | `writeReport(outputDir, filename, content): Promise<string>` (full path 반환) |

### 신규 (테스트)

| 경로 | 대상 |
|---|---|
| `packages/mobile-qa-tour/src/monkey/__tests__/crash-detect.test.ts` | `extractCrashes` 픽스처 입력 → `Crash[]` 검증 |
| `packages/mobile-qa-tour/src/report/__tests__/monkey-template.test.ts` | `renderMonkeyReport` 출력 markdown snapshot 또는 핵심 필드 substring 검증 |
| `packages/mobile-qa-tour/src/report/__tests__/writer.test.ts` | `writeReport` — tmpdir 디렉토리 자동 생성 + 파일 write 검증 |
| `packages/mobile-qa-tour/src/adb/__tests__/index.test.ts` | execa mock 후 인자 sequence 검증 |
| `packages/mobile-qa-tour/src/monkey/__tests__/run.test.ts` | execa + fs mock 후 `runMonkey` flow 통합 (logcat -c → monkey shell → logcat -d → screencap → write) |
| `packages/mobile-qa-tour/src/__tests__/cli.test.ts` | `--help` / 서브커맨드 등록 smoke (process.exit mock) |

### 수정

- `package.json` (루트) — `workspaces` 를 `["apps/mobile"]` → `["apps/mobile", "packages/*"]` 로 확장

---

## 의존성 (외부 라이브러리 — *실존 확인 완료*)

| 라이브러리 | 버전 핀 | 형태 | 검증 결과 |
|---|---|---|---|
| `commander` | `^12.1.0` | dependency | `npm view commander@12` → 12.1.0 존재. CJS+ESM dual. `import { Command } from 'commander'` 표준 — 공식 README. (latest 14.0.3 도 호환이지만 12.x = 가장 널리 쓰이는 stable LTS 라인) |
| `zod` | `^3.23.0` | dependency | batch 02 에서 본격 사용. 본 batch 는 **dependencies 등록만** 하고 사용은 안 함. v3.23+ 안정. (참고: latest 4.4.1 — major bump 라 batch 02 작성 시 architect 재검토. 본 plan 에선 v3 라인 권장 — `discriminatedUnion` API 안정) |
| `execa` | `^5.1.1` | dependency | **v5 = 마지막 CJS**, v6+ = ESM only. 본 패키지 module=commonjs 라 v5 강제. `import { execa } from 'execa'` 는 v5/v6 모두 named export 동일. `npm view execa@5` 확인 완료 |
| `chalk` | `^4.1.2` | dependency | **v4 = 마지막 CJS**, v5+ = ESM only. CJS 라 v4 강제. `import chalk from 'chalk'` (default export) — `npm view chalk@4` 확인 |
| `typescript` | `~5.3.0` | devDep | 모노레포 mobile workspace 와 일치 |
| `@types/node` | `^20.0.0` | devDep | Node 18+ 타입 |
| `vitest` | `^3.0.0` | devDep | mobile workspace 와 동일 메이저. CJS 패키지 테스트 가능 (vite-node hoist) |
| `@vitest/coverage-v8` | `^3.0.0` | devDep (선택) | 커버리지 — 본 batch 에선 optional |

> **의심 시 검증 권고**: `cd packages/mobile-qa-tour && npm install` 후 `node -e "console.log(require('commander').Command)"` 로 Class 출력 확인. execa 5 의 named export 도 동일 방법.

---

## 인터페이스

### CLI (commander 12.x)

```
mobile-qa-tour --version
mobile-qa-tour --help

mobile-qa-tour monkey
  --package <com.x.app>          # required
  --events <N>                   # default "1000"  (string parse → int)
  --throttle <ms>                # default "200"
  --pct-touch <0-100>            # default "60"
  --pct-motion <0-100>           # default "20"
  --pct-nav <0-100>              # default "10"
  --pct-syskeys <0-100>          # default "5"
  --pct-anyevent <0-100>         # default "5"
  --output <dir>                 # default "./qa-output"
  --seed <N>                     # default 미지정 (monkey 자동 random seed)

mobile-qa-tour tour     # stub: console.error + exit 2 (batch 02 에서 구현)
mobile-qa-tour init     # stub: console.error + exit 2 (batch 02 에서 구현)
```

### `src/adb/index.ts`

```ts
import { execa } from 'execa';

export interface AdbExecOptions {
  serial?: string;            // 다중 device 시 -s <serial>
  timeoutMs?: number;
}

export async function adbShell(cmd: string, opts?: AdbExecOptions): Promise<string>;
export async function adbExecOut(cmd: string, opts?: AdbExecOptions): Promise<Buffer>;
export async function adbLogcat(args?: string[], opts?: AdbExecOptions): Promise<string>;
export async function listDevices(): Promise<string[]>;     // serial 목록
```

### `src/monkey/run.ts`

```ts
import type { Crash } from './crash-detect';

export interface MonkeyPercentages {
  touch: number;       // --pct-touch
  motion: number;      // --pct-motion
  nav: number;         // --pct-nav
  syskeys: number;     // --pct-syskeys
  anyevent: number;    // --pct-anyevent
}

export interface MonkeyOptions {
  appPackage: string;
  events: number;
  throttle: number;
  pcts: MonkeyPercentages;
  output: string;          // 출력 디렉토리
  seed?: number;           // 미지정 시 monkey 자체 random
}

export interface MonkeyResult {
  appPackage: string;
  events: number;
  durationMs: number;
  monkeyStdout: string;    // adb shell monkey stdout 전문
  monkeyExitCode: number;  // 0 = 정상, non-zero = monkey 자체 실패 (crash 아님)
  crashes: Crash[];
  screenshotPath: string | null;   // screencap 실패 시 null + console.warn
}

export async function runMonkey(opts: MonkeyOptions): Promise<MonkeyResult>;
```

### `src/monkey/crash-detect.ts`

```ts
export type CrashType = 'FATAL' | 'ANR' | 'CRASH';

export interface Crash {
  type: CrashType;
  excerpt: string;        // logcat 매치 라인부터 최대 10 라인
  lineIndex: number;      // 디버깅용 — 매치된 logcat 라인 번호
}

export function extractCrashes(logcatRaw: string): Crash[];
```

매치 패턴 (정규식):
- `FATAL` ← `/FATAL EXCEPTION/`
- `ANR`   ← `/ANR in /`
- `CRASH` ← `/CRASH:/`

### `src/report/monkey-template.ts`

```ts
import type { Crash } from '../monkey/crash-detect';

export interface MonkeyReportData {
  appPackage: string;
  events: number;
  durationMs: number;
  crashes: Crash[];
  screenshotPath: string | null;
  generatedAt: string;     // ISO 8601
  seed?: number;
}

export function renderMonkeyReport(data: MonkeyReportData): string;  // markdown
```

리포트 형식:
```markdown
# Monkey Report — {appPackage}

- Generated: {generatedAt}
- Events: {events}
- Duration: {durationMs} ms
- Seed: {seed ?? 'random'}
- Crashes: {crashes.length}

## Crashes

(crashes.length === 0) → "No crashes detected. ✅"
(else) → 각 crash 별 ### {type} ({lineIndex}) + ```{excerpt}``` 코드 블록

## Last Screenshot

(screenshotPath != null) → "![last-screen]({relativePath})"
(else) → "_screenshot capture failed_"
```

### `src/report/writer.ts`

```ts
export async function writeReport(
  outputDir: string,
  filename: string,
  content: string
): Promise<string>;   // 작성된 절대 경로 반환
```

동작: `fs.mkdir(outputDir, { recursive: true })` → `fs.writeFile(path.join(outputDir, filename), content, 'utf8')` → resolved path.

### `src/index.ts` (programmatic barrel)

```ts
export { runMonkey } from './monkey/run';
export { extractCrashes } from './monkey/crash-detect';
export { renderMonkeyReport } from './report/monkey-template';
export { writeReport } from './report/writer';
export type {
  MonkeyOptions, MonkeyResult, MonkeyPercentages,
} from './monkey/run';
export type { Crash, CrashType } from './monkey/crash-detect';
export type { MonkeyReportData } from './report/monkey-template';
```

---

## 의사코드

### `src/cli.ts`

```ts
#!/usr/bin/env node
import { Command } from 'commander';
import path from 'node:path';

const program = new Command();
program
  .name('mobile-qa-tour')
  .description('Android QA tooling — monkey + tour')
  .version('0.1.0');

program
  .command('monkey')
  .description('Run adb monkey + crash detection + report')
  .requiredOption('--package <pkg>', 'app package id')
  .option('--events <n>', 'event count', '1000')
  .option('--throttle <ms>', 'ms between events', '200')
  .option('--pct-touch <n>', '', '60')
  .option('--pct-motion <n>', '', '20')
  .option('--pct-nav <n>', '', '10')
  .option('--pct-syskeys <n>', '', '5')
  .option('--pct-anyevent <n>', '', '5')
  .option('--output <dir>', 'output dir', './qa-output')
  .option('--seed <n>', 'random seed (default: monkey auto)')
  .action(async (opts) => {
    const { runMonkey } = await import('./monkey/run');
    const { renderMonkeyReport } = await import('./report/monkey-template');
    const { writeReport } = await import('./report/writer');

    const result = await runMonkey({
      appPackage: opts.package,
      events: parseInt(opts.events, 10),
      throttle: parseInt(opts.throttle, 10),
      pcts: {
        touch: parseInt(opts.pctTouch, 10),
        motion: parseInt(opts.pctMotion, 10),
        nav: parseInt(opts.pctNav, 10),
        syskeys: parseInt(opts.pctSyskeys, 10),
        anyevent: parseInt(opts.pctAnyevent, 10),
      },
      output: path.resolve(opts.output),
      seed: opts.seed != null ? parseInt(opts.seed, 10) : undefined,
    });

    const md = renderMonkeyReport({
      appPackage: result.appPackage,
      events: result.events,
      durationMs: result.durationMs,
      crashes: result.crashes,
      screenshotPath: result.screenshotPath,
      generatedAt: new Date().toISOString(),
      seed: undefined,  // CLI 에서는 result 안에 다시 안 넣음 — opts.seed 로 채우려면 별도
    });

    const filename = `${new Date().toISOString().slice(0, 10)}-monkey.md`;
    const written = await writeReport(path.resolve(opts.output), filename, md);
    console.log(`Report written: ${written}`);

    if (result.crashes.length > 0) process.exit(1);
  });

program
  .command('tour')
  .description('Driven screenshot tour (batch 02)')
  .action(() => {
    console.error('tour: not yet implemented (batch 02)');
    process.exit(2);
  });

program
  .command('init')
  .description('Generate qa.config.example.json (batch 02)')
  .action(() => {
    console.error('init: not yet implemented (batch 02)');
    process.exit(2);
  });

// 진입점 가드 — vitest 가 cli.ts 를 import 시 parseAsync 자동 실행 막기
if (require.main === module) {
  program.parseAsync(process.argv).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { program };  // 테스트용 export
```

### `src/adb/index.ts`

```ts
import { execa } from 'execa';

function withSerial(args: string[], serial?: string): string[] {
  return serial ? ['-s', serial, ...args] : args;
}

export async function adbShell(cmd: string, opts: AdbExecOptions = {}): Promise<string> {
  const { stdout } = await execa('adb', withSerial(['shell', cmd], opts.serial), {
    timeout: opts.timeoutMs,
  });
  return stdout;
}

export async function adbExecOut(cmd: string, opts: AdbExecOptions = {}): Promise<Buffer> {
  const { stdout } = await execa('adb', withSerial(['exec-out', cmd], opts.serial), {
    encoding: null,           // binary
    timeout: opts.timeoutMs,
  });
  return stdout as unknown as Buffer;
}

export async function adbLogcat(args: string[] = ['-d'], opts: AdbExecOptions = {}): Promise<string> {
  const { stdout } = await execa('adb', withSerial(['logcat', ...args], opts.serial), {
    timeout: opts.timeoutMs,
  });
  return stdout;
}

export async function listDevices(): Promise<string[]> {
  const { stdout } = await execa('adb', ['devices']);
  return stdout
    .split('\n')
    .slice(1)
    .filter((line) => line.includes('\tdevice'))
    .map((line) => line.split('\t')[0])
    .filter(Boolean);
}
```

### `src/monkey/run.ts`

```ts
import { execa } from 'execa';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { listDevices, adbExecOut, adbLogcat } from '../adb';
import { extractCrashes } from './crash-detect';
import type { Crash } from './crash-detect';

export async function runMonkey(opts: MonkeyOptions): Promise<MonkeyResult> {
  const devices = await listDevices();
  if (devices.length === 0) {
    throw new Error('No adb device connected. Run `adb devices` to verify.');
  }

  await fs.mkdir(opts.output, { recursive: true });
  await execa('adb', ['logcat', '-c']);  // clear

  const t0 = Date.now();
  const args = [
    'shell', 'monkey',
    '-p', opts.appPackage,
    '--throttle', String(opts.throttle),
    '--pct-touch', String(opts.pcts.touch),
    '--pct-motion', String(opts.pcts.motion),
    '--pct-nav', String(opts.pcts.nav),
    '--pct-syskeys', String(opts.pcts.syskeys),
    '--pct-anyevent', String(opts.pcts.anyevent),
    '-v', String(opts.events),
  ];
  if (opts.seed != null) {
    args.splice(2, 0, '-s', String(opts.seed));
  }

  const monkey = await execa('adb', args, { reject: false });
  const durationMs = Date.now() - t0;

  const logcat = await adbLogcat(['-d']);
  const crashes: Crash[] = extractCrashes(logcat);

  let screenshotPath: string | null = path.join(opts.output, 'last-screen.png');
  try {
    const png = await adbExecOut('screencap -p');
    await fs.writeFile(screenshotPath, png);
  } catch (err) {
    console.warn('screencap failed:', (err as Error).message);
    screenshotPath = null;
  }

  return {
    appPackage: opts.appPackage,
    events: opts.events,
    durationMs,
    monkeyStdout: monkey.stdout,
    monkeyExitCode: monkey.exitCode ?? -1,
    crashes,
    screenshotPath,
  };
}
```

### `src/monkey/crash-detect.ts`

```ts
const PATTERNS: Array<{ regex: RegExp; type: CrashType }> = [
  { regex: /FATAL EXCEPTION/, type: 'FATAL' },
  { regex: /ANR in /, type: 'ANR' },
  { regex: /CRASH:/, type: 'CRASH' },
];

export function extractCrashes(logcatRaw: string): Crash[] {
  const lines = logcatRaw.split('\n');
  const out: Crash[] = [];
  for (let i = 0; i < lines.length; i++) {
    for (const { regex, type } of PATTERNS) {
      if (regex.test(lines[i])) {
        const excerpt = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');
        out.push({ type, excerpt, lineIndex: i });
        break;
      }
    }
  }
  return out;
}
```

### `src/report/monkey-template.ts`

```ts
export function renderMonkeyReport(data: MonkeyReportData): string {
  const lines: string[] = [];
  lines.push(`# Monkey Report — ${data.appPackage}`);
  lines.push('');
  lines.push(`- Generated: ${data.generatedAt}`);
  lines.push(`- Events: ${data.events}`);
  lines.push(`- Duration: ${data.durationMs} ms`);
  lines.push(`- Seed: ${data.seed ?? 'random'}`);
  lines.push(`- Crashes: ${data.crashes.length}`);
  lines.push('');
  lines.push('## Crashes');
  lines.push('');
  if (data.crashes.length === 0) {
    lines.push('No crashes detected. ✅');
  } else {
    for (const c of data.crashes) {
      lines.push(`### ${c.type} (line ${c.lineIndex})`);
      lines.push('');
      lines.push('```');
      lines.push(c.excerpt);
      lines.push('```');
      lines.push('');
    }
  }
  lines.push('');
  lines.push('## Last Screenshot');
  lines.push('');
  if (data.screenshotPath) {
    lines.push(`![last-screen](${data.screenshotPath})`);
  } else {
    lines.push('_screenshot capture failed_');
  }
  return lines.join('\n');
}
```

### `src/report/writer.ts`

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function writeReport(
  outputDir: string,
  filename: string,
  content: string
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });
  const fullPath = path.join(outputDir, filename);
  await fs.writeFile(fullPath, content, 'utf8');
  return fullPath;
}
```

### 루트 `package.json` (수정 — 정확한 diff)

Before:
```json
"workspaces": ["apps/mobile"]
```

After:
```json
"workspaces": ["apps/mobile", "packages/*"]
```

### `packages/mobile-qa-tour/package.json` (신규 본체)

```json
{
  "name": "mobile-qa-tour",
  "version": "0.1.0",
  "description": "Android mobile QA tooling — random monkey + driven screenshot tour",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "mobile-qa-tour": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepare": "npm run build"
  },
  "files": ["dist", "templates", "README.md"],
  "engines": { "node": ">=18" },
  "dependencies": {
    "chalk": "^4.1.2",
    "commander": "^12.1.0",
    "execa": "^5.1.1",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "~5.3.0",
    "vitest": "^3.0.0"
  }
}
```

### `packages/mobile-qa-tour/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "**/__tests__/**", "**/*.test.ts"]
}
```

> 주의: 테스트 파일 (`__tests__`, `*.test.ts`) 은 build 산출물에서 제외. vitest 는 ts-node 처럼 source 직접 실행 — outDir 빌드 불필요.

### `packages/mobile-qa-tour/.gitignore`

```
dist/
node_modules/
qa-output/
*.tsbuildinfo
```

### `packages/mobile-qa-tour/README.md` (outline — 본문은 batch 03/05 에서 정밀화)

- 설치 (모노레포 workspace 사용)
- CLI usage 요약 (monkey / tour / init)
- adb 환경 요구사항 (PATH 또는 ANDROID_HOME)
- 출력 디렉토리 규칙 (`<output>/<date>-monkey.md`, `<output>/last-screen.png`)
- consumer 통합 (batch 04 참조)

---

## 테스트 전략

### 도구

- **vitest 3.x** (mobile workspace 와 동일 메이저 — 모노레포 일관성)
- mock 전략: `vi.mock('execa', () => ({ execa: vi.fn() }))` 로 adb 호출 가로채기. `vi.mock('node:fs', { promises: { ... } })` 또는 tmpdir 실제 fs 사용
- snapshot 사용 가능 (markdown 출력 검증)

### 케이스 매트릭스

| 테스트 파일 | 케이스 | 검증 방법 |
|---|---|---|
| `crash-detect.test.ts` | (1) 빈 logcat → `[]` | 직접 비교 |
| | (2) FATAL EXCEPTION 1건 → `[{ type: 'FATAL', lineIndex, excerpt }]` | 필드별 |
| | (3) ANR + CRASH 혼합 → 2건 + type 정합 | 길이 + 매핑 |
| | (4) 같은 라인에 2 패턴 → 1건만 (break 검증) | 길이 |
| | (5) excerpt = 매치 라인 + 후속 9 라인 (총 10 라인) | line count |
| `monkey-template.test.ts` | (1) crashes 0 → `"No crashes detected. ✅"` substring | substring |
| | (2) crashes 2 → `### FATAL` + `### ANR` 출현 | substring |
| | (3) screenshotPath null → `_screenshot capture failed_` | substring |
| | (4) seed undefined → `Seed: random` | substring |
| | (5) snapshot (전체 markdown 형식 회귀 가드) | toMatchSnapshot |
| `writer.test.ts` | (1) 부재 디렉토리 자동 생성 + 파일 작성 | tmpdir + fs.readFile |
| | (2) 반환값 = absolute path | path.isAbsolute |
| `adb/index.test.ts` | (1) `adbShell('ls')` → execa called with `['adb', 'shell', 'ls']` | mock.calls |
| | (2) `adbExecOut('screencap')` → encoding: null 옵션 | mock.calls[0][2] |
| | (3) `listDevices()` 가 `\tdevice` 라인만 추출 | fixture stdout |
| | (4) serial 옵션 → `-s <serial>` prefix | mock.calls 인자 |
| `monkey/run.test.ts` | (1) device 0대 → throw "No adb device" | toThrow |
| | (2) 정상 흐름 → logcat -c → monkey shell → logcat -d → screencap → return MonkeyResult | execa.mock.calls 순서 + 반환값 |
| | (3) seed 지정 → monkey args 안에 `-s <seed>` 포함 | mock.calls[N][1] |
| | (4) screencap 실패 → screenshotPath: null + console.warn | spy |
| | (5) crashes 검출 시 result.crashes.length > 0 | fixture logcat 주입 |
| `cli.test.ts` | (1) `--help` → exit 0 + stdout 에 `monkey`, `tour`, `init` 포함 | program.parseAsync + stdout capture |
| | (2) `monkey --help` → option 목록 노출 | substring |
| | (3) `tour` → exit 2 + stderr `not yet implemented` | exitCode |

### 실측 smoke (CI 외 — 개발자 수동)

- emulator 1대 + jajang 설치 후 `npx mobile-qa-tour monkey --package com.jajang.app --events 100 --output ./qa-output` → `qa-output/<date>-monkey.md` + `last-screen.png` 생성 확인 (수용 기준 REQ-009 가 이 절차)

---

## 결정 근거

### A. 왜 commander v12 (vs cac vs yargs)?

- **commander**: Node CLI 표준, weekly downloads 200M+. `Command` 클래스 + `requiredOption` / `option` 체이닝 + 자동 `--help` 생성. v12 는 stable LTS — v14 는 너무 최신 (의존 conflict 위험)
- **cac**: 작지만 (~5KB) commander 만큼 mature 하지 않음. 자동 help 포맷이 약함
- **yargs**: middleware 강력하지만 **builder DSL 의 type 추론이 약하고** v17+ ESM 강제 — 본 패키지 CJS 라 friction
→ commander 채택

### B. 왜 execa v5 (vs child_process vs zx)?

- **child_process**: stdlib 이지만 promise 래핑 / argv quoting / cross-platform shell 차이 직접 처리해야 함
- **execa v6+**: ESM only — 본 패키지 CJS 라 require 불가
- **execa v5.1.1**: 마지막 CJS 라인. `import { execa } from 'execa'` 패턴 동일. encoding: null 로 binary 캡처 가능 (screencap)
- **zx**: shell 스크립트 스타일 — 본 패키지 (라이브러리) 가 아닌 ad-hoc script 용
→ execa v5 채택

### C. 왜 module=commonjs (vs ESM/NodeNext)?

system-design §2 는 NodeNext 명시했으나 *bin entry point + 외부 consumer (jajang mobile) 의 require / npm script* 호환을 위해 **commonjs 가 우위**:
- NodeNext / ESM 시 모든 import 에 `.js` 확장자 명시 필요 (TypeScript 인지부조화)
- ESM 패키지를 require 하는 consumer 가 ERR_REQUIRE_ESM
- bin 의 `#!/usr/bin/env node` + CJS 가 가장 호환적

execa v5 / chalk v4 가 CJS 라인이라 일관성도 ✅. 본 결정으로 system-design §2 와 약간 다름 — system-design 은 권고였고 본 impl 의 implementation-level 결정이 우선. 후속 batch 도 동일 (commonjs).

### D. 왜 report 템플릿 = literal 인터폴레이션 (vs handlebars / mustache)?

- handlebars / mustache 는 외부 의존 + runtime cost
- 리포트는 정형 markdown (이벤트 5~6 필드 + crashes 배열) — `lines.push(...)` 방식이 type 안전 + 의존 0
- 후속 (batch 03 tour 리포트) 도 동일 방식 채택 → 일관성
→ literal 채택

### E. 왜 monkey 의 `reject: false`?

monkey 가 crash 발견 시 non-zero exit code 반환. exec 자체 reject 면 logcat 분석 단계 진입 불가. stdout 만 캡처 + crash 검출은 logcat 이 정답.

### F. 왜 tour/init 은 stub?

Story 1 scope = monkey 만. CLI 디스패치만 미리 박아두면 batch 02 가 stub 자리에 핸들러 넣음 (구조 0 비용 변경). exit 2 = "command unimplemented" 관용 (POSIX 적합).

---

## 다른 모듈과의 경계

- **batch 02 (config + entry-steps)**: 본 batch 의 `cli.ts` 의 `tour` / `init` stub 가 hand-off 지점. batch 02 가 stub action 을 실제 핸들러로 교체. `src/index.ts` barrel 도 batch 02 가 `runTour`, `loadConfig` 추가
- **batch 03 (heuristics + tour-template)**: `src/report/writer.ts` 가 본 batch 산출물 — 그대로 재사용 (monkey/tour 공통)
- **batch 04 (jajang consumer)**: 루트 `workspaces` 에 `packages/*` 가 본 batch 에서 추가되지 않으면 `apps/mobile` 의 `npm install` 시 `mobile-qa-tour` 못 찾음 — 본 batch 필수 변경
- **adb 의존**: PATH 또는 `ANDROID_HOME` 필요. README 명시 + `runMonkey` 진입 시 `listDevices()` 가 0대면 친절 에러 throw
- **다른 모듈 부재 시 graceful**: 본 패키지는 standalone — 의존 모듈 부재 영향 없음. consumer (jajang) 부재 시도 패키지 자체 build/test 는 동작 (test 가 jajang 무관)
- **역방향 cascade 없음**: 본 패키지가 jajang 을 import 하지 않음. consumer 무관 보장 (수용 기준 REQ-010 grep 으로 검증)

---

## 주의사항

- **DB 영향도**: 영향 없음 (본 패키지는 클라이언트 측 QA 툴링, DB 직접 접근 X)
- **Breaking change**: 루트 `package.json` workspaces 확장 — `apps/mobile` 만 있던 곳에 `packages/*` 추가. 기존 `apps/mobile` 의 npm install 동작 변화는 없음 (workspace name conflict 없음 — `mobile-qa-tour` 신규 이름). 영향 받는 파일: 없음
- **CLI binary 권한**: `dist/cli.js` 가 `#!/usr/bin/env node` shebang 을 포함. tsc 가 shebang 보존 — TypeScript 5.x 부터 지원. 의심 시 빌드 후 `head -1 dist/cli.js` 로 확인
- **vitest + ts source**: tsconfig 에서 테스트 파일 exclude. vitest 는 ts source 직접 실행 (별도 빌드 불필요). build 명령은 production dist 용
- **chalk v4 import**: `import chalk from 'chalk'` (default export). 본 batch 에선 chalk 실 사용 처는 없음 (cli.ts 의 `console.error` 는 plain). chalk 는 향후 batch 02+ 에서 색상 출력에 사용 — dependency 등록만
- **execa v5 의 stdout 타입**: `encoding: null` 시 stdout 은 Buffer 인데 `execa` v5 type 이 `string | Buffer` union. `as unknown as Buffer` cast 필요 (의사코드에 명시)
- **상태 초기화 순서**: `runMonkey` 진입 시 (1) device check (2) outputDir 생성 (3) `logcat -c` (4) monkey 실행 (5) `logcat -d` (6) screencap. screencap 실패는 throw 안 하고 warn — 리포트 자체는 생성되어야 함

---

## 수용 기준

| ID | 내용 | 검증 | 통과 조건 |
|---|---|---|---|
| REQ-001 | `extractCrashes` 가 빈 logcat 에서 `[]` 반환 | (TEST) `crash-detect.test.ts` | toEqual([]) |
| REQ-002 | `extractCrashes` 가 FATAL/ANR/CRASH 3종 패턴을 정확히 분류 | (TEST) `crash-detect.test.ts` | type 배열 ['FATAL','ANR','CRASH'] |
| REQ-003 | `extractCrashes` 의 excerpt = 매치 라인 + 최대 9 후속 라인 (총 10) | (TEST) `crash-detect.test.ts` | excerpt.split('\\n').length ≤ 10 |
| REQ-004 | `renderMonkeyReport` 가 crashes 0 일 때 `No crashes detected.` 포함 | (TEST) `monkey-template.test.ts` | toContain |
| REQ-005 | `renderMonkeyReport` markdown snapshot 회귀 가드 | (TEST) `monkey-template.test.ts` | toMatchSnapshot |
| REQ-006 | `writeReport` 가 부재 디렉토리 자동 생성 후 파일 작성 + absolute path 반환 | (TEST) `writer.test.ts` | fs.readFile 검증 + path.isAbsolute |
| REQ-007 | `adbShell` / `adbExecOut` / `adbLogcat` / `listDevices` 가 정확한 execa 인자로 호출 | (TEST) `adb/index.test.ts` | execa.mock.calls 정합 |
| REQ-008 | `runMonkey` 가 device 0대 시 친절 에러 throw | (TEST) `monkey/run.test.ts` | toThrow(/No adb device/) |
| REQ-009 | `runMonkey` 정상 흐름 — adb 호출 순서 (logcat -c → monkey → logcat -d → screencap) | (TEST) `monkey/run.test.ts` | execa.mock.calls[i][1] sequence |
| REQ-010 | 패키지 코드 안에 jajang 특정 문자열 (`com.jajang`, `S10`, `jajang`) 0 occurrence | (TEST) `vitest` 안에서 `fs.readdir` recursive + 텍스트 grep, 또는 별도 npm script `grep -r "com.jajang\|S10" src/` | grep exit 1 (no match) |
| REQ-011 | `cd packages/mobile-qa-tour && npm install && npm run build` 성공 | (MANUAL) build smoke (adb 무관) | exit 0 + `dist/cli.js` 존재 |
| REQ-012 | `node packages/mobile-qa-tour/dist/cli.js --help` 가 monkey/tour/init 목록 노출 | (MANUAL) build 후 직접 실행 (`npx` 는 workspace bin link 후 가능) | stdout 에 3 서브커맨드 |
| REQ-013 | 루트 `package.json.workspaces` 에 `packages/*` 추가 + `npm install` 후 `apps/mobile/node_modules/mobile-qa-tour` symlink 존재 | (MANUAL) (workspaces 동작은 자동 검증 어려움 — npm 자체 동작 확인) | symlink 존재 OR `node_modules/mobile-qa-tour` 디렉토리 존재 |
| REQ-014 | (실측 smoke — emulator 필요) `mobile-qa-tour monkey --package com.jajang.app --events 100 --output ./qa-output` 실행 후 `<date>-monkey.md` + `last-screen.png` 생성 | (MANUAL) emulator + jajang 설치 필요해서 자동화 불가 | 두 파일 존재 + 리포트 안에 `Events: 100` |
| REQ-015 | `cli.ts` 의 `tour` / `init` stub 가 exit code 2 + stderr `not yet implemented` 출력 | (TEST) `cli.test.ts` | exitCode === 2 |

---

## 결론

본 모듈 plan 은 system-design §1~§5 와 정합하면서 (a) 외부 라이브러리 4종 (`commander@^12`, `zod@^3.23`, `execa@^5.1.1`, `chalk@^4.1.2`) 의 실존 + CJS 호환 버전을 npm 으로 검증 완료, (b) 모든 export API 의 TypeScript signature + null 케이스 (`screenshotPath: string | null`) 명시, (c) `module=commonjs` 결정을 system-design §2 의 NodeNext 권고와 다르게 채택한 근거를 §결정 근거 §C 에 박았다. 테스트는 vitest 3.x (mobile workspace 와 모노레포 일관성) + execa/fs mock 전략으로 6 파일 + 21+ 케이스 → test-engineer 가 즉시 작성 가능. 수용 기준 15 행 (TEST 9 / MANUAL 4 / SNAPSHOT 1 포함) 모두 통과 조건 명시. 모듈은 standalone — 의존 부재 시도 build/test 동작, 역방향 cascade 없음, consumer 코드 누설 0 (REQ-010 grep). batch 02 / 03 / 04 가 의존할 export 면(`runMonkey`, `extractCrashes`, `writeReport`, `src/adb/*`, `src/index.ts` barrel) 모두 본 batch 에서 확정.

READY_FOR_IMPL
