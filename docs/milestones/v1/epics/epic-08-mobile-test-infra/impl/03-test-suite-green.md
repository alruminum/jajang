---
depth: std
---
# impl-03 — 기존 테스트 파일 jest 호환 검증 + 전체 suite 통과

**이슈**: #153  
**에픽**: epic-08-mobile-test-infra  
**선행 impl**: 02-setup-mock-jest-migration.md (완료 필수)  
**후행 impl**: 없음 (마지막 impl)

---

## 결정 근거

### 잔류 vi.* 스캔 전략

impl-02에서 4개 파일(advanceTimersByTimeAsync 대상)을 수동 처리. 나머지 파일은 `grep`으로 잔류 여부 확인 후 일괄 변환:

```bash
grep -rl "vi\." apps/mobile/src/__tests__/ --include="*.ts" --include="*.tsx"
grep -rl "from 'vitest'" apps/mobile/src/__tests__/ --include="*.ts" --include="*.tsx"
```

### 실패 분류 체계

`npm test` 전체 실행 후 실패 원인:

| 유형 | 원인 | 처리 |
|---|---|---|
| (a) vi.* 잔류 | `vi.fn()` / `vi.mock()` 잔류 | sed 또는 수동 변환 |
| (b) alias 누락 | `Cannot find module '@lib/...'` 등 | jest.config.js moduleNameMapper 추가 |
| (c) native mock 누락 | `NativeModule.XXX is null` | `__mocks__` 추가 또는 setup.ts에 jest.mock 추가 |
| (d) RTL v12 호환 | `act()` 경고, 비동기 render 이슈 | waitFor / act 래핑 패턴 확인 |

### PR #149 포함 테스트 확인 대상

PR #149 (이어폰 모달 12 it) batch 4/5 테스트:
- 이어폰 모달 관련 test 파일 경로 확인 필요 (`grep -rl "이어폰\|headphone\|AudioOutputModal" apps/mobile/src/__tests__/`)
- 해당 테스트가 impl-02에서 처리되지 않은 vi.* 잔류 파일이면 이 impl에서 처리

### CLAUDE.md 갱신 범위

`apps/mobile` 섹션의 `npx vitest run` → `npm test`. 해당 줄만 변경. 다른 섹션 무관.

---

## 수정 파일 목록

| 파일 | 작업 | 설명 |
|---|---|---|
| `apps/mobile/src/__tests__/**/*.test.ts(x)` | 잔류 vi.* 변환 | grep 후 실제 해당 파일만 수정 |
| `CLAUDE.md` | 수정 | `npx vitest run` → `npm test` |

---

## 변환 상세

### 1. 잔류 vi.* 파일 탐색 및 변환

```bash
cd apps/mobile

# 잔류 vi.mock / vi.fn / vi.spyOn 탐색
grep -rl "vi\." src/__tests__/ --include="*.ts" --include="*.tsx"

# vitest import 잔류 탐색
grep -rl "from 'vitest'" src/__tests__/ --include="*.ts" --include="*.tsx"
```

탐색 결과 파일별 변환:

```bash
# vi.fn() → jest.fn() 일괄
sed -i '' 's/\bvi\.fn()/jest.fn()/g' <파일경로>

# vi.mock( → jest.mock(
sed -i '' 's/\bvi\.mock(/jest.mock(/g' <파일경로>

# vi.spyOn( → jest.spyOn(
sed -i '' 's/\bvi\.spyOn(/jest.spyOn(/g' <파일경로>

# vi.clearAllMocks() → jest.clearAllMocks()
sed -i '' 's/\bvi\.clearAllMocks()/jest.clearAllMocks()/g' <파일경로>

# vi.useFakeTimers() → jest.useFakeTimers()
sed -i '' 's/\bvi\.useFakeTimers()/jest.useFakeTimers()/g' <파일경로>

# vi.useRealTimers() → jest.useRealTimers()
sed -i '' 's/\bvi\.useRealTimers()/jest.useRealTimers()/g' <파일경로>

# vi.resetAllMocks() → jest.resetAllMocks()
sed -i '' 's/\bvi\.resetAllMocks()/jest.resetAllMocks()/g' <파일경로>

# vi.restoreAllMocks() → jest.restoreAllMocks()
sed -i '' 's/\bvi\.restoreAllMocks()/jest.restoreAllMocks()/g' <파일경로>

# from 'vitest' import 제거 — 파일별 수동 처리 (import 구조가 다양)
```

`from 'vitest'` import 제거: 해당 파일에서 import 구문 전체를 삭제. jest globals (`describe`, `it`, `expect`, `beforeEach`, `afterEach`, `jest`) 는 jest.config.js의 `preset: 'jest-expo'` 설정으로 자동 주입.

### 2. 실패 원인별 처리

#### (a) vi.* 잔류 — 위 sed 처리

#### (b) moduleNameMapper 누락 alias

`Cannot find module '@lib/something'` 등 에러 발생 시 `jest.config.js`의 `moduleNameMapper` 에 추가:

```js
'^@lib/(.*)$': '<rootDir>/src/lib/$1',
```

현재 tsconfig.json에 `@lib/*` 경로 선언되어 있으므로 jest.config.js도 동기화.

#### (c) 추가 RN 네이티브 모듈 mock 누락

`expo-notifications` mock: AudioEngine-timer.test.ts에서 이미 로컬 mock 선언. setup.ts에 전역 mock 필요 여부는 `npm test` 결과로 확인.

새 mock 필요 패턴:
```typescript
// setup.ts 추가
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('mock-notification-id'),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
}));
```

#### (d) @testing-library/react-native v12 호환

`act()` 비동기 패턴:
```typescript
// jest 환경에서 권장 패턴 (RTL v12)
await act(async () => {
  jest.advanceTimersByTime(N);
  await Promise.resolve();
});
```

`waitFor` 타임아웃 기본값(jest): 1000ms. 필요 시 `waitFor(fn, { timeout: 3000 })`.

#### PR #149 이어폰 모달 배치 확인

```bash
grep -rl "이어폰\|headphone\|HeadphoneModal\|AudioOutput" apps/mobile/src/__tests__/
```

결과 파일 → vi.* 잔류 여부 확인 → 위 변환 적용 → `npm test <파일경로>` GREEN 확인.

### 3. 전체 suite 실행

```bash
cd apps/mobile
npm test
```

실패 0건, 모든 test suite 통과 확인.

### 4. coverage 실행

```bash
npm run test:ci
```

coverage 리포트 생성, 0 exit code 확인.

### 5. CLAUDE.md 갱신

```
# 변경 전
npx vitest run

# 변경 후
npm test
```

`apps/mobile` 섹션의 해당 줄만 수정. 섹션 구조 유지.

---

## 구현 레시피 (순서)

1. `grep -rl "vi\." apps/mobile/src/__tests__/` 실행 → 잔류 파일 목록 확인
2. `grep -rl "from 'vitest'" apps/mobile/src/__tests__/` 실행
3. 잔류 파일별 sed 일괄 변환 + `from 'vitest'` import 수동 제거
4. `npm test` 전체 실행 → 실패 목록 확인
5. 실패 원인 분류 (a/b/c/d) → 원인별 처리
6. PR #149 관련 테스트 파일 GREEN 확인
7. `npm test` 재실행 → 0 failures 확인
8. `npm run test:ci` → coverage 리포트 생성 확인
9. `CLAUDE.md` `npx vitest run` → `npm test` 수정

---

## 수용 기준

- (TEST) `npm test` 결과 0 failures, 전체 test suite 통과
- (MANUAL) `grep -r "from 'vitest'" apps/mobile/src/` 결과 0건
- (MANUAL) `grep -r "vi\." apps/mobile/src/__tests__/` 결과 0건 (단, 변수명 `via`, `visual` 등 false positive 제외)
- (TEST) `npm run test:ci` 실행 시 coverage 리포트 생성 (0 exit code)
- (MANUAL) `CLAUDE.md` 에서 `npx vitest run` 문자열 0건

---

## 주의사항

- `grep -r "vi\."` 실행 시 `device`, `service` 등 단어 내 `vi.` 패턴이 false positive로 잡힐 수 있음. `\bvi\.` (word boundary) 패턴 사용 또는 결과 육안 확인.
- `ReturnType<typeof vi.fn>` → `jest.Mock` 으로 변환. jest 타입에서 `jest.Mock` 이 직접 사용 가능.
- `vi.mocked(fn)` → `jest.mocked(fn)` (jest 27.4+에서 지원).
- `vi.importActual` 사용 파일이 impl-02 외에 추가로 존재하면 `jest.requireActual` 로 동기 변환.
- 변환 완료 후 `npx tsc --project tsconfig.test.json --noEmit` 최종 확인 권장.
