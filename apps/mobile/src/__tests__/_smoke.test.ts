/**
 * REQ-INFRA-01 — Jest 인프라 smoke test
 *
 * 목적: jest-expo preset 이 정상 부트하는지 확인.
 * 비즈니스 로직 검증 X — 인프라 설치 결과 검증.
 *
 * 수용 기준 대응:
 *   (TEST) npm test -- --listTests 실행 시 에러 없이 .test.ts(x) 파일 목록 출력
 *   (TEST) npm test -- --passWithNoTests 가 0 exit code 로 종료
 *
 * 이 파일이 존재하고 jest 가 실행할 수 있으면 두 기준 모두 충족.
 */

describe('REQ-INFRA-01 — jest 인프라 smoke', () => {
  it('jest 런타임이 정상 부트한다', () => {
    // Given: jest-expo preset 이 로드된 환경
    // When: 기본 산술 평가
    // Then: 결과가 정확히 2
    expect(1 + 1).toBe(2);
  });

  it('describe / it / expect 전역 API 가 주입된다', () => {
    // Given: jest 전역 설정 (tsconfig.test.json types: ["jest"])
    // When: typeof 검사
    // Then: 함수로 확인
    expect(typeof describe).toBe('function');
    expect(typeof it).toBe('function');
    expect(typeof expect).toBe('function');
  });
});
