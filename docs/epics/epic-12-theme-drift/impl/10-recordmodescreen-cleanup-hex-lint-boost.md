---
depth: simple
story: 공통
task_index: —
github_issue: 259
epic: 12
slug: recordmodescreen-cleanup-hex-lint-boost
branch_prefix: feat/epic12-issue259-cleanup-hex-lint-boost
---

# task 10 — RecordModeScreen 폐기 + hex-lint 보강

## 사전 준비 (먼저 read 필수)

먼저 아래 파일들을 읽고 맥락을 파악하라:

- `docs/epics/epic-12-theme-drift/impl/09-regression-test-jest-hex-lint.md` — §3.1 HEX_REGEX 설계 + §4.4 자가 검증 패턴
- `apps/mobile/src/__tests__/theme/no-raw-hex.test.ts` — 현재 ALLOWED_FILES / HEX_REGEX / findHexMatches 전체 구현
- `apps/mobile/src/navigation/types.ts` — RecordMode route 주석 현 상태
- `apps/mobile/src/navigation/MainNavigator.tsx` — RecordModeScreen import/Stack 주석 현 상태

## Scope

본 task = 3 Phase (1 PR):

| Phase | 대상 | 레이어 |
|---|---|---|
| 1 | RecordModeScreen.tsx + S08 테스트 파일 삭제 | screens / tests |
| 2 | types.ts 주석 정리 + MainNavigator.tsx 주석 정리 | navigation |
| 3 | no-raw-hex.test.ts — ALLOWED_FILES 제거 + HEX_REGEX 보강 + 자가 검증 추가 + NICE TO HAVE 2건 | test infra |

**다른 레이어 손대지 X**: tokens.ts 변경 X. RecordGuideScreen / RecordScreen 변경 X.

## 영향 파일 (실측 grep 검증 — 2026-05-12)

### Phase 1 — 삭제 대상

| 파일 | 상태 | 확인 방법 |
|---|---|---|
| `apps/mobile/src/screens/RecordModeScreen.tsx` | 131 라인, 9 hex 리터럴, navigation stack 이미 미등록 | 직접 read |
| `apps/mobile/src/__tests__/screens/S08RecordModeScreen.test.tsx` | 266 라인, `@screens/RecordModeScreen` import | 직접 read |

### Phase 2 — 주석 정리 (코드 로직 변경 X)

| 파일 | 라인 | 현재 내용 | 처리 |
|---|---|---|---|
| `apps/mobile/src/navigation/types.ts` | L24 | `// RecordMode (S08) 폐기 — impl/13. 파일 삭제는 별도 클린업 태스크.` | 주석 삭제 |
| `apps/mobile/src/navigation/types.ts` | L55 | `// RecordModeScreenProps 삭제 (S08 폐기 — impl/13)` | 주석 삭제 |
| `apps/mobile/src/navigation/MainNavigator.tsx` | L13 | `// RecordModeScreen (S08) — import 제거 (impl/13 폐기). 파일 삭제는 별도 클린업.` | 주석 삭제 |
| `apps/mobile/src/navigation/MainNavigator.tsx` | L72 | `{/* RecordMode (S08) — Stack에서 제거 (impl/13 폐기) */}` | 주석 삭제 |

> **out-of-scope 주석** (건드리지 X): `S07SongSelectScreen.tsx:148` (`S07 → S09 직결`) / `RecordScreen.tsx:310` (`SongSelect로 fallback`) / `m1b-play-pending-nav-processed-hex-map.test.ts` (plan §3.4 skip α 설명 주석) — 이들은 *로직 설명* 주석으로 폐기 완료 주석이 아님. 삭제 금지.

### Phase 3 — no-raw-hex.test.ts 수정

| 변경 항목 | 현재 | 변경 후 |
|---|---|---|
| ALLOWED_FILES `'screens/RecordModeScreen.tsx'` | 존재 | 제거 |
| ALLOWED_FILES doc comment `(폐기 예정 화면…)` | 존재 | 제거 (항목 자체 제거와 함께) |
| HEX_REGEX | `/['"]#[0-9A-Fa-f]{3,6}['"]/g` | `/[`'"]#[0-9A-Fa-f]{3,6}[`'"]/g` (backtick 추가) |
| HEX_REGEX 옆 인라인 주석 | `// quote-aware — 직접 hex *리터럴*…` | 기존 유지 + `// 3~6자리 강제: 8자리 #RRGGBBAA 제외` 추가 (NICE TO HAVE) |
| 자가 검증 token 카운트 주석 | `// tokens.ts = hex SSOT → ColorTokens 29 토큰 × 2 (dark/light) = 58 hex 리터럴` | 고정 숫자 제거 → `// tokens.ts = hex SSOT → quote 안 hex 리터럴 다수` (NICE TO HAVE) |
| 자가 검증 it — backtick 케이스 | 없음 | 신규 추가 |

## 결정 근거 — HEX_REGEX 보강 방식

**옵션 A (채택): 단일 regex 확장** `/[`'"]#[0-9A-Fa-f]{3,6}[`'"]/g`

**옵션 B (기각): 별도 BACKTICK_REGEX** `/`[^`]*#[0-9A-Fa-f]{3,6}[^`]*`/g`

옵션 A 채택 근거:
1. **slice(1, -1) 호환** — 기존 `findHexMatches` 의 `quoted.slice(1, -1)` 가 backtick 제거에 동일하게 동작. 함수 내부 수정 불필요.
2. **오탐 방지** — 옵션 B의 `[^`]*` 패턴은 `` `color: ${someVar}, border: #FF0000, size: ${w}` `` 같은 긴 template literal 에서 non-hex 내용 포함 + match 경계 불명확. 옵션 A는 quote/backtick 바로 다음이 `#` → 직접 hex 리터럴만 검출.
3. **단순화** — 함수 추가 없이 regex 1자 수정. 검증 대상 범위 명확.
4. **실제 위협 패턴** — backtick hex = `` `#FF4444` `` (직접 리터럴) 또는 `` backgroundColor: `#${hex}` `` (변수 주입). 옵션 A는 전자만 검출 — 전자가 실질 위협.

## 인터페이스

### HEX_REGEX (변경)

```ts
// Before
const HEX_REGEX = /['"]#[0-9A-Fa-f]{3,6}['"]/g;

// After — backtick 추가. 3~6자리 강제: 8자리 #RRGGBBAA 제외
const HEX_REGEX = /[`'"]#[0-9A-Fa-f]{3,6}[`'"]/g;
```

### findHexMatches (변경 없음)

기존 `quoted.slice(1, -1)` 가 backtick 제거에 그대로 동작. 함수 본문 수정 불필요.

### 자가 검증 신규 it (추가)

```ts
it('backtick hex 리터럴 검출 — `#RRGGBB` 패턴 매치', () => {
  expect('`#FF4444`'.match(HEX_REGEX)).not.toBeNull();
  expect('`#fff`'.match(HEX_REGEX)).not.toBeNull();
  // 변수 주입 패턴은 검출 X (hex 자체가 없음)
  expect('`${color}`'.match(HEX_REGEX)).toBeNull();
});
```

## 핵심 로직 (3 Phase 의사코드)

```
Phase 1:
  rm apps/mobile/src/screens/RecordModeScreen.tsx
  rm apps/mobile/src/__tests__/screens/S08RecordModeScreen.test.tsx

Phase 2:
  types.ts  — L24, L55 주석 라인 제거
  MainNavigator.tsx — L13, L72 주석 라인 제거

Phase 3 (no-raw-hex.test.ts):
  ALLOWED_FILES = ['theme/tokens.ts']   // RecordModeScreen 항목 제거
  HEX_REGEX = /[`'"]#[0-9A-Fa-f]{3,6}[`'"]/g  // backtick 추가
  HEX_REGEX 옆 주석 보강 (3~6자리 설명)
  tokens.ts 매직 넘버 주석 느슨화
  isAllowed 자가 검증 it — 'screens/RecordModeScreen.tsx' 기대값 false 로 변경
  backtick 자가 검증 it 1개 추가
```

> **isAllowed 자가 검증 기존 라인 주의**: `expect(isAllowed('screens/RecordModeScreen.tsx')).toBe(true)` → `toBe(false)` 로 변경 필수. Phase 1 에서 파일 삭제 + Phase 3 에서 ALLOWED_FILES 제거 = 이 라인이 `true` 이면 자가 검증이 거짓 통과.

## 분기 enumeration

| 분기 | 위치 | fix 적용 | 회귀 가능성 |
|---|---|---|---|
| RecordModeScreen 삭제 후 import 잔재 | MainNavigator.tsx L13 (이미 주석처리 완료) | Phase 2 주석 삭제 — import 코드 없음 | 없음 (주석만) |
| types.ts `RecordMode` route 엔트리 | L24 주석 (실제 타입 엔트리는 이미 삭제됨) | Phase 2 주석 삭제 | 없음 |
| ALLOWED_FILES 에서 삭제 후 no-raw-hex GREEN | Phase 1 파일 삭제 후 hex walk 시 존재 X → skip X → 검사 대상 무 | GREEN 유지 | 없음 |
| S07SongSelectScreen RecordMode 주석 | L148 — 로직 설명 주석 | 건드리지 X (out-of-scope) | N/A |
| RecordScreen RecordMode 주석 | L310 — fallback 설명 주석 | 건드리지 X (out-of-scope) | N/A |
| m1b 회귀 테스트 RecordMode 주석 | L13/L49/L56 — plan §3.4 설명 | 건드리지 X (out-of-scope) | N/A |
| S07SongSelectScreen.test.tsx RecordMode 참조 | L15/L224/L237/L248/L256 — describe/it 텍스트 | 건드리지 X (실 assertion 유지가 맞음) | N/A |
| isAllowed 자가 검증 RecordModeScreen.tsx 기대값 | L153 `toBe(true)` | `toBe(false)` 로 변경 필수 | ALLOWED_FILES 제거 후 true 이면 자가 검증 오탐 |

## 수용 기준

| REQ | 내용 | 검증 | 통과 조건 |
|---|---|---|---|
| REQ-001 | RecordModeScreen.tsx 파일 부재 | (MANUAL) | `ls apps/mobile/src/screens/RecordModeScreen.tsx` → No such file |
| REQ-002 | S08RecordModeScreen.test.tsx 파일 부재 | (MANUAL) | `ls apps/mobile/src/__tests__/screens/S08RecordModeScreen.test.tsx` → No such file |
| REQ-003 | navigation/types.ts 에 RecordMode route 코드·주석 잔재 0건 | (MANUAL) | `grep -n 'RecordMode' apps/mobile/src/navigation/types.ts` → 0건 |
| REQ-004 | no-raw-hex.test.ts ALLOWED_FILES 에 RecordModeScreen 등재 0건 | (MANUAL) | `grep -n 'RecordModeScreen' apps/mobile/src/__tests__/theme/no-raw-hex.test.ts` → 0건 |
| REQ-005 | backtick hex 자가 검증 it GREEN | (TEST) | `npm test --testPathPattern="no-raw-hex" -- --testNamePattern="backtick"` 통과 |
| REQ-006 | 전체 theme 테스트 suite GREEN | (TEST) | `cd apps/mobile && npm test -- --testPathPattern="__tests__/theme"` → 모든 테스트 PASS |
| REQ-007 | type-check 0 error (본 변경 파일 대상) | (MANUAL) | `cd apps/mobile && npm run type-check` → 0 errors (기존 main 환경 이슈 제외) |

**통과 조건 일괄 커맨드**:
```bash
cd apps/mobile && npm run type-check && npm test -- --testPathPattern="__tests__/theme"
```

## 주의사항

- **isAllowed 자가 검증 라인 반드시 변경**: `no-raw-hex.test.ts` L153 의 `expect(isAllowed('screens/RecordModeScreen.tsx')).toBe(true)` → `toBe(false)`. 이유: ALLOWED_FILES 에서 제거하면 isAllowed 는 `false` 반환. `true` 기대 시 자가 검증이 실제 동작과 반대.
- **S07 / RecordScreen / m1b 주석 삭제 금지**: 이들은 폐기 완료 기록이 아닌 *로직 flow 설명* 주석. 제거 시 컨텍스트 손실.
- **tokens.ts 건드리지 X**: 이미 task 09 가 신규 2 토큰 정의 완료. 본 task 범위 외.
- **no-raw-hex.test.ts HEX_REGEX 파일 두 곳 모두 변경**: 상단 정의 (`const HEX_REGEX`) 와 파일 헤더 주석 설명 (`패턴: ...`) 을 동기화. 이유: 헤더 주석이 old regex 설명 그대로면 문서 drift.

## DB 영향도

영향 없음 — 색상 토큰 및 파일 정리 작업. DB 스키마 변경 0.

## 의존성

- 선행 task 09 (`09-regression-test-jest-hex-lint.md`) PR #258 머지 완료 전제
- `apps/mobile/src/theme/tokens.ts` — SSOT. 본 task 가 변경 X

## 모듈 = 테스트 단위 정합

- Phase 1 (파일 삭제): 삭제 후 `npm run type-check` 로 dangling reference 즉시 검출 가능.
- Phase 3 (no-raw-hex.test.ts): 자가 검증 `it` 블록이 HEX_REGEX 동작을 직접 단언 — mock 필요 없음. 단위 테스트 가능.
- 의존 모듈 mock 필요 없음 — `fs`, `path` 는 Node 내장, jest `testEnvironment: node` 로 보장.
