---
depth: std
design: skipped
---

# impl/02 — 서버: GDPR 데이터 내보내기 (V1 Deferred)

**Epic**: 06 — 개인정보 & 데이터 관리  
**Story**: Story 2/3 보조 — GDPR Right to Access (열람권)  
**예상 소요**: V1 범위 밖 — 설계 문서만 작성 (구현 없음)

---

## 1. V1 Deferred 결정

**결론: V1 에서 구현하지 않는다.**

### 판단 근거

| 항목 | 내용 |
|---|---|
| GDPR 의무 여부 | GDPR Art.15 (열람권)는 EU 거주자에게만 적용. V1 타깃(한국 iOS/Android)은 개인정보보호법(PIPA) 적용. PIPA는 열람권을 명시하나 자동화된 "데이터 내보내기" 파일 생성 의무는 없음. |
| 한국 PIPA 요건 | 개인정보보호법 제35조 — 개인정보 열람 요청 시 10일 이내 답변 의무. V1 규모(1인 서비스)에서 수동 대응 가능. |
| 구현 복잡도 | ZIP 패키징 + presigned URL 생성 + 만료 관리 + 이메일 발송 인프라 필요. V1 MVP 범위 초과. |
| 비즈니스 우선순위 | 탈퇴 시 즉시 삭제(impl/01)가 실질적 데이터 통제권 부여. 내보내기 없이도 PIPA 컴플라이언스 달성 가능. |

**에스컬레이션 기록**: 2026-04-24 — product-planner, architect 합의. V1 출시 후 EU 진출 시점에 재설계.

---

## 2. V2 설계 예약 (구현 시 참조)

### 엔드포인트 스펙

```
POST /users/me/export
Authorization: Bearer <access_token>
→ 202 Accepted { "request_id": "...", "estimated_ready_at": "..." }

GET /users/me/export/{request_id}
→ 200 { "status": "pending|ready|expired", "download_url": "<presigned_url>" }
```

### 포함 데이터 (V2)

| 데이터 | 형식 | 설명 |
|---|---|---|
| 계정 정보 | JSON | email, provider, created_at, privacy_consent_at |
| 생성 음원 목록 | JSON | song_key, created_at, status (S3 파일 자체는 별도 처리 검토) |
| 생성 이력 | JSON | generation_counters, completed_at |
| 광고 사용 이력 | JSON | rewarded_ad_usage (year_month, monthly_count) |

### 처리 흐름 (V2)

```
POST /users/me/export
    │
    ▼
Celery task: generate_export_package(user_id)
    ├─ DB 데이터 쿼리 → JSON 직렬화
    ├─ ZIP 패키징 (zipfile 모듈)
    ├─ S3 업로드: s3://jajang-exports/{user_id}/{request_id}.zip
    └─ presigned URL 생성 (만료 24h)
    │
    ▼
이메일 발송 또는 인앱 푸시 알림 (준비 완료)
```

### 주의사항 (V2 구현 시)

- `jajang-exports` 버킷은 `jajang-audio` 와 별도 — 접근 정책 분리 필요
- presigned URL 만료 = 24h, 재발급 요청은 7일 내 1회 제한 권장
- 목소리 샘플 원본은 24h 삭제 정책으로 대부분 미존재 — ZIP에 "샘플은 서버에서 삭제되었어요" 안내 포함
- 생성 음원 S3 파일 자체 포함 여부: 파일 크기 이슈로 URL만 제공하는 것이 현실적

---

## 3. 수용 기준 (V1)

- [ ] 이 impl 파일이 존재함 = V1 deferred 결정 문서화 완료
- [ ] `POST /users/me/export` 엔드포인트 **미구현** 확인 (라우터에 없어야 함)
- [ ] 개인정보처리방침 문서에 "데이터 내보내기 기능은 향후 제공 예정" 문구 포함 여부 확인 (법무 검토 사항)
