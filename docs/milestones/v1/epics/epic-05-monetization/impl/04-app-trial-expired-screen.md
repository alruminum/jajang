---
depth: std
design: skipped
---

# impl/04 — S17 TrialExpiredScreen (트라이얼 만료 안내)

**커버 스토리**: Epic 05 Story 5 진입점, UX Flow S17 (트라이얼 만료 → 구독 전환 or 무료 전환)  
**선행 조건**: impl/03 (S15 SubscribeScreen 등록), Epic 01 impl/06 (AuthStore entitlement), Epic 01 impl/07 (useEntitlementSync)  
**예상 소요**: 0.5일

---

## 1. 생성/수정 파일

| 경로 | 동작 | 비고 |
|---|---|---|
| `apps/mobile/src/screens/S17_TrialExpiredScreen.tsx` | **신규** | 만료 안내 + 구독 CTA + 무료 전환 |
| `apps/mobile/src/hooks/useTrialExpiredGuard.ts` | **신규** | 트라이얼 만료 감지 → S17 자동 진입 훅 |
| `apps/mobile/src/navigation/RootNavigator.tsx` | **수정** | TrialExpired 스크린 등록 |
| `apps/mobile/src/screens/S06_HomeScreen.tsx` | **수정** | useTrialExpiredGuard() 훅 마운트 |

---

## 2. TS 인터페이스

```typescript
// useTrialExpiredGuard.ts
/**
 * S06 홈 화면 마운트 시 트라이얼 만료 감지.
 * entitlement='trial' + trialExpiresAt 경과 → S17 자동 이동.
 *
 * 트리거 조건:
 * - useEntitlementSync가 포그라운드 복귀 시 재조회 → entitlement 업데이트
 * - 만료 판단은 로컬 trialExpiresAt 기준 (서버 동기화 전 즉각 반응)
 */
export function useTrialExpiredGuard(navigation: NavigationProp<any>): void

// S17 route params — 없음 (단일 상태 화면)
type TrialExpiredScreenProps = {
  navigation: StackNavigationProp<RootStackParamList, 'TrialExpired'>
}
```

---

## 3. 핵심 로직 의사코드

### 3-1. useTrialExpiredGuard (S06에 삽입)

```typescript
export function useTrialExpiredGuard(navigation: NavigationProp<any>): void {
  const { entitlement, trialExpiresAt } = useAuthStore()

  useEffect(() => {
    // 트라이얼 만료 판단
    // 조건: entitlement가 아직 'trial'인 상태에서 만료일 경과
    // (서버 webhook이 EXPIRATION 처리 전에 클라이언트가 먼저 감지하는 케이스)
    if (entitlement === 'trial' && trialExpiresAt) {
      const expiresMs = new Date(trialExpiresAt).getTime()
      if (Date.now() >= expiresMs) {
        navigation.navigate('TrialExpired')
      }
    }

    // entitlement가 이미 'free'로 전환된 경우 (webhook 처리 완료)
    // trialExpiresAt이 있고 trial 기간을 이미 사용한 유저 → S17 진입
    // 단, 최초 free 가입 유저(trialExpiresAt=null)는 S17 미진입
    if (entitlement === 'free' && trialExpiresAt !== null) {
      // trialExpiresAt이 존재 = 과거에 trial을 사용한 유저
      // 이 케이스는 앱 재시작 시 처리
      navigation.navigate('TrialExpired')
    }
  }, [entitlement, trialExpiresAt])

  // 주의: 이 훅은 S06이 최초 마운트될 때만 체크하면 됨.
  // useEntitlementSync(포그라운드 복귀)가 entitlement를 업데이트하면
  // 이 useEffect가 재실행됨 → 자동 S17 진입
}
```

> **설계 주의**: `entitlement='free' && trialExpiresAt !== null` 조건은 오탐 가능성 있음.
> MVP에서는 서버의 `EXPIRATION` webhook이 entitlement='free' 전환 시 trialExpiresAt을 null로 초기화하지 않으므로 이 조건으로 만료 구분.
> 정밀화 필요 시 `trialExpiresAt < now()` 추가 조건 + `hasDismissedTrialExpired` 로컬 플래그로 한 번만 진입하도록 보완.

### 3-2. S17_TrialExpiredScreen

```typescript
function TrialExpiredScreen({ navigation }: TrialExpiredScreenProps) {
  const { setEntitlement } = useAuthStore()

  function handleSubscribe() {
    navigation.navigate('Subscribe', { source: 'trial_expired' })
  }

  function handleContinueFree() {
    // 무료 플랜 전환 확정: entitlement='free', trialExpiresAt=null 처리
    // AuthStore에서 trialExpiresAt 제거 → useTrialExpiredGuard 재트리거 방지
    setEntitlement('free', null)
    navigation.navigate('Main')
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* 달 → 구름 가려지는 애니메이션 (2s ease-in) */}
      <MoonCoverAnimation />

      <Text style={styles.headline}>7일이 지났어요</Text>
      <Text style={styles.body}>
        아기 곁을 떠나면{'\n'}자장가도 멈춰요
      </Text>

      {/* 혜택 목록 */}
      <BenefitList benefits={[
        '백그라운드 재생',
        '광고 없음',
        '자장가 무제한 생성',
      ]} />

      <TouchableOpacity
        style={styles.subscribeBtn}
        onPress={handleSubscribe}
        accessibilityLabel="구독 시작하기"
      >
        <Text style={styles.subscribeBtnText}>구독 시작하기</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleContinueFree}
        accessibilityLabel="무료로 계속할게요"
      >
        <Text style={styles.freeContinueText}>무료로 계속할게요</Text>
      </TouchableOpacity>
    </SafeAreaView>
  )
}
```

### 3-3. MoonCoverAnimation 컴포넌트

```typescript
// S17 전용 달→구름 애니메이션 (UX Flow: "서서히 이동 2s ease-in")
function MoonCoverAnimation() {
  const moonX = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(moonX, {
      toValue: -40,         // 달이 구름 뒤로 40px 이동
      duration: 2000,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }).start()
  }, [])

  return (
    <View style={styles.animationContainer}>
      {/* 구름 레이어 (정적 이미지) */}
      <Image source={require('@assets/illustrations/cloud.png')} style={styles.cloud} />
      {/* 달 레이어 (애니메이션) */}
      <Animated.Image
        source={require('@assets/illustrations/moon.png')}
        style={[styles.moon, { transform: [{ translateX: moonX }] }]}
      />
    </View>
  )
}
```

---

## 4. 결정 근거

| 결정 | 이유 | 대안 검토 |
|---|---|---|
| useTrialExpiredGuard S06에서만 실행 | S06이 트라이얼 만료 후 첫 진입점. 다른 화면에서 진입 시 S06 → 자동 S17 리다이렉트. | 모든 화면에서 체크 → 복잡한 네비게이션 상태 충돌 위험 |
| handleContinueFree에서 trialExpiresAt=null | setEntitlement('free', null) 후 재트리거 방지. guard 조건 `trialExpiresAt !== null` 이 false가 됨. | trialExpiresAt 유지 → guard 무한 루프 (S06 → S17 → S06 → S17) |
| S17 뒤로가기 버튼 없음 | UX Flow에 헤더 뒤로 없음. 의도적 진입점이므로 항상 선택을 강제. 시스템 제스처 막기 위해 `gestureEnabled: false` 설정 권장. | 뒤로 허용 → 만료 유저가 S06 진입 → 재트리거 루프 |
| MoonCoverAnimation 별도 컴포넌트 | 애니메이션 로직 분리로 Screen 코드 단순화. 추후 Lottie로 교체 시 컴포넌트만 변경. | 인라인 → Screen 컴포넌트 비대화 |
| BenefitList 재사용 (S15와 공유) | S17 혜택 목록 = S15 혜택 목록 일부 (오프라인 재생 제외). 컴포넌트 추출 후 props로 benefits 배열 전달. | 각 화면 인라인 → 텍스트 불일치 위험 |

---

## 5. 모듈 경계

- **S17 → S15**: navigate('Subscribe', { source: 'trial_expired' })
- **S17 → S06**: navigate('Main') — 무료 전환 시
- **S17 → AuthStore**: setEntitlement('free', null) — 무료 전환 확정
- **S06 → useTrialExpiredGuard**: 훅 마운트 (S06 컴포넌트 내부)
- **useTrialExpiredGuard → AuthStore**: entitlement, trialExpiresAt read
- **useTrialExpiredGuard → navigation**: navigate('TrialExpired') 자동 진입
- **RootNavigator**: TrialExpired 스크린 Stack에 추가, `gestureEnabled: false`

---

## 6. 수용 기준

| # | 시나리오 | 기대 결과 |
|---|---|---|
| AC-01 | S06 진입 시 entitlement='trial' + trialExpiresAt 경과 | S17 자동 이동 |
| AC-02 | S06 진입 시 entitlement='free' + trialExpiresAt != null | S17 자동 이동 |
| AC-03 | S06 진입 시 entitlement='premium' | S17 미이동 |
| AC-04 | S06 진입 시 최초 free 가입 유저 (trialExpiresAt=null) | S17 미이동 |
| AC-05 | S17 "구독 시작하기" 탭 | S15 이동 (source='trial_expired') |
| AC-06 | S17 "무료로 계속할게요" 탭 | S06 이동, entitlement='free', trialExpiresAt=null |
| AC-07 | S17 → S15 → 결제 성공 → S06 | S06 진입 시 S17 재진입 없음 (Premium 상태) |
| AC-08 | S17 → "무료로 계속" → S06 재진입 | S17 재진입 없음 (trialExpiresAt=null) |
| AC-09 | 달→구름 애니메이션 | S17 마운트 시 2s ease-in 재생 |

---

## 7. 주의사항

- **포그라운드 복귀 + 만료 타이밍**: 트라이얼이 앱 실행 중에 만료되는 케이스. `useEntitlementSync`가 AppState 'active' 이벤트 → RevenueCat 재조회 → entitlement 업데이트 → useTrialExpiredGuard 재실행. 이 경우 S06이 마운트된 상태에서 갑자기 S17로 이동. 사용자 경험 고려 시 딜레이 500ms 추가 검토.
- **gestureEnabled: false 강제**: RootNavigator에서 TrialExpired 스크린에 `options={{ gestureEnabled: false }}` 설정. Android 백 버튼도 `BackHandler` 로 차단 필요 여부 검토 (S06 재진입 → 루프 방지).
- **애니메이션 에셋**: `apps/mobile/src/assets/illustrations/moon.png` / `cloud.png` 파일 필요. 디자인 에셋 전달 전까지는 `View` 플레이스홀더로 대체.
- **`setEntitlement` 시그니처**: Epic 01 impl/06 AuthStore에서 정의된 `setEntitlement(entitlement, trialExpiresAt)` 시그니처 동일하게 사용. `null` 전달 가능 여부 타입 정의 확인 필수.
