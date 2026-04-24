---
depth: std
---

# impl/07 — F14 가입 완료 시 7일 트라이얼 자동 시작 (RevenueCat)

**Epic**: 01 — 인증 & 온보딩  
**커버 스토리**: Story 5 (7일 무료 Premium 트라이얼)  
**선행 조건**: impl/05 (회원가입/로그인 완성), impl/06 (Zustand 세션 관리)  
**예상 소요**: 3~4시간

---

## 1. 생성/수정할 파일 목록

```
apps/mobile/src/
├── services/
│   └── revenue-cat.ts           [신규 — RevenueCat 래퍼]
├── hooks/
│   └── useEntitlement.ts        [신규 — entitlement 조회 훅]
├── App.tsx                      [수정 — Purchases.configure + GoogleSignin.configure + mobileAds 초기화]
└── screens/
    ├── S04SignupScreen.tsx       [수정 — 가입 완료 후 revenueCatLogin 호출]
    └── S05LoginScreen.tsx       [수정 — 로그인 완료 후 revenueCatLogin 호출]
```

---

## 2. RevenueCat 래퍼

### services/revenue-cat.ts

```typescript
import Purchases, { CustomerInfo, LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';
import { useAuthStore } from '@store/auth-store';

// 개발환경 로그 활성화
if (__DEV__) {
  Purchases.setLogLevel(LOG_LEVEL.DEBUG);
}

/**
 * 앱 초기화 시 1회 호출 (App.tsx)
 * 유저 로그인 전에 configure 먼저 실행 필수
 */
export function configurePurchases() {
  const apiKey = Platform.select({
    ios: process.env.REVENUECAT_IOS_API_KEY ?? '',
    android: process.env.REVENUECAT_ANDROID_API_KEY ?? '',
    default: '',
  });
  Purchases.configure({ apiKey });
}

/**
 * 로그인/가입 완료 직후 호출
 * userId = server UUID (문자열)
 * RevenueCat에서 자동으로 트라이얼 시작 (대시보드 설정 기준)
 */
export async function revenueCatLogin(userId: string): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.logIn(userId);
  return customerInfo;
}

/**
 * CustomerInfo → 앱 내부 entitlement 타입 변환
 */
export function extractEntitlement(
  customerInfo: CustomerInfo,
): { entitlement: 'free' | 'trial' | 'premium'; trialExpiresAt: string | null } {
  const active = customerInfo.entitlements.active;
  const premiumEntry = active['premium'];  // RevenueCat 대시보드 entitlement ID: 'premium'

  if (!premiumEntry) {
    return { entitlement: 'free', trialExpiresAt: null };
  }

  // isTrial: RevenueCat v7에서 productPlanIdentifier 또는 periodType으로 확인
  // periodType: 'TRIAL' | 'INTRO' | 'NORMAL'
  const isTrial = premiumEntry.periodType === 'TRIAL';
  const expiresAt = premiumEntry.expirationDate ?? null;  // ISO 8601 string

  return {
    entitlement: isTrial ? 'trial' : 'premium',
    trialExpiresAt: isTrial ? expiresAt : null,
  };
}

/**
 * 현재 CustomerInfo 조회 (앱 포그라운드 복귀 시 호출)
 */
export async function getCustomerInfo(): Promise<CustomerInfo> {
  return Purchases.getCustomerInfo();
}

/**
 * 로그아웃 (탈퇴/로그아웃 시 호출)
 */
export async function revenueCatLogout(): Promise<void> {
  await Purchases.logOut();
}

/**
 * CustomerInfo listener 등록 (구독 상태 변경 실시간 반영)
 * App.tsx에서 1회 등록, unmount 시 제거
 */
export function addCustomerInfoListener(
  callback: (customerInfo: CustomerInfo) => void,
): () => void {
  Purchases.addCustomerInfoUpdateListener(callback);
  return () => Purchases.removeCustomerInfoUpdateListener(callback);
}
```

**`periodType === 'TRIAL'` 검증**: RevenueCat SDK v7에서 `EntitlementInfo`의 `periodType` 속성으로 트라이얼 여부 확인. `productIdentifier.includes('trial')` 방식(이전 패턴) 대비 명확한 서버-사이드 데이터 기반 판별. 실제 SDK `.d.ts` 확인 후 필드명 검증 필요 (impl/07 수용 기준에 포함).

**트라이얼 자동 시작 메커니즘**: RevenueCat 대시보드에서 상품(App Store Connect/Google Play) 에 7일 무료 트라이얼 기간 설정. `Purchases.logIn(userId)` 후 RevenueCat이 해당 유저의 첫 구독 여부를 확인 → 자동 트라이얼 entitlement 부여. 클라이언트 코드 추가 없음.

---

## 3. useEntitlement 훅

```typescript
// src/hooks/useEntitlement.ts
import { useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuthStore } from '@store/auth-store';
import {
  getCustomerInfo,
  extractEntitlement,
  addCustomerInfoListener,
} from '@services/revenue-cat';

/**
 * entitlement 동기화 훅
 * - 앱 포그라운드 복귀 시 RevenueCat 재조회
 * - CustomerInfoUpdateListener로 실시간 반영
 */
export function useEntitlementSync() {
  const { setEntitlement, isAuthenticated } = useAuthStore();

  const syncEntitlement = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const customerInfo = await getCustomerInfo();
      const { entitlement, trialExpiresAt } = extractEntitlement(customerInfo);
      setEntitlement(entitlement, trialExpiresAt);
    } catch (e) {
      // 네트워크 오류 시 기존 캐시값 유지
      console.warn('RevenueCat sync failed:', e);
    }
  }, [isAuthenticated, setEntitlement]);

  // 포그라운드 복귀 시 동기화
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        syncEntitlement();
      }
    });
    return () => subscription.remove();
  }, [syncEntitlement]);

  // CustomerInfo 실시간 리스너
  useEffect(() => {
    if (!isAuthenticated) return;
    const remove = addCustomerInfoListener((customerInfo) => {
      const { entitlement, trialExpiresAt } = extractEntitlement(customerInfo);
      setEntitlement(entitlement, trialExpiresAt);
    });
    return remove;
  }, [isAuthenticated, setEntitlement]);

  return { syncEntitlement };
}

/**
 * 트라이얼 D-1 여부 계산 (배너 표시용)
 */
export function useTrialDaysRemaining(): number | null {
  const { entitlement, trialExpiresAt } = useAuthStore();

  if (entitlement !== 'trial' || !trialExpiresAt) return null;

  const expiresMs = new Date(trialExpiresAt).getTime();
  const nowMs = Date.now();
  const remainMs = expiresMs - nowMs;

  if (remainMs <= 0) return 0;
  return Math.ceil(remainMs / (1000 * 60 * 60 * 24));
}
```

**포그라운드 동기화 이유**: 유저가 앱 외부에서 구독 취소/갱신한 경우 반영. 실시간 webhook은 서버→DB 동기화용, 클라이언트는 RevenueCat SDK가 진실 공급원.

---

## 4. App.tsx 초기화 수정

```typescript
// App.tsx (완성 버전)
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import mobileAds, { MaxAdContentRating } from 'react-native-google-mobile-ads';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import RootNavigator from '@navigation/RootNavigator';
import { configurePurchases } from '@services/revenue-cat';
import { useEntitlementSync } from '@hooks/useEntitlement';
import { SessionExpiredListener } from './src/lib/SessionExpiredListener';

// 앱 레벨 1회 초기화 (컴포넌트 외부)
configurePurchases();

GoogleSignin.configure({
  webClientId: process.env.GOOGLE_WEB_CLIENT_ID ?? '',
  offlineAccess: false,
});

function AppContent() {
  const { syncEntitlement } = useEntitlementSync();

  useEffect(() => {
    // AdMob 초기화
    mobileAds().initialize().catch(console.warn);
    mobileAds().setRequestConfiguration({
      maxAdContentRating: MaxAdContentRating.PG,
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    }).catch(console.warn);
  }, []);

  return (
    <>
      <SessionExpiredListener />
      <RootNavigator />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="#0D0F1A" />
      <NavigationContainer theme={/* 기존 theme */}>
        <AppContent />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
```

**초기화 순서 근거**:
1. `configurePurchases()`: 컴포넌트 외부 최상단 — 어떤 화면도 열리기 전 SDK 준비
2. `GoogleSignin.configure()`: 소셜 로그인 버튼 탭 전 준비
3. `mobileAds().initialize()`: 광고 SDK는 지연 허용 (S13 재생화면 진입 전까지 시간 여유)

---

## 5. 가입/로그인 완료 후 RevenueCat 연동

### S04SignupScreen.tsx, S05LoginScreen.tsx 수정 패턴

```typescript
// handleEmailSignup / handleSocialSuccess / handleLogin 성공 블록 수정
import { revenueCatLogin, extractEntitlement } from '@services/revenue-cat';

// 기존:
await saveSession(response);
navigation.replace('Main');

// 수정:
await saveSession(response);

// RevenueCat logIn → 트라이얼 자동 시작 + entitlement 확인
try {
  const customerInfo = await revenueCatLogin(response.user_id);
  const { entitlement, trialExpiresAt } = extractEntitlement(customerInfo);
  // Zustand entitlement 업데이트 (서버 응답의 'free' → 실제 'trial' 반영)
  useAuthStore.getState().setEntitlement(entitlement, trialExpiresAt);
} catch (e) {
  console.warn('RevenueCat logIn failed:', e);
  // 실패 시 서버 응답 entitlement 유지 (트라이얼 미확인 상태로 진입)
}

navigation.replace('Main');
```

**순서 결정**: `saveSession` (SecureStore + Zustand) → `revenueCatLogin` (RevenueCat SDK) → `setEntitlement` (Zustand 업데이트). RevenueCat 실패 시 가입 자체를 막지 않음 — 트라이얼 미적용 상태로 홈 진입 후 `useEntitlementSync`가 다음 앱 재실행 시 동기화.

---

## 6. 서버 webhook 연동 (FastAPI)

Epic 01 범위에서 webhook 엔드포인트 최소 구현:

```python
# apps/api/app/api/v1/webhooks.py
from fastapi import APIRouter, Request, HTTPException
import hmac, hashlib
from app.core.config import settings
from app.core.db import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

@router.post("/revenuecat")
async def revenuecat_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    # 서명 검증 (RevenueCat 대시보드 shared secret)
    body = await request.body()
    signature = request.headers.get("X-RevenueCat-Signature", "")
    expected = hmac.new(
        settings.REVENUECAT_WEBHOOK_SECRET.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401, detail="Invalid signature")

    payload = await request.json()
    event = payload.get("event", {})
    event_type = event.get("type")
    app_user_id = event.get("app_user_id")  # = user.id (UUID string)
    
    # 주요 이벤트 처리 (Epic 01: trial_started + 기본 처리)
    HANDLED_EVENTS = {
        "TRIAL_STARTED", "TRIAL_CONVERTED", "INITIAL_PURCHASE",
        "RENEWAL", "CANCELLATION", "EXPIRATION",
    }
    
    if event_type in HANDLED_EVENTS and app_user_id:
        await sync_subscription_from_webhook(db, app_user_id, event_type, event)
    
    return {"status": "ok"}

async def sync_subscription_from_webhook(
    db: AsyncSession,
    user_id_str: str,
    event_type: str,
    event: dict,
):
    """subscriptions 테이블 UPSERT"""
    from app.models.subscription import Subscription
    from sqlalchemy import select
    import uuid
    from datetime import datetime, timezone

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        return

    # entitlement 결정
    entitlement_map = {
        "TRIAL_STARTED": "trial",
        "TRIAL_CONVERTED": "premium",
        "INITIAL_PURCHASE": "premium",
        "RENEWAL": "premium",
        "CANCELLATION": "premium",  # 만료일까지 유지
        "EXPIRATION": "free",
    }
    entitlement = entitlement_map.get(event_type, "free")

    result = await db.execute(
        select(Subscription).where(Subscription.user_id == user_id)
    )
    sub = result.scalar_one_or_none()
    if sub:
        sub.entitlement = entitlement
        sub.is_active = entitlement != "free"
        sub.updated_at = datetime.now(timezone.utc)
    else:
        sub = Subscription(
            user_id=user_id,
            revenuecat_customer_id=event.get("app_user_id", user_id_str),
            entitlement=entitlement,
            is_active=entitlement != "free",
        )
        db.add(sub)
    await db.commit()
```

---

## 7. RevenueCat 대시보드 설정 체크리스트

- [ ] App Store Connect: 월간/연간 구독 상품 생성 (7일 free trial 설정 포함)
- [ ] Google Play Console: 동일 구독 상품 생성
- [ ] RevenueCat 대시보드: 프로젝트 생성 + iOS/Android 앱 연결
- [ ] RevenueCat Entitlement: `premium` entitlement 생성 → 두 상품 연결
- [ ] RevenueCat Webhook: 서버 endpoint URL 등록 + shared secret 복사
- [ ] `REVENUECAT_WEBHOOK_SECRET` 환경변수 설정

---

## 8. 수용 기준

- [ ] 신규 이메일 가입 완료 → `Purchases.logIn(userId)` 호출 확인 (로그 확인)
- [ ] `extractEntitlement` 반환값: RevenueCat 대시보드 트라이얼 설정 시 `entitlement='trial'`
- [ ] `useAuthStore.getState().entitlement` = `'trial'` (가입 직후)
- [ ] `useAuthStore.getState().trialExpiresAt` = 7일 후 ISO 8601 문자열
- [ ] 앱 포그라운드 복귀 → `useEntitlementSync` 재조회 동작 확인 (AppState 'active' 이벤트)
- [ ] RevenueCat webhook `TRIAL_STARTED` → subscriptions 테이블 `entitlement='trial'` 업데이트
- [ ] `periodType === 'TRIAL'` 필드 존재 확인 — `react-native-purchases` v7 `.d.ts` 열람 필수

---

## 9. 주의사항

- **`periodType` 필드 확인 필수**: `docs/sdk.md`에서 `productIdentifier.includes('trial')` 패턴을 언급했으나, RevenueCat v7 SDK에서 실제 트라이얼 판별은 `EntitlementInfo.periodType`이 더 신뢰성 있음. 실제 `.d.ts` 파일을 열어 `periodType` 타입 확인 후 적용.
- **트라이얼 상품 등록 선행**: App Store Connect/Google Play에 7일 트라이얼 구독 상품이 없으면 `Purchases.logIn` 후 entitlement가 `free`로 남음. 개발 단계에서 RevenueCat Sandbox 환경으로 테스트.
- **`REVENUECAT_WEBHOOK_SECRET` 환경변수**: `.env.example`에 키 추가 필수 (impl/00에서 누락됨). 서버 배포 전 반드시 설정.
- **소셜 재로그인 시 RevenueCat**: 기존 유저가 소셜로 재로그인 시 `revenueCatLogin(userId)` 호출로 기존 구독 상태 복원. RevenueCat은 같은 `userId`로 이전 구독을 자동 연결.
- **AdMob과 RevenueCat 초기화 순서**: RevenueCat `configure`는 컴포넌트 외부 최상단 실행. AdMob `initialize()`는 `useEffect` 내 비동기 실행 — 순서 바뀌어도 무방. 단 AdMob은 첫 광고 요청 전에 initialize 완료 필요 (S13 진입 전 여유 충분).
