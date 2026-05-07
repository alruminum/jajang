/**
 * REQ-INFRA-01 — jest-expo 인프라 설정 검증
 *
 * 목적: package.json 변경 (jest 의존성 + "test": "jest" 스크립트) 완료 후
 *       jest-expo preset 과 setupFilesAfterEnv(_setup.ts) 가 정상 동작하는지 검증.
 *
 * 수용 기준 대응:
 *   (TEST-1) npm test -- --listTests: 이 파일이 testMatch 패턴에 매칭되어 목록에 포함
 *   (TEST-2) npm test -- --passWithNoTests: 런타임 오류 없이 0 exit code
 *
 * 검증 범위:
 *   - setupFilesAfterEnv 로드 성공 (_setup.ts 전역 적용 확인)
 *   - testEnvironment: 'node' 반영 확인
 *   - jest 전역 API 완전 초기화 확인
 *   - _setup.ts의 AsyncStorage mock 주입 확인
 *
 * 이 파일은 __tests__/infra/ 에 위치하므로 testMatch 패턴
 * '**/__tests__/**\/*.test.ts' 에 해당 — jest가 파싱·실행 성공 = (TEST-1) 충족.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

describe('REQ-INFRA-01 — jest 인프라 설정 검증', () => {
  // ─── (TEST-2) 런타임 기동 ────────────────────────────────────────────────────

  it('jest 런타임이 오류 없이 실행된다', () => {
    // Given: jest-expo preset 이 로드된 상태
    // When: 기본 산술 평가
    // Then: 결과가 정확히 2 (jest 런타임 정상 기동 확인)
    expect(1 + 1).toBe(2);
  });

  // ─── setupFilesAfterEnv (_setup.ts) 로드 검증 ───────────────────────────────

  it('_setup.ts 가 로드되어 __DEV__ 전역이 false 로 설정된다', () => {
    // Given: setupFilesAfterEnv: ['./src/__tests__/_setup.ts'] 설정
    // When: __DEV__ 전역 값 참조
    // Then: _setup.ts 에서 설정한 false 와 일치
    expect((global as Record<string, unknown>).__DEV__).toBe(false);
  });

  it('_setup.ts 가 로드되어 AsyncStorage mock 이 주입된다', () => {
    // Given: _setup.ts 에서 jest.mock('@react-native-async-storage/async-storage')
    // When: AsyncStorage.getItem 함수 타입 확인
    // Then: jest mock 함수로 주입됨
    expect(typeof AsyncStorage.getItem).toBe('function');
    expect(jest.isMockFunction(AsyncStorage.getItem)).toBe(true);
  });

  it('AsyncStorage.getItem mock 이 null 을 resolve 한다', async () => {
    // Given: _setup.ts mock 기본값 mockResolvedValue(null)
    // When: getItem 호출
    // Then: null resolve (mock 동작 정상)
    const result = await AsyncStorage.getItem('any-key');
    expect(result).toBeNull();
  });

  // ─── testEnvironment: 'node' 반영 확인 ──────────────────────────────────────

  it('testEnvironment 가 node 이므로 window 가 undefined 이다', () => {
    // Given: jest.config.js testEnvironment: 'node'
    // When: window 전역 참조
    // Then: node 환경에서 window 는 정의되지 않음
    expect(typeof window).toBe('undefined');
  });

  // ─── jest 전역 API 완전 초기화 확인 ─────────────────────────────────────────

  it('jest.fn() 이 동작하고 mock 함수를 반환한다', () => {
    // Given: jest 전역 초기화 완료
    // When: jest.fn() 생성
    // Then: mock 함수 여부가 true
    const mockFn = jest.fn();
    expect(jest.isMockFunction(mockFn)).toBe(true);
  });

  it('jest.fn() mock 의 호출 횟수가 정확히 추적된다', () => {
    // Given: jest.fn() 으로 생성된 mock 함수
    // When: 2회 호출
    // Then: toHaveBeenCalledTimes(2)
    const mockFn = jest.fn();
    mockFn();
    mockFn();
    expect(mockFn).toHaveBeenCalledTimes(2);
  });
});
