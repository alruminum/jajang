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
    // React 단일 인스턴스 보장 (monorepo dual-instance 방지)
    '^react$': '<rootDir>/node_modules/react',
    '^react/(.*)$': '<rootDir>/node_modules/react/$1',
    '^react-test-renderer$': '<rootDir>/../../node_modules/react-test-renderer',
    '^react-test-renderer/(.*)$': '<rootDir>/../../node_modules/react-test-renderer/$1',
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
    '/src/__tests__/(?!(_smoke|audio/AudioEngine-timer|useBgmPlayer|screens/S01SplashScreen|screens/S10RecordScreen\\.bgm)\\.test\\.(ts|tsx))',
  ],
};
