---
depth: std
design: skipped
---

# impl/05 — S16 SettingsScreen 구독 관리 섹션

**커버 스토리**: Epic 05 Story 1 (구독 취소 딥링크 + 복원), Story 5 (구독 진입점), UX Flow S16  
**선행 조건**: impl/03 (S15 SubscribeScreen), Epic 01 impl/08 (S06 홈 — 설정 아이콘 진입)  
**예상 소요**: 1일

---

## 1. 생성/수정 파일

| 경로 | 동작 | 비고 |
|---|---|---|
| `apps/mobile/src/screens/S16_SettingsScreen.tsx` | **신규** | 전체 설정 화면 (구독 섹션 포함) |
| `apps/mobile/src/services/revenue-cat.ts` | **수정** | getManagementURL() 추가 |
| `apps/mobile/src/navigation/RootNavigator.tsx` | **수정** | Settings 스크린 등록 (이미 있으면 확인) |
| `apps/mobile/src/api/tracks-api.ts` | **수정 또는 확인** | 음원 삭제 API 호출 (이미 있으면 재사용) |
| `apps/mobile/src/api/auth-api.ts` | **수정 또는 확인** | 계정 탈퇴 API 호출 (이미 있으면 재사용) |

---

## 2. TS 인터페이스

### 2-1. revenue-cat.ts 추가 함수

```typescript
/**
 * RevenueCat 구독 관리 URL 조회.
 * iOS: App Store 구독 관리 URL
 * Android: Google Play 구독 관리 URL
 * 없는 경우 null (구독 없는 유저)
 */
export async function getManagementURL(): Promise<string | null>
```

### 2-2. S16 화면 내부 상태

```typescript
interface S16State {
  isDeleting: 'voice' | 'tracks' | null  // 삭제 진행 중 항목
}
```

---

## 3. 핵심 로직 의사코드

### 3-1. 구독 관리 섹션 (핵심)

```typescript
function SubscriptionSection({ navigation }) {
  const { entitlement, trialExpiresAt, email } = useAuthStore()

  // 배지 텍스트 결정
  const badgeText = (() => {
    if (entitlement === 'premium') return 'Premium'
    if (entitlement === 'trial' && trialExpiresAt) {
      const daysLeft = Math.ceil(
        (new Date(trialExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
      return `D-${daysLeft}`
    }
    return null  // 무료 유저: 배지 없음
  })()

  async function handleManageSubscription() {
    // RevenueCat managementURL (iOS: itms-apps://, Android: market://)
    const url = await getManagementURL()
    if (url) {
      await Linking.openURL(url)
    } else {
      // 구독 없는 유저가 탭한 경우 (UI에서 조건부 노출이지만 방어)
      showToast('관리할 구독이 없어요')
    }
  }

  return (
    <View>
      {/* 계정 헤더: 이메일 + 배지 */}
      <View style={styles.accountRow}>
        <Icon name="person-circle" />
        <Text style={styles.email}>{email}</Text>
        {badgeText && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badgeText}</Text>
          </View>
        )}
      </View>

      <Divider />

      {/* 구독 관리: Premium/Trial 유저에게만 노출 */}
      {entitlement !== 'free' && (
        <SettingsRow
          label="구독 관리"
          onPress={handleManageSubscription}
          accessibilityLabel="구독 관리 — 앱스토어에서 변경"
        />
      )}

      {/* 플랜 업그레이드: 무료/Trial 유저에게 노출 */}
      {entitlement !== 'premium' && (
        <SettingsRow
          label="플랜 업그레이드"
          onPress={() => navigation.navigate('Subscribe', { source: 'settings' })}
          highlighted={entitlement === 'free'}  // 무료 유저는 강조 스타일
          accessibilityLabel="플랜 업그레이드"
        />
      )}
    </View>
  )
}
```

### 3-2. 전체 설정 화면 구조

```typescript
function SettingsScreen({ navigation }) {
  const { entitlement, email } = useAuthStore()
  const [isDeleting, setIsDeleting] = useState<'voice' | 'tracks' | null>(null)

  // 로그아웃
  async function handleLogout() {
    const confirmed = await showConfirmDialog('로그아웃할까요?')
    if (!confirmed) return
    await revenueCatLogout()
    useAuthStore.getState().clearSession()
    navigation.navigate('Login')
  }

  // 계정 탈퇴
  async function handleDeleteAccount() {
    const confirmed1 = await showConfirmDialog('계정을 탈퇴할까요?', '모든 데이터가 삭제됩니다')
    if (!confirmed1) return
    const confirmed2 = await showConfirmDialog('정말 삭제할까요?', '되돌릴 수 없어요')
    if (!confirmed2) return

    try {
      await deleteAccountAPI()  // DELETE /me
      await revenueCatLogout()
      useAuthStore.getState().clearSession()
      navigation.navigate('Login')
    } catch {
      showToast('탈퇴 처리에 실패했어요')
    }
  }

  // 목소리 샘플 삭제
  async function handleDeleteVoiceSamples() {
    const confirmed = await showConfirmDialog('목소리 샘플을 삭제할까요?')
    if (!confirmed) return
    setIsDeleting('voice')
    try {
      await deleteVoiceSamplesAPI()  // DELETE /me/voice-samples
      showToast('삭제했어요')
    } catch {
      showToast('삭제에 실패했어요')
    } finally {
      setIsDeleting(null)
    }
  }

  // 생성 음원 삭제 — 선택 시트 (개별/전체)
  async function handleDeleteTracks() {
    // 음원 선택 시트 → 개별/전체 선택 후 확인
    // 구현 상세: ActionSheetIOS (iOS) / @gorhom/bottom-sheet 선택 시트
    // MVP: 전체 삭제만 구현 후 개별 추가
    const confirmed = await showConfirmDialog(
      '전부 삭제할까요?',
      '되돌릴 수 없어요'
    )
    if (!confirmed) return
    setIsDeleting('tracks')
    try {
      await deleteAllTracksAPI()  // DELETE /me/generated-tracks
      showToast('삭제했어요')
      // S06 홈 음원 목록 갱신 트리거 (React Query invalidate or Zustand 초기화)
    } catch {
      showToast('삭제에 실패했어요')
    } finally {
      setIsDeleting(null)
    }
  }

  return (
    <SafeAreaView>
      <Header title="설정" onBack={() => navigation.goBack()} />
      <ScrollView>

        {/* 계정 + 구독 섹션 */}
        <SubscriptionSection navigation={navigation} />

        <Divider />

        {/* 알림 */}
        <SettingsRow
          label="알림 설정"
          onPress={() => Linking.openSettings()}
        />

        <Divider />

        {/* 데이터 관리 */}
        <SettingsRow
          label="목소리 샘플 삭제"
          onPress={handleDeleteVoiceSamples}
          isLoading={isDeleting === 'voice'}
        />
        <SettingsRow
          label="생성 음원 삭제"
          onPress={handleDeleteTracks}
          isLoading={isDeleting === 'tracks'}
        />
        <SettingsRow
          label="계정 탈퇴"
          onPress={handleDeleteAccount}
          destructive
        />

        <Divider />

        {/* 법적 */}
        <SettingsRow
          label="개인정보처리방침"
          onPress={() => Linking.openURL(PRIVACY_URL)}
        />
        <SettingsRow
          label="이용약관"
          onPress={() => Linking.openURL(TERMS_URL)}
        />
        <Text style={styles.version}>버전 1.0.0</Text>

        <Divider />

        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
          accessibilityLabel="로그아웃"
        >
          <Text style={styles.logoutText}>로그아웃</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  )
}
```

### 3-3. revenue-cat.ts getManagementURL 구현

```typescript
export async function getManagementURL(): Promise<string | null> {
  try {
    const customerInfo = await Purchases.getCustomerInfo()
    return customerInfo.managementURL ?? null
    // managementURL: iOS → itms-apps://buy.itunes.apple.com/WebObjects/...
    //                Android → https://play.google.com/store/account/subscriptions?...
    // RevenueCat v7에서 CustomerInfo.managementURL 필드 확인 필수
  } catch {
    return null
  }
}
```

---

## 4. 결정 근거

| 결정 | 이유 | 대안 검토 |
|---|---|---|
| 구독 관리 = RevenueCat managementURL deep link | RevenueCat이 플랫폼별 URL 자동 제공. 직접 itms-apps:// 하드코딩 불필요. Apple/Google 스토어 정책 준수 (앱 내 구독 취소 직접 처리 금지). | 직접 취소 API → Apple/Google 정책 위반 위험 |
| Premium 유저만 "구독 관리" 노출, free/trial은 "플랜 업그레이드" | UX Flow S16 명세 그대로. 각 상태별 CTA 최적화. | 항상 두 항목 모두 노출 → 혼란 유발 |
| 삭제 중 `isDeleting` 상태로 해당 항목만 비활성 | UX Flow S16 명세 ("해당 항목 비활성 + 인라인 스피너, 다른 항목은 정상 조작 가능"). | 화면 전체 로딩 → 다른 설정 탭 불가 |
| 음원 삭제 MVP = 전체 삭제만 | UX Flow에 개별/전체 선택 시트가 명시되어 있으나 MVP 리소스. 개별 삭제는 M1에 추가. | 개별 삭제 먼저 → 전체 삭제보다 복잡. 전체가 더 자주 필요. |
| revenueCatLogout() + clearSession() 분리 | 로그아웃/탈퇴 모두 RevenueCat 로컬 캐시 초기화 필요. 순서: RevenueCat → 앱 세션 (역순이면 로그아웃 후 RevenueCat 상태 남음). | clearSession 하나만 → 다음 로그인 시 이전 유저의 RevenueCat 상태 남아 entitlement 오염 |
| 삭제 성공 후 S06 트랙 목록 갱신 | UX Flow S16 명세 ("삭제 완료 → S06 홈 음원 목록 갱신 트리거"). React Query 사용 시 queryClient.invalidateQueries(['tracks']). Zustand 사용 시 trackSlice.clear(). | 갱신 없음 → S06 복귀 시 삭제된 항목 여전히 노출 |

---

## 5. 모듈 경계

- **S16 → revenue-cat.ts**: getManagementURL, revenueCatLogout
- **S16 → AuthStore**: entitlement, trialExpiresAt, email read / clearSession() write
- **S16 → S15**: navigate('Subscribe', { source: 'settings' })
- **S16 → S05 (Login)**: navigate('Login') — 로그아웃/탈퇴 후
- **S16 → tracks-api.ts**: deleteAllTracksAPI() — Epic 04/05 tracks API 재사용
- **S16 → auth-api.ts**: deleteAccountAPI() — Epic 01 impl/02 auth API
- **S06 → S16**: 설정 아이콘 탭 → navigate('Settings')
- **S16 내 SubscriptionSection**: 별도 함수형 컴포넌트로 분리 (구독 로직 캡슐화)

---

## 6. 수용 기준

| # | 시나리오 | 기대 결과 |
|---|---|---|
| AC-01 | Premium 유저 S16 진입 | "Premium" 배지, "구독 관리" 항목 노출, "플랜 업그레이드" 미노출 |
| AC-02 | Trial 유저 S16 진입 (D-3) | "D-3" 배지, "플랜 업그레이드" 강조 노출 |
| AC-03 | 무료 유저 S16 진입 | 배지 없음, "플랜 업그레이드" 강조 노출, "구독 관리" 미노출 |
| AC-04 | 구독 관리 탭 (Premium) | 앱스토어/플레이스토어 구독 관리 화면 열림 |
| AC-05 | 플랜 업그레이드 탭 | S15 이동 (source='settings') |
| AC-06 | 알림 설정 탭 | OS 알림 설정 열림 |
| AC-07 | 목소리 샘플 삭제 → 확인 | API 호출, 완료 토스트, 해당 항목 로딩 중 다른 항목 정상 |
| AC-08 | 생성 음원 삭제 → 전체 삭제 확인 | 2단계 확인 → API 호출 → S06 목록 갱신 |
| AC-09 | 계정 탈퇴 → 2단계 확인 | 모든 데이터 삭제 → RevenueCat 로그아웃 → S05 이동 |
| AC-10 | 로그아웃 → 확인 | RevenueCat 로그아웃 → S05 이동 |
| AC-11 | 개인정보처리방침 / 이용약관 탭 | 브라우저/웹뷰로 링크 열림 |

---

## 7. 주의사항

- **`CustomerInfo.managementURL` 필드**: RevenueCat v7 `.d.ts` 확인 필수. 구독이 없는 유저나 Android에서 null일 수 있음. null 방어 코드 필수.
- **Apple 앱스토어 심사 요구**: 구독 취소는 반드시 앱스토어로 안내해야 함 (인앱 취소 처리 금지). `managementURL` deep link가 이 요구를 충족.
- **`clearSession()` 시그니처**: Epic 01 impl/06 AuthStore에서 정의. 토큰 + userId + entitlement 초기화. SecureStore의 refresh token 삭제 포함 여부 확인 필요.
- **음원 삭제 API**: `DELETE /me/generated-tracks` 엔드포인트가 Epic 03/04에서 구현되지 않았을 수 있음. 없으면 별도 impl 필요 (Epic 05 범위 외, backlog에 추가).
- **계정 탈퇴 API**: `DELETE /me` 엔드포인트가 Epic 01 impl/02에 있는지 확인. 없으면 별도 서버 impl 필요.
- **버전 표시**: `apps/mobile/app.json`의 `version` 필드를 동적으로 읽는 것이 정확함 (`expo-constants` `Constants.expoConfig.version`). 하드코딩 '1.0.0' 대신 동적 조회 권장.
- **알림 설정 딥링크**: `Linking.openSettings()` (React Native 0.71+). 이전 버전은 `Linking.openURL('app-settings:')` (iOS only). Android는 별도 Intent 필요.
