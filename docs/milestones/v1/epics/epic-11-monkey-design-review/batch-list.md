# Epic 11 — Batch List

`/impl-loop` 입력용 batch 분해 결과. 각 batch 는 `impl/NN-*.md` 파일 1개에 대응. 각 batch 의 완료 enum = `LGTM` (`/impl-batch-loop` advance).

본 batch 들은 *기본 골격* (생성 파일 + 핵심 인터페이스 + 의사코드) 만 작성. 정밀 module plan 은 `/impl-loop` 내 `architect:MODULE_PLAN` 단계에서 작성 (= MODULE_PLAN_READY 마커 미박음).

---

## Batch 표

| ID | impl 파일 | 포함 stories | 주요 파일 | 예상 변경 수 | branch_prefix | 의존성 |
|---|---|---|---|---|---|---|
| **01** | `01-package-skeleton-monkey.md` | Story 1 | `packages/mobile-qa-tour/{package.json, tsconfig.json, src/cli.ts, src/adb/index.ts, src/monkey/{run,crash-detect}.ts, src/report/{monkey-template,writer}.ts, README.md, .gitignore}`, 루트 `package.json` workspaces | ~12 | `feat/` | none |
| **02** | `02-tour-config-entry-steps.md` | Story 2 (절반 — config + runner + entry-steps) | `src/config/{schema,load}.ts`, `src/tour/{runner,entry-steps}.ts`, `src/cli/init.ts` (또는 `cli.ts` 확장), `templates/{qa.config,screen-registry}.example.json` | ~8 | `feat/` | 01 |
| **03** | `03-uiautomator-heuristics-tour-report.md` | Story 2 (나머지 — uiautomator + 휴리스틱 + tour 리포트) | `src/tour/uiautomator.ts`, `src/heuristics/{index,text-truncation,touch-target}.ts`, `src/report/tour-template.ts`, `src/index.ts` (programmatic export) | ~7 | `feat/` | 02 |
| **04** | `04-jajang-consumer-integration.md` | Story 3 | `apps/mobile/qa.config.json`, `apps/mobile/screen-registry.json`, `apps/mobile/package.json` (scripts.qa:*), `docs/qa/.gitkeep`, `docs/qa/README.md` (운영 SOP), `.gitignore` (qa output 제외) | ~6 | `feat/` | 01, 02, 03 |
| **05** | `05-pencil-adapter-out-of-scope.md` | Story 4 + Story 5 | `src/pencil/adapter.ts`, `src/report/tour-template.ts` (pencil 슬롯 추가), `apps/mobile/qa.config.json` (pencil 블록), `docs/qa/README.md` (Pencil SOP), `backlog.md`, `system-design.md §8` 보강 | ~6 | `chore/` | 04 |

**총 batch 수**: 5. **총 예상 변경 파일**: ~39.

---

## 실행 순서 (의존성 그래프)

```
[01] 패키지 골격 + monkey
        │
        ▼
[02] tour config + entry-steps ──┐
                                 │
[03] uiautomator + heuristics + tour report  (← 02)
        │
        ▼
[04] jajang consumer 통합 (← 01, 02, 03)
        │
        ▼
[05] Pencil adapter (Story 4) + backlog/후속 (Story 5)
```

병렬 가능 그룹:
- 본 epic 은 **기본 직렬** — 패키지 모듈이 점진 구축돼야 의미 있음.
- 단 02, 03 사이 stub 통과 시 약한 병렬 가능 (02 가 runner 만 stub 으로 만들고 03 가 채우는 방식). 본 분해는 직렬 권장.

---

## 분할 결정 근거

### Story 2 → 02 (config + entry-steps) / 03 (uiautomator + heuristics + tour report) 분할

- Story 2 단일 batch 시 신규 파일 ~14 개 + ~600 LOC. engineer 1 사이클 budget 초과 가능.
- 02 = "tour 진입 + 명령 실행" 까지 (실제 navigate 가능). 03 = "출력 / 분석" 추가 (인지적 분리).
- 02 종료 시점에 `tour --only <screenId>` 가 navigate + screencap 까지 동작 (heuristic 없는 baseline). 검증 가능 단위.
- 03 가 dump XML 파싱 + 휴리스틱 + 리포트 템플릿 추가 — 별 변경 이유 (parsing concern) 라 SRP 정합.

### Story 1 → 01 (단일 batch)

- Story 1 = 패키지 골격 + monkey 모듈. ~12 파일이지만 각 파일 LOC 짧음 (CLI bootstrap 60 LOC, adb wrapper 50 LOC, monkey runner 80 LOC). 1 batch 충분.
- Smoke 검증 가능: `npx mobile-qa-tour --help` 동작 + 100 events monkey run.

### Story 3 → 04 (단일 batch)

- Story 3 = jajang consumer 측 자산 (qa.config.json + screen-registry.json + npm scripts + 운영 README). 신규 파일 ~6, 코드 변경 0 (설정만).
- 단일 batch 적합.

### Story 4 + Story 5 → 05 (통합 batch)

- Story 4 = Pencil adapter placeholder (실제 호출 X — 슬롯 작성만). ~3 파일.
- Story 5 = backlog + system-design §8 갱신. ~3 파일 doc.
- 둘 다 light depth — 별 batch 분리 시 overhead 큼. 통합 batch 1개 적합.
- Story 4 가 optional 이지만 본 epic 완료 기준에 명시 — 같이 처리.

### 듀얼 모드 / 디자인 토큰 가드레일

- 본 epic 은 *UI 컴포넌트 신설 0* (mobile-qa-tour 패키지는 Node.js CLI, jajang 소비자 통합은 설정 파일 only). 디자인 토큰 가드레일 미적용.

---

## F1 IMPL_PARTIAL 평가

| Batch | 파일 수 | 신규 LOC 추정 | engineer budget 위험도 |
|---|---|---|---|
| 01 | ~12 | ~400 | **중간** (다수 파일 but 각 짧음) |
| 02 | ~8 | ~350 | 중간 |
| 03 | ~7 | ~300 | **낮음** (parser + 표 생성, 패턴 명확) |
| 04 | ~6 | ~200 (설정 위주) | **낮음** |
| 05 | ~6 | ~150 (doc + adapter stub) | **낮음** |

**01 IMPL_PARTIAL 발화 시 분할안:**
- 01a: 패키지 골격 + CLI bootstrap + adb wrapper (`packages/mobile-qa-tour/{package.json, tsconfig.json, src/cli.ts, src/adb/index.ts}` + 루트 workspaces)
- 01b: monkey runner + crash-detect + 리포트 (`src/monkey/*`, `src/report/*`)

**02 IMPL_PARTIAL 발화 시 분할안:**
- 02a: config schema + loader + templates
- 02b: tour runner + entry-steps

---

## 외부 의존 검증 메모

- `commander`, `zod`, `execa`, `chalk`, `xml2js` — 모두 npm 등록 + 활발히 maintained. 각 패키지 사용 시 README 의 import path / API signature 1차 확인 권고 (학습 데이터 hallucination 위험 — 특히 `xml2js` 의 callback vs promise API 분기).
- `adb` (Android Platform Tools) — PATH 또는 `ANDROID_HOME` 의존. consumer 환경 검증은 batch 04 의 SOP 에 명시.
- 루트 `package.json` workspaces 는 현재 `["apps/mobile"]` — `["apps/mobile", "packages/*"]` 로 확장 필요 (batch 01).

---

## 제출 후

- `/impl-loop` 또는 batch 별 `/impl <batch-id>` 진행
- 각 batch 완료 시 `LGTM` advance → 다음 batch
- batch 05 완료 = Epic 11 close
