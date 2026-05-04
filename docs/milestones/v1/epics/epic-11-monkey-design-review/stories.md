# Epic 11 — Mobile QA Tour Package (`mobile-qa-tour`) + Jajang First Consumer

**목표:** Android 에뮬레이터 기반 (a) random monkey crash/ANR hunting + (b) driven screenshot tour LLM 디자인 검수를 *재사용 가능 standalone npm 패키지* (`mobile-qa-tour`) 로 캡슐화하고, jajang 모바일 앱을 **최초 consumer** 로 통합한다.
**선행 조건:** Epic 10 (Mobile Test Finalize) merge 완료 — main 0 failures 상태에서 QA 툴링 추가가 회귀 위험 최소.
**완료 기준:**
1. `packages/mobile-qa-tour/` workspace 가 모노레포에 추가되고 `npx mobile-qa-tour --help` 동작
2. `mobile-qa-tour monkey` 가 jajang 에서 1000 events run 후 markdown 리포트 생성 (crash/ANR 0 검증)
3. `mobile-qa-tour tour` 가 jajang 7 화면 (S06/S07/S09/S10/S11/S16/AccountDeletion) screenshot + 휴리스틱 표 + LLM 검수 슬롯 생성
4. (선택) Pencil MCP adapter 가 S10 reference 캡처 동작
5. backlog.md / CLAUDE.md 갱신
6. out-of-scope 명시 + 후속 epic 후보 등록

**범위 제외 (out-of-scope):**
- iOS 시뮬레이터 지원 (Android only — `adb` 의존)
- Pencil 노드 매핑 확장 (S10 외 화면) — 별도 design 작업 필요
- CI 자동화 (GitHub Actions integration) — 후속 epic
- npm registry publish — 안정화 후 별도 epic
- 픽셀 단위 visual diff — 인프라 부재 (Maestro/Detox/Reg suite 없음)
- theme drift 자동 fix — 검출만, fix 는 별도 epic-12 후보
- 30초 녹음 필요 화면 (Preview/Generating/Play) deep reach — deep-link 인프라 선행 필요

**패키지화 결정 근거:**
- **재사용성**: jajang 외 다른 RN/Expo 앱에서도 동일 monkey + tour 흐름 적용 가능. 코드 중복 회피.
- **consumer-agnostic**: 패키지 자체는 앱 특정 정보 (패키지명·화면 정의·Pencil 매핑) 미포함. consumer 가 `qa.config.json` 으로 주입.
- **모노레포 workspace 우선**: 초기 iteration 비용 낮음 (별도 레포 분리 시 publish/CI/version 관리 부담). 안정화 후 (semver 1.0.0 도달 시) 별도 레포 + npm publish 분리 옵션 열어둠.
- **CLI 형태 (npm + bin)**: jajang 이 RN/Expo 모노레포라 Node.js 생태계 정합 + 풍부한 인자 파싱·config 검증·휴리스틱 표 생성 유리. shell wrapper 보다 npm package 가 의존성 / type 안전성 우위.

**GitHub Epic Issue:** TBD (architect TASK_DECOMPOSE 진입 후 등록)

---

## 패키지화 영역 분리 (Story 작성 전 명시)

| 영역 | 패키지 (재사용) | Consumer (jajang 특정) |
|---|---|---|
| adb wrapper / monkey runner | ✅ | — |
| screencap + uiautomator dump 자동화 | ✅ | — |
| screen-registry.json 스키마 정의 + 검증 | ✅ | — |
| 진입 스텝 실행기 (tap 좌표 / testID / permission grant / deep-link) | ✅ | — |
| uiautomator XML 파싱 → 잘림 / 터치 타겟 휴리스틱 | ✅ | — |
| 리포트 markdown 생성기 (템플릿) | ✅ | — |
| Pencil MCP integration adapter (programmatic) | ✅ (optional 모듈) | — |
| 앱 패키지명 (`com.jajang.app`) | — | ✅ |
| `qa.config.json` 본체 | — | ✅ |
| `screen-registry.json` 본체 (jajang 의 7 화면) | — | ✅ |
| Pencil 캔버스 경로 + node id 매핑 (S10 한정) | — | ✅ |
| `ux-flow.md` spec ref (LLM 분석 시 메인 Claude read) | — | ✅ |
| npm script (`npm run qa:monkey`, `npm run qa:tour`) | — | ✅ |

---

## Story 1 — 패키지 골격 + Track A monkey 모듈

**As a** 모노레포 개발자
**I want** `packages/mobile-qa-tour/` workspace 가 추가되고 `npx mobile-qa-tour monkey --package <pkg> --events <N>` 만으로 random monkey + crash/ANR 추출 + markdown 리포트 생성이 동작하길 원한다
**So that** plan 의 Track A (이미 jajang 에서 검증된 monkey 흐름) 가 *jajang 외 앱에서도* 그대로 재사용 가능하다.

### 근본 동기

plan §Track A 는 이미 `adb shell monkey` 단일 명령 + logcat grep 으로 검증됨. 인프라 추가 0. 이걸 wrapping 한 CLI 가 있으면 다른 앱에서도 같은 보장 (crash 0) 을 1 명령으로 검증 가능.

### 영향 / 신규 파일

- `packages/mobile-qa-tour/package.json` (신규)
  - name: `mobile-qa-tour`, version: `0.1.0`, bin: `{ "mobile-qa-tour": "./dist/cli.js" }`
  - dependencies: `commander`, `zod` (config 검증), `execa` (adb wrapper), `chalk`
  - peerDependencies: 없음 (consumer 무관)
- `packages/mobile-qa-tour/tsconfig.json` (신규) — strict, target ES2022, NodeNext
- `packages/mobile-qa-tour/src/cli.ts` (신규) — commander root + 서브커맨드 dispatch (`monkey` / `tour` / `init`)
- `packages/mobile-qa-tour/src/adb/index.ts` (신규) — `adb` wrapper (`shell`, `exec-out`, `logcat`, `devices`)
- `packages/mobile-qa-tour/src/monkey/run.ts` (신규) — monkey 실행 + 결과 파싱
- `packages/mobile-qa-tour/src/monkey/crash-detect.ts` (신규) — logcat grep `FATAL|ANR|CRASH`
- `packages/mobile-qa-tour/src/report/monkey-template.ts` (신규) — markdown 리포트 템플릿
- `packages/mobile-qa-tour/src/report/writer.ts` (신규) — output 디렉토리 + 파일명 규칙 (`{date}-monkey.md`)
- `packages/mobile-qa-tour/README.md` (신규) — 설치 / CLI usage / config 스키마
- `packages/mobile-qa-tour/.gitignore` (신규) — `dist/`, `node_modules/`
- 루트 `package.json` (수정) — `workspaces: ["apps/*", "packages/*"]` (이미 있다면 확인)
- 루트 `pnpm-workspace.yaml` 또는 npm workspaces 설정 (수정 또는 신규)

### 태스크 체크리스트

- [x] `packages/mobile-qa-tour/` 디렉토리 + 기본 npm package 골격 생성
- [x] 루트 monorepo workspaces 설정 확인 / 갱신 (jajang 가 npm workspaces 인지 pnpm 인지 확인 후 정합)
- [x] commander 기반 CLI bootstrap (`mobile-qa-tour --help` 동작)
- [x] `monkey` 서브커맨드: `--package` / `--events` / `--throttle` / `--output` / `--pct-touch` 등 인자 파싱
- [x] adb wrapper 구현 (device 연결 확인 + 패키지 설치 확인)
- [x] monkey 실행 + stdout / stderr 캡처
- [x] logcat grep 으로 crash/ANR 추출
- [x] 마지막 화면 screencap → output 디렉토리 저장
- [x] markdown 리포트 생성 (crash 0 / N events / 마지막 screenshot 경로)
- [ ] `npx mobile-qa-tour monkey --package com.jajang.app --events 100` 로 smoke 검증 (emulator 필요 — batch 04 에서 검증)

### 수용 기준

- (CLI) `npx mobile-qa-tour --help` → 서브커맨드 목록 출력
- (CLI) `npx mobile-qa-tour monkey --help` → 인자 목록 출력 + 예시
- (실행) jajang 에서 100 events 로 smoke run → markdown 리포트 + screenshot 생성
- (재사용) 다른 RN 앱 패키지명을 인자로 줘도 동작 (적어도 시뮬레이션 / dry-run 검증)
- (의존성) 패키지 내부에 jajang 특정 문자열 (예: `com.jajang`, `S10`) 0 occurrences

---

## Story 2 — Track B tour 모듈 + screen registry 스키마 + 휴리스틱 체커

**As a** QA 자동화 사용자
**I want** `npx mobile-qa-tour tour --config qa.config.json` 만으로 등록된 화면 N 개를 순차 navigate + screencap + uiautomator dump + 휴리스틱 자동 체크 + per-screen markdown slot 리포트 생성이 동작하길 원한다
**So that** plan 의 Track B (driven tour) 가 *consumer 가 화면 정의만 주입하면* 자동 실행되고, LLM 멀티모달 검수 input (screenshot + spec ref + 휴리스틱 표) 이 일관된 형식으로 수집된다.

### 근본 동기

plan §Track B 는 7 화면 × (navigate + screencap + LLM analysis) 흐름. navigate 스크립트 / uiautomator 휴리스틱 / 리포트 템플릿이 *앱 무관* 영역. 이걸 패키지로 묶고 consumer 는 `screens` 배열만 주입하면 즉시 사용 가능.

### 영향 / 신규 파일

- `packages/mobile-qa-tour/src/config/schema.ts` (신규)
  - `qa.config.json` zod 스키마: `appPackage`, `outputDir`, `screens[]`, `pencil?`, `uxFlowAnchor?`
  - `screen-registry` 항목 스키마: `id`, `label`, `entrySteps[]` (각 step: `{ type: 'tap'|'tapTestId'|'inputText'|'keyevent'|'permissionGrant'|'deepLink'|'wait', ... }`), `settleMs`, `pencilNodeIds?`
- `packages/mobile-qa-tour/src/config/load.ts` (신규) — config 파일 read + zod 검증 + 친절한 에러
- `packages/mobile-qa-tour/src/tour/runner.ts` (신규) — 화면 배열 순회 + 진입 / settle / 캡처 / 휴리스틱 / 리포트 슬롯 생성
- `packages/mobile-qa-tour/src/tour/entry-steps.ts` (신규) — 진입 스텝 실행기 (각 type 별 adb 명령 매핑)
- `packages/mobile-qa-tour/src/tour/uiautomator.ts` (신규) — `adb shell uiautomator dump` → XML 파싱 → bounds / text / class 추출
- `packages/mobile-qa-tour/src/heuristics/text-truncation.ts` (신규) — text 노드 width vs container width 비교
- `packages/mobile-qa-tour/src/heuristics/touch-target.ts` (신규) — bounds 의 width × height 가 44dp × 44dp 미만이면 flag
- `packages/mobile-qa-tour/src/heuristics/index.ts` (신규) — 휴리스틱 결과 표 markdown 생성
- `packages/mobile-qa-tour/src/report/tour-template.ts` (신규) — per-screen markdown 템플릿 (LLM 검수 슬롯 포함)
- `packages/mobile-qa-tour/src/cli/init.ts` (신규) — `mobile-qa-tour init` → consumer dir 에 `qa.config.example.json` + `screen-registry.example.json` 생성
- `packages/mobile-qa-tour/src/index.ts` (신규) — programmatic API export (runMonkey, runTour, loadConfig)
- `packages/mobile-qa-tour/templates/qa.config.example.json` (신규)
- `packages/mobile-qa-tour/templates/screen-registry.example.json` (신규)

### 태스크 체크리스트

- [ ] zod 스키마 정의 + unit test (config validation pass / fail 케이스)
- [ ] `tour` 서브커맨드 추가: `--config <path>` / `--output <dir>` / `--only <screenId>` / `--skip-uiautomator`
- [ ] 진입 스텝 실행기 (tap / tapTestId / inputText / keyevent / permissionGrant / deepLink / wait)
- [ ] testID 기반 tap: `uiautomator dump` 에서 `resource-id` 매칭 후 bounds 중앙 좌표 추출
- [ ] uiautomator XML 파서 (xml2js 또는 정규식)
- [ ] 휴리스틱 — 텍스트 잘림 / 터치 타겟 < 44dp / (옵션) 화면 색상 분석은 P3 (LLM 위임)
- [ ] per-screen markdown 슬롯: screenshot 경로 / 휴리스틱 표 / `ux-flow ref` 슬롯 / `pencil ref` 슬롯 (있으면) / `LLM 검수 결과` 슬롯 (메인 Claude 가 채움)
- [ ] `init` 서브커맨드 — 템플릿 복사 + 안내 메시지
- [ ] programmatic API export (Node script 에서 import 가능)
- [ ] consumer 무관 검증 — 가짜 `qa.config.json` (다른 앱 패키지명) 으로 dry-run

### 수용 기준

- (CLI) `npx mobile-qa-tour init` → consumer 디렉토리에 `qa.config.example.json` 생성
- (CLI) `npx mobile-qa-tour tour --config qa.config.json --only <screenId>` → 1 화면 처리
- (스키마) 잘못된 config (예: `entrySteps` 미정의) → zod 친절 에러 + exit 1
- (휴리스틱) 의도된 작은 터치 타겟 화면에서 < 44dp flag 1건 이상 검출
- (재사용) 패키지 코드에 jajang 특정 문자열 0 occurrences

---

## Story 3 — jajang Consumer 통합 (qa.config.json + npm script + 첫 실행 검증)

**As a** jajang 개발자
**I want** jajang 모바일 앱이 `mobile-qa-tour` 의 첫 consumer 로 통합되고 `npm run qa:monkey` / `npm run qa:tour` 만으로 plan §Step 2~4 가 자동 실행되길 원한다
**So that** plan 의 7 화면 (S06/S07/S09/S10/S11/S16/AccountDeletion) tour 결과가 매번 동일 형식으로 `docs/qa/` 에 누적되고 메인 Claude 가 멀티모달 검수만 채우면 된다.

### 근본 동기

패키지 자체는 consumer 무관 — jajang 의 7 화면 정의 / 패키지명 / Pencil 매핑은 jajang 안에 거주. consumer 통합 단계가 별도 Story 로 분리돼야 패키지 / consumer 책임 경계가 강제된다.

### 영향 / 신규 파일

- `apps/mobile/qa.config.json` (신규) — jajang 7 화면 정의 + appPackage `com.jajang.app` + outputDir `docs/qa/` + uxFlowAnchor `docs/ux-flow.md` + (옵션) Pencil 블록
- `apps/mobile/screen-registry.json` (신규) — S06/S07/S09/S10/S11/S16/AccountDeletion 의 entrySteps 정의 (testID 기반 우선, 없으면 좌표 fallback)
- `apps/mobile/package.json` (수정) — `scripts.qa:monkey`, `scripts.qa:tour`, `scripts.qa:init`, devDependencies `mobile-qa-tour: workspace:*`
- `docs/qa/.gitkeep` (신규) — output 디렉토리 placeholder
- `docs/qa/README.md` (신규) — QA 리포트 누적 위치 + 운영 가이드 (PR merge 전 / 마일스톤 종료 시 실행 권장)

### 태스크 체크리스트

- [ ] `qa.config.json` 작성 — 7 화면 정의
  - S06 Home: 시작점 (entrySteps 비어있음, settleMs 2000)
  - S07 SongSelect: tap "자장가 만들기" CTA (testID 또는 좌표)
  - S09 RecordGuide: S07 + tap song
  - S10 Record: S09 + tap CTA + permission grant (RECORD_AUDIO)
  - S11 Preview: S10 + 30초 wait OR mock recording (현실적 선택 — skip + 후속 epic 으로 미루기 권장)
  - S16 Settings: tab "설정"
  - AccountDeletion: S16 + tap "계정 삭제" (smoke only — 실제 호출 차단 표시)
- [ ] `screen-registry.json` 의 testID 매핑 — `apps/mobile/src/screens/S0*.tsx` 의 실제 testID grep 후 정합
- [ ] testID 부재 화면은 좌표 fallback 명시 (해상도 1080×1920 기준 좌표 + 주의)
- [ ] `npm run qa:init` 으로 jajang 디렉토리에 템플릿 첫 생성 검증 (그 후 위 jajang-specific 내용으로 덮어씀)
- [ ] `npm run qa:monkey` 첫 run — 1000 events / crash 0 / 리포트 생성 확인
- [ ] `npm run qa:tour` 첫 run — 6 화면 (S11 제외) screenshot + 휴리스틱 표 생성
- [ ] 메인 Claude 가 LLM 검수 슬롯 채우는 운영 SOP 문서화 (`docs/qa/README.md`)

### 수용 기준

- (실행) jajang 루트에서 `npm run qa:monkey` 성공 + `docs/qa/{date}-monkey.md` 생성 + crash 0
- (실행) `npm run qa:tour` 성공 + `docs/qa/{date}-tour/` 디렉토리에 화면별 screenshot + per-screen markdown
- (휴리스틱) 최소 1 화면에서 휴리스틱 결과 표 0 row 이상 생성
- (재사용 보장) jajang 의 `qa.config.json` 외부에 jajang 특정 정보가 패키지 코드 안에 누설 0
- (운영) `docs/qa/README.md` 에 SOP (PR merge 전 / 마일스톤 종료 시) 명시

---

## Story 4 — Pencil MCP Adapter (S10 reference 캡처, optional)

**As a** S10 디자인 검수 사용자
**I want** `qa.config.json.pencil.enabled = true` 일 때 tour 가 S10 진입 후 Pencil MCP 의 `get_screenshot` 으로 reference 캡처를 함께 수집해 per-screen 리포트의 `pencil ref` 슬롯에 채우길 원한다
**So that** plan §Track B 의 "S10 한정 Pencil 비교" 가 자동화되고 메인 Claude 가 1:1 비교 가능.

### 근본 동기

plan 의 한계 §2 (Pencil 캔버스 미완성, S10 만 매핑) 를 인정한 채로, *매핑된 화면만이라도* 자동 reference 캡처를 패키지에 옵션으로 내장. consumer 는 `pencil.nodeIds` 에 화면 → 노드 ID 매핑만 추가.

### 주의

- Pencil MCP 는 `mcp__pencil__*` 도구로 Claude 컨텍스트 안에서만 호출 가능 (CLI 직접 호출 불가). 따라서 패키지의 Pencil 모듈은 *adapter / placeholder* 역할 — 실제 호출은 메인 Claude 가 tour 실행 후 후속 step 으로 수행.
- 또는: Pencil 노드 ID + 출력 경로만 리포트에 기록하고, 실제 reference png 는 메인 Claude 가 tour 종료 후 별도 호출 (`mcp__pencil__get_screenshot`) 로 채워넣음.
- 본 Story 는 후자 방식 (placeholder 슬롯 생성 + 메인 Claude 수동 fill) 채택. 자동 호출은 후속 epic.

### 영향 / 신규 파일

- `packages/mobile-qa-tour/src/pencil/adapter.ts` (신규) — `qa.config.json.pencil` 검증 + per-screen 리포트에 `pencil ref` 슬롯 prefix 작성 (실제 캡처 X)
- `packages/mobile-qa-tour/src/report/tour-template.ts` (수정) — pencil 슬롯 추가
- `apps/mobile/qa.config.json` (수정) — `pencil` 블록 추가 (`enabled: true`, `documentPath: "/Users/dc.kim/project/jajang/design/jajang.pen"`, `nodeIds: { "S10": ["llTp1", "r97aM"] }`)
- `docs/qa/README.md` (수정) — SOP 에 "Pencil reference 채우기" 단계 추가 (메인 Claude → `mcp__pencil__get_screenshot` 호출)

### 태스크 체크리스트

- [ ] config schema 에 `pencil` 블록 추가 (zod) + 선택 필드
- [ ] tour runner — pencil enabled 일 때 per-screen 리포트에 `<!-- pencil ref slot: nodeIds=[...] -->` 주석 + 실제 png 경로 placeholder 작성
- [ ] jajang `qa.config.json` 에 S10 매핑 추가 (현재 design-handoff.md 의 frame ID 재사용)
- [ ] `docs/qa/README.md` SOP 업데이트
- [ ] 후속 epic 후보 등록 — "Pencil 자동 호출 통합" (별도 MCP gateway 또는 wrapper 필요)

### 수용 기준

- (config) `pencil.enabled: false` 면 tour 정상 동작 + pencil 슬롯 미생성
- (config) `pencil.enabled: true` + S10 매핑 → S10 리포트에 슬롯 placeholder 1건 이상
- (운영) SOP 따라 메인 Claude 가 슬롯 1건 채워 reference png 첨부 가능

---

## Story 5 — Out-of-scope 명시 + 후속 epic 후보 등록 + backlog 갱신

**As a** 마일스톤 운영자
**I want** Epic 11 종료 시점에 미해결 / 후속 작업이 명시적으로 backlog 에 등록되길 원한다
**So that** 추후 epic-12 + 별도 레포 분리 작업이 추적 가능.

### 근본 동기

QA 툴링은 점진 진화 영역 (CI 자동화 / iOS / theme drift fix 등). 본 epic 에서 단번에 다 못 함. 후속 후보를 *명시적으로* 적어두지 않으면 잊혀짐.

### 영향 / 신규 파일

- `backlog.md` (수정) — 에픽 목록 표 마지막에 Epic 11 행 추가 + 체크리스트 마지막에 항목 추가
- `CLAUDE.md` (수정 — 옵션) — 문서 목록에 epic-11 경로 추가 (현재 CLAUDE.md 가 epic 별 경로 노출 구조면 갱신, 아니면 skip)
- `docs/milestones/v1/epics/epic-11-monkey-design-review/system-design.md` §8 후속 epic 후보 (별도 작성)

### 태스크 체크리스트

- [ ] `backlog.md` 에픽 목록 표에 Epic 11 행 추가
- [ ] `backlog.md` 체크리스트 마지막에 Epic 11 항목 추가
- [ ] `CLAUDE.md` 문서 목록 갱신 (해당되는 경우)
- [ ] 후속 epic 후보 명시 — `system-design.md §8` 참조
  - epic-12 (가칭) "Theme drift fix" — drift 89% 정정 (직접 hex → theme token 마이그레이션)
  - epic-13 (가칭) "QA package 별도 레포 분리 + npm publish" — semver 1.0.0 안정화 후
  - epic-14 (가칭) "QA tour CI 자동화" — GitHub Actions 통합 (PR merge 전 자동 실행)
  - epic-15 (가칭) "iOS 시뮬레이터 지원" — `xcrun simctl` 기반 wrapper 추가
  - epic-16 (가칭) "Pencil 노드 매핑 확장" — S10 외 6 화면 design-handoff 추가

### 수용 기준

- (DOC) `backlog.md` 에 Epic 11 등록
- (DOC) 후속 epic 후보 5건 이상 system-design 에 명시

---

## Story 의존성

```
Story 1 (패키지 골격 + monkey) ──┐
                                 ├─→ Story 3 (jajang consumer 통합)
Story 2 (tour 모듈 + 휴리스틱) ──┘         │
                                          ├─→ Story 5 (backlog + 후속)
Story 4 (Pencil adapter, optional) ──────┘
```

- Story 1, 2 병렬 가능 (서로 다른 모듈 — adb wrapper 만 공유, 1 에서 먼저 완성).
- Story 3 은 1, 2 완료 후 — consumer 통합은 패키지가 동작해야 의미 있음.
- Story 4 는 1 완료 후 언제든 가능 (optional, 2 / 3 와 독립).
- Story 5 는 1~4 완료 시점에 backlog 정리.

---

## 관련 이슈

| 스토리 | GitHub Issue |
|---|---|
| Epic | #181 |
| Story 1 | (PR #180 — issue 미등록, 회고용 직접 등록 X) |
| Story 2 | #182 |
| Story 3 | TBD |
| Story 4 | TBD |
| Story 5 | TBD |

> architect TASK_DECOMPOSE 진입 시 GitHub Issues 등록.
