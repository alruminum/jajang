---
depth: std
---
# impl-01 — Jest 인프라 설치 (deps + config)

**이슈**: #151  
**에픽**: epic-08-mobile-test-infra  
**선행 impl**: 없음 (인프라 에픽 시작점)  
**후행 impl**: 02-setup-mock-jest-migration.md (이 파일 완료 후 진행)

---

## 결정 근거

### 왜 jest-expo인가

| 기준 | jest-expo | @react-native/jest-preset |
|---|---|---|
| Expo 55 Bare workflow 공식 권장 | O | X |
| Flow strip (babel-preset-expo 내장) | O | O (별도 preset) |
| expo-modules-core 등 Expo SDK auto-mock | O | X (수동) |
| 이 프로젝트 현황 | Expo 55 Bare | 해당 없음 |

결론: `jest-expo` 채택. 내부적으로 `@react-native/babel-preset` + `babel-jest`로 Flow 타입 strip 처리.

### react-test-renderer / @types/react 버전 정합

현재 `react: 19.2.0` (package.json). `react-test-renderer`는 react 메이저 버전과 동일해야 함.  
`@types/react ~18.3.0` → `^19.0.0` 업그레이드 필요 (jest-expo peerDep 정합).  
jest-expo peerDependencies: react-test-renderer의 react 19.x 지원 여부를 `npm view jest-expo peerDependencies` 로 사전 확인 후 진행.

### vitest 제거 이유

vitest + esbuild는 react-native Flow 타입 문법(`opaque type`, `interface X mixins Y` 등)을 파싱하지 못함. jest-expo는 babel-jest + babel-preset-expo로 Flow strip하여 근본 해결.

---

## 수정/생성 파일 목록

| 파일 | 작업 | 상태 | 설명 |
|---|---|---|---|
| `apps/mobile/package.json` | 수정 | **미완료** | devDeps 교체 + scripts 추가 |
| `apps/mobile/jest.config.js` | 신규 생성 | **완료** | 이미 생성됨 — 수정 불필요 |
| `apps/mobile/babel.config.js` | 수정 없음 | 완료 | babel-preset-expo 이미 설정됨 — 변경 불필요 |
| `apps/mobile/tsconfig.test.json` | 수정 | **완료** | 이미 `"types": ["jest"]` 로 설정됨 |
| `apps/mobile/vitest.config.ts` | 비활성화 | **완료** | 파일이 이미 존재하지 않음 (비활성화 완료) |

> **실제 작업 범위**: `package.json` 변경만 수행하면 됨. 나머지 파일은 이미 목표 상태.

---

## package.json 변경 명세

### devDependencies 제거

```
"vitest": "^3.0.0"
```

### devDependencies 추가

```json
"jest": "^29.0.0",
"jest-expo": "~55.0.0",
"babel-jest": "^29.0.0",
"@types/jest": "^29.0.0"
```

> `jest-expo ~55.0.0`: Expo SDK 55와 마이너 정합. npm에서 최신 55.x 패치 자동 적용.

### devDependencies 버전 업그레이드

```json
"react-test-renderer": "^19.2.0",   // 18.3.1 → react 19 메이저 정합
"@types/react": "^19.0.0"           // ~18.3.0 → 19.x
```

> 사전 검증 필수: `npm view jest-expo@~55.0.0 peerDependencies` 실행. react-test-renderer 19.x 미지원 시 지원하는 최신 버전으로 고정 후 impl 파일 수정.

### scripts 변경

```json
"test": "jest",
"test:ci": "jest --ci --coverage"
```

기존 `test` 스크립트(vitest 관련) 교체. `start`, `ios`, `android` 등 비관련 scripts는 유지.

---

## jest.config.js 전체 (신규 생성)

```js
/** @type {import('jest-expo').JestPreset} */
module.exports = {
  preset: 'jest-expo',

  // ─── Flow 타입 포함 RN 생태계 패키지 babel 변환 허용 ───────────────────────
  // jest-expo 기본 패턴에 이 프로젝트에서 사용하는 추가 패키지 병합.
  // react-native-track-player는 __mocks__ 파일로 처리되므로 목록 불포함.
  transformIgnorePatterns: [
    'node_modules/(?!(' +
      'react-native' +
      '|@react-native' +
      '|expo' +
      '|@expo' +
      '|expo-modules-core' +
      '|expo-audio' +
      '|expo-secure-store' +
      '|expo-web-browser' +
      '|expo-status-bar' +
      '|@react-navigation' +
      '|react-native-safe-area-context' +
      '|react-native-screens' +
      '|@react-native-async-storage' +
      '|@react-native-google-signin' +
      '|@invertase/react-native-apple-authentication' +
      ')/)',
  ],

  // ─── tsconfig paths → jest moduleNameMapper 동기화 ────────────────────────
  // babel.config.js module-resolver alias와 1:1 대응.
  moduleNameMapper: {
    '^@screens/(.*)$': '<rootDir>/src/screens/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@store/index$': '<rootDir>/src/store/index.ts',
    '^@store/(.*)$': '<rootDir>/src/store/$1',
    '^@store$': '<rootDir>/src/store/index.ts',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@audio/(.*)$': '<rootDir>/src/audio/$1',
    '^@navigation/(.*)$': '<rootDir>/src/navigation/$1',
    '^@hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@types/(.*)$': '<rootDir>/src/types/$1',
    '^@lib/(.*)$': '<rootDir>/src/lib/$1',
    // babel.config.js의 직접 파일 alias — jest-expo 환경에서 모듈 해상도 보장
    '^react-native-google-mobile-ads$': '<rootDir>/src/__mocks__/react-native-google-mobile-ads.js',
    '^react-native-track-player$': '<rootDir>/src/__mocks__/react-native-track-player.js',
    '^react-native-purchases$': '<rootDir>/stubs/react-native-purchases.js',
  },

  // ─── 전역 setup ────────────────────────────────────────────────────────────
  setupFilesAfterEnv: ['./src/__tests__/_setup.ts'],

  // ─── 테스트 환경 ───────────────────────────────────────────────────────────
  // jest-expo 기본값은 'node'. @testing-library/react-native는 node 환경에서 동작.
  testEnvironment: 'node',

  // ─── 파일 수집 패턴 ────────────────────────────────────────────────────────
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.tsx',
    '**/*.test.ts',
    '**/*.test.tsx',
  ],

  // ─── setup 파일 자체는 테스트 대상 제외 ────────────────────────────────────
  testPathIgnorePatterns: [
    '/node_modules/',
    '/src/__tests__/_setup\\.ts$',
  ],
};
```

> jest 29.x 공식 키: `setupFilesAfterEnv` (위 코드 블록에 정확히 반영됨).

---

## tsconfig.test.json 수정

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": ["jest"]
  },
  "include": ["src/**/__tests__/**/*", "src/**/*.test.*", "src/**/*.spec.*"]
}
```

변경: `"types": ["vitest/globals"]` → `"types": ["jest"]`

---

## vitest.config.ts 비활성화

```bash
cd apps/mobile
mv vitest.config.ts vitest.config.ts.disabled
```

삭제 금지 (롤백 시 참조용). git에서는 rename으로 기록.

---

## 구현 레시피 (순서)

> jest.config.js, tsconfig.test.json, vitest.config.ts 비활성화는 이미 완료 상태.
> 실제 작업은 package.json 변경 + npm install + 검증만 수행.

1. `npm view jest-expo@~55.0.0 peerDependencies` 실행 → react-test-renderer 지원 버전 확인
2. `package.json` devDependencies 수정 (위 명세대로)
3. `npm install` 실행 → peerDep 경고 0건 확인
4. `npm test -- --listTests` 실행 → 에러 없이 .test.ts(x) 목록 출력 확인
5. `npm test -- --passWithNoTests` 실행 → 0 exit code 확인

---

## 수용 기준

- (TEST) `npm test -- --listTests` 실행 시 에러 없이 .test.ts(x) 파일 목록 출력 (0 exit code)
- (TEST) `npm test -- --testPathPattern=infra/jest-setup` 6/6 GREEN (0 exit code) — jest 인프라 기동 확인용. 전체 suite GREEN은 Story 3(#153) 수용 기준.
- (MANUAL) `npm install` 후 peerDep 경고 0건 (react-test-renderer ^19.2.0 + @types/react ^19.0.0 정합)
- (MANUAL) `ls apps/mobile/vitest.config.ts` → No such file (이미 존재하지 않음, 확인만)

---

## 주의사항

- `babel.config.js`는 이미 `babel-preset-expo` + `module-resolver`가 설정되어 있으므로 수정 불필요. jest-expo는 babel-preset-expo를 내부적으로 사용하므로 babel.config.js가 그대로 동작함.
- `jest.config.js`의 `moduleNameMapper`와 `babel.config.js`의 `alias`는 반드시 동기화 상태 유지. 둘 중 하나만 수정하면 런타임(Metro)과 테스트(jest) 간 모듈 해상도 불일치 발생.
- **`@lib` alias 불일치**: `src/services/api.ts`가 `@lib/session-events`를 import하는데 `babel.config.js`에 `@lib` alias가 없음. jest 환경에서는 `moduleNameMapper`의 `'^@lib/(.*)$': '<rootDir>/src/lib/$1'`으로 해소되지만, Metro(런타임)에서는 별도 수정 필요. 이 impl 범위에서는 jest 환경 정합만 보장하며, babel.config.js `@lib` alias 추가는 별도 이슈로 분리.
- `transformIgnorePatterns`에서 패키지명에 `-`가 포함된 경우 regex 메타문자 이스케이프 불필요 (`-`는 문자 클래스 밖에서 리터럴).
- `react-native-track-player`는 `moduleNameMapper`에서 `__mocks__` 파일로 직접 매핑하므로 `transformIgnorePatterns`에서 제외해도 됨.
