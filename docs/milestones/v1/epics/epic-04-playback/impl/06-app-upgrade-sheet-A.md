---
depth: deep
design: skipped
---

# impl/06 — S14 A형 업그레이드 팝업 + Rewarded Ad 언락

**커버 스토리**: S14 A형 (백그라운드 재생 시도 시), Rewarded Ad 언락, 트라이얼 유저 Rewarded 미노출  
**선행 조건**: impl/01 AudioEngine (pendingUpgradePrompt), impl/02 PlayScreen (useEffect 트리거), Epic 03 완료 (RevenueCat entitlement), AdMob SDK 초기화  
**예상 소요**: 2일

---

## 1. 생성/수정 파일

| 경로 | 동작 | 비고 |
|---|---|---|
| `apps/mobile/src/screens/S14_UpgradeSheet.tsx` | 신규 생성 | A/B 두 variant 통합 |
| `apps/mobile/src/services/rewardedAdService.ts` | 신규 생성 | AdMob Rewarded Ad 래퍼 |
| `apps/mobile/src/store/subscriptionSlice.ts` | 수정 | rewardedAdUsedThisMonth, rewardedUnlockExpiresAt |
| `apps/mobile/src/navigation/RootNavigator.tsx` | 수정 | UpgradeSheet 모달 스택 등록 |

> **B형** (횟수 소진) 구현 범위: Epic 03에서 S14 B형은 생성 횟수 소진 경로로 이미 스켈레톤 존재 예상. 이 impl에서는 A형 전용 로직(Rewarded Ad + 백그라운드 언락)과 공통 variant 분기만 다룬다.

---

## 2. TS 인터페이스

### 2-1. 화면 route params

```typescript
type UpgradeSheetParams = {
  variant: 'background' | 'generation-exhausted'
}
```

### 2-2. rewardedAdService

```typescript
// apps/mobile/src/services/rewardedAdService.ts

export type RewardedAdResult =
  | { status: 'completed' }
  | { status: 'dismissed' }
  | { status: 'load_failed'; error: string }
  | { status: 'monthly_exhausted' }

export async function loadAndShowRewardedAd(): Promise<RewardedAdResult>

export function getMonthlyUsageCount(): number   // SubscriptionSlice 경유

export function isMonthlyExhausted(): boolean    // >= 7회
```

### 2-3. SubscriptionSlice 신규 필드

```typescript
interface SubscriptionSlice {
  generationCount: number
  rewardedAdUsedThisMonth: number        // 이번 달 시청 횟수 (0~7)
  rewardedAdMonthKey: string             // 'YYYY-MM' — 월 전환 시 리셋
  rewardedUnlockExpiresAt: number | null // 자정 timestamp (PlayerSlice에도 동기화)
}
```

---

## 3. 핵심 로직 의사코드

### 3-1. S14 A형 렌더 분기

```typescript
function UpgradeSheet({ route, navigation }) {
  const { variant } = route.params
  const { entitlement } = useAuthStore()
  const { rewardedAdUsedThisMonth, rewardedAdMonthKey } = useSubscriptionStore()

  // 월 전환 시 카운터 리셋
  useEffect(() => {
    const currentMonthKey = getCurrentMonthKey()  // 'YYYY-MM'
    if (rewardedAdMonthKey !== currentMonthKey) {
      useSubscriptionStore.setState({
        rewardedAdUsedThisMonth: 0,
        rewardedAdMonthKey: currentMonthKey,
      })
    }
  }, [])

  // A형 전용 — Rewarded Ad 버튼 노출 조건
  // 트라이얼 유저는 Rewarded Ad 미노출 (백그라운드 이미 허용)
  // → 이 경로에 trial 유저가 도달하는 것은 AudioEngine의 버그이므로
  //   trial 도달 시 early return으로 S13 복귀
  useEffect(() => {
    if (variant === 'background' && entitlement === 'trial') {
      // trial은 백그라운드 허용 — 팝업이 뜨면 안 됨 (AudioEngine 방어 코드 누락)
      navigation.goBack()
    }
  }, [])

  const showRewardedButton =
    variant === 'background' &&
    entitlement === 'free' &&
    rewardedAdUsedThisMonth < 7

  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        <TouchableOpacity onPress={navigation.goBack} style={styles.closeBtn}>
          <Icon name="close" />
        </TouchableOpacity>

        {variant === 'background' ? (
          <VariantBackground
            showRewardedButton={showRewardedButton}
            monthlyUsed={rewardedAdUsedThisMonth}
            onRewardedPress={handleRewardedAd}
            onSubscribePress={goToSubscribe}
            onDismiss={() => navigation.goBack()}
          />
        ) : (
          <VariantGenerationExhausted
            onSubscribePress={goToSubscribe}
            onDismiss={handleExhaustedDismiss}
          />
        )}
      </View>
    </View>
  )
}
```

### 3-2. VariantBackground 컴포넌트

```typescript
function VariantBackground({ showRewardedButton, monthlyUsed, onRewardedPress, onSubscribePress, onDismiss }) {
  return (
    <>
      <Text style={styles.headline}>💤 아기가 잠드는 동안에도</Text>
      <Text style={styles.body}>화면을 꺼도 자장가가 계속 흘러요</Text>

      {showRewardedButton && (
        <TouchableOpacity style={styles.rewardedBtn} onPress={onRewardedPress}
          accessibilityLabel="광고 보고 오늘 밤 무료로 쓸게요">
          <Text>광고 보고 오늘 밤 무료로 쓸게요</Text>
        </TouchableOpacity>
      )}

      {!showRewardedButton && monthlyUsed >= 7 && (
        <Text style={styles.exhaustedMsg}>이번 달은 이미 모두 사용했어요</Text>
      )}

      <TouchableOpacity style={styles.subscribeBtn} onPress={onSubscribePress}
        accessibilityLabel="구독하기">
        <Text style={styles.subscribeBtnText}>구독하기</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onDismiss} accessibilityLabel="지금은 괜찮아요">
        <Text style={styles.dismissText}>지금은 괜찮아요</Text>
      </TouchableOpacity>
    </>
  )
}
```

### 3-3. handleRewardedAd 흐름

```typescript
async function handleRewardedAd() {
  setIsLoadingAd(true)

  const result = await rewardedAdService.loadAndShowRewardedAd()

  setIsLoadingAd(false)

  switch (result.status) {
    case 'completed':
      // 자정까지 백그라운드 언락
      const midnight = getMidnightTimestamp()  // 오늘 자정 ms
      useSubscriptionStore.setState(state => ({
        rewardedAdUsedThisMonth: state.rewardedAdUsedThisMonth + 1,
      }))
      usePlayerStore.setState({ rewardedUnlockExpiresAt: midnight })
      // S13 복귀 + 재생 재개
      AudioEngine.resumePlayback()
      navigation.goBack()
      break

    case 'dismissed':
      // 시청 완료 전 닫기 — 언락 없음, 팝업 유지
      break

    case 'load_failed':
      showToast('광고를 불러오지 못했어요')
      // 광고 버튼만 비활성화, 구독 버튼 유지
      setAdLoadFailed(true)
      break

    case 'monthly_exhausted':
      // UI 이미 monthlyUsed >= 7로 버튼 숨김 — 도달 불가 케이스
      break
  }
}
```

### 3-4. rewardedAdService.ts

```typescript
import { RewardedAd, RewardedAdEventType, TestIds } from 'react-native-google-mobile-ads'

const REWARDED_UNIT_ID = process.env.ENV === 'production'
  ? process.env.ADMOB_REWARDED_UNIT_ID!
  : TestIds.REWARDED  // 개발환경 mock

export async function loadAndShowRewardedAd(): Promise<RewardedAdResult> {
  const ad = RewardedAd.createForAdRequest(REWARDED_UNIT_ID, {
    requestNonPersonalizedAdsOnly: false,
    // COPPA: tag_for_child_directed_treatment=false (부모용 앱)
  })

  return new Promise((resolve) => {
    const unsubscribeLoaded = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      ad.show()
    })

    const unsubscribeEarned = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      cleanup()
      resolve({ status: 'completed' })
    })

    const unsubscribeClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
      // EARNED_REWARD가 먼저 fire되므로 여기선 dismissed 처리
      // completed는 이미 resolve됐으므로 중복 resolve 없음
      cleanup()
      resolve({ status: 'dismissed' })
    })

    const unsubscribeError = ad.addAdEventListener(AdEventType.ERROR, (error) => {
      cleanup()
      resolve({ status: 'load_failed', error: error.message })
    })

    function cleanup() {
      unsubscribeLoaded()
      unsubscribeEarned()
      unsubscribeClosed()
      unsubscribeError()
    }

    // 로드 시작
    ad.load()

    // 15초 타임아웃
    setTimeout(() => {
      cleanup()
      resolve({ status: 'load_failed', error: 'timeout' })
    }, 15_000)
  })
}

// 자정 timestamp 계산
function getMidnightTimestamp(): number {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setHours(23, 59, 59, 999)
  return midnight.getTime()
}
```

---

## 4. 결정 근거

| 결정 | 이유 |
|---|---|
| trial 유저 팝업 도달 시 early return | trial은 백그라운드 허용 — 팝업 노출이 UX 오류. AudioEngine 방어코드 미비를 팝업에서 흡수 |
| 월 7회 제한은 클라이언트에서만 카운트 | MVP 단계. 서버 검증 추가 시 `rewarded_ad_usage` DB 테이블 활용 (TRD §4 참조). 클라이언트 조작 위험은 낮음 — 앱 재설치 시 리셋은 허용 범위 |
| 자정 timestamp로 만료 관리 | "오늘 밤" 언락 = 자정까지. UTC가 아닌 로컬 자정 사용 (수면 앱 특성상 지역 시간 기준) |
| 15초 ad load 타임아웃 | AdMob 문서 권장 10~15초. 무한 대기 방지 |
| dismissed와 completed 구분 | EARNED_REWARD는 CLOSED 이전에 fire됨. Promise resolve가 2번 호출되지 않도록 cleanup 후 resolve |
| 개발환경 TestIds.REWARDED | 실제 광고 노출 없이 개발/테스트 가능. ENV 분기 필수 |

---

## 5. 모듈 경계

- **S14 → rewardedAdService**: loadAndShowRewardedAd() 호출
- **S14 → SubscriptionSlice**: rewardedAdUsedThisMonth, rewardedAdMonthKey read/write
- **S14 → PlayerSlice**: rewardedUnlockExpiresAt write (Rewarded 완료 시)
- **S14 → AudioEngine**: resumePlayback() (Rewarded 완료 후 재생 재개)
- **S14 → navigation**: goBack() (S13 복귀), navigate('Subscribe') (구독 화면)
- **AudioEngine.handleBackgroundTransition → PlayerSlice.pendingUpgradePrompt**: 이 팝업의 트리거 공급원
- **B형 분기**: variant='generation-exhausted' — Epic 03 완료 상태 기반. 이 impl에서 UI 분기만 담당, 횟수 로직은 Epic 03

---

## 6. 수용 기준

| # | 시나리오 | 기대 결과 |
|---|---|---|
| AC-01 | 무료 + 화면 잠금 → 앱 복귀 | S14 A형 노출, Rewarded 버튼 + 구독 버튼 |
| AC-02 | Trial + 화면 잠금 (비정상 경로) | S14 미노출, S13 유지 |
| AC-03 | Rewarded Ad 시청 완료 | rewardedAdUsedThisMonth+1, rewardedUnlockExpiresAt=자정, 재생 재개, S13 복귀 |
| AC-04 | Rewarded Ad 시청 중 닫기 | 팝업 유지, 언락 없음 |
| AC-05 | Rewarded Ad 로드 실패 | "광고를 불러오지 못했어요" 토스트, 광고 버튼 비활성, 구독 버튼 유지 |
| AC-06 | 당월 7회 시청 완료 후 재진입 | Rewarded 버튼 미노출, "이번 달은 이미 모두 사용했어요" 메시지 |
| AC-07 | 구독하기 탭 | S15 이동 |
| AC-08 | ✕ / 지금은 괜찮아요 탭 | S13 복귀 (재생 중단 상태 유지) |
| AC-09 | Rewarded 언락 유저 화면 잠금 | 자정 전: 재생 유지. 자정 후: 무료 정책 적용 |
| AC-10 | 월 전환 시 앱 실행 | rewardedAdUsedThisMonth=0 리셋 |

---

## 7. 주의사항

- `EARNED_REWARD`와 `CLOSED` 이벤트 순서는 AdMob iOS/Android에서 다를 수 있음. 실기기 테스트 필수. cleanup 패턴으로 중복 resolve 방지.
- `rewardedUnlockExpiresAt`은 PlayerSlice와 SubscriptionSlice 두 곳에 있음. PlayerSlice의 값이 AudioEngine이 직접 읽는 진실 공급원. SubscriptionSlice는 UI용. 동기화 책임은 S14 handleRewardedAd에 있음.
- 월 7회 제한은 PRD F11에 명시된 수치. 변경 시 PRD 먼저 확인.
- `getMidnightTimestamp()`는 로컬 자정 기준. 타임존이 자정을 넘는 경우(UTC 기준 다음날) 처리 불필요 — 수면 앱 특성상 자정 이후 사용은 드묾.
- 개발환경에서 `ENV` 환경변수 누락 시 `TestIds.REWARDED`로 fallback 처리 필수.
