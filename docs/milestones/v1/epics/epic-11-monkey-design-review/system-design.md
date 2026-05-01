# Epic 11 System Design — `mobile-qa-tour` Package + Jajang Integration

> Standalone npm 패키지로 캡슐화된 Android 모바일 QA 툴링. Track A (random monkey crash hunting) + Track B (driven screenshot tour for LLM design review) 두 트랙을 consumer-agnostic 하게 제공. jajang 은 최초 consumer.

---

## 1. 구성 요소

### 1.1 패키지 내부 모듈 (재사용 영역)

| 모듈 | 책임 | 주요 export |
|---|---|---|
| `cli` | commander 기반 CLI 진입점 + 서브커맨드 dispatch | `bin: mobile-qa-tour` |
| `config` | `qa.config.json` zod 스키마 + 로더 + 검증 에러 | `loadConfig`, `QaConfigSchema` |
| `adb` | adb 명령 wrapper (shell / exec-out / logcat / devices) | `adbShell`, `adbExecOut`, `adbLogcat` |
| `monkey` | random monkey 실행 + 결과 파싱 + crash/ANR 추출 | `runMonkey`, `extractCrashes` |
| `tour/runner` | screen-registry 순회 + 진입 / settle / 캡처 / 휴리스틱 | `runTour` |
| `tour/entry-steps` | 진입 스텝 7종 실행기 (tap / tapTestId / inputText / keyevent / permissionGrant / deepLink / wait) | `executeSteps` |
| `tour/uiautomator` | uiautomator dump XML 파싱 → bounds / text / class 추출 | `dumpUi`, `parseUi` |
| `heuristics` | 텍스트 잘림 / 터치 타겟 < 44dp 등 자동 검출 | `runHeuristics` |
| `report` | markdown 리포트 템플릿 + writer | `writeMonkeyReport`, `writeTourReport` |
| `pencil/adapter` | (optional) Pencil 슬롯 placeholder 생성 — 실제 캡처는 메인 Claude | `preparePencilSlot` |

### 1.2 Consumer 측 자산 (jajang specifics)

| 파일 | 책임 |
|---|---|
| `apps/mobile/qa.config.json` | jajang 의 appPackage / outputDir / 화면 목록 / Pencil 매핑 |
| `apps/mobile/screen-registry.json` | jajang 7 화면의 entrySteps + settleMs + testID 매핑 (qa.config.json 안에 inline 도 가능) |
| `apps/mobile/package.json` 의 `scripts.qa:*` | `npm run qa:monkey` / `qa:tour` / `qa:init` |
| `docs/ux-flow.md` | 메인 Claude 가 LLM 검수 시 read 하는 spec ref (패키지 미참조) |
| `docs/qa/` | 리포트 출력 디렉토리 |
| `design/jajang.pen` (Pencil) | S10 reference 캔버스 (메인 Claude 가 MCP 로 read) |

---

## 2. 패키지 디렉토리 구조

```
packages/mobile-qa-tour/
├── package.json                  # name, version, bin, deps
├── tsconfig.json                 # strict, NodeNext
├── README.md                     # 설치 / CLI / config 스키마
├── .gitignore                    # dist/, node_modules/
├── src/
│   ├── cli.ts                    # commander root (monkey/tour/init dispatch)
│   ├── index.ts                  # programmatic API export
│   ├── config/
│   │   ├── schema.ts             # zod schema (QaConfigSchema, ScreenSchema, ...)
│   │   └── load.ts               # loadConfig (file read + validate + 친절 에러)
│   ├── adb/
│   │   └── index.ts              # adbShell, adbExecOut, adbLogcat, listDevices
│   ├── monkey/
│   │   ├── run.ts                # runMonkey (events / throttle / pct-* 인자)
│   │   └── crash-detect.ts       # logcat grep FATAL|ANR|CRASH
│   ├── tour/
│   │   ├── runner.ts             # runTour (screen 배열 순회)
│   │   ├── entry-steps.ts        # executeSteps (7 step types)
│   │   └── uiautomator.ts        # dumpUi, parseUi (XML)
│   ├── heuristics/
│   │   ├── index.ts              # runHeuristics 진입점
│   │   ├── text-truncation.ts    # text width vs container width
│   │   └── touch-target.ts       # bounds < 44dp flag
│   ├── report/
│   │   ├── monkey-template.ts    # monkey 리포트 markdown
│   │   ├── tour-template.ts      # per-screen 리포트 + LLM 슬롯
│   │   └── writer.ts             # output 디렉토리 + 파일명 규칙
│   └── pencil/
│       └── adapter.ts            # (optional) Pencil 슬롯 placeholder
├── templates/
│   ├── qa.config.example.json    # init 명령으로 복사
│   └── screen-registry.example.json
└── dist/                         # build 산출물 (gitignored)
```

루트 모노레포 (`/Users/dc.kim/project/jajang/`):
```
├── apps/
│   ├── api/
│   └── mobile/
│       ├── qa.config.json        # consumer 측 진입점
│       ├── screen-registry.json  # 또는 qa.config.json 안에 inline
│       └── package.json          # scripts.qa:* + devDeps mobile-qa-tour
├── packages/
│   └── mobile-qa-tour/           # 본 패키지
├── docs/
│   └── qa/                       # 리포트 누적 + README.md (운영 SOP)
└── package.json                  # workspaces: ["apps/*", "packages/*"]
```

---

## 3. 자료 흐름

### 3.1 Track A — Monkey

```
[CLI: mobile-qa-tour monkey --package <pkg> --events <N>]
   │
   ├─→ adb.listDevices() → device 1대 이상 + <pkg> 설치 확인
   ├─→ adb.logcat -c (clear)
   ├─→ adb.shell monkey -p <pkg> --throttle 200 --pct-* -v <N>
   │     │
   │     └─→ stdout/stderr 캡처 (events seed / 통과/실패)
   │
   ├─→ adb.logcat -d | grep -E "FATAL|ANR|CRASH" → crashes[]
   ├─→ adb.exec-out screencap -p > <output>/last-screen.png
   │
   └─→ writeMonkeyReport(output, { events, crashes, screenshotPath })
         → <output>/<date>-monkey.md
```

**입력**: appPackage (CLI arg), events (CLI arg), outputDir (CLI arg, default `./qa-output`).
**출력**: markdown 리포트 + 마지막 screenshot.

### 3.2 Track B — Tour

```
[CLI: mobile-qa-tour tour --config <path>]
   │
   ├─→ loadConfig(<path>) → { appPackage, outputDir, screens[], pencil? }
   ├─→ adb.listDevices() + 패키지 설치 확인
   │
   └─→ for each screen in config.screens:
         │
         ├─→ executeSteps(screen.entrySteps)
         │     ├─ tap / tapTestId / inputText / keyevent / permissionGrant / deepLink / wait
         │     └─ tapTestId: dumpUi → resource-id 매칭 → bounds 중앙 좌표 → adb.shell input tap X Y
         │
         ├─→ wait(screen.settleMs)
         ├─→ adb.exec-out screencap -p > <output>/<screenId>.png
         ├─→ dumpUi → parseUi → uiHierarchy
         ├─→ runHeuristics(uiHierarchy) → { textTruncations[], smallTouchTargets[] }
         ├─→ (optional) preparePencilSlot(screen, config.pencil) → pencilSlotPlaceholder
         │
         └─→ writeTourReport(output, screen, {
                screenshotPath, heuristics, pencilSlot, uxFlowAnchor: config.uxFlowAnchor
             })
                → <output>/<date>-tour/<screenId>.md
                  (LLM 검수 슬롯은 <!-- LLM REVIEW HERE --> 주석으로 비워둠)
```

**입력**: `qa.config.json` (consumer 작성).
**출력**: per-screen markdown (LLM 검수 슬롯 포함) + screenshot + uiautomator XML.

**메인 Claude 후속 step** (패키지 외부):
1. tour 종료 후 `docs/qa/<date>-tour/<screenId>.md` 의 LLM 슬롯 채우기:
   - screenshot Read (멀티모달)
   - `docs/ux-flow.md` §<screenId> read
   - (S10) `mcp__pencil__get_screenshot(<nodeIds>)` 로 reference 캡처 → 슬롯에 첨부
   - 텍스트 / 레이아웃 / 색상 / 잘림 비교 결과 작성

---

## 4. 외부 의존

| 의존 | 형태 | 필수성 |
|---|---|---|
| `adb` (Android Platform Tools) | CLI, PATH 또는 `ANDROID_HOME` | ✅ 필수 |
| Android Emulator (또는 실기기) | running, `adb devices` 1대 이상 | ✅ 필수 |
| `uiautomator` | adb shell 내장 (Android API 18+) | ✅ 필수 |
| `commander`, `zod`, `execa`, `chalk`, `xml2js` | npm | ✅ 필수 |
| Pencil MCP (`mcp__pencil__*`) | 메인 Claude 컨텍스트 only | optional (S10 한정) |
| Claude 멀티모달 | 메인 Claude (패키지 외부) | optional (LLM 검수 단계) |
| GitHub MCP (`mcp__github__*`) | 메인 Claude (issue 등록) | optional (P0/P1 issue 등록 단계) |

**중요**: Pencil MCP / Claude 멀티모달 / GitHub MCP 는 *패키지 코드에서 직접 호출 불가*. 모두 메인 Claude 컨텍스트 안에서만 가능. 패키지는 슬롯 / placeholder / 안내 메시지만 제공.

---

## 5. 인터페이스

### 5.1 CLI 사양

```
mobile-qa-tour --help
mobile-qa-tour --version

mobile-qa-tour init [--out <dir>]
  # consumer 디렉토리에 qa.config.example.json + screen-registry.example.json 복사

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

mobile-qa-tour tour
  --config <qa.config.json>      # required
  --output <dir>                 # override config.outputDir
  --only <screenId>              # optional, single screen
  --skip-uiautomator             # optional, fast mode
  --skip-heuristics              # optional
```

### 5.2 `qa.config.json` 스키마 (zod)

```ts
const QaConfigSchema = z.object({
  appPackage: z.string(),                        // "com.jajang.app"
  outputDir: z.string().default('./qa-output'),  // "docs/qa"
  uxFlowAnchor: z.string().optional(),           // "docs/ux-flow.md"
  screens: z.array(ScreenSchema),                // 또는 screenRegistryPath 로 참조
  screenRegistryPath: z.string().optional(),
  pencil: z.object({
    enabled: z.boolean().default(false),
    documentPath: z.string().optional(),         // "/path/to/jajang.pen"
    nodeIds: z.record(z.string(), z.array(z.string())).optional(),
    // { "S10": ["llTp1", "r97aM"] }
  }).optional(),
});

const ScreenSchema = z.object({
  id: z.string(),                                // "S10"
  label: z.string().optional(),                  // "Record"
  entrySteps: z.array(EntryStepSchema),
  settleMs: z.number().default(2000),
  pencilNodeIds: z.array(z.string()).optional(), // 화면 단위 매핑 (config.pencil.nodeIds 와 양립)
});

const EntryStepSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tap'), x: z.number(), y: z.number() }),
  z.object({ type: z.literal('tapTestId'), testId: z.string() }),
  z.object({ type: z.literal('inputText'), text: z.string() }),
  z.object({ type: z.literal('keyevent'), code: z.union([z.string(), z.number()]) }),
  z.object({ type: z.literal('permissionGrant'), permission: z.string() }),
  z.object({ type: z.literal('deepLink'), uri: z.string() }),
  z.object({ type: z.literal('wait'), ms: z.number() }),
]);
```

### 5.3 `screen-registry.json` 스키마

`qa.config.json` 의 `screens` 와 동일 (별도 파일로 분리할 때만 사용). 위 `ScreenSchema` 배열.

### 5.4 패키지 export API (programmatic)

```ts
// packages/mobile-qa-tour/src/index.ts
export { runMonkey } from './monkey/run';
export { runTour } from './tour/runner';
export { loadConfig, QaConfigSchema } from './config/load';
export { runHeuristics } from './heuristics';
export type { QaConfig, Screen, EntryStep } from './config/schema';

// 사용 예 (Node.js script):
import { runTour, loadConfig } from 'mobile-qa-tour';
const config = await loadConfig('./qa.config.json');
const result = await runTour(config, { only: 'S10' });
```

---

## 6. 위험 / 한계

| 위험 | 완화 |
|---|---|
| **testID 부재** (jajang 82 / 19 screens) | 좌표 fallback 명시 + screen-registry 에 해상도 주석 + epic-12 후보로 testID 확대 분리 |
| **해상도 의존성** | 좌표 기반 fallback 은 1080×1920 기준 — 다른 해상도 시 테스트 실패. testID 우선 권장 + 운영 SOP 에 emulator 해상도 고정 명시 |
| **Pencil 미매핑 화면** | S10 외 6 화면은 Pencil ref 없음. ux-flow.md 문서 비교만 가능 (정확도 낮음). epic-16 후보로 매핑 확장 |
| **시각 검수 정확도** | LLM 멀티모달은 1px 정렬 / 한글 자간 / 미세 색조 차이 놓침. P0 (crash, broken layout, 큰 텍스트 잘림) 위주 검출. 운영 SOP 에 한계 명시 |
| **Destructive flow** | 계정 삭제 / 결제 / 외부 API 호출 등 destructive 화면은 entrySteps 마지막 단계 차단 + smoke only 라벨 |
| **iOS scope 외** | adb 의존이라 iOS 시뮬레이터 동작 불가. epic-15 후보 (`xcrun simctl` wrapper) |
| **30초 녹음 필요 화면** (Preview/Generating/Play) | 본 epic 에서 skip. deep-link 또는 mock 인프라 후속 |
| **패키지 semver 안정화 비용** | 0.x 기간엔 breaking change 자유. 1.0.0 도달 시 semver 엄격 + epic-13 (별도 레포 + npm publish) 분리 |
| **모노레포 workspaces 호환** | jajang 가 npm / pnpm / yarn 중 어느 것 쓰는지 확인 후 정합. 기존 root `package.json` 검토 필요 |
| **휴리스틱 false positive** | 텍스트 잘림 / 터치 타겟 검사는 컨테이너 폭 추출이 100% 정확하지 않음. 운영 시 메인 Claude 가 시각 재확인 필수 |

---

## 7. 운영 절차 (manual SOP)

### 7.1 PR merge 전 (consumer 측)

1. emulator 부팅 + jajang 앱 설치 (`npx expo run:android`)
2. `npm run qa:monkey` — 1000 events crash 0 확인
3. `npm run qa:tour` — 6 화면 (S11 제외) screenshot + 휴리스틱
4. (메인 Claude) `docs/qa/<date>-tour/*.md` 의 LLM 슬롯 채우기:
   - screenshot Read
   - `docs/ux-flow.md` §<screenId> read 후 비교
   - (S10) `mcp__pencil__get_screenshot` 호출 → 슬롯 첨부
   - P0/P1 issue 발견 시 `mcp__github__create_issue` (label: `bug` 또는 `design`)
5. 리포트 git commit + PR 첨부

### 7.2 마일스톤 종료 시

1. 7 화면 풀 tour + LLM 검수
2. P0/P1/P2/P3 issue 정리 + 다음 마일스톤 backlog 반영
3. 후속 epic 후보 (theme drift fix / Pencil 매핑 확장 등) 등록

---

## 8. 후속 epic 후보

| ID (가칭) | 제목 | 트리거 |
|---|---|---|
| epic-12 | Theme drift fix (직접 hex → theme token 마이그레이션) | drift 89% 정정. tour 휴리스틱이 색상 검출 정확도 올려준 후 |
| epic-13 | `mobile-qa-tour` 별도 레포 분리 + npm publish | semver 1.0.0 안정화 후 (외부 사용자 발생 시점) |
| epic-14 | QA tour CI 자동화 (GitHub Actions) | PR merge 전 자동 실행 + 리포트 PR 코멘트 |
| epic-15 | iOS 시뮬레이터 지원 (`xcrun simctl` wrapper) | iOS QA 필요 시점 (TestFlight 배포 직전) |
| epic-16 | Pencil 노드 매핑 확장 (S10 외 6 화면) | 디자인 폴리시 마무리 단계 (1~2주 작업) |
| epic-17 | Deep-link 인프라 + Preview/Generating/Play 화면 tour 포함 | 30초 녹음 우회 mock + deep-link 추가 후 |
| epic-18 | testID 확대 (82 → 19 screens × 5+ avg) | tour 좌표 fallback 의존 제거 |

---

## 결론

본 design 은 plan 의 Track A/B/한계를 모두 보존하면서 *재사용 가능한 standalone npm 패키지* 로 캡슐화하고, jajang 을 최초 consumer 로 통합한다. 패키지 (consumer-agnostic) ↔ consumer (jajang specifics) 책임 경계는 §1.1, §1.2 표로 강제된다. 인터페이스 (§5) 는 CLI 사양 + zod schema + programmatic API 3 면을 모두 노출해 추후 다른 모노레포에서도 그대로 사용 가능. 위험 (§6) 은 testID 부재 / Pencil 미매핑 / iOS scope 외 등 plan 의 한계를 명시 인계. 후속 epic (§8) 7건이 backlog 추적 대상.

SYSTEM_DESIGN_READY
