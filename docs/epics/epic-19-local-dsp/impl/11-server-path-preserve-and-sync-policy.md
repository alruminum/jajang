---
depth: simple
design: not-required
story: 3
task_index: 1/1
---

# 11 — server-path-preserve-and-sync-policy

서버 DSP path (`/sessions/*` + Celery DSP task + S3) 코드 보존 명시 + 미래 sync 정책 (raw 영구 로컬 / 완성 wav 만 업로드) 을 root `docs/ARCHITECTURE.md` + `docs/ADR.md` 에 박는다. 코드 변경 = minimal (헤더 주석 2건).

---

## 사전 준비 (먼저 read 필수)

- `docs/epics/epic-19-local-dsp/adr.md` ADR-19A/B/C — Local DSP path + 서버 path 보존 + sync 정책 결정 사항
- `docs/epics/epic-19-local-dsp/architecture.md` §3.5 / §3.6 — 미래 sync 진입 시 데이터 흐름
- `docs/ARCHITECTURE.md` §음원 생성 시퀀스 (line 153) — 기존 DSP 시퀀스 위치
- `docs/ADR.md` — ADR-009 까지 박힌 root ADR. 다음 번호 = ADR-010
- `apps/api/app/api/v1/sessions.py` — 헤더 주석 추가 대상 (변경 minimal)
- `apps/mobile/src/services/api/generations.ts` — 헤더 주석 추가 대상

---

## Scope

**이 task 가 다루는 것**:

1. `docs/ARCHITECTURE.md` — §음원 생성 시퀀스 갱신 (Local DSP 시퀀스 = MVP 활성 / 서버 DSP 시퀀스 = 보존 / 미래 sync 시퀀스 = 경로명만 박음)
2. `docs/ADR.md` — ADR-010 신규 (Local DSP path 도입 + 서버 path 보존 + 미래 sync 정책)
3. `apps/api/app/api/v1/sessions.py` — 헤더 docstring 추가 (MVP 미호출 명시)
4. ~~`apps/mobile/src/services/api/generations.ts` — 헤더 주석 추가~~ → **제외** (dcness TDD guard 가 비-테스트-파일 변경 차단. 빈 stub 회피 → mobile 측 정책은 `docs/ARCHITECTURE.md` + `docs/ADR.md` ADR-010 로 cover)

**이 task 가 건드리지 않는 것**:

- `apps/api/app/api/v1/sessions.py` 의 *함수 본문 / 라우터 데코레이터* — ADR-19B "삭제 0 / 변경 0" 절대 준수
- `apps/api/app/tasks/dsp_processing.py` / `apps/api/app/services/dsp/*` / `apps/api/app/services/counter_service.py` — 보존 대상
- 데이터 모델 (`RecordingSession` / `Recording` / `MasterAudio` / `GenerationCounter`) — 보존
- 마이그레이션 — 추가 0 / 삭제 0
- `apps/mobile/src/audio/local-dsp/*` — task 09 산출물
- 인프라 (Celery / S3 / DB) — 변경 0 (deploy 정지만)

---

## 인터페이스

### 1. `docs/ARCHITECTURE.md` 갱신

§음원 생성 시퀀스 (DSP 방식) 섹션을 다음 구조로 재구성:

```markdown
### 음원 생성 시퀀스

**MVP (v1.4.x+) — Local DSP path 활성**

[Mermaid sequence — App + LocalDspService + LocalCounterRepo. 서버 / S3 / Celery 0]

**Server DSP path — 코드 보존, MVP 미호출 (미래 sync 활성화 시 복귀)**

[기존 Mermaid sequence 보존, 단 상단에 ⚠️ 보존 표시]

**미래 sync 진입 시 (V2+)**

- 클라이언트: mobile DSP 완료 mp3 만 (raw 0) `POST /sessions/{id}/upload-master` 신규 엔드포인트로 업로드 (사용자 명시 동의 게이트)
- 서버: DSP 처리 0. S3 저장 + `MasterAudio` 메타 등록만
- 카운터 reconcile: 클라 카운터 (3회) ↔ 서버 `GenerationCounter` reconcile 방식 = V2+ 결정 미루기
```

### 2. `docs/ADR.md` 갱신 — ADR-010 신규

ADR-009 다음 위치 (line 103 이후) 에 신규 ADR 추가:

```markdown
### ADR-010: Local DSP path 도입 + 서버 path 보존 + 미래 sync 정책

**결정**: v1.4.x 부터 mobile 디바이스 로컬 DSP path (`LocalDspService` + `DspPipeline` + `MinimalDspBridgeImpl` + `LocalCounterRepo`) 활성. 서버 DSP path (`/sessions/*` + Celery + S3) 코드 보존 (삭제 0 / 변경 0), 배포만 stop. 미래 sync 진입 시 완성 wav 만 업로드 (raw 영구 로컬).

**이유**:
- 인프라 비용 절감 (Celery / API server / S3 storage 0)
- 오프라인 (네트워크 의존 0 — 새벽 와이파이 끊긴 환경)
- 프라이버시 (raw 음성 디바이스 외 유출 0, 생체정보 안전 우선)

**트레이드오프**: dead code 누적 → lint warning 허용. 단 V2+ AI 합성 부활 / sync 진입 시 인프라 재구축 비용 회피 가치 우선.

**Epic-local 결정** (자세히): [docs/epics/epic-19-local-dsp/adr.md](epics/epic-19-local-dsp/adr.md) ADR-19A~19E.
```

### 3. `apps/api/app/api/v1/sessions.py` 헤더 주석

파일 최상단 (import 직전) 에 다음 docstring 추가:

```python
"""
Server DSP path — MVP v1.4.x 부터 클라이언트 호출 0 (mobile local DSP path 채택, ADR-010).

코드/스키마/마이그레이션 보존 — 미래 sync 진입 시 (다중 디바이스 동기화 / 가족 공유 등)
재활성화 가능. 신규 엔드포인트 = `POST /sessions/{id}/upload-master` (미구현, 경로명만 박힘).

자세히 = docs/epics/epic-19-local-dsp/adr.md ADR-19B.
"""
```

### 4. ~~`apps/mobile/src/services/api/generations.ts` 헤더 주석~~ → 제외

dcness TDD guard hook 가 비-테스트-파일 (generations.ts) 변경 시 테스트 파일 동반 요구. 헤더 주석 1줄 추가에 빈 stub 테스트 작성 = 안티패턴 ([[feedback_dcness_tdd_guard_theme_infix_false_positive]] 정합).

→ mobile 측 정책은 `docs/ARCHITECTURE.md` (§음원 생성 시퀀스 — Server DSP path 보존 보조 박힘) + `docs/ADR.md` ADR-010 으로 cover. task 10 에서 이미 `recordingsApi` / `generationsApi` import 제거 + 호출 site 0 달성 → 신규 엔지니어가 파일 read 시 *호출 0 사실* 자체로 인지 가능.

---

## 핵심 로직 (의사코드)

해당 없음 — doc / 헤더 주석 위주 변경.

---

## 수용 기준

| REQ | 내용 | 검증 | 통과 조건 |
|---|---|---|---|
| REQ-001 | `docs/ARCHITECTURE.md` 음원 생성 시퀀스 = Local DSP path / Server DSP path (보존) / 미래 sync 진입 3 단락 | (TEST) | `grep -A2 "음원 생성 시퀀스" docs/ARCHITECTURE.md` 에 Local + Server + 미래 sync 3 단락 매치 |
| REQ-002 | `docs/ADR.md` ADR-010 신규 추가 (Local DSP path 도입) | (TEST) | `grep -n "^### ADR-010" docs/ADR.md` 매치 1건 |
| REQ-003 | `apps/api/app/api/v1/sessions.py` 헤더 docstring 추가 | (TEST) | `head -10 apps/api/app/api/v1/sessions.py` 에 "MVP v1.4.x" / "ADR-010" 매치 |
| ~~REQ-004~~ | ~~`apps/mobile/src/services/api/generations.ts` 헤더 주석~~ | — | **제외** (TDD guard 차단, § 인터페이스 §4 참조) |
| REQ-005 | 서버 코드 *변경 0* (ADR-19B) — sessions.py 헤더 외 다른 함수 / 라우터 / 모델 변경 0 | (TEST) | `git diff feature/local-dsp...HEAD apps/api/ | grep -v "^---\|^+++\|^@@" | grep "^[+-]"` 에서 sessions.py 헤더 추가 부분 외 변경 0 |
| REQ-006 | mobile generations.ts 변경 0 (TDD guard 차단으로 제외) | (TEST) | `git diff feature/local-dsp...HEAD apps/mobile/src/services/api/generations.ts` = 0 line |
| REQ-007 | `docs/epics/epic-19-local-dsp/adr.md` ADR-19B 정책이 본 task 의 sessions.py 헤더 + root ADR-010 로 실재 | (TEST) | REQ-002 + REQ-003 grep 매치 |

---

## 주의사항

1. **git commit 금지**: 본 impl 파일 실행 중 `git add`, `git commit`, `git push` 명령 실행 금지. 코드 변경만 수행.
2. **ADR-19B 절대 준수**: `apps/api/app/api/v1/sessions.py` 의 *함수 본문* 절대 수정 X. 헤더 docstring 만.
3. **`POST /sessions/{id}/upload-master` 미구현**: 경로명만 docs/ARCHITECTURE.md + sessions.py 헤더에 박힘. *실제 라우터 등록 / 함수 구현 X* (V2+ sync 진입 시 박음).
4. **카운터 reconcile 방식 미결**: 본 task = "V2+ 결정 미루기" 명시만. 구체 방식 (예: max(client, server) / event-sourced / etc.) 결정 X.
5. **ADR-010 root 승격**: epic-local ADR-19A~19E 의 *철학적 핵심* (Local DSP path 도입 + 서버 보존 + sync 정책) 만 root ADR-010 에 1단락 요약. 구체 결정 (NS1~NS4 spike / 통합 브랜치 패턴 / C3 채택 등) = epic-local 잔류.

---

## DB 영향도

영향 없음. 데이터 모델 / 마이그레이션 변경 0.

---

## 다른 모듈과의 경계

| 의존 방향 | 모듈 | 역할 | 부재 시 동작 |
|---|---|---|---|
| 참조 (read-only) | `apps/api/app/api/v1/sessions.py` | MVP 미호출 명시 대상 | 헤더 주석만 추가, 본문 보존 |
| 참조 (read-only) | `apps/mobile/src/services/api/generations.ts` | MVP 미호출 명시 대상 | 동상 |
| 참조 (read-only) | `docs/epics/epic-19-local-dsp/adr.md` | ADR-19A~19E 의 root 승격 출처 | 본 task 가 root 로 1단락 승격 |

---

## Breaking Change 검토

영향 없음. 코드 변경 = 헤더 주석 2건 (lint / 타입 / 테스트 회귀 0). doc 변경 = root ARCHITECTURE.md + ADR.md 갱신 (구현 영향 0).
