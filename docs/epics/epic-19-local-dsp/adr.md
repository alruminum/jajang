# Epic 19 — ADR (Architecture Decision Records)

> Local DSP migration 관련 결정. 본 epic 종료 시점에 핵심 결정 (특히 ADR-19A 라이브러리 최종 선정) 은 `docs/ADR.md` 본문으로 승격 / 본 파일은 epic-local 추가 결정 (B/C/D/E) 유지.

**관련**:
- 본 architecture 가설: [architecture.md](architecture.md)
- 본 epic stories: [stories.md](stories.md)
- 기존 프로젝트 ADR: [docs/ADR.md](../../ADR.md)

---

## ADR-19A — Local DSP path 도입 + 라이브러리 후보 spike 게이팅

**상태**: Proposed (Story 1 spike 결과 의존 — PASS 시 Accepted, FAIL 시 Superseded by 새 ADR 또는 epic 폐기)

**결정**:
서버 ffmpeg DSP 파이프라인을 mobile (iOS + Android, Expo Bare RN) 디바이스에서 직접 실행하는 path 를 추가한다. 라이브러리는 단일 선정이 아닌 **spike 게이팅** 으로 결정한다:
- 1차 후보: `jdarshan5/ffmpeg-kit-react-native` fork
- 2차 fallback: `ffmpeg-expo` (kingjnr4)
- 3차 fallback: 자체 native module (iOS AVAudioEngine + Android AudioEffect)

Story 1 spike 5 artifacts (working build / `ffprobe -filters` / 디바이스별 30초 처리시간 / ipa/apk 델타 / LGPL 확정) 모두 PASS 시에만 1차 후보 채택. 1+ FAIL 시 2차 fallback 으로 재진입, 모두 FAIL 시 V2+ 이관 또는 epic 폐기.

**이유**:
- **인프라 비용 절감** — Celery worker + API server stop → 인프라 비용 0
- **오프라인** — 새벽 와이파이 끊긴 환경에서도 자장가 생성 가능 (현재 NW 의존 path 의 핵심 UX 약점)
- **프라이버시** — raw 부모 음성이 디바이스 외 유출 0 (생체정보 안전 우선, PRD §F13 정합)
- **외부 검증된 라이브러리 retire 인지** — `ffmpeg-kit` 본가 2025-01-06 retire, 2025-04-01 v6.0 바이너리 npm/CocoaPods/Maven 제거, 2025-06-23 GitHub archive ([plan-reviewer PRE_CHECK 2026-05-13](stories.md#참고))

**트레이드오프**:
- 1차 후보 = semver 없음 + Expo Bare 통합 문서 없음 + 단일 binary release (2025-04-08) 만. **선정 자체가 위험** → spike 게이팅 필수
- LGPL App Store 정합 = Arthenica wiki "hard to achieve", Apple 공식 입장 없음 → artifact #5 검증 의무
- 앱 크기 +45~150MB (full variant) → ABI split + iOS thinning 으로 완화 spike 측정 필요
- fork bug fix = 자체 책임. 본가 issue tracker 응답 0

**대안 (버린 것)**:
- `@spreen/ffmpeg-kit-react-native` — iOS-only + GPL → App Store 불가
- `react-native-audio-api` (Software Mansion) — `afftdn` 동등 noise reduction missing, `acrossfade` missing
- `ffmpeg.wasm` on RN — Hermes / JSC WASM 미지원
- `expo-av` — 재생/녹음만, DSP X
- 서버 path 유지 (현행) — 본 epic 의 도입 동기 (비용/오프라인/프라이버시) 미충족

---

## ADR-19B — 서버 DSP path 코드 보존 + 배포 stop

**상태**: Proposed

**결정**:
서버 DSP 엔드포인트 (`apps/api/app/api/v1/sessions.py` + Celery `dsp_process_task` + `apps/api/app/services/dsp/*` + `counter_repo.py`) 와 데이터 모델 (`RecordingSession` / `Recording` / `MasterAudio` / `GenerationCounter`) 코드/스키마/마이그레이션 **삭제 0 / 변경 0**. 배포만 stop (Celery worker stop + API server stop, 인프라 비용 0). 클라이언트 호출 site 만 mobile local path 로 교체.

**이유**:
- **V2+ AI 합성 부활 대비** — DSP 가 충분하지 않다고 판단되는 V3+ 시점에 AI 합성 (OpenVoice / F5-TTS / RVC 등) 부활 가능성 존재. 그때 서버 인프라 재구축 비용 = 대규모 → 코드 보존이 압도적으로 싸다
- **삭제 비용 = 코드 변경 PR + 마이그레이션 down 작성** = 0 가치 작업
- **유지 비용 = 0** (배포 stop 만 하면 됨, 코드는 main 트리에 잔존)

**트레이드오프**:
- dead code 누적 → lint warning 허용 + `apps/mobile/src/services/api/generations.ts` 호출 site 0 = 명시
- 서버 path 유지 보수 (security patch / dep update) 책임 잔존 → "deploy stop 상태에서 main 트리만 sync" 정책 명시
- 코드 read 시 신규 엔지니어 혼란 가능 → `apps/api/app/api/v1/sessions.py` 헤더에 "v1.4.x 부터 MVP 미호출, 미래 sync 진입 시 재활성화" 주석 박음 (Story 3 impl)

---

## ADR-19C — 미래 sync 정책: raw 영구 로컬 / 완성 mp3 만 서버 업로드

**상태**: Proposed (정책 박힘. 실제 sync 기능 구현은 V2+)

**결정**:
미래 sync 기능 도입 시 (다중 디바이스 동기화 / 가족 공유 / 클라우드 백업 등) 다음 정책을 따른다:
- **raw 부모 녹음** — 디바이스 영구 로컬. 서버 업로드 0. 디바이스 분실 시 raw 손실 수용 (생체정보 안전 우선)
- **완성 mp3** — 사용자 명시 동의 시 서버 업로드 (`POST /sessions/{id}/upload-master` 신규 엔드포인트, Story 3 impl 에서 경로명만 박고 미구현)
- **서버 DSP 처리 0** — 업로드된 mp3 는 이미 mobile 에서 DSP 완료. 서버는 S3 저장만 수행
- **카운터 reconcile** — 클라 카운터 (3회) ↔ 서버 카운터 reconcile 방식 = 본 epic 미결, sync 진입 시 결정

**이유**:
- **법적 안전 우선** (ADR 철학) — raw 음성 = 생체정보, 출시 후 데이터 유출 사고 = catastrophic. 영구 로컬 = 사고 가능성 = 0
- **인프라 비용 최소화** — 서버 DSP 처리 = 0 (mobile 에서 이미 처리). S3 storage 비용만
- **사용자 통제권** — 업로드 = 명시 동의 게이트. 디폴트 = 업로드 0

**트레이드오프**:
- 디바이스 분실 시 raw 손실 → 사용자 재녹음 필요. "raw 백업" 기능 요구 발생 시 본 ADR supersede 필요
- 다중 디바이스 동기화 = mp3 만 → raw 기반 재처리 (예: DSP 파라미터 튜닝 후 재생성) 불가. mobile-only 한계 수용

---

## ADR-19D — spike-driven epic 패턴 (PRD spec 확정 spike 결과로 미룸)

**상태**: Proposed (본 epic 패턴 명시)

**결정**:
본 epic 은 PRD spec 확정을 spike 결과로 미루는 **spike-driven epic** 패턴을 따른다:
- PRD v1.4.x = *candidate 트랙* 1단락만 박힘 (spec 변경 X, 진행 트랙 marker)
- architecture 산출 = 본 `architecture.md` (가설). `docs/ARCHITECTURE.md` 본문 보강 X
- Story 1 spike 5 artifacts PASS 시점에 PRD F4 spec 확정 갱신 + `docs/ARCHITECTURE.md` 본문 보강
- 1+ artifact FAIL 시 epic 폐기 또는 V2+ 이관 → PRD 변경 0 / ARCHITECTURE 변경 0 (rollback 비용 0)

**이유**:
- **catastrophic risk 회피** — plan-reviewer PRE_CHECK 결과 (2026-05-13) 가 명확히 "측정 spike 없이 Story 2 진입은 catastrophic" 으로 판정. spec 확정을 spike 앞에 두면 spec 갈아엎기 + 후속 doc cascade
- **plan-reviewer §8.2 정합** — "Spike Gate 충족 = 측정 결과로 spec 확정" 원칙. abstract interface + Mock 만으로 PASS 처리 = 안티패턴
- **rollback 비용 최소화** — 가설 epic-local 문서 = epic 폐기 시 디렉토리 1개 삭제로 끝

**트레이드오프**:
- "이중 문서" 비용 — 가설 (epic-local) ↔ 확정 (root). spike PASS 후 본문 보강 1회 필요
- 후속 엔지니어가 가설 문서를 confirmed spec 으로 오인 위험 → 본 architecture.md 상단 + 본 ADR 모두 "가설" 명시 박음

---

## ADR-19E — 통합 브랜치 패턴 (long-lived feature branch + sub-PR + 옵션 c-1 수동 close)

**상태**: Proposed (본 epic 한정)

**결정**:
본 epic 은 trunk-based 기본 워크플로의 예외로 **long-lived integration branch** 패턴을 따른다:
- `feature/local-dsp` 통합 브랜치 (main 에서 분기, spike 진행 동안 유지)
- sub-PR base = `feature/local-dsp` (main 아님)
- story 이슈 = epic 의 GitHub sub-issue 로 등록 (epic #262, story #263/#264/#265)
- GitHub `Closes #N` auto-close 키워드는 base ≠ main 일 때 미발동 → **story 이슈는 메인 Claude 가 sub-PR 머지 직후 수동 close** (`gh issue close #story-N --comment "PR #M merged into feature/local-dsp"`)
- 마지막 main 머지 PR (`feature/local-dsp` → `main`) = `Closes #262` (epic) 만 박으면 충분 (story 이슈는 이미 진행 중 수동 close 완료)
- main 정기 backport (drift 방지)

**이유**:
- **spike 결과 의존 = epic 자체 폐기 가능성 존재** — main 직접 머지 시 polluted history. integration branch = 폐기 시 single revert/branch delete 로 정리
- **다수 sub-PR 누적** — spike 5 artifacts 측정 + Story 2/3 구현 = 6+ sub-PR. 각자 main 머지 시 PR review 부담 분산 → integration branch 안에서 누적 검증 후 한방 머지
- **옵션 c-1 = "story 수동 close 허용"** — CLAUDE.md "GitHub API 이슈 직접 close 금지" 룰의 trunk-based 가정에 대한 통합 브랜치 한정 예외 명시. PR-ref 박힌 comment 동반 close → 추적 손실 0

**트레이드오프**:
- main backport 누락 시 drift 누적 → "주 1회 또는 sub-PR 머지 직후 main backport" 정책 명시
- story 이슈 수동 close 누락 시 epic close 시점에 잔존 → 메인 Claude 가 sub-PR 머지 직후 의무 박음 (실수 시 epic close 머지 PR review 단계에서 catch)
- 1인 개발 + 짧은 spike (며칠~몇 주) 환경 → drift 위험 낮음 (다중 개발자 환경에서는 본 패턴 재검토 필요)

---

> 후속 결정 (라이브러리 최종 선정 / sync 엔드포인트 spec / 카운터 reconcile 방식 등) 은 spike PASS 후 추가.
