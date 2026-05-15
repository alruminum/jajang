/**
 * REQ-004 — sample-fixtures.ts export 존재 및 타입 검증
 *
 * 목적: SAMPLE_LULLABY / SAMPLE_VOICE 두 export 가 정상적으로 노출되고
 *       Metro bundler require() 반환값인 number 타입임을 검증한다.
 *
 * 수용 기준 대응:
 *   REQ-004 (TEST): sample-fixtures.ts 에 SAMPLE_LULLABY / SAMPLE_VOICE export 존재
 *
 * jest 환경 .wav require 처리:
 *   Metro bundler 는 require('*.wav') 를 모듈 ID 정수로 반환하지만,
 *   jest(node) 환경은 .wav 파일을 transform 하지 못한다.
 *   → 각 .wav require 를 jest.mock virtual 로 우회, Metro 동작 모사 (정수 반환).
 *   jest.config.js 수정 불필요 — 이 파일 안에서 완결.
 *
 * REQ-005 (TypeScript 컴파일 통과) 는 jest 단위 테스트가 아닌
 *   `npm run type-check` 명령으로 검증하므로 본 파일에서 다루지 않는다.
 */

// ─── .wav require 를 jest virtual mock 으로 우회 ───────────────────────────
// jest 호출 순서 규칙: jest.mock 은 파일 최상단 (import 전) 에 위치해야
// babel-jest hoisting 이 정상 동작한다.
jest.mock('../../assets/samples/lullaby-sample.wav', () => 1, { virtual: true });
jest.mock('../../assets/samples/voice-sample.wav',   () => 2, { virtual: true });

// ─── 검증 대상 모듈 import ────────────────────────────────────────────────
// engineer 가 아직 파일을 생성하지 않은 선작성(TDD) 상태 → import error 로
// RED 확인이 정상. jest.mock virtual 이 resolve 를 우회하므로 wav 에러 없음.
import { SAMPLE_LULLABY, SAMPLE_VOICE } from '../sample-fixtures';

// ─── describe / it 블록 ───────────────────────────────────────────────────

describe('REQ-004 — sample-fixtures.ts SAMPLE_LULLABY / SAMPLE_VOICE export', () => {

  it('SAMPLE_LULLABY import 가 throw 없이 성공한다', () => {
    // Given: jest virtual mock 으로 lullaby-sample.wav → 1 매핑된 환경
    // When: import { SAMPLE_LULLABY } from '../sample-fixtures'
    // Then: 정의되어 있다 (undefined 가 아님)
    expect(SAMPLE_LULLABY).toBeDefined();
  });

  it('SAMPLE_VOICE import 가 throw 없이 성공한다', () => {
    // Given: jest virtual mock 으로 voice-sample.wav → 2 매핑된 환경
    // When: import { SAMPLE_VOICE } from '../sample-fixtures'
    // Then: 정의되어 있다 (undefined 가 아님)
    expect(SAMPLE_VOICE).toBeDefined();
  });

  it('SAMPLE_LULLABY 의 타입이 number 이다', () => {
    // Given: Metro bundler 는 require() 에 모듈 ID 정수를 반환한다
    // When: typeof SAMPLE_LULLABY 평가
    // Then: 정확히 'number'
    expect(typeof SAMPLE_LULLABY).toBe('number');
  });

  it('SAMPLE_VOICE 의 타입이 number 이다', () => {
    // Given: Metro bundler 는 require() 에 모듈 ID 정수를 반환한다
    // When: typeof SAMPLE_VOICE 평가
    // Then: 정확히 'number'
    expect(typeof SAMPLE_VOICE).toBe('number');
  });

  // 두 export 의 분리(서로 다른 값) 검증은 Metro 실 번들에서만 검증 가능.
  // jest-expo preset 의 asset transformer 는 모든 정적 asset 을 정수 `1` 로 일괄 mock 하므로
  // SAMPLE_LULLABY !== SAMPLE_VOICE 는 단위 테스트로 표현 불가 → REQ-004 핵심
  // ("export 2개 존재 + number 타입") 4 it 으로 충분.

});
