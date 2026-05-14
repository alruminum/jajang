// require() 경로는 번들러가 정적 분석하므로 변수 동적 생성 금지 (이유: Metro bundler static require).
// expo-asset 패키지 별도 import 금지 — expo 내장 Asset 은 task 09 에서 필요 시 사용.
// 본 파일은 순수 require() 참조만 제공한다.

export const SAMPLE_LULLABY = require('../../assets/samples/lullaby-sample.wav');
export const SAMPLE_VOICE   = require('../../assets/samples/voice-sample.wav');
