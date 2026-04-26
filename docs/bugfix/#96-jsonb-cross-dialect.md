---
depth: simple
---
# impl: JSONB 크로스-다이얼렉트 호환 (#96)

## 개요

SQLite dev 환경에서 `audit_logs.metadata` 컬럼의 JSONB 타입이 SQLite 컴파일러에서 렌더링 불가 오류를 유발.
PostgreSQL 전용 타입(`sqlalchemy.dialects.postgresql.JSONB`)을 방언-분기 타입으로 교체해 SQLite에서도 부팅 가능하게 수정.

- **영향 범위**: `apps/api/app/models/audit_log.py` 1파일, 1컬럼 정의
- **운영 DDL 변화**: 없음 (PostgreSQL은 동일하게 JSONB로 컴파일)
- **관련 이슈**: #96

---

## 수정 파일

### `apps/api/app/models/audit_log.py`

#### 변경 전

```python
from sqlalchemy.dialects.postgresql import JSONB, UUID

event_metadata = Column("metadata", JSONB, nullable=True)
```

#### 변경 후

```python
from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB, UUID

event_metadata = Column("metadata", JSON().with_variant(JSONB(), "postgresql"), nullable=True)
```

**선택 근거**

| 방안 | 장점 | 단점 | 결정 |
|---|---|---|---|
| `JSON().with_variant(JSONB(), "postgresql")` | 방언별 자동 분기, 운영 DDL 변화 없음 | 없음 | **채택** |
| `TypeDecorator` 커스텀 타입 | 유연성 높음 | 오버엔지니어링, 코드량 증가 | 기각 |
| `Text` 타입으로 교체 | 단순 | JSONB 인덱스·연산자 손실 | 기각 |

`JSON().with_variant()` 패턴은 SQLAlchemy 공식 방언 분기 권장 방식.
PostgreSQL 방언: `JSONB`로 컴파일 → 기존 운영 DDL 동일.
SQLite 방언: `JSON`으로 컴파일 → TEXT 저장, `create_all` 오류 해소.

---

## 스코프 가드

- 수정 대상: `audit_log.py` 단일 파일, `event_metadata` 컬럼 정의 1줄 + import 1줄
- `trd.md`, `architecture.md`, `db-schema.md` 수정 불필요 (운영 DDL 변화 없음)
- 타 모델 파일 수정 금지

---

## 검증 절차

```bash
# 1. 기존 dev DB 초기화
rm -f apps/api/jajang_dev.db

# 2. 서버 기동 (SQLite create_all 오류 없이 부팅되어야 함)
cd apps/api && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 &
sleep 8

# 3. 가입 엔드포인트 정상 응답 확인
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8000/api/v1/auth/signup/email \
  -H "Content-Type: application/json" \
  -d '{"email":"qa@jajang.com","password":"Test1234"}'
# 기대값: 200
```

성공 기준: `CompileError` 없이 서버 기동, curl 응답 200.
