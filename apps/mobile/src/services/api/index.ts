// apps/mobile/src/services/api/index.ts
// Metro barrel — @services/api 동명 충돌 해소 (#86)
// 원본 axios 인스턴스는 ../api.ts (파일)에 존재한다.
// Metro가 디렉토리를 우선 해석하므로 이 index가 진입점이 된다.
// `api`를 re-export하는 이유: 기존 `@services/api` 직접 import 코드의 하위 호환 유지.

export { api } from '../api.ts';

export * from './songs';
export * from './generations';
export * from './recordings';
export * from './tracks';
