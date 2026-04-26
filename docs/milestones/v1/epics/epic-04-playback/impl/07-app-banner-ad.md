---
depth: std
design: skipped
---

# impl/07 — F10 배너 광고 + 무료 유저 전용 + collapse + S13 첫 진입 알림 권한

**커버 스토리**: Story 1 (재생 화면 — 무료 유저 배너 광고 영역), ux-flow.md S13 "광고 로드 실패 collapse"  
**선행 조건**: impl/02 PlayScreen (BannerAdSlot placeholder 위치), AdMob SDK 초기화  
**예상 소요**: 0.5일

> **참고**: S13 첫 진입 알림 권한 요청은 impl/02 §3-2에서 이미 `requestNotificationPermissionOnFirstEntry()`로 구현됨. 이 impl에서는 배너 광고 컴포넌트 구현에 집중.

---

## 1. 생성/수정 파일

| 경로 | 동작 | 비고 |
|---|---|---|
| `apps/mobile/src/components/BannerAdSlot.tsx` | 신규 생성 | 배너 광고 + collapse 처리 |
| `apps/mobile/src/services/adMobService.ts` | 신규 생성 | AdMob 초기화 래퍼 |
| `apps/mobile/App.tsx` (또는 index.js) | 수정 | 앱 기동 시 MobileAds.initialize() 호출 |

---

## 2. TS 인터페이스

```typescript
// BannerAdSlot — props 없음
// S13 PlayScreen에서 entitlement==='free' 조건으로 조건부 렌더만

interface BannerAdSlotState {
  loaded: boolean
  failed: boolean
}
```

---

## 3. 핵심 로직 의사코드

### 3-1. AdMob 초기화 (앱 기동 시 1회)

```typescript
// apps/mobile/src/services/adMobService.ts

import MobileAds from 'react-native-google-mobile-ads'

export async function initializeAdMob(): Promise<void> {
  await MobileAds().initialize()
  // COPPA 설정: 부모용 앱 — 아동 대상 광고 제외
  await MobileAds().setRequestConfiguration({
    tagForChildDirectedTreatment: false,
    tagForUnderAgeOfConsent: false,
  })
}

// App.tsx 또는 index.js 앱 기동 시:
// adMobService.initializeAdMob().catch(err => Sentry.captureException(err))
```

### 3-2. BannerAdSlot 컴포넌트

```typescript
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads'

const BANNER_UNIT_ID = process.env.ENV === 'production'
  ? process.env.ADMOB_BANNER_UNIT_ID!
  : TestIds.BANNER

function BannerAdSlot() {
  const [adState, setAdState] = useState<BannerAdSlotState>({
    loaded: false,
    failed: false,
  })

  if (adState.failed) {
    // 로드 실패 시 collapse — 빈 공간 없음
    return null
  }

  return (
    <View style={[styles.container, !adState.loaded && styles.hidden]}>
      <BannerAd
        unitId={BANNER_UNIT_ID}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: false,
        }}
        onAdLoaded={() => {
          setAdState({ loaded: true, failed: false })
        }}
        onAdFailedToLoad={(error) => {
          setAdState({ loaded: false, failed: true })
          // 에러 레벨 로깅 (AdMob 로드 실패는 빈번 — Sentry breadcrumb만 남김)
          Sentry.addBreadcrumb({
            category: 'admob',
            message: 'banner_load_failed',
            data: { error: error.message },
            level: 'info',
          })
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    // 하단 고정 — S13 SafeAreaView 내부 하단
  },
  hidden: {
    // 로드 전 공간 예약 없음 — 로드 완료 시 렌더
    height: 0,
    overflow: 'hidden',
  },
})
```

### 3-3. S13 PlayScreen에서 조건부 렌더 (impl/02 연결)

```typescript
// 이미 impl/02에서 선언된 부분:
// {entitlement === 'free' && <BannerAdSlot />}

// BannerAdSlot import 추가 (impl/02 placeholder 교체)
import { BannerAdSlot } from '../components/BannerAdSlot'
```

---

## 4. 결정 근거

| 결정 | 이유 |
|---|---|
| 로드 실패 시 null 반환 (collapse) | ux-flow.md S13 "광고 로드 실패 (무료) → 배너 collapse — 빈 공간 없음" 명시 |
| 로드 전 height=0 | 광고 로드 완료 전 빈 공간이 레이아웃에서 자리를 차지하면 UX 이상. 로드 완료 후에만 공간 확보 |
| ANCHORED_ADAPTIVE_BANNER | AdMob 권장 배너 사이즈. 기기 너비에 맞게 자동 조정 |
| Sentry breadcrumb (info 레벨) | AdMob 배너 로드 실패는 네트워크 상태, 광고 인벤토리 부족 등으로 빈번 발생. error 레벨로 캡처하면 노이즈. breadcrumb으로 사후 분석 가능하게 |
| 개발환경 TestIds.BANNER | 실제 광고 없이 개발 가능. ENV 분기 필수 |

---

## 5. 모듈 경계

- **BannerAdSlot → AdMob SDK**: BannerAd 컴포넌트 직접 사용
- **BannerAdSlot → Sentry**: breadcrumb (에러 아님)
- **S13 PlayScreen → BannerAdSlot**: `entitlement==='free'` 조건부 렌더
- **adMobService → App.tsx**: 앱 기동 1회 초기화. BannerAdSlot 렌더 전 완료 보장
- **알림 권한 (S13 첫 진입)**: impl/02 §3-2 `requestNotificationPermissionOnFirstEntry()` — 이 파일 담당 아님

---

## 6. 수용 기준

| # | 시나리오 | 기대 결과 |
|---|---|---|
| AC-01 | 무료 유저 S13 진입 | BannerAdSlot 렌더, 광고 로드 시도 |
| AC-02 | 광고 로드 성공 | 배너 하단 표시, 빈 공간 없이 |
| AC-03 | 광고 로드 실패 | BannerAdSlot null 반환, 배너 영역 collapse |
| AC-04 | Premium/Trial 유저 S13 진입 | BannerAdSlot 미렌더 |
| AC-05 | 광고 로드 전 | height=0, 공간 차지 없음 |
| AC-06 | 개발환경 | TestIds.BANNER 사용, 테스트 광고 노출 |
| AC-07 | 앱 기동 | MobileAds().initialize() + COPPA 설정 완료 |

---

## 7. 주의사항

- `MobileAds().initialize()`는 배너 렌더 이전에 완료되어야 함. App.tsx 최상단에서 await 처리 (앱 스플래시 중 수행).
- `ADMOB_BANNER_UNIT_ID` 환경변수는 iOS/Android 별도. 플랫폼 분기 필요 시 `Platform.select()` 또는 `.env.ios` / `.env.android` 분리.
- 배너 광고는 S13 SafeAreaView 내부 하단에 고정. SafeAreaView bottom inset 밖에 배치하지 않도록 주의 (홈 인디케이터 겹침).
- AdMob 앱 ID (`ADMOB_IOS_APP_ID`, `ADMOB_ANDROID_APP_ID`)는 `app.json` 또는 `Info.plist` / `AndroidManifest.xml`에도 설정 필요. 누락 시 앱 크래시.
