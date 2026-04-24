# Epic 01 — Impl 실행 순서 및 의존성

**Epic**: 01 — 인증 & 온보딩  
**Impl 수**: 9개 (00~08)  
**생성일**: 2026-04-24

---

## 실행 순서

```
00-project-scaffold
        │
        ├──▶ 01-db-schema-auth ──▶ 02-server-auth-api
        │
        └──▶ 03-app-nav-skeleton ──▶ 04-app-splash-consent-onboarding
                                          │
                                          ▼
                          05-app-signup-signin (requires 02 + 04)
                                          │
                                          ▼
                          06-app-session-state (requires 05)
                                          │
                                          ▼
                          07-app-trial-activation (requires 05 + 06)
                                          │
                                          ▼
                          08-app-home-shell (requires 06 + 07)
```

---

## Impl 요약표

| 파일 | depth | 커버 스토리 | 선행 impl | 예상 소요 |
|---|---|---|---|---|
| 00-project-scaffold.md | std | 전체 선행 | — | 3~4h |
| 01-db-schema-auth.md | std | Story 2/3/4/5 (서버) | 00 | 2~3h |
| 02-server-auth-api.md | deep | Story 2/3/4 (서버) | 01 | 5~7h |
| 03-app-nav-skeleton.md | std | 전체 앱 선행 | 00 | 3~4h |
| 04-app-splash-consent-onboarding.md | std | Story 1 | 03 | 4~5h |
| 05-app-signup-signin.md | deep | Story 2/3/4 | 02, 03, 04 | 6~8h |
| 06-app-session-state.md | std | Story 4 (세션) | 03, 05 | 3~4h |
| 07-app-trial-activation.md | std | Story 5 | 05, 06 | 3~4h |
| 08-app-home-shell.md | std | Story 5 (홈 진입) | 06, 07 | 4~5h |

**총 예상 소요**: 33~44시간 (1인 주말 개발 기준 3~4주말)

---

## 병렬 실행 가능 구간

```
[Week 1]
  서버 트랙: 00 → 01 → 02
  앱 트랙:   00 → 03 → 04

[Week 2]
  05 (02 + 04 완료 후)

[Week 3]
  06 → 07 → 08
```

1인 개발이므로 병렬 실행은 참고용. 서버 먼저 완성 후 앱 연동이 실제 작업 흐름에 적합.

---

## Epic 01 완료 기준 (전체 수용 기준 체크)

### Story 1 — 개인정보 동의
- [ ] 앱 최초 실행 → S02 동의 화면 (스킵 없음)
- [ ] 필수 항목 미체크 → "동의하고 시작할게요" 비활성
- [ ] 동의 완료 → S03 온보딩 이동
- [ ] 미동의 → 종료 안내 다이얼로그
- [ ] 앱 재실행 (동의 완료) → S02 스킵

### Story 2 — 이메일 가입
- [ ] 정상 가입 → 트라이얼 + 홈 이동
- [ ] 이메일 형식 오류 → 인라인 에러
- [ ] 중복 이메일 → 409 + "로그인하기" 링크

### Story 3 — 소셜 가입
- [ ] Apple 로그인 성공 → 트라이얼 + 홈 (iOS)
- [ ] Google 로그인 성공 → 트라이얼 + 홈
- [ ] 기존 소셜 계정 → 기존 음원 복원 (신규 미생성)

### Story 4 — 로그인
- [ ] 올바른 자격증명 → 홈 이동 + 기존 음원 복원
- [ ] 잘못된 비밀번호 → 401 에러 메시지
- [ ] 앱 재실행 (세션 유효) → 자동 홈 진입
- [ ] 세션 만료 → 로그인 리다이렉트 (음원 데이터 유지)

### Story 5 — 7일 트라이얼
- [ ] 신규 가입 완료 → `entitlement='trial'` + 트라이얼 배지
- [ ] 홈 화면: "7일 무료 체험 중 · N일 남음" 배지
- [ ] D-1 배너: "내일 무료 체험이 끝나요" + 구독하기 CTA
- [ ] RevenueCat webhook `TRIAL_STARTED` → DB 동기화

---

## 다음 에픽 의존성

Epic 02 (녹음) 시작 전 Epic 01 완료 필수:
- `User` 모델 + `/auth/` 엔드포인트 — 모든 후속 API에 JWT 인증 필요
- `AuthSlice` Zustand — `userId`, `entitlement` 조회 전역 사용
- S06 홈 화면 — Epic 02 완료 후 트랙 목록 API 연동 예정

Epic 05 (구독) 시작 전:
- RevenueCat `configurePurchases()` 초기화 (impl/07) 완료 필요
- `subscriptions` 테이블 + webhook 엔드포인트 (impl/01, impl/07) 완료 필요
