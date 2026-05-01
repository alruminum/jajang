---
depth: std
---

# impl/04 — [Story 3] jajang Consumer 통합 (`qa.config.json` + screen-registry + npm script + 첫 실행 SOP)

**Story:** Story 3
**선행 조건:** impl/01, 02, 03 완료 (패키지 build 성공 + monkey/tour CLI 동작)
**후행 조건:** `cd apps/mobile && npm run qa:monkey` + `npm run qa:tour` 동작 + `docs/qa/<date>-*` 산출물 생성

**context budget:** file edits ≤ 6 / tool uses ≤ 30

---

## 0. 시작 전 확인

```bash
# jajang 의 testID 실측 — screen-registry 작성 정합 검증
grep -rE "testID=" /Users/dc.kim/project/jajang/apps/mobile/src/screens/S0[679]*.tsx | head -30
grep -rE "testID=" /Users/dc.kim/project/jajang/apps/mobile/src/screens/S1[16]*.tsx | head -20
grep -rE "testID=" /Users/dc.kim/project/jajang/apps/mobile/src/screens/AccountDeletion*.tsx | head -10

# emulator + jajang 설치 상태
adb devices                         # 1대 이상
adb shell pm list packages | grep jajang
```

---

## 생성/수정 파일

### 신규

- `apps/mobile/qa.config.json` — jajang specifics
- `apps/mobile/screen-registry.json` — 7 화면의 entrySteps 정의
- `docs/qa/.gitkeep` — output 디렉토리 placeholder
- `docs/qa/README.md` — 운영 SOP

### 수정

- `apps/mobile/package.json` — `scripts.qa:monkey`, `scripts.qa:tour`, `scripts.qa:init`, `devDependencies.mobile-qa-tour: workspace:*`
- `.gitignore` (루트 또는 `docs/qa/`) — `docs/qa/<date>-*` artifact 제외, 단 `docs/qa/README.md` + `.gitkeep` 은 추적

---

## 인터페이스

### `apps/mobile/qa.config.json`

```json
{
  "appPackage": "com.jajang.app",
  "outputDir": "../../docs/qa",
  "uxFlowAnchor": "../../docs/ux-flow.md",
  "screenRegistryPath": "./screen-registry.json"
}
```

> `outputDir` 는 monorepo root 기준 `docs/qa/` (CLI 실행 cwd = `apps/mobile`).

### `apps/mobile/screen-registry.json`

7 화면 (S06/S07/S09/S10/S11/S16/AccountDeletion) — testID 기반 우선, 미존재 시 좌표 fallback.

```json
[
  {
    "id": "S06",
    "label": "Home",
    "entrySteps": [],
    "settleMs": 2000
  },
  {
    "id": "S07",
    "label": "SongSelect",
    "entrySteps": [
      { "type": "tapTestId", "testId": "<실측 testID>" }
    ],
    "settleMs": 2000
  },
  {
    "id": "S09",
    "label": "RecordGuide",
    "entrySteps": [
      { "type": "tapTestId", "testId": "<S07 CTA>" },
      { "type": "wait", "ms": 1500 },
      { "type": "tapTestId", "testId": "<song item>" }
    ],
    "settleMs": 2000
  },
  {
    "id": "S10",
    "label": "Record",
    "entrySteps": [
      { "type": "tapTestId", "testId": "<S07 CTA>" },
      { "type": "wait", "ms": 1500 },
      { "type": "tapTestId", "testId": "<song item>" },
      { "type": "wait", "ms": 1500 },
      { "type": "tapTestId", "testId": "<S09 CTA>" },
      { "type": "permissionGrant", "permission": "android.permission.RECORD_AUDIO" }
    ],
    "settleMs": 2000,
    "pencilNodeIds": ["llTp1", "r97aM"]
  },
  {
    "id": "S11_SKIP",
    "label": "Preview (skip — 30s recording required)",
    "entrySteps": [],
    "settleMs": 0
  },
  {
    "id": "S16",
    "label": "Settings",
    "entrySteps": [
      { "type": "tapTestId", "testId": "<설정 tab>" }
    ],
    "settleMs": 2000
  },
  {
    "id": "AccountDeletion",
    "label": "Account Deletion (smoke only — 실제 삭제 차단)",
    "entrySteps": [
      { "type": "tapTestId", "testId": "<설정 tab>" },
      { "type": "wait", "ms": 1500 },
      { "type": "tapTestId", "testId": "<계정 삭제 항목>" }
    ],
    "settleMs": 2000
  }
]
```

> 실측 testID 는 `apps/mobile/src/screens/S0*.tsx` grep 후 채움. testID 부재 시 좌표 fallback (`{ "type": "tap", "x": 540, "y": 1200 }` + 주석으로 1080×1920 기준 명시).

> S11 은 30초 녹음 필요 — 본 epic skip + epic-17 후속.

### `apps/mobile/package.json` (수정)

```json
{
  "scripts": {
    "qa:init": "mobile-qa-tour init --out .",
    "qa:monkey": "mobile-qa-tour monkey --package com.jajang.app --events 1000 --output ../../docs/qa",
    "qa:tour": "mobile-qa-tour tour --config ./qa.config.json"
  },
  "devDependencies": {
    "mobile-qa-tour": "workspace:*"
  }
}
```

> npm workspaces 에서 `workspace:*` 는 pnpm/yarn berry 문법. **순수 npm 은 `*` 사용 권장**. 루트가 npm workspaces 인 게 검증됐으므로 `"mobile-qa-tour": "*"` 로 작성하고 정합 (실 install 단계에서 검증).

### `docs/qa/README.md` (운영 SOP)

```markdown
# QA Tour 산출물

`mobile-qa-tour` 패키지가 생성하는 monkey + tour 리포트의 출력 디렉토리.

## 실행

```bash
cd apps/mobile

# 1) random monkey crash hunting
npm run qa:monkey                 # 1000 events, crash 0 검증

# 2) driven screenshot tour
npm run qa:tour                   # 6 화면 (S11 제외) screenshot + heuristics
```

## LLM 검수 (메인 Claude)

`<date>-tour/<screenId>.md` 의 `<!-- LLM REVIEW HERE -->` 슬롯 채우기:

1. screenshot Read (멀티모달)
2. `docs/ux-flow.md` §<screenId> read 후 비교
3. (S10) `mcp__pencil__get_screenshot(<nodeIds>)` reference 캡처 첨부
4. P0/P1 issue 발견 시 `mcp__github__create_issue` (label: `bug`, `design` + 현재 버전)

## 운영 시점

- PR merge 전 (consumer 측 화면 변경 시)
- 마일스톤 종료 시 (7 화면 풀 tour)

## 한계

- iOS 미지원 (epic-15 후보)
- Pencil ref 는 S10 만 매핑 (epic-16 후보)
- S11/Generating/Play 는 30초 녹음 필요 (epic-17 후보)
- 휴리스틱은 false positive 가능 — LLM 시각 재확인 필수
```

### `.gitignore` (수정)

```
# qa output (date-prefixed) — README + .gitkeep 은 추적
docs/qa/*-monkey.md
docs/qa/*-tour/
```

---

## 의사코드

본 batch 는 **설정 파일 + 운영 문서 위주** — 코드 변경 0. 작업 흐름:

```
1. apps/mobile/src/screens/*.tsx 의 testID 실측 grep
   - 없으면 design-handoff.md 또는 디자인 의도 기반 후보 testID + epic-18 (testID 확대) backlog 항목 추가
2. screen-registry.json 작성 — 실측 testID 우선, 좌표 fallback
3. qa.config.json 작성 — appPackage / outputDir / uxFlowAnchor / screenRegistryPath
4. apps/mobile/package.json scripts 추가 + devDeps 추가
5. 루트 npm install 실행 → workspace 링크 확인
6. npm run qa:init (실 jajang 디렉토리에서 동작 검증 — 이후 위 specifics 로 덮어씀)
7. emulator + jajang 설치 후 npm run qa:monkey (events 100 smoke) → 리포트 생성 검증
8. npm run qa:tour --only S06 (가장 안전한 화면) → screenshot + md 검증
9. 풀 tour (6 화면) 1회 실행 → docs/qa/<date>-tour/ 누적 검증
10. docs/qa/README.md SOP 작성
11. .gitignore 추가
```

---

## 결정 근거

**왜 outputDir 가 monorepo root 의 `docs/qa/`?**
QA 리포트를 docs 같이 모아두면 PR review / 마일스톤 정리 시 발견 쉬움. `apps/mobile/qa-output/` 은 cwd-local 이라 monorepo 구조에 안 어울림.

**왜 testID 우선?**
좌표 fallback 은 emulator 해상도 의존 — 1080×1920 외에서 깨짐. testID 우선 + 부재 시 epic-18 후보로 추적.

**왜 S11 skip?**
S11 은 S10 에서 30초 녹음 후 진입. 30초 wait 추가하면 tour 시간 비현실적 + 녹음 자체가 환경 의존 (마이크 없는 emulator 는 silence). epic-17 (deep-link 인프라) 로 우회.

**왜 AccountDeletion smoke only?**
실제 삭제 호출은 destructive. entrySteps 마지막 confirm 버튼 tap 미포함 — 화면 진입까지만 검증.

**왜 .gitignore 의 artifact 제외?**
매 실행마다 png + md 누적되면 repo bloat. README + .gitkeep 만 추적 + 산출물은 PR 첨부 또는 별도 artifact storage.

---

## 다른 모듈과의 경계

- **impl/01~03**: 본 batch 는 *consumer 측 자산 only*. 패키지 코드 0 수정.
- **impl/05 (Pencil)**: 본 batch 의 `qa.config.json` 에 `pencil` 블록은 미포함 (Story 4 임). 05 에서 추가.
- **`docs/ux-flow.md`**: 본 batch 가 `uxFlowAnchor` 로 참조. 메인 Claude 가 LLM 검수 시 read.
- **`apps/mobile/src/screens/*.tsx`**: testID 부재 시 epic-18 후보 등록 — 본 epic 에서 testID 신설 X (consumer 인터페이스 변경 회피).

---

## 수용 기준

- (BUILD) 루트 `npm install` 후 `apps/mobile/node_modules/mobile-qa-tour` symlink 존재
- (CLI) `cd apps/mobile && npm run qa:monkey -- --events 100` → `docs/qa/<date>-monkey.md` 생성 + crash 0
- (CLI) `npm run qa:tour -- --only S06` → `docs/qa/<date>-tour/S06.{png,xml,md}` 생성
- (CLI) `npm run qa:tour` → 6 화면 (S11 제외) 풀 tour 동작
- (DOC) `docs/qa/README.md` SOP 1 페이지 + 한계 명시
- (재사용) 패키지 코드 grep `com.jajang` → 여전히 0 occurrence
