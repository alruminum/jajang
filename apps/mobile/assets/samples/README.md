# apps/mobile/assets/samples/

테스트 전용 오디오 fixture. Story 2 AC-1 검증 목적으로만 사용.

## 파일 목록

| 파일 | 출처 | 라이선스 |
|---|---|---|
| `lullaby-sample.wav` | `apps/api/static/previews/brahms_preview.wav` 복사 | Public Domain — 브람스 자장가 (Johannes Brahms, 1868). 작곡가 사망 70년 이상 경과. 편곡·연주 저작권은 본 프로젝트 자체 생성물. |
| `voice-sample.wav` | ffmpeg sine 합성 (440Hz 10s dummy) | N/A — 테스트 전용 합성 신호. 실제 녹음 아님. |

## 사용 의도

`apps/mobile/src/assets/sample-fixtures.ts` 통해 DSP module (task 09) 단위 테스트 입력으로 사용.
프로덕션 빌드에도 번들링되나, 앱 사용자는 본 파일 대신 실제 녹음 파일을 입력으로 사용한다.

## 실제 목소리 교체 방법

`apps/mobile/assets/samples/voice-sample.wav` 를 실제 부모 목소리 녹음 (10초 내외, 44100Hz 16-bit mono WAV) 으로 교체 후 DSP chain 재검증.
