---
depth: light
---

# impl/05 — [Story 4 + Story 5] Pencil MCP adapter (placeholder) + out-of-scope 명시 + backlog 갱신

**Story:** Story 4 (Pencil adapter) + Story 5 (backlog + 후속 epic 후보)
**선행 조건:** impl/04 완료 (jajang qa.config.json 존재)
**후행 조건:** S10 리포트에 Pencil 슬롯 placeholder + backlog.md 에 Epic 11 등록 + 후속 epic 후보 명시

**context budget:** file edits ≤ 6 / tool uses ≤ 25

---

## 0. 시작 전 확인

- impl/03 의 `tour-template.ts` 의 `pencilSlot?` 필드 — 본 batch 가 채움
- jajang `design/jajang.pen` 존재 (Pencil document) + `design-handoff.md` 의 S10 frame ID 확인
- `mcp__pencil__*` 도구는 메인 Claude only — 패키지 코드에서 직접 호출 불가 (placeholder 만 작성)

---

## 생성/수정 파일

### 신규

- `packages/mobile-qa-tour/src/pencil/adapter.ts` — `preparePencilSlot(screen, pencilConfig)` placeholder 생성

### 수정

- `packages/mobile-qa-tour/src/report/tour-template.ts` — pencil 슬롯 활성 (impl/03 이 필드만 정의 — 실제 렌더 본 batch)
- `packages/mobile-qa-tour/src/tour/runner.ts` — `pencil.enabled` 시 `preparePencilSlot` 호출 + result 주입
- `apps/mobile/qa.config.json` — `pencil` 블록 추가 (S10 매핑)
- `docs/qa/README.md` — Pencil reference 채우기 SOP 단계 추가
- `backlog.md` — Epic 11 행 추가 + 체크리스트 항목 추가
- `docs/milestones/v1/epics/epic-11-monkey-design-review/system-design.md` — §8 후속 epic 후보 보강 (이미 7건 존재 — 본 batch 에서 backlog 추적 ID 매핑 확정)

---

## 인터페이스

### `src/pencil/adapter.ts`

```ts
import type { Screen, QaConfig } from '../config/schema';

export function preparePencilSlot(
  screen: Screen,
  pencilConfig: NonNullable<QaConfig['pencil']>,
): string | undefined {
  // 1. pencilConfig.enabled === false → undefined
  // 2. 매핑 노드 ID 결정:
  //    - screen.pencilNodeIds (화면 단위) ∪ pencilConfig.nodeIds?.[screen.id] (config 레벨)
  // 3. 매핑이 없으면 undefined
  // 4. 매핑 있으면 markdown comment + placeholder 작성:
  //    `<!-- pencil ref slot
  //      document: ${pencilConfig.documentPath}
  //      screen: ${screen.id}
  //      nodeIds: [${nodeIds.join(', ')}]
  //      action: 메인 Claude 가 mcp__pencil__get_screenshot 호출 후 본 슬롯 아래에 reference png 첨부
  //    -->`
}
```

### `src/report/tour-template.ts` (수정)

```markdown
## Pencil Reference

{pencilSlot ?? '<!-- pencil ref: 매핑 없음 -->'}
```

### `src/tour/runner.ts` (수정)

```ts
// for each screen 루프 안:
let pencilSlot: string | undefined;
if (config.pencil?.enabled) {
  const { preparePencilSlot } = await import('../pencil/adapter');
  pencilSlot = preparePencilSlot(screen, config.pencil);
}
// renderTourScreenReport 에 pencilSlot 주입
```

### `apps/mobile/qa.config.json` (수정)

```json
{
  "appPackage": "com.jajang.app",
  "outputDir": "../../docs/qa",
  "uxFlowAnchor": "../../docs/ux-flow.md",
  "screenRegistryPath": "./screen-registry.json",
  "pencil": {
    "enabled": true,
    "documentPath": "../../design/jajang.pen",
    "nodeIds": {
      "S10": ["llTp1", "r97aM"]
    }
  }
}
```

> `nodeIds` 의 실값은 `design-handoff.md` 의 S10 frame ID 확인 후 정합. 위 `llTp1`, `r97aM` 은 git status 에 보이는 png 파일명 추정 — 실제 Pencil node ID 는 메인 Claude 의 `mcp__pencil__batch_get` 으로 검증 권장.

### `docs/qa/README.md` (수정 — Pencil SOP 추가)

```markdown
### S10 Pencil reference 채우기

1. `docs/qa/<date>-tour/S10.md` 의 `<!-- pencil ref slot ... -->` 슬롯 위치 확인
2. 메인 Claude 에서:
   ```
   mcp__pencil__open_document('/path/to/jajang.pen')
   mcp__pencil__get_screenshot({ nodeIds: ['llTp1', 'r97aM'] })
   ```
3. 반환 png 를 `docs/qa/<date>-tour/S10-pencil-ref.png` 로 저장
4. S10.md 슬롯 아래에 `![pencil ref](S10-pencil-ref.png)` 추가
5. LLM 검수 단계에서 screenshot vs pencil ref 1:1 비교
```

### `backlog.md` (수정)

```markdown
| Epic 11 | mobile-qa-tour 패키지 + jajang consumer 통합 | docs/milestones/v1/epics/epic-11-monkey-design-review/ | ⬜ |
```

체크리스트 마지막에:
```markdown
- [ ] Epic 11 — mobile-qa-tour 패키지화 + jajang QA 통합
```

> backlog.md 현 구조 확인 후 정합 (epic 표 형식인지 단순 리스트인지). 형식이 다르면 기존 컨벤션 유지.

### `docs/milestones/v1/epics/epic-11-monkey-design-review/system-design.md` §8 (보강)

§8 기존 7 후속 epic 후보 (epic-12 ~ epic-18) 에 backlog 추적 ID 컬럼 추가:

```markdown
| ID (가칭) | 제목 | 트리거 | backlog 등록 |
|---|---|---|---|
| epic-12 | Theme drift fix | drift 89% 정정 | ⬜ Epic 11 종료 후 등록 |
| epic-13 | mobile-qa-tour 별도 레포 분리 + npm publish | semver 1.0.0 안정화 후 | ⬜ |
| epic-14 | QA tour CI 자동화 (GitHub Actions) | PR merge 전 자동 실행 | ⬜ |
| epic-15 | iOS 시뮬레이터 지원 | iOS QA 시점 | ⬜ |
| epic-16 | Pencil 노드 매핑 확장 | 디자인 폴리시 단계 | ⬜ |
| epic-17 | Deep-link 인프라 + Preview/Generating/Play tour | 30초 녹음 우회 mock | ⬜ |
| epic-18 | testID 확대 (82 → 19 screens) | 좌표 fallback 의존 제거 | ⬜ |
```

---

## 의사코드

```
1. src/pencil/adapter.ts 작성 — placeholder 생성 함수
2. src/report/tour-template.ts 의 Pencil Reference 섹션 활성
3. src/tour/runner.ts 에 pencil.enabled 분기 추가
4. apps/mobile/qa.config.json 에 pencil 블록 추가 — S10 매핑
5. docs/qa/README.md 에 Pencil SOP 단계 추가
6. backlog.md 에 Epic 11 등록 (현재 형식 grep 후 정합)
7. system-design.md §8 후속 epic 후보 표에 backlog 등록 컬럼 추가
8. tour --only S10 재실행 → S10.md 의 Pencil Reference 섹션에 slot 포함 검증
9. tour --only S06 (pencil 매핑 없음) → S06.md 의 Pencil Reference 는 "매핑 없음" 주석
```

---

## 결정 근거

**왜 placeholder 만 (실제 캡처 X)?**
Pencil MCP (`mcp__pencil__*`) 는 메인 Claude 컨텍스트 only — Node.js CLI 가 직접 호출 불가. CLI 자동화 + 메인 Claude 후속 단계 분리 패턴 유지.

**왜 화면 단위 / config 레벨 둘 다 매핑 허용?**
화면 단위 (`screen.pencilNodeIds`) 는 inline. config 레벨 (`config.pencil.nodeIds`) 은 중앙 집중. 둘 다 허용 + union — consumer 자유. 본 batch 는 config 레벨만 사용 (jajang specifics 분리).

**왜 Story 4 + Story 5 통합 batch?**
Story 4 (~3 파일) + Story 5 (~3 파일 doc) 둘 다 light depth. 분리 시 PR overhead 큼 + 의존성 직렬 (4 → 5).

**왜 backlog.md 형식 체크 후 정합?**
현재 backlog.md 구조 (epic 표 vs 리스트 vs 체크박스) 확인 못한 상태 — engineer 단계에서 read 후 기존 컨벤션 유지. 형식이 표라면 행 추가, 단순 리스트라면 체크박스.

---

## 다른 모듈과의 경계

- **impl/03**: 본 batch 가 03 의 `tour-template.ts` `pencilSlot` 필드 *활성*. 03 은 필드만 정의.
- **impl/04**: 본 batch 가 04 의 `qa.config.json` 에 `pencil` 블록 *추가*. 04 의 다른 필드 변경 X.
- **메인 Claude SOP**: `mcp__pencil__*` 호출은 본 batch 의 산출물 (slot) 을 입력으로 받아 메인 Claude 가 후속 step 으로 채움. 패키지 코드 자동화 X.
- **`design/jajang.pen`**: 본 batch 가 직접 read X — `mcp__pencil__*` 도구로만 read 가능.

---

## 수용 기준

- (BUILD) `npm run build` 성공
- (실행) `tour --only S10` → S10.md 에 `<!-- pencil ref slot ... nodeIds: [llTp1, r97aM] -->` placeholder 포함
- (실행) `tour --only S06` (매핑 없음) → S06.md 에 `<!-- pencil ref: 매핑 없음 -->`
- (config) `pencil.enabled: false` 또는 `pencil` 블록 자체 없음 → tour 정상 동작 + Pencil Reference 섹션 미생성
- (DOC) backlog.md 에 Epic 11 행/항목 추가 (기존 컨벤션 유지)
- (DOC) `system-design.md §8` 에 후속 epic 7건 + backlog 등록 컬럼
- (DOC) `docs/qa/README.md` SOP 에 Pencil reference 채우기 단계 추가
- (운영) 메인 Claude 가 SOP 따라 슬롯 1건 채워 reference png 첨부 가능 (smoke 검증)
