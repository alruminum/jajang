# mobile-qa-tour

Android mobile QA tooling — random monkey testing + driven screenshot tour.

## Installation (monorepo workspace)

```bash
# From monorepo root
npm install

# Or install in consumer workspace
npm install mobile-qa-tour --workspace apps/mobile
```

## Requirements

- Node >= 18
- `adb` in PATH (or set `ANDROID_HOME`)
- Android device or emulator connected (`adb devices` shows at least one)

## CLI Usage

### monkey — Random event injection + crash detection

```bash
npx mobile-qa-tour monkey \
  --package com.example.app \
  --events 1000 \
  --throttle 200 \
  --pct-touch 60 \
  --pct-motion 20 \
  --pct-nav 10 \
  --pct-syskeys 5 \
  --pct-anyevent 5 \
  --output ./qa-output \
  --seed 42
```

**Options:**

| Option | Default | Description |
|---|---|---|
| `--package <pkg>` | required | App package id (e.g. `com.example.app`) |
| `--events <n>` | `1000` | Number of random events to inject |
| `--throttle <ms>` | `200` | Milliseconds between events |
| `--pct-touch <n>` | `60` | Touch event percentage (0–100) |
| `--pct-motion <n>` | `20` | Motion event percentage (0–100) |
| `--pct-nav <n>` | `10` | Navigation event percentage (0–100) |
| `--pct-syskeys <n>` | `5` | System key event percentage (0–100) |
| `--pct-anyevent <n>` | `5` | Any other event percentage (0–100) |
| `--output <dir>` | `./qa-output` | Output directory for report + screenshot |
| `--seed <n>` | (random) | Fixed random seed for reproducibility |

**Output:**
- `<output>/<date>-monkey.md` — markdown crash report
- `<output>/last-screen.png` — screenshot at end of run (or after crash)

### tour — Driven screenshot tour

```bash
npx mobile-qa-tour tour  # not yet implemented (batch 02)
```

### init — Generate config template

```bash
npx mobile-qa-tour init  # not yet implemented (batch 02)
```

## Programmatic API

```ts
import { runMonkey, extractCrashes, renderMonkeyReport, writeReport } from 'mobile-qa-tour';

const result = await runMonkey({
  appPackage: 'com.example.app',
  events: 500,
  throttle: 200,
  pcts: { touch: 60, motion: 20, nav: 10, syskeys: 5, anyevent: 5 },
  output: './qa-output',
});

const md = renderMonkeyReport({
  appPackage: result.appPackage,
  events: result.events,
  durationMs: result.durationMs,
  crashes: result.crashes,
  screenshotPath: result.screenshotPath,
  generatedAt: new Date().toISOString(),
});

await writeReport('./qa-output', '2026-05-01-monkey.md', md);
```

## Config schema

See batch 02 (`init` command) for full `qa.config.json` schema.
