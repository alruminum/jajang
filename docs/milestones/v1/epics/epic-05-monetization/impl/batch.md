# Epic 05 — impl 실행 순서 & 의존 관계

## 실행 순서 (권고)

```
01-server-revenuecat-webhook
        │
        ▼
02-server-rewarded-counter   (impl/01과 병행 가능 — 별도 테이블)
        │
        ▼
03-app-subscribe-screen      (Epic 01 impl/07 RevenueCat 래퍼 의존)
        │
        ├──── 04-app-trial-expired-screen   (병행 가능)
        │
        └──── 05-app-settings-subscription  (impl/03 S15 네비게이션 의존)
```

## impl 목록

| 순번 | 파일 | 커버 스토리 | depth | 예상 소요 | 의존 |
|---|---|---|---|---|---|
| 01 | [01-server-revenuecat-webhook.md](01-server-revenuecat-webhook.md) | Story 1 (F12 webhook) | **deep** | 1일 | Epic 01 impl/07 skeleton |
| 02 | [02-server-rewarded-counter.md](02-server-rewarded-counter.md) | Story 3 (F11 월 카운터) | std | 0.5일 | impl/01 (migration 0004 선행) |
| 03 | [03-app-subscribe-screen.md](03-app-subscribe-screen.md) | Story 1 (S15) | std | 2일 | Epic 01 impl/07, Epic 04 impl/06 |
| 04 | [04-app-trial-expired-screen.md](04-app-trial-expired-screen.md) | Story 5 (S17) | std | 0.5일 | impl/03 (S15 navigate 선행) |
| 05 | [05-app-settings-subscription.md](05-app-settings-subscription.md) | Story 1/5 (S16) | std | 1일 | impl/03, Epic 01 (auth) |

**총 예상 소요**: 5일

## 의존 관계 상세

### 강한 의존 (이전 impl 완료 필수)

- `impl/02` → `impl/01`: `rewarded_ad_usage` 테이블 (migration 0004) 생성 후 서비스 구현
- `impl/03` → Epic 01 impl/07: `revenue-cat.ts` (`configurePurchases`, `extractEntitlement`) 완료 필수
- `impl/04` → `impl/03`: S15 (`Subscribe`) 스크린이 RootNavigator에 등록된 상태에서 navigate 호출 가능
- `impl/05` → `impl/03`: `navigate('Subscribe', { source: 'settings' })` 호출 (S15 등록 선행)

### 약한 의존 (병행 개발 후 연결)

- `impl/02` → `impl/01`: migration 0004만 선행이면 됨. webhook 로직과는 독립.
- `impl/04` → Epic 01 impl/06: `useAuthStore.setEntitlement` 시그니처 확인 정도.
- `impl/05` → Epic 01 impl/02: `DELETE /me` 엔드포인트 존재 여부 확인.

## 병행 개발 가능 구간

```
[서버 트랙]  impl/01 → impl/02  (순차)
[앱 트랙]    impl/03 → impl/04 + impl/05  (03 완료 후 04/05 병행 가능)

서버와 앱은 완전 병행 가능.
단, impl/03 착수 전 Epic 01 impl/07 완료 확인 필수.
```

## 사전 확인 체크리스트

impl/01 착수 전:
- [ ] `apps/api/app/api/v1/webhooks.py` 기존 skeleton 코드 확인 (Epic 01 impl/07)
- [ ] `REVENUECAT_WEBHOOK_SECRET` 환경변수 설정 확인
- [ ] RevenueCat 대시보드 webhook URL 등록 + 활성화 확인
- [ ] `structlog` 패키지 설치 확인 (`apps/api/requirements.txt`)

impl/02 착수 전:
- [ ] migration 0004 (`rewarded_ad_usage`) 완료 확인 (`alembic upgrade head`)
- [ ] `apps/api/app/models/__init__.py`에 `RewardedAdUsage` import 추가 확인

impl/03 착수 전:
- [ ] RevenueCat 대시보드 Offerings 설정 확인 (default offering, monthly/annual 패키지)
- [ ] App Store Connect / Google Play 구독 상품 등록 확인 (₩3,900 / ₩29,000)
- [ ] Sandbox 계정으로 purchasePackage 테스트 가능 환경 확인 (실기기 필수)
- [ ] `react-native-purchases` v7 설치 확인 (`PURCHASES_ERROR_CODE` 필드 `.d.ts` 열람)

impl/05 착수 전:
- [ ] `DELETE /me` 엔드포인트 존재 여부 확인 (없으면 별도 impl 필요)
- [ ] `DELETE /me/voice-samples`, `DELETE /me/generated-tracks` 엔드포인트 존재 여부 확인

## Epic 05 완료 기준

모든 impl 완료 후 아래 E2E 플로우 검증:

1. 신규 가입 → S06 → S15 진입 → 연간 결제 → Premium 상태 → S06 광고 없음
2. Premium → S16 → "구독 관리" 탭 → 앱스토어/플레이스토어 이동
3. Trial 만료 → S06 진입 → S17 자동 → "구독 시작하기" → S15 → 결제 → S06
4. Trial 만료 → S17 "무료로 계속" → S06 (배너 광고 노출, S17 재진입 없음)
5. 무료 → S14 A형 → "광고 보고 오늘 밤" → AdMob 시청 → POST /rewarded/claim 200 → 자정까지 백그라운드 재생
6. 무료 7회 소진 → S14 A형 재진입 → Rewarded 버튼 미노출 → "이번 달은 이미 모두 사용했어요"
7. 기기 변경 → S15 → "구독 복원하기" → 구독 복원 확인
8. RevenueCat EXPIRATION webhook → 서버 subscriptions.entitlement='free' → 앱 포그라운드 복귀 → useEntitlementSync → free 반영

## 스토리 커버리지 확인

| Epic 05 스토리 | 커버 impl | 미구현 |
|---|---|---|
| Story 1 — IAP 구독 (월/연) | impl/01 (webhook), impl/03 (S15) | — |
| Story 2 — 배너 광고 | Epic 04 impl/07 (완료) | — |
| Story 3 — Rewarded Ad 월 7회 한도 | impl/02 (서버), Epic 04 impl/06 (클라이언트) | — |
| Story 4 — 오프라인 다운로드 | **미포함** — Epic 05 배경 설명에 명시된 범위 밖 | M1 이후 |
| Story 5 — 업그레이드 유도 진입점 | impl/03 (S15), impl/04 (S17), impl/05 (S16) | — |

> **Story 4 (오프라인 다운로드)**: 이번 Epic 05 impl 범위에서 제외됨. 배경 설명의 요구사항에 포함되지 않았음. 별도 에픽 또는 M1 backlog에 추가 권장.
