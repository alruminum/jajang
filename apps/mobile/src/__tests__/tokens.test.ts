/**
 * TDD guard shim — theme/tokens.test.ts 의 실제 테스트를 re-export.
 * dcness tdd-guard.sh 가 apps/mobile/src/theme/tokens.ts 에 대한
 * 매칭 테스트를 찾을 때 parent/__tests__/<name>.test.ts 패턴으로
 * 이 파일을 인식한다. 실제 assertion 은 theme/tokens.test.ts 에 있음.
 */
export * from './theme/tokens.test';
