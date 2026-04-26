# Epic 06 — impl 배치 인덱스

**Epic**: 06 — 개인정보 & 데이터 관리  
**생성일**: 2026-04-24  
**상태**: READY_FOR_IMPL

---

## impl 목록

| # | 파일 | depth | 스토리 | 요약 | 선행 의존 |
|---|---|---|---|---|---|
| 01 | [01-server-account-deletion.md](01-server-account-deletion.md) | deep | Story 3 | DELETE /users/me + 계단형 삭제 + audit_log + Celery hard delete | — |
| 02 | [02-server-data-export.md](02-server-data-export.md) | std | Story 2/3 | GDPR export V1 Deferred 결정 문서 | — |
| 03 | [03-app-settings-screen-extended.md](03-app-settings-screen-extended.md) | std | Story 1, 2 | S16 데이터 관리 섹션 확장 (목소리 삭제 + 음원 삭제) | impl/01 서버 API 확정 후 |
| 04 | [04-app-account-deletion-flow.md](04-app-account-deletion-flow.md) | std | Story 3 | 계정 탈퇴 2단계 확인 + 로컬 초기화 + LoginScreen 리다이렉트 | impl/01 완료 필수 |
| 05 | [05-app-legal-screen.md](05-app-legal-screen.md) | std | Story 4 | 설정 > 법적 정보 화면 (expo-web-browser) | 독립 |

---

## 구현 순서 권고

```
[병렬 가능]
  impl/01 (서버)    impl/05 (법적 정보)    impl/02 (문서만)
       │
       ▼ 완료 후
  impl/03 (설정 화면)
       │
       ▼ 완료 후
  impl/04 (탈퇴 플로우)
```

1. **impl/01** — 서버 엔드포인트가 없으면 클라이언트 통합 테스트 불가. 최우선.
2. **impl/05** — 완전 독립. impl/01 과 병렬 진행 가능. 가장 빠른 완료 가능.
3. **impl/02** — 구현 없음, 결정 문서만. 언제든 처리 가능.
4. **impl/03** — impl/01 API 시그니처 확정 후. 서버 엔드포인트 의존.
5. **impl/04** — impl/01 + impl/03 완료 후 통합 테스트.

---

## 주의사항 (구현 전 확인)

1. **스펙 불일치**: `stories.md` Story 1 수용 기준은 "48h 이내 삭제"이나 `ux-flow.md` S16은 "즉시 삭제"로 명시. impl/03 구현 전 product-planner에 정책 확인 요청 필요.

2. **auth 모듈 패치**: `get_current_user` 가 `users.deleted_at IS NULL` 조건을 포함하지 않으면 impl/01 배포 전 패치 필요. Epic 01 구현 확인.

3. **bulk DELETE /tracks 엔드포인트**: impl/03 에서 필요. Epic 04에서 개별 삭제만 구현된 경우 추가 서버 작업 필요.

4. **법적 URL**: `config/legalUrls.ts` 의 URL(`https://jajang.app/privacy`, `https://jajang.app/terms`)은 출시 전 실제 URL로 반드시 교체.

5. **migration 0005**: impl/01 의 `audit_logs` 테이블 migration. `alembic upgrade head` 실행 순서 확인 (기존 migration 0004 이후여야 함).

---

## TRD 현행화 필요 항목 (구현 완료 후)

| 항목 | 대상 |
|---|---|
| `audit_logs` 테이블 추가 | trd.md §4 DB 스키마 + docs/db-schema.md |
| `AccountDeletionService`, `AuditLog` 모델 | trd.md §2 프로젝트 구조 |
| `hard_delete_expired_users` Celery Beat 태스크 | trd.md §3 핵심 로직 |
| `LegalScreen`, `AccountDeletionScreen`, `DeleteTracksSheet` | trd.md §7 화면 컴포넌트 |
| `clearAuthState()` AuthSlice 추가 | trd.md §6 전역 상태 |
