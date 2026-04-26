---
depth: simple
---
# impl: API_BASE_URL Android 분기 제거 (#103)

## 요약

`apps/mobile/src/services/api.ts`의 `API_BASE_URL` Android 분기(`10.0.2.2`) 제거 및
단일 `localhost:8000` 으로 통일. 실기기(R3CXC0B93AR) adb reverse 환경에서 라우팅 실패 해소.

---

## 근본 원인

| 항목 | 내용 |
|---|---|
| 파일 | `apps/mobile/src/services/api.ts` |
| 위치 | L6-8 `API_BASE_URL` 상수 |
| 원인 | `10.0.2.2`는 Android 에뮬레이터 전용 루프백. 실기기에서는 라우팅 불가 → axios 요청 실패 → catch 블록에서 "가입 실패" 다이얼로그 |
| 이유 | `localhost:8000`은 `adb reverse tcp:8000 tcp:8000` 활성 시 에뮬레이터·실기기 모두 호스트 머신으로 라우팅됨 |

---

## 수정 대상 파일

- `apps/mobile/src/services/api.ts`

---

## 변경 상세

### 1. API_BASE_URL Android 분기 제거

```typescript
// AS-IS (L6-8)
const API_BASE_URL =
  process.env.API_BASE_URL ??
  (Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000');

// TO-BE
const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:8000';
```

### 2. Platform import 제거

`Platform`이 해당 파일(`api.ts`) 내에서 URL 분기 외 다른 곳에서 사용되지 않으므로
L3의 `import { Platform } from 'react-native';` 를 함께 제거한다.

```typescript
// AS-IS (L3)
import { Platform } from 'react-native';

// TO-BE: 해당 라인 삭제
```

---

## 결정 근거

| 결정 | 대안 | 선택 이유 |
|---|---|---|
| `localhost:8000` 단일화 | 기기별 IP 주소 하드코드 | 개발 PC IP는 네트워크 변경 시마다 바뀜. adb reverse가 표준 dev workflow이므로 localhost 단일화가 유지보수 부담 최소 |
| Android 분기 제거 | 실기기 감지 로직 추가 | 에뮬레이터/실기기 모두 adb reverse 사용이 전제이므로 분기 자체가 불필요 |
| `Platform` import 제거 | 유지 | 파일 내 다른 사용처 없음 (grep 확인) → dead import 제거로 lint 오류 방지 |

---

## 주의사항

- `Platform`을 `api.ts` 외부에서 re-export하거나 barrel export하는 파일이 있으면 영향 없음 (해당 없음 확인됨)
- 프로덕션 환경에서는 `process.env.API_BASE_URL`(예: `https://api.jajang.app`)이 주입되므로 fallback 로직 동작 안 함 — 회귀 없음

---

## 검증 시나리오

| 시나리오 | 방법 | 기대 결과 |
|---|---|---|
| 실기기 이메일 가입 | Android 실기기(R3CXC0B93AR) adb reverse 후 이메일 가입 | 가입 성공, 다이얼로그 없음 |
| 실기기 Google 소셜 로그인 | 동일 기기 Google 로그인 | 로그인 성공, 다이얼로그 없음 |
| 에뮬레이터 회귀 | emulator-5554 동일 플로우 | 기존과 동일 정상 동작 |
