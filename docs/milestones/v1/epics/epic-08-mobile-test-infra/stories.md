# Epic 08 — Mobile Test Infra: Vitest → Jest (jest-expo) 마이그레이션

**GitHub Epic Issue:** [#150](https://github.com/alruminum/jajang/issues/150)

**목표:** mobile 테스트 자동화 정상화. vitest + esbuild 환경에서 react-native Flow 타입 문법 파싱 불가 문제 근본 해결.  
**선행 조건:** 없음 (인프라 에픽, 기능 에픽 독립)  
**완료 기준:** `npm test` 전체 suite 0 failures. vitest 의존성 제거.

---

## 기술 결정 — jest-expo vs @react-native/jest-preset

| 기준 | jest-expo | @react-native/jest-preset |
|---|---|---|
| Expo Bare workflow 공식 권장 | O | X (vanilla RN 권장) |
| Flow strip (babel-jest 연동) | O (babel-preset-expo 내장) | O (@react-native/babel-preset) |
| Expo SDK mock 자동 포함 | O (expo-modules-core 등) | X (수동) |
| 검증 사례 | Expo 공식 docs + 수많은 Expo 프로젝트 | RN CLI 프로젝트 |

**결론: jest-expo 채택.** 프로젝트가 Expo 55 Bare workflow이므로 `jest-expo`가 더 정합. 내부적으로 `@react-native/babel-preset` + `babel-jest`를 사용해 Flow strip 처리.

---

## Story 1 — Jest 인프라 설치 (deps + config)

**GitHub Issue:** [#151](https://github.com/alruminum/jajang/issues/151)

**As a** 개발자  
**I want** mobile 테스트 환경을 vitest에서 jest-expo로 교체하고 싶다  
**So that** react-native Flow 문법 파싱 오류 없이 테스트를 실행할 수 있다

### 태스크 체크리스트

- [x] `package.json` devDeps: `vitest` 제거 / `jest`, `jest-expo`, `babel-jest`, `@types/jest` 추가
- [x] `package.json` devDeps: `react-test-renderer` `18.3.1` → `^19.2.0`, `@types/react` `~18.3.0` → `^19.0.0` (react 19 메이저 정합) — [FAIL-02]
  - 사전 검증: `npm view jest-expo peerDependencies` 로 react-test-renderer 19.x 지원 확인 후 진행
  - 사전 검증: Expo SDK 55 + jest-expo react 19 지원 여부 확인; 미지원 시 정합 버전 명시
- [x] `package.json` scripts: `"test": "jest"`, `"test:ci": "jest --ci --coverage"` 추가 (vitest 스크립트 제거)
- [x] `jest.config.js` 신규 생성 (아래 핵심 설정 포함)
  - `preset: 'jest-expo'`
  - `transformIgnorePatterns`: RN 생태계 패키지 babel 변환 허용 패턴
  - `moduleNameMapper`: `@screens`, `@components`, `@store`, `@services`, `@audio`, `@navigation`, `@hooks`, `@utils`, `@types`, `@lib` 등 tsconfig paths 동기화
  - `setupFilesAfterFramework`: `['./src/__tests__/setup.ts']`
- [x] `tsconfig.test.json` 변경: `"types": ["vitest/globals"]` → `"types": ["jest"]`
- [x] `vitest.config.ts` 삭제 (또는 vitest.config.ts.disabled 리네임)

### 수용 기준

- (TEST) `npm test -- --listTests` 실행 시 에러 없이 .test.ts(x) 목록 출력 (0 exit code)
- (TEST) `npm test -- --testPathPattern=infra/jest-setup` 6/6 GREEN (0 exit code) — jest 인프라 기동 확인. 전체 suite GREEN은 Story 3 수용 기준.
- (MANUAL) `npm install` 후 peerDep 경고 0건 (react-test-renderer 19.x + @types/react 19.x 정합)

---

## Story 2 — Setup 파일 & __mocks__ jest 변환 (vi.* → jest.*)

**GitHub Issue:** [#152](https://github.com/alruminum/jajang/issues/152)

**As a** 개발자  
**I want** 기존 vitest 전용 API를 jest API로 변환하고 싶다  
**So that** setup.ts 및 mock 파일들이 jest 런타임에서 정상 동작한다

### 태스크 체크리스트

#### vi.* → jest.* 기본 변환

- [ ] `src/__tests__/setup.ts` 전면 재작성: `vi` import 제거, `jest.mock()` / `jest.fn()` 교체
  - `vi.mock('react-native', ...)` → `jest.mock('react-native', ...)`
  - `vi.fn()` 전체 → `jest.fn()`
  - `vi.mock(...)` factory 패턴 → `jest.mock(...)` 동일 패턴 (문법 동일)
- [ ] `src/__mocks__/react-native-track-player.js` — jest-expo transformIgnorePatterns 반영 여부 확인 (이미 모듈 해상도가 babel.config.js alias로 처리 중)
- [ ] `src/__mocks__/react-native-google-mobile-ads.js` 동일 검토
- [ ] `stubs/react-native-purchases.js` 동일 검토
- [ ] `vi.mock()` / `vi.fn()` / `vi.spyOn()` 잔류 파일 일괄 변환 (sed: `s/vi\./jest./g`)
- [ ] `from 'vitest'` import 잔류 제거

#### vi.advanceTimersByTimeAsync 변환 — 4파일 32곳 수동 처리 필수 (sed 불가) [FAIL-01]

> `vi.advanceTimersByTimeAsync` 는 jest 에 동등 API 없음. 아래 패턴으로 1:1 변환.

변환 패턴:
```
// before (vitest)
await vi.advanceTimersByTimeAsync(N);

// after (jest) — 패턴 A: 인라인 (유일 권장)
jest.advanceTimersByTime(N);
await Promise.resolve();  // microtask flush
```

> 참고: `flushPromises = () => new Promise(setImmediate)` 패턴 B는 fake timer 환경에서 setImmediate 가 fake 처리되어 hang 위험. 대상 4파일 모두 useFakeTimers 환경이므로 패턴 A 만 사용.

대상 파일 (총 32곳):
- [ ] `src/__tests__/audio/AudioEngine-timer.test.ts` — 변환 + GREEN 확인
- [ ] `src/__tests__/hooks/useBgmPlayer.test.ts` — 변환 + GREEN 확인 (경로 실존 확인 후 진행)
- [ ] `src/__tests__/screens/S01SplashScreen.test.tsx` — 변환 + GREEN 확인
- [ ] `src/__tests__/screens/S10RecordScreen.bgm.test.tsx` — 변환 + GREEN 확인

완료 기준: 32곳 모두 패턴 변환 완료, 해당 파일 각각 `npm test <파일경로>` GREEN

#### jest-expo auto-mock vs setup.ts 수동 mock 정리 [FAIL-03]

> jest-expo 자동 mock 과 setup.ts 수동 mock 중복 시 silent conflict 발생 가능.

- [ ] jest-expo 공식 README 기준 auto-mock 제공 모듈 목록 확인
  - 공식 기준 포함: `expo-asset`, `expo-constants`, `expo-modules-core`, `expo-font`, `expo-localization`
- [ ] 현재 setup.ts 수동 mock 항목 중 auto-mock 중복 여부 개별 확인:
  - [ ] `expo-secure-store` — jest-expo auto-mock 제공 여부 확인; 제공 시 setup.ts 항목 제거
  - [ ] `expo-audio` — jest-expo auto-mock 제공 여부 확인; 제공 시 setup.ts 항목 제거
- [ ] RN 외부 라이브러리 mock (`react-native-safe-area-context`, `@invertase/react-native-apple-authentication` 등) — jest-expo 무관, setup.ts 유지
- [ ] 정리 후 `npm test` 실행하여 mock override 충돌 없음 확인

### 수용 기준

- (TEST) `npx tsc --project tsconfig.test.json --noEmit` 에러 없음
- (MANUAL) `grep -r "from 'vitest'" apps/mobile/src/__tests__/` 결과 0건
- (MANUAL) `grep -r "advanceTimersByTimeAsync" apps/mobile/src/__tests__/` 결과 0건 — [FAIL-01]
- (TEST) `npm test -- --testPathPattern=setup` 실행 시 setup 로드 에러 없음
- (TEST) `npm test src/__tests__/audio/AudioEngine-timer.test.ts` GREEN — [FAIL-01]
- (TEST) `npm test src/__tests__/screens/S01SplashScreen.test.tsx` GREEN — [FAIL-01]
- (TEST) `npm test src/__tests__/screens/S10RecordScreen.bgm.test.tsx` GREEN — [FAIL-01]

---

## Story 3 — 기존 테스트 파일 jest 호환 검증 + 전체 suite 통과

**GitHub Issue:** [#153](https://github.com/alruminum/jajang/issues/153)

**As a** 개발자  
**I want** 기존 모든 테스트 파일이 jest 환경에서 통과하길 원한다  
**So that** 화면/컴포넌트 단위 회귀 테스트가 CI에서 자동으로 실행된다

### 태스크 체크리스트

- [ ] `npm test` 전체 실행 후 실패 목록 확인
- [ ] 실패 원인별 분류 및 픽스:
  - (a) vi.* 잔류 → 일괄 변환
  - (b) moduleNameMapper 누락 alias → jest.config.js 추가
  - (c) 추가 RN 네이티브 모듈 mock 누락 → `__mocks__` 또는 setup 추가
  - (d) `@testing-library/react-native` v12 + jest-expo 호환 이슈 → render/fireEvent/waitFor 확인
- [ ] PR #149 (이어폰 모달 12 it) 포함 batch 4/5 테스트 모두 통과 확인
- [ ] CLAUDE.md `npx vitest run` → `npm test` 업데이트

### 수용 기준

- (TEST) `npm test` 결과 0 failures, 전체 test suite 통과
- (MANUAL) `grep -r "from 'vitest'" apps/mobile/src/` 결과 0건
- (TEST) `npm test -- --coverage` 실행 시 coverage 리포트 생성 (0 exit code)

---

## 관련 이슈

| 스토리 | GitHub Issue |
|---|---|
| Epic | [#150](https://github.com/alruminum/jajang/issues/150) |
| Story 1 | [#151](https://github.com/alruminum/jajang/issues/151) |
| Story 2 | [#152](https://github.com/alruminum/jajang/issues/152) |
| Story 3 | [#153](https://github.com/alruminum/jajang/issues/153) |
