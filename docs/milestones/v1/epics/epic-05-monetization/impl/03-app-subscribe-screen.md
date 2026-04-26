---
depth: std
design: skipped
---

# impl/03 — S15 SubscribeScreen (IAP 구독 결제 화면)

**커버 스토리**: Epic 05 Story 1 (F12 IAP 구독 — 월 ₩3,900 / 연 ₩29,000), Story 5 (구독 진입점)  
**선행 조건**: Epic 01 impl/07 (RevenueCat configurePurchases + revenue-cat.ts 래퍼), Epic 04 impl/06 (S14 UpgradeSheet navigate('Subscribe') 호출)  
**예상 소요**: 2일

---

## 1. 생성/수정 파일

| 경로 | 동작 | 비고 |
|---|---|---|
| `apps/mobile/src/screens/S15_SubscribeScreen.tsx` | **신규** | 월/연 플랜 선택 + RevenueCat purchasePackage + 복원 |
| `apps/mobile/src/services/revenue-cat.ts` | **수정** | fetchOfferings(), purchasePackage(), restorePurchases() 추가 |
| `apps/mobile/src/navigation/RootNavigator.tsx` | **수정** | Subscribe 스크린 등록 |

---

## 2. TS 인터페이스

### 2-1. revenue-cat.ts 추가 함수

```typescript
import Purchases, {
  CustomerInfo,
  PurchasesOffering,
  PurchasesPackage,
  PURCHASES_ERROR_CODE,
} from 'react-native-purchases'

/**
 * RevenueCat Offerings 조회.
 * 'default' offering을 사용. 패키지: MONTHLY_3900 / ANNUAL_29000.
 * 실패 시 null 반환 (네트워크 오류 처리는 호출자).
 */
export async function fetchOfferings(): Promise<PurchasesOffering | null>

/**
 * 패키지 결제 실행.
 * RevenueCat purchasePackage → CustomerInfo 반환.
 * 사용자 취소: throws PurchasesError (code=PURCHASE_CANCELLED_ERROR) → 호출자에서 구분 처리.
 */
export async function purchasePackage(
  pkg: PurchasesPackage
): Promise<CustomerInfo>

/**
 * 기존 구독 복원.
 * 기기 변경 또는 앱 재설치 후 호출.
 * 복원 대상 없으면 CustomerInfo.entitlements.active 빈 객체.
 */
export async function restorePurchases(): Promise<CustomerInfo>

/**
 * RevenueCat PurchasesError 취소 여부 확인 헬퍼.
 */
export function isCancelledError(error: unknown): boolean
```

### 2-2. S15_SubscribeScreen.tsx 주요 타입

```typescript
type PlanType = 'monthly' | 'annual'

interface PlanCardProps {
  planType: PlanType
  price: string           // "₩3,900/월" | "₩29,000/년"
  savingsBadge?: string   // "월 ₩2,417 절약" (연간만)
  isSelected: boolean
  onSelect: () => void
}

type SubscribeScreenParams = {
  // 진입 경로 (로그 목적)
  source?: 'upgrade_sheet' | 'settings' | 'trial_banner' | 'trial_expired'
}
```

---

## 3. 핵심 로직 의사코드

### 3-1. fetchOfferings + 화면 초기화

```typescript
function SubscribeScreen({ route, navigation }) {
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('annual')  // 연간 기본 선택
  const [offering, setOffering] = useState<PurchasesOffering | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingOfferings, setIsLoadingOfferings] = useState(true)

  useEffect(() => {
    async function loadOfferings() {
      try {
        const off = await fetchOfferings()
        setOffering(off)
      } catch {
        showToast('상품 정보를 불러오지 못했어요')
      } finally {
        setIsLoadingOfferings(false)
      }
    }
    loadOfferings()
  }, [])

  // 트라이얼 미사용 유저: "7일 무료 체험 후 과금" 문구 표시
  // 이미 trial 사용한 유저: 문구 미노출
  const { entitlement } = useAuthStore()
  const showTrialBadge = entitlement === 'free'  // trial이었던 유저도 free 전환 후 미노출
  // 정확하게는 RevenueCat introductoryPrice 존재 여부로 판단이 맞으나
  // MVP에서는 entitlement='free' && 트라이얼 미사용 가정 (단순화)
```

### 3-2. 결제 플로우

```typescript
  async function handleSubscribe() {
    if (!offering || isLoading) return

    const pkg = selectedPlan === 'monthly'
      ? offering.monthly          // MONTHLY package
      : offering.annual           // ANNUAL package

    if (!pkg) {
      showToast('선택한 상품을 찾을 수 없어요')
      return
    }

    setIsLoading(true)
    try {
      const customerInfo = await purchasePackage(pkg)
      const { entitlement, trialExpiresAt } = extractEntitlement(customerInfo)

      // Zustand 즉시 반영
      useAuthStore.getState().setEntitlement(entitlement, trialExpiresAt)

      // 구독 성공 → S06 홈으로
      showToast('구독이 완료됐어요')
      navigation.navigate('Main')

    } catch (error) {
      if (isCancelledError(error)) {
        // 사용자 취소 — 무음 처리 (토스트 없음)
        return
      }
      // 결제 실패 (네트워크, 카드 오류 등)
      showToast('결제에 실패했어요. 다시 시도해주세요.')
    } finally {
      setIsLoading(false)
    }
  }
```

### 3-3. 복원 플로우

```typescript
  async function handleRestore() {
    setIsLoading(true)
    try {
      const customerInfo = await restorePurchases()
      const { entitlement, trialExpiresAt } = extractEntitlement(customerInfo)

      if (entitlement !== 'free') {
        useAuthStore.getState().setEntitlement(entitlement, trialExpiresAt)
        showToast('구독이 복원됐어요')
        navigation.navigate('Main')
      } else {
        showToast('복원할 구독이 없어요')
      }
    } catch {
      showToast('복원에 실패했어요')
    } finally {
      setIsLoading(false)
    }
  }
```

### 3-4. 화면 구조

```typescript
  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity onPress={navigation.goBack} style={styles.backBtn}>
        <Icon name="arrow-left" />
      </TouchableOpacity>

      {/* 헤드라인 */}
      <Text style={styles.headline}>아기 곁에서 더 오래{'\n'}함께해요</Text>

      {/* 혜택 목록 — stagger fade-in 60ms (UX Flow 애니메이션 의도) */}
      <BenefitList benefits={[
        '백그라운드 재생',
        '광고 없음',
        '오프라인 재생',
        '자장가 무제한 생성',
      ]} />

      {/* 로딩 중: 플랜 카드 스켈레톤 */}
      {isLoadingOfferings ? (
        <PlanCardSkeleton />
      ) : (
        <>
          <PlanCard
            planType="monthly"
            price={offering?.monthly?.product?.priceString ?? '₩3,900/월'}
            isSelected={selectedPlan === 'monthly'}
            onSelect={() => setSelectedPlan('monthly')}
          />
          <PlanCard
            planType="annual"
            price={offering?.annual?.product?.priceString ?? '₩29,000/년'}
            savingsBadge="월 ₩2,417 절약"
            isSelected={selectedPlan === 'annual'}
            onSelect={() => setSelectedPlan('annual')}
          />
        </>
      )}

      {/* 트라이얼 미사용 유저 한정 */}
      {showTrialBadge && (
        <Text style={styles.trialBadge}>7일 무료 체험 후 과금</Text>
      )}

      {/* 구독 CTA */}
      <TouchableOpacity
        style={[styles.subscribeBtn, isLoading && styles.disabled]}
        onPress={handleSubscribe}
        disabled={isLoading || isLoadingOfferings}
        accessibilityLabel="구독 시작하기"
      >
        {isLoading
          ? <ActivityIndicator color="#FFF" />
          : <Text style={styles.subscribeBtnText}>구독 시작하기</Text>
        }
      </TouchableOpacity>

      {/* 복원 */}
      <TouchableOpacity onPress={handleRestore} disabled={isLoading}>
        <Text style={styles.restoreText}>구독 복원하기</Text>
      </TouchableOpacity>

      {/* 법적 링크 */}
      <View style={styles.legalRow}>
        <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL)}>
          <Text style={styles.legalText}>개인정보처리방침</Text>
        </TouchableOpacity>
        <Text style={styles.legalDot}> · </Text>
        <TouchableOpacity onPress={() => Linking.openURL(TERMS_URL)}>
          <Text style={styles.legalText}>이용약관</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}
```

### 3-5. revenue-cat.ts 추가 구현

```typescript
export async function fetchOfferings(): Promise<PurchasesOffering | null> {
  const offerings = await Purchases.getOfferings()
  return offerings.current ?? null
  // RevenueCat 대시보드에서 'default' offering 설정 필수
  // monthly 패키지: PackageType.MONTHLY
  // annual 패키지: PackageType.ANNUAL
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.purchasePackage(pkg)
  return customerInfo
}

export async function restorePurchases(): Promise<CustomerInfo> {
  const customerInfo = await Purchases.restorePurchases()
  return customerInfo
}

export function isCancelledError(error: unknown): boolean {
  // RevenueCat v7: PurchasesError.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code: number }).code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
  ) {
    return true
  }
  return false
}
```

---

## 4. 결정 근거

| 결정 | 이유 | 대안 검토 |
|---|---|---|
| Offerings API 경유 (hardcoded 가격 금지) | 스토어 가격은 국가/프로모션에 따라 변동. `product.priceString`은 RevenueCat이 현지화. Apple 심사 요구사항 (IAP 가격 하드코딩 금지). | 가격 상수 → 심사 거절 위험 + 다국어 대응 불가 |
| 연간 플랜 기본 선택 | UX Flow S15 명시 ("연간 기본 선택 + 절약 배지"). LTV 최대화 목적. | 월간 기본 → 전환율 낮은 플랜으로 진입 |
| 사용자 취소 시 토스트 없음 | 취소는 의도적 행동. 토스트 노출이 오히려 UX 방해. RevenueCat 공식 가이드 패턴. | 취소 토스트 → "결제에 실패했어요" 오해 유발 |
| PlanCard에 priceString fallback | 네트워크 오류 시 Offerings null → 하드코딩 fallback 표시. 최소한의 UI 유지. | 오류 시 화면 전체 실패 → 구독 전환 기회 손실 |
| 트라이얼 배지 = entitlement==='free' 단순화 | MVP. 정확하게는 `pkg.introductoryPrice` 존재 여부로 판단해야 하나 RevenueCat SDK 필드 확인 필요. 추후 보강. | introductoryPrice 조건 → SDK 버전별 필드명 다름, 실기기 테스트 필요 |
| navigation.navigate('Main') 성공 후 | S15는 Stack에서 Modal로 열리므로 goBack()으로는 S06로 복귀 안 됨. navigate('Main') 또는 navigation.popToTop() 사용. | goBack() → S14/S17 등 이전 화면으로 복귀 (의도와 다름) |

---

## 5. 모듈 경계

- **S15 → revenue-cat.ts**: fetchOfferings, purchasePackage, restorePurchases, isCancelledError
- **S15 → AuthStore**: setEntitlement (결제 성공 즉시 반영)
- **S15 → navigation**: goBack() (헤더 뒤로), navigate('Main') (결제/복원 성공)
- **S14 → S15**: navigate('Subscribe', { source: 'upgrade_sheet' })
- **S16 → S15**: navigate('Subscribe', { source: 'settings' })
- **S17 → S15**: navigate('Subscribe', { source: 'trial_expired' })
- **RootNavigator 등록**: Subscribe 스크린을 Stack Navigator에 추가 (modal presentation 권장)

---

## 6. 수용 기준

| # | 시나리오 | 기대 결과 |
|---|---|---|
| AC-01 | S15 진입 | Offerings 로드, 연간 플랜 기본 선택, 가격 표시 |
| AC-02 | 월간 플랜 탭 | 월간 선택 강조, 연간 강조 해제 |
| AC-03 | 연간 플랜 탭 | 연간 선택 강조 + "월 ₩2,417 절약" 배지 |
| AC-04 | 구독 시작하기 탭 → IAP 성공 | 버튼 스피너 → Premium 상태 → S06 이동 |
| AC-05 | 구독 시작하기 탭 → 사용자 취소 | 토스트 없음, S15 유지 |
| AC-06 | 구독 시작하기 탭 → 결제 실패 | "결제에 실패했어요. 다시 시도해주세요." 토스트 |
| AC-07 | 구독 복원하기 탭 → 기존 구독 있음 | Premium 상태 복원 → S06 이동 + "구독이 복원됐어요" |
| AC-08 | 구독 복원하기 탭 → 없음 | "복원할 구독이 없어요" 토스트 |
| AC-09 | Offerings 로드 실패 | fallback 가격 표시, 구독 버튼 활성 유지 |
| AC-10 | entitlement='free' 진입 | "7일 무료 체험 후 과금" 문구 노출 |
| AC-11 | 뒤로 탭 (← 헤더) | 이전 화면 복귀 |
| AC-12 | 결제 성공 후 앱 재시작 | Premium entitlement 유지 (useEntitlementSync 동기화) |

---

## 7. 주의사항

- **Apple IAP 강제 (PRD F12)**: 외부 결제 UI 노출 금지. S15에서 RevenueCat purchasePackage만 사용. "외부 결제" 버튼, 웹 링크, 가격 비교 UI 금지.
- **`PURCHASES_ERROR_CODE` 필드명 확인**: `react-native-purchases` v7 `.d.ts`에서 `PURCHASE_CANCELLED_ERROR` 상수명 실제 확인 필수. 버전별로 `purchaseCancelledError` (camelCase) 일 수 있음.
- **Offerings 패키지 식별자**: RevenueCat 대시보드에서 monthly/annual 패키지 생성 시 `PackageType.MONTHLY` / `PackageType.ANNUAL` 설정 필요. `offering.monthly` / `offering.annual` 접근자는 이 타입 기반. 커스텀 식별자 사용 시 `offering.availablePackages.find(p => p.identifier === '...')` 방식 변경.
- **스토어 심사 요구**: S15에서 "구독 복원하기" 버튼 노출 필수 (Apple 심사 요구사항). 이용약관 / 개인정보처리방침 링크 필수.
- **개발환경 Sandbox 테스트**: RevenueCat Sandbox 계정으로 purchasePackage 테스트. 실제 청구 없음. iOS Simulator에서는 IAP 테스트 불가 — 실기기 필수.
- **`navigation.navigate('Main')` 경로**: RootNavigator에서 Main 탭 네비게이터 이름 확인 필요. Epic 01 impl/03 (AppNavSkeleton) 에서 정의된 이름 사용.
