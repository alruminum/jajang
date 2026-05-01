---
depth: std
---

# impl/01 — [Story 1] 패키지 골격 + Track A monkey 모듈 (`mobile-qa-tour` workspace 추가)

**Story:** Story 1 (패키지 골격 + monkey)
**선행 조건:** 없음
**후행 조건:** `npx mobile-qa-tour --help` + `monkey --package <pkg> --events 100` 동작

**context budget:** file edits ≤ 12 / tool uses ≤ 50

---

## 0. 시작 전 환경 확인

```bash
adb --version                                       # adb PATH 확인
adb devices                                         # 1대 이상 (smoke 단계만 — 본 batch 는 dry build OK)
node --version                                      # >= 18
cat /Users/dc.kim/project/jajang/package.json       # 루트 workspaces 현재 상태
```

---

## 생성/수정 파일

### 신규 (패키지 내부)

- `packages/mobile-qa-tour/package.json` — name `mobile-qa-tour`, version `0.1.0`, bin `mobile-qa-tour: ./dist/cli.js`, deps `commander zod execa chalk`, devDeps `typescript @types/node`
- `packages/mobile-qa-tour/tsconfig.json` — strict, target ES2022, module NodeNext, outDir `dist`
- `packages/mobile-qa-tour/.gitignore` — `dist/`, `node_modules/`
- `packages/mobile-qa-tour/README.md` — 설치 / CLI usage / config 스키마 outline (정밀화는 batch 03 / 05 에서)
- `packages/mobile-qa-tour/src/cli.ts` — commander root + `monkey` 서브커맨드 dispatch (tour / init 은 stub — `not implemented` 메시지)
- `packages/mobile-qa-tour/src/adb/index.ts` — `adbShell`, `adbExecOut`, `adbLogcat`, `listDevices` (execa wrapper)
- `packages/mobile-qa-tour/src/monkey/run.ts` — `runMonkey({ appPackage, events, throttle, pcts, output, seed })` → `{ events, lastScreenshotPath }`
- `packages/mobile-qa-tour/src/monkey/crash-detect.ts` — `extractCrashes(logcatRaw): Crash[]`
- `packages/mobile-qa-tour/src/report/monkey-template.ts` — `renderMonkeyReport({ appPackage, events, crashes, screenshotPath, durationMs })`
- `packages/mobile-qa-tour/src/report/writer.ts` — `writeReport(outputDir, filename, content)` + 디렉토리 보장

### 수정

- `package.json` (루트) — `workspaces: ["apps/mobile", "packages/*"]`

---

## 인터페이스

### CLI (commander)

```
mobile-qa-tour --version
mobile-qa-tour --help

mobile-qa-tour monkey
  --package <com.x.app>          # required
  --events <N>                   # default 1000
  --throttle <ms>                # default 200
  --pct-touch <0-100>            # default 60
  --pct-motion <0-100>           # default 20
  --pct-nav <0-100>              # default 10
  --pct-syskeys <0-100>          # default 5
  --pct-anyevent <0-100>         # default 5
  --output <dir>                 # default ./qa-output
  --seed <N>                     # default random
```

### `src/adb/index.ts`

```ts
export async function adbShell(cmd: string): Promise<string>;          // adb shell <cmd> stdout
export async function adbExecOut(cmd: string): Promise<Buffer>;        // adb exec-out (binary stdout)
export async function adbLogcat(args: string[] = ['-d']): Promise<string>;
export async function listDevices(): Promise<string[]>;                // serial 목록
```

### `src/monkey/run.ts`

```ts
export interface MonkeyOptions {
  appPackage: string;
  events: number;
  throttle: number;
  pcts: { touch: number; motion: number; nav: number; syskeys: number; anyevent: number };
  output: string;          // dir
  seed?: number;
}

export interface MonkeyResult {
  appPackage: string;
  events: number;
  durationMs: number;
  monkeyStdout: string;
  crashes: Crash[];        // crash-detect.ts
  screenshotPath: string;  // <output>/last-screen.png
}

export async function runMonkey(opts: MonkeyOptions): Promise<MonkeyResult>;
```

### `src/monkey/crash-detect.ts`

```ts
export interface Crash {
  type: 'FATAL' | 'ANR' | 'CRASH';
  process?: string;
  excerpt: string;        // logcat 1~10 라인
}

export function extractCrashes(logcatRaw: string): Crash[];
```

### `src/report/monkey-template.ts`

```ts
export function renderMonkeyReport(input: {
  appPackage: string;
  events: number;
  crashes: Crash[];
  screenshotPath: string;
  durationMs: number;
  generatedAt: string;
}): string;   // markdown
```

---

## 의사코드

### `src/cli.ts`

```ts
#!/usr/bin/env node
import { Command } from 'commander';
const program = new Command();
program.name('mobile-qa-tour').version('0.1.0');

program.command('monkey')
  .requiredOption('--package <pkg>')
  .option('--events <n>', '', '1000')
  .option('--throttle <ms>', '', '200')
  // ... pct-* 옵션들
  .option('--output <dir>', '', './qa-output')
  .option('--seed <n>')
  .action(async (opts) => {
    const { runMonkey } = await import('./monkey/run');
    const { renderMonkeyReport } = await import('./report/monkey-template');
    const { writeReport } = await import('./report/writer');
    const result = await runMonkey({ appPackage: opts.package, events: +opts.events, ... });
    const md = renderMonkeyReport({ ...result, generatedAt: new Date().toISOString() });
    const filename = `${new Date().toISOString().slice(0,10)}-monkey.md`;
    writeReport(opts.output, filename, md);
    if (result.crashes.length > 0) process.exit(1);
  });

program.command('tour').action(() => {
  console.error('tour: not yet implemented (batch 02-03)');
  process.exit(2);
});
program.command('init').action(() => {
  console.error('init: not yet implemented (batch 02)');
  process.exit(2);
});

program.parseAsync();
```

### `src/monkey/run.ts`

```ts
async function runMonkey(opts) {
  const devices = await listDevices();
  if (devices.length === 0) throw new Error('No adb device connected');

  await fs.mkdir(opts.output, { recursive: true });
  await execa('adb', ['logcat', '-c']);

  const t0 = Date.now();
  const args = [
    'shell', 'monkey',
    '-p', opts.appPackage,
    '--throttle', String(opts.throttle),
    '--pct-touch', String(opts.pcts.touch),
    // ... 나머지 pct-*
    '-v', String(opts.events),
  ];
  if (opts.seed != null) args.push('-s', String(opts.seed));
  const { stdout } = await execa('adb', args, { reject: false });
  const durationMs = Date.now() - t0;

  const logcat = await adbLogcat(['-d']);
  const crashes = extractCrashes(logcat);

  const screenshotPath = path.join(opts.output, 'last-screen.png');
  const png = await adbExecOut('screencap -p');
  await fs.writeFile(screenshotPath, png);

  return { appPackage: opts.appPackage, events: opts.events, durationMs, monkeyStdout: stdout, crashes, screenshotPath };
}
```

### `src/monkey/crash-detect.ts`

```ts
export function extractCrashes(raw: string): Crash[] {
  const lines = raw.split('\n');
  const out: Crash[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/(FATAL EXCEPTION|ANR in|CRASH:)/);
    if (!m) continue;
    const type = m[1].startsWith('FATAL') ? 'FATAL' : m[1].startsWith('ANR') ? 'ANR' : 'CRASH';
    const excerpt = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');
    out.push({ type, excerpt });
  }
  return out;
}
```

### `src/adb/index.ts` (execa)

```ts
import { execa } from 'execa';

export async function adbShell(cmd: string) {
  const { stdout } = await execa('adb', ['shell', cmd]);
  return stdout;
}
export async function adbExecOut(cmd: string) {
  const { stdout } = await execa('adb', ['exec-out', cmd], { encoding: null });
  return stdout as unknown as Buffer;
}
export async function adbLogcat(args: string[] = ['-d']) {
  const { stdout } = await execa('adb', ['logcat', ...args]);
  return stdout;
}
export async function listDevices() {
  const { stdout } = await execa('adb', ['devices']);
  return stdout.split('\n').slice(1).filter(l => l.includes('\tdevice')).map(l => l.split('\t')[0]);
}
```

### 루트 `package.json` (수정)

```json
{
  "workspaces": ["apps/mobile", "packages/*"]
}
```

---

## 결정 근거

**왜 `execa`?**
Node.js child_process 표준이지만 promise + stderr 통합 + cross-platform argv quoting 안전. `commander` 와 함께 Node CLI 표준 조합.

**왜 ANR / FATAL / CRASH 3 패턴?**
Android logcat 표준 crash signature. plan §Track A 실측 검증 패턴.

**왜 monkey stdout `reject: false`?**
monkey 가 crash 발생 시 non-zero exit. stdout 캡처 + crash 검출은 logcat 으로 — exec 자체를 reject 하면 분석 단계 진입 불가.

**왜 tour / init 은 stub?**
Story 1 scope = monkey 만. tour / init 진입점은 batch 02 / 03 에서 채움. CLI 디스패치만 미리 박아두면 추후 분기 추가 0 비용.

---

## 다른 모듈과의 경계

- **batch 02 (config + entry-steps)**: 본 batch 의 `cli.ts` 의 `tour` / `init` stub 가 entry point. 02 가 stub 자리에 실제 핸들러 박음.
- **batch 04 (jajang consumer)**: 본 batch 가 npm workspace 추가하지 않으면 `apps/mobile` 의 `npm install` 시 `mobile-qa-tour` 못 찾음. 루트 `workspaces` 갱신 필수.
- **adb 의존성**: PATH 또는 `ANDROID_HOME` 필요. README 에 명시 + CLI 진입 시 `listDevices()` 가 친절 에러 출력.

---

## 수용 기준

- (BUILD) `cd packages/mobile-qa-tour && npm install && npm run build` 성공
- (CLI) `npx mobile-qa-tour --help` → `monkey`, `tour`, `init` 서브커맨드 노출
- (CLI) `npx mobile-qa-tour monkey --help` → 인자 목록 + 기본값
- (실행) emulator 부팅 + jajang 설치 시 `npx mobile-qa-tour monkey --package com.jajang.app --events 100 --output ./qa-output` → `qa-output/<date>-monkey.md` + `last-screen.png` 생성
- (재사용) 패키지 코드 grep `com.jajang` / `S10` → 0 occurrence
- (workspaces) 루트 `npm install` 후 `apps/mobile/node_modules/mobile-qa-tour` symlink 존재
