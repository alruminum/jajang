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
npm test                 # 테스트 (jest-expo — epic-08 완료 후 활성)
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

사람이 해야 할 운영/출시 항목은 **`RELEASE.md`** 참조.

---

## stories.md 작성 규칙

- **스토리 번호**: 에픽 내 독립 순번 (Story 1, Story 2 …). 전역 누적 번호 사용 금지.
- **impl 파일 번호**: 에픽 내 독립 순번 (01-*, 02-*, 03-* …). 전역 누적 번호 사용 금지.
- 새 에픽 stories.md 작성 전 직전 에픽 stories.md를 읽어 컨벤션 확인 필수.

---

## 새 마일스톤 시작 전 체크리스트

PRD/스펙이 크게 바뀌어 새 마일스톤을 시작할 때 아래 순서로 스냅샷을 보관한다.

> **원칙**: 루트 파일 = 항상 현재 최신. 과거 버전 = `docs/milestones/vNN/`에 스냅샷.

1. 루트 스펙 파일(`prd.md`, `trd.md`, `docs/ui-spec.md` 등) → `docs/milestones/vNN/`에 복사
2. 현재 에픽 폴더 → `docs/milestones/vNN/epics/`에 복사
3. 루트 파일 업데이트 (새 버전 내용으로 교체)
4. `backlog.md` + `CLAUDE.md` 경로 업데이트

> 소규모 수정(버그픽스, 단순 문구 변경)은 스냅샷 불필요. PRD 스펙 변경 수준일 때만 적용.

---

## 문서 목록

| 파일 | 내용 |
|---|---|
| [backlog.md](backlog.md) | 에픽 목록 인덱스 |
| [RELEASE.md](RELEASE.md) | 운영/출시 체크리스트 |
| [docs/epics/](docs/epics/) | 에픽별 impl/ |
| [docs/architecture.md](docs/architecture.md) | 시스템 구조·화면 흐름·ERD |
| [docs/design.md](docs/design.md) | UI 모듈 작업 / 디자인 시스템 변경 시 read |
| [docs/domain-logic.md](docs/domain-logic.md) | 핵심 비즈니스 로직·상수·계산식 |
| [docs/db-schema.md](docs/db-schema.md) | DB 테이블 DDL + 주요 쿼리 |
| [docs/sdk.md](docs/sdk.md) | 외부 SDK/API 연동 |
| [docs/ui-spec.md](docs/ui-spec.md) | 화면별 컴포넌트 스펙 |
| [prd.md](prd.md) / [trd.md](trd.md) | 요구사항 정의 |

---

## Git 커밋 메시지 규칙

### 템플릿

```
<type>(<scope>): <한 줄 요약>

[왜] <트리거 — 버그: 재현 조건 / 기능: 요구사항 출처 / 리팩: 문제 상황>
[변경]
- <파일/모듈>: <변경 내용>
[주의] <사이드이팩트·후속 작업> (없으면 생략)

Closes/Related to #NNN
```

### type별 [왜] 작성 기준

| type | [왜] 내용 |
|---|---|
| `fix` | 재현 조건 + 근본 원인 (한 문장) |
| `feat` | PRD/이슈 번호 + 어떤 요구사항인지 |
| `refactor` | 어떤 문제가 있었는지 (가독성/성능/결합도) |
| `chore` | 왜 이 시점에 필요했는지 |
| `docs` | 무엇이 불일치/누락됐었는지 |
| `test` | 어떤 시나리오가 커버 안 됐었는지 |

### 커밋 분리 원칙

- 문서 변경 + 코드 변경 → 반드시 별도 커밋
- chore(harness/agent) + feat → 반드시 별도 커밋
- 실패 커밋 재시도 → push 전 `git rebase -i`로 squash

### 이슈 close 원칙 (절대 원칙)

- **GitHub API로 이슈를 직접 close 금지**
- 이슈는 반드시 **`git push` 이후** `Closes #NNN` 커밋 메시지로만 자동 close
