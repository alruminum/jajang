# 자장 (Jajang)

부모 목소리로 AI 자장가를 생성하고 화면 잠근 채로 최대 10시간 재생하는 React Native + FastAPI 크로스플랫폼 앱. MVP 10~14주 (1인 개발 + Claude 어시스트).

**Repo**: https://github.com/alruminum/jajang
**구조**: 모노레포 — `apps/mobile/` (Expo Bare) + `apps/api/` (FastAPI)

> 워크플로우·에이전트 라우팅·architect 모드 등은 **dcness 플러그인**이 담당한다 (`/product-plan`, `/impl`, `/impl-loop`, `/quick`, `/qa` 스킬). 본 문서는 **프로젝트 특화 규칙**만 기록.

---

## 개발 명령어

### Mobile (apps/mobile)
```bash
cd apps/mobile
npm install              # 또는 pnpm install
npx expo prebuild        # 네이티브 코드 생성 (최초 1회)
npx expo run:ios         # iOS 시뮬레이터 (Bare workflow)
npx expo run:android     # Android 에뮬레이터
npm test                 # 테스트 (jest)
npm run test:ci          # CI 모드 (coverage 포함)
npm run type-check       # tsc --noEmit
npm run lint             # eslint src/**
npm run qa:tour          # mobile-qa-tour 시나리오 실행
npm run qa:monkey        # monkey 1000 events (../../docs/qa 저장)
```

### API (apps/api)
```bash
cd apps/api
pip install -e .                                      # 또는 poetry install
alembic upgrade head                                  # DB migration
uvicorn app.main:app --reload --port 8000             # 개발 서버
celery -A app.core.celery_app worker --loglevel=info  # Celery 워커
pytest                                                # 테스트
```

## 환경변수

### apps/api/.env
```
DATABASE_URL=postgresql://localhost/jajang
JWT_PRIVATE_KEY=...
JWT_PUBLIC_KEY=...
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=30
GOOGLE_CLIENT_ID=...
S3_BUCKET=jajang-audio
S3_REGION=ap-northeast-2
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
REVENUECAT_WEBHOOK_SECRET=...
MOCK_DSP=true                                          # M0 전 placeholder mp3 사용
```

### apps/mobile (app.config.ts)
```
EXPO_PUBLIC_API_URL=http://localhost:8000/api/v1
EXPO_PUBLIC_REVENUECAT_API_KEY_IOS=...
EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID=...
EXPO_PUBLIC_ADMOB_APP_ID_IOS=...
EXPO_PUBLIC_ADMOB_APP_ID_ANDROID=...
```

---

## GitHub Issues 마일스톤

| 용도 | 마일스톤 |
|---|---|
| 버그 (동작 오류) | `Bugs` |
| 기능 추가·개선 | `Feature` |
| 스토리 이슈 | `Story` |
| 에픽 | `Epics` |
| 현재 버전 레이블 | `v01` |

> 버전이 올라가면 "현재 버전 레이블" 항목만 업데이트.

### 이슈 생성 시 마일스톤 처리 규칙

`mcp__github__create_issue`의 `milestone` 파라미터는 **이름이 아닌 숫자(number)**를 요구한다. 이슈 생성 전 반드시 아래 명령으로 이름 → 번호를 조회한다:

```bash
gh api repos/{owner}/{repo}/milestones --jq '.[] | {number: .number, title: .title}'
```

### 이슈 등록 필수 항목

| 종류 | 레이블 | 마일스톤 |
|---|---|---|
| 버그 | `bug` + 현재 버전 레이블 | `Bugs` |
| 기능/개선 | `feat` + 현재 버전 레이블 | `Feature` |
| 스토리 | 해당 에픽 레이블 + 현재 버전 레이블 | `Story` |

### 버그픽스 이슈 정책 (프로젝트 룰)

`bug` 레이블 이슈를 작업할 때:

1. **원래 이슈 번호 유지** — 추가 수정 발생해도 새 이슈 등록 금지. 원래 이슈 체크리스트에 항목 추가.
2. 커밋 메시지: 원래 이슈 번호 참조 (`Related to #NNN` 또는 `Closes #NNN`).

> dcness `/quick` 스킬 사용 시에도 위 정책 우선.

---

## 작업 순서 (요약)

1. **GitHub Issues** 에서 해당 에픽 레이블/마일스톤으로 미완료 이슈 확인
2. **이슈 본문**에서 스토리 컨텍스트 + 태스크 체크리스트 확인
3. **`docs/epics/epic-NN-*/impl/NN-*.md`** 계획 확인 (없으면 dcness `/product-plan` 또는 architect MODULE_PLAN 위임)
4. dcness 스킬로 구현 (`/impl` / `/impl-loop` / `/quick`)
5. 구현 후 GitHub Issue 체크리스트 업데이트

---

## stories.md 작성 규칙

- **스토리 번호**: 에픽 내 독립 순번 (Story 1, Story 2 …). 전역 누적 번호 사용 금지.
- **impl 파일 번호**: 에픽 내 독립 순번 (01-*, 02-*, 03-* …). 전역 누적 번호 사용 금지.
- 새 에픽 stories.md 작성 전 직전 에픽 stories.md를 읽어 컨벤션 확인 필수.

---

## 새 마일스톤 시작 전 체크리스트

PRD/스펙이 크게 바뀌어 새 마일스톤을 시작할 때 아래 순서로 스냅샷을 보관한다.

> **원칙**: 루트 파일 = 항상 현재 최신. 과거 버전 = `docs/milestones/vNN/`에 스냅샷.

1. 스펙 파일(`docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/ADR.md` 등) → `docs/milestones/vNN/`에 복사
2. 현재 에픽 폴더 → `docs/milestones/vNN/epics/`에 복사
3. 루트 파일 업데이트 (새 버전 내용으로 교체)
4. `backlog.md` + `CLAUDE.md` 경로 업데이트

> 소규모 수정(버그픽스, 단순 문구 변경)은 스냅샷 불필요. PRD 스펙 변경 수준일 때만 적용.

---

## 문서 목록

| 파일 | 내용 |
|---|---|
| [backlog.md](backlog.md) | 에픽 목록 인덱스 |
| [docs/epics/](docs/epics/) | 에픽별 impl/ |
| [docs/PRD.md](docs/PRD.md) | 제품 요구사항 (목표·사용자·기능·수용 기준·디자인 방향) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 시스템 구조·기술 스택·데이터 흐름·상태 관리·시퀀스·ERD·NFR·보안 (구 `trd.md` + `architecture.md` 통합) |
| [docs/ADR.md](docs/ADR.md) | 아키텍처 결정 사항 (Architecture Decision Records) |
| [docs/design.md](docs/design.md) | UI 모듈 작업 / 디자인 시스템 변경 시 read |
| [docs/domain-logic.md](docs/domain-logic.md) | 핵심 비즈니스 로직·상수·계산식 |
| [docs/db-schema.md](docs/db-schema.md) | DB 테이블 DDL + 주요 쿼리 |
| [docs/sdk.md](docs/sdk.md) | 외부 SDK/API 연동 |
| [docs/ux-flow.md](docs/ux-flow.md) | UX flow (ux-architect 산출) |
| [docs/audio-engine.md](docs/audio-engine.md) | 오디오 엔진 설계 노트 |
| [docs/voice-pipeline.md](docs/voice-pipeline.md) | 음성 합성 파이프라인 |

---

## Git 커밋 / PR 규칙

> SSOT = dcness `docs/plugin/git-naming-spec.md`. 본 절은 프로젝트 특화 항목만.

### 커밋 / PR 제목 형식 (dcness git-naming-spec §2, §4)

| 타입 | 형식 | 예시 |
|---|---|---|
| 기능 구현 | `[epic{N}][story{N}] {설명}` | `[epic12][story4] chore: hex → ColorTokens 마이그레이션` |
| 버그픽스 | `[issue-{N}] {설명}` | `[issue-249] mobile-qa-tour type shim 제거` |
| 문서 | `[docs] {설명}` | `[docs] PRD 시드 양식 재배치` |

- CI gate `.github/workflows/git-naming-validation.yml` 가 형식 강제 — 미준수 시 머지 차단.
- `<type>(<scope>): summary` (Conventional Commits) 사용 금지 — 본 프로젝트는 dcness spec 우선.

### 커밋 분리 원칙 (프로젝트 룰)

- 문서 변경 + 코드 변경 → 반드시 별도 커밋
- chore(harness/agent) + feat → 반드시 별도 커밋
- 실패 커밋 재시도 → push 전 `git rebase -i`로 squash

### 이슈 close 원칙 (절대 원칙)

- **GitHub API로 이슈 직접 close 금지**
- 머지 후 `Closes #NNN` / `Part of #NNN` 키워드로만 자동 close (PR body close-keyword gate — dcness §1.4)
- 중간 task PR = `Part of #N`, 마지막 task = `Closes #N`, epic 마지막 task = `Closes #story` + `Closes #epic` 둘 다

---

## CI Gate (.github/workflows/)

| Workflow | 역할 |
|---|---|
| `git-naming-validation.yml` | 커밋/PR 제목 형식 검사 (`[epicN][storyN]` / `[issue-N]` / `[docs]`) |
| `pr-body-validation.yml` | PR body close-keyword (`Part of` / `Closes` / `Fixes`) 강제 |
| `gemini-review.yml` | 자동 코드 리뷰 |

- 로컬 PASS 만으로 머지 금지. `gh pr checks --watch` 또는 dcness `pr-finalize.sh` 사용.

---

## 모듈 계획

### v01

**Epic 19 — Local DSP Migration** · [stories](docs/epics/epic-19-local-dsp/stories.md) · ✅ **COMPLETED 2026-05-15** ([#262](https://github.com/alruminum/jajang/issues/262), 통합 PR [#284](https://github.com/alruminum/jajang/pull/284))

채택: **C3** (DSP 강등 + UX 보강 — afftdn 폐기 + highpass IIR + EQ + echo + crossfade / dep 0 + size 0 + server SSOT 재사용). 출력 = `.wav` (mp3 인코딩 = 미래 sync task 이관). 자세히 = [docs/ADR.md](docs/ADR.md) ADR-010 + [epics/epic-19-local-dsp/adr.md](docs/epics/epic-19-local-dsp/adr.md) ADR-19A~19E.

| NN | impl 파일 | 상태 |
|---|---|---|
| 01 spike-fork-eval | [docs/epics/epic-19-local-dsp/impl/01-spike-fork-eval.md](docs/epics/epic-19-local-dsp/impl/01-spike-fork-eval.md) | ✅ COMPLETED — RESULT: NO_GO ([PR #270](https://github.com/alruminum/jajang/pull/270)) |
| 02 spike-filter-probe | [docs/epics/epic-19-local-dsp/impl/02-spike-filter-probe.md](docs/epics/epic-19-local-dsp/impl/02-spike-filter-probe.md) | ⚠️ DEPRECATED (ffmpeg-kit fork 의존 전제 무효) |
| 03 spike-device-perf-size-license | [docs/epics/epic-19-local-dsp/impl/03-spike-device-perf-size-license.md](docs/epics/epic-19-local-dsp/impl/03-spike-device-perf-size-license.md) | ⚠️ DEPRECATED (동상) |
| 04 spike-ns1-afftdn-perceptual | [docs/epics/epic-19-local-dsp/impl/04-spike-ns1-afftdn-perceptual.md](docs/epics/epic-19-local-dsp/impl/04-spike-ns1-afftdn-perceptual.md) | ✅ COMPLETED — C3 viable ([PR #272](https://github.com/alruminum/jajang/pull/272)) |
| 05 spike-ns2-pure-js-perf | [docs/epics/epic-19-local-dsp/impl/05-spike-ns2-pure-js-perf.md](docs/epics/epic-19-local-dsp/impl/05-spike-ns2-pure-js-perf.md) | ✅ COMPLETED — C1 viable ([PR #273](https://github.com/alruminum/jajang/pull/273)) |
| 06 spike-ns3-rn-audio-api-integration | [docs/epics/epic-19-local-dsp/impl/06-spike-ns3-rn-audio-api-integration.md](docs/epics/epic-19-local-dsp/impl/06-spike-ns3-rn-audio-api-integration.md) | ✅ COMPLETED — C2 viable ([PR #274](https://github.com/alruminum/jajang/pull/274)) |
| 07 spike-ns4-candidate-comparison | [docs/epics/epic-19-local-dsp/impl/07-spike-ns4-candidate-comparison.md](docs/epics/epic-19-local-dsp/impl/07-spike-ns4-candidate-comparison.md) | ✅ COMPLETED — **ADOPTED: C3** ([PR #275](https://github.com/alruminum/jajang/pull/275)) |
| 08 sample-asset-fixtures | [docs/epics/epic-19-local-dsp/impl/08-sample-asset-fixtures.md](docs/epics/epic-19-local-dsp/impl/08-sample-asset-fixtures.md) | ✅ COMPLETED ([PR #280](https://github.com/alruminum/jajang/pull/280)) |
| 09 mobile-local-dsp-module | [docs/epics/epic-19-local-dsp/impl/09-mobile-local-dsp-module.md](docs/epics/epic-19-local-dsp/impl/09-mobile-local-dsp-module.md) | ✅ COMPLETED ([PR #281](https://github.com/alruminum/jajang/pull/281)) |
| 10 mobile-screens-hookup | [docs/epics/epic-19-local-dsp/impl/10-mobile-screens-hookup.md](docs/epics/epic-19-local-dsp/impl/10-mobile-screens-hookup.md) | ✅ COMPLETED ([PR #282](https://github.com/alruminum/jajang/pull/282)) |
| 11 server-path-preserve-and-sync-policy | [docs/epics/epic-19-local-dsp/impl/11-server-path-preserve-and-sync-policy.md](docs/epics/epic-19-local-dsp/impl/11-server-path-preserve-and-sync-policy.md) | ✅ COMPLETED ([PR #283](https://github.com/alruminum/jajang/pull/283)) |

**후속 영역 (별 epic / V2+ 이관)**:
- mp3 인코딩 (lamejs RN/Hermes 호환 spike)
- `POST /sessions/{id}/upload-master` 실제 구현 (V2+ sync 진입 시점)
- 카운터 reconcile 방식 (클라 ↔ 서버, V2+)
- S11PreviewScreen `isGenerationExhausted=false` 데드 JSX 클린업
- DSP 출력 wav → mp3 변환 (서버 측 또는 별 task)
