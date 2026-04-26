---
depth: std
design: skipped
---

# impl/04 — 앱: 계정 탈퇴 2단계 확인 플로우

**Epic**: 06 — 개인정보 & 데이터 관리  
**Story**: Story 3 — 계정 탈퇴 & 전체 데이터 삭제 (클라이언트)  
**예상 소요**: 4~5h  
**선행 의존**: impl/01 (서버 `DELETE /users/me` 완료 필수)

---

## 1. 생성 / 수정 파일

| 경로 | 작업 |
|---|---|
| `/Users/dc.kim/project/jajang/apps/mobile/src/screens/AccountDeletionScreen.tsx` | 신규 — 탈퇴 2단계 확인 화면 |
| `/Users/dc.kim/project/jajang/apps/mobile/src/services/accountApi.ts` | 신규 — `DELETE /users/me` 래퍼 |
| `/Users/dc.kim/project/jajang/apps/mobile/src/store/authSlice.ts` | 탈퇴 완료 후 상태 초기화 액션 추가 |
| `/Users/dc.kim/project/jajang/apps/mobile/src/navigation/SettingsNavigator.tsx` | `AccountDeletionScreen` 라우트 추가 |
| `/Users/dc.kim/project/jajang/apps/mobile/src/__tests__/AccountDeletionScreen.test.tsx` | 신규 — 2단계 확인 + 422 핸들링 테스트 |

---

## 2. 화면 플로우

```
SettingsScreen "계정 탈퇴" 탭
    │
    ▼
AccountDeletionScreen — Step 1 (사유 선택, 선택사항)
    │
    ├─ 구독 활성 배너 노출 여부 판단
    │     └─ AuthSlice entitlement === 'premium' and is_active
    │           → "구독을 먼저 취소해주세요" 배너 + 앱스토어 딥링크
    │
    ▼
탈퇴 사유 선택 (optional radio)
  ○ 더 이상 사용하지 않아요
  ○ 원하는 기능이 없어요
  ○ 개인정보가 걱정돼요
  ○ 기타
    │
    ▼
"다음으로" 탭
    │
    ▼
Step 2 — 최종 확인 바텀 시트
  "계정을 삭제하면 되돌릴 수 없어요"
  ·  목소리 샘플 삭제
  ·  자장가 음원 모두 삭제
  ·  계정 정보 삭제
    │
    ├─ [아니요, 유지할게요] → AccountDeletionScreen 닫기
    └─ [네, 탈퇴할게요]
           │
           ▼
       DELETE /users/me 호출
           │
           ├─ 성공 (202) → 로컬 데이터 초기화 → LoginScreen 이동
           ├─ 422 ACTIVE_SUBSCRIPTION → 구독 취소 안내 모달
           └─ 기타 오류 → 에러 토스트 + 시트 유지
```

---

## 3. TypeScript 시그니처

### `services/accountApi.ts`

```typescript
import { apiClient } from './apiClient'

export interface AccountDeletionError {
  code: 'ACTIVE_SUBSCRIPTION'
  message: string
  subscriptionPlatform: 'ios' | 'android'
}

export class ActiveSubscriptionError extends Error {
  constructor(
    public detail: AccountDeletionError,
  ) {
    super(detail.message)
    this.name = 'ActiveSubscriptionError'
  }
}

export async function deleteMyAccount(): Promise<void> {
  try {
    await apiClient.delete('/users/me')
  } catch (err: any) {
    if (err?.response?.status === 422) {
      const detail = err.response.data?.detail as AccountDeletionError
      if (detail?.code === 'ACTIVE_SUBSCRIPTION') {
        throw new ActiveSubscriptionError(detail)
      }
    }
    throw err
  }
}
```

### `store/authSlice.ts` 추가

```typescript
// AuthSlice 인터페이스에 추가
interface AuthSlice {
  // ... 기존 필드
  clearAuthState: () => void
}

// 구현부
clearAuthState: () =>
  set({
    userId: null,
    accessToken: null,
    entitlement: 'free',
    trialExpiresAt: null,
  }),
```

### `screens/AccountDeletionScreen.tsx` 핵심 로직

```typescript
import React, { useState, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, Alert,
  ScrollView, StyleSheet, Linking,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useNavigation } from '@react-navigation/native'
import { deleteMyAccount, ActiveSubscriptionError } from '../services/accountApi'
import { useAuthStore } from '../store/authSlice'
import { usePlayerStore } from '../store/playerSlice'
import { useGenerationStore } from '../store/generationSlice'

type DeletionReason =
  | 'not_using'
  | 'missing_features'
  | 'privacy_concerns'
  | 'other'
  | null

export function AccountDeletionScreen() {
  const navigation = useNavigation()
  const [selectedReason, setSelectedReason] = useState<DeletionReason>(null)
  const [isConfirmVisible, setIsConfirmVisible] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const { entitlement, clearAuthState } = useAuthStore()
  const { clearAllTracks } = useGenerationStore()
  const { reset: resetPlayer } = usePlayerStore()

  // 구독 활성 여부 (서버 422 전에 클라이언트도 사전 경고)
  const hasActiveSubscription = entitlement === 'premium' || entitlement === 'trial'

  const handleConfirmDeletion = useCallback(async () => {
    setIsDeleting(true)
    try {
      await deleteMyAccount()
      await clearLocalData()
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] })
    } catch (err) {
      if (err instanceof ActiveSubscriptionError) {
        setIsConfirmVisible(false)
        showSubscriptionCancelGuide(err.detail.subscriptionPlatform)
      } else {
        Alert.alert('오류', '탈퇴 처리 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.')
      }
    } finally {
      setIsDeleting(false)
    }
  }, [navigation, clearLocalData])

  const clearLocalData = useCallback(async () => {
    // 1. Zustand 상태 초기화
    clearAuthState()
    clearAllTracks()
    resetPlayer()

    // 2. AsyncStorage 전체 삭제 (토큰, 캐시, 오프라인 큐 등)
    await AsyncStorage.clear()

    // 3. react-native-track-player 큐 초기화
    // TrackPlayer.reset() — AudioEngine 래퍼를 통해 호출
    // (직접 임포트 대신 AudioEngine.stop() 사용)
  }, [clearAuthState, clearAllTracks, resetPlayer])

  // ...render
}

function showSubscriptionCancelGuide(platform: 'ios' | 'android') {
  const url =
    platform === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions'

  Alert.alert(
    '구독을 먼저 취소해주세요',
    '계정을 삭제하려면 먼저 구독을 취소해야 해요.\n앱스토어에서 구독을 취소한 뒤 다시 시도해주세요.',
    [
      { text: '나중에', style: 'cancel' },
      {
        text: '구독 취소하러 가기',
        onPress: () => Linking.openURL(url),
      },
    ]
  )
}
```

---

## 4. 탈퇴 사유 선택 UI (Step 1) 와이어프레임 의도

```
┌─────────────────────────────┐
│ [← 뒤로]   계정 탈퇴        │
│                              │
│  [경고 배너 (구독 활성 시)]  │
│  구독 취소 후 탈퇴 가능해요  │
│  [앱스토어에서 취소하기 →]   │
│                              │
│  탈퇴 사유를 알려주세요      │
│  (선택사항이에요)            │
│                              │
│  ○ 더 이상 사용하지 않아요   │
│  ○ 원하는 기능이 없어요      │
│  ○ 개인정보가 걱정돼요       │
│  ○ 기타                     │
│                              │
│ ┌─────────────────────────┐ │
│ │      다음으로           │ │  ← 항상 활성 (사유 미선택 OK)
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

**배너 표시 조건**: `entitlement === 'premium'` 또는 `entitlement === 'trial'`

---

## 5. Step 2 최종 확인 바텀 시트 스타일

```
┌─────────────────────────────┐
│                              │
│   정말 탈퇴하시겠어요?       │
│                              │
│  탈퇴하면 아래 데이터가      │
│  모두 삭제돼요               │
│                              │
│  · 내 목소리 샘플            │
│  · 자장가 음원 전체          │
│  · 계정 정보                 │
│                              │
│  되돌릴 수 없어요            │
│                              │
│ ┌─────────────────────────┐ │
│ │    네, 탈퇴할게요       │ │  ← 경고 색상 (#FF6B6B)
│ └─────────────────────────┘ │
│                              │
│      아니요, 유지할게요      │  ← 보조 텍스트 버튼
└─────────────────────────────┘
```

---

## 6. 로컬 데이터 초기화 범위

탈퇴 완료 시 클리어 대상:

| 저장소 | 클리어 방법 | 포함 데이터 |
|---|---|---|
| AsyncStorage | `AsyncStorage.clear()` | JWT tokens, 캐시, 오프라인 삭제 큐, 설정 |
| Zustand (in-memory + persist) | 각 slice `clearAuthState()`, `clearAllTracks()`, `resetPlayer()` | 인증 상태, 음원 목록, 재생 상태 |
| react-native-track-player | `TrackPlayer.reset()` (AudioEngine 래퍼 통해) | 재생 큐 |
| expo-file-system 로컬 캐시 | `FileSystem.deleteAsync(cacheDir, { idempotent: true })` | 로컬 다운로드된 mp3 캐시 |

**주의**: `AsyncStorage.clear()`는 앱 내 모든 키를 삭제하므로, 탈퇴 외 흐름(로그아웃)에는 사용하지 않는다. 로그아웃은 토큰 키만 삭제.

---

## 7. 수용 기준

- [ ] Step 1 화면: 구독 활성 시 경고 배너 + 앱스토어 딥링크 노출
- [ ] Step 1 화면: 사유 미선택 상태에서도 "다음으로" 버튼 활성
- [ ] Step 2 바텀 시트: 삭제 대상 항목 목록 표시
- [ ] 탈퇴 완료 (202): AsyncStorage.clear() + Zustand 초기화 + LoginScreen 이동
- [ ] 탈퇴 422 ACTIVE_SUBSCRIPTION: 구독 취소 안내 Alert + 앱스토어 딥링크
- [ ] 탈퇴 중 로딩: "네, 탈퇴할게요" 버튼 비활성 + 스피너
- [ ] 탈퇴 후 재실행: 로그인 화면으로 진입 (세션 없음)
- [ ] accessibilityLabel: "계정 탈퇴 확인", "탈퇴 취소" 등 모든 CTA에 지정

---

## 8. 결정 근거

| 결정 | 근거 |
|---|---|
| 탈퇴 사유 선택 선택사항 | UX 마찰 최소화. 강제 입력 시 탈퇴 이탈률 증가. 데이터는 향후 개선 인사이트용 |
| AsyncStorage.clear() 전체 삭제 | 탈퇴 후 캐시 잔류 → 개인정보 노출 위험. 전체 삭제가 안전 |
| 서버 422 전 클라이언트 사전 경고 | 서버 왕복 없이 UX 개선. 단, entitlement 는 서버와 비동기화될 수 있으므로 서버 422도 반드시 처리 |
| 2단계 확인 (사유 → 최종 확인) | Apple App Store Review Guideline 5.1.1 — 계정 삭제 기능 요구. 2단계 확인이 심사 통과 실무 기준 |

---

## 9. 다른 모듈 경계

- **impl/01**: 서버 `DELETE /users/me` API 없이 이 impl 구현 불가. 선행 완료 필수.
- **AuthSlice**: `clearAuthState()` 는 로그아웃 흐름에서도 부분 재사용 가능 — 단, 로그아웃은 AsyncStorage 전체 삭제 아닌 토큰 키만 삭제. 구분 주의.
- **AudioEngine**: `TrackPlayer.reset()` 직접 호출 금지 — AudioEngine 래퍼를 통해 호출. 재생 엔진 상태머신을 우회하면 백그라운드 세션 정리가 누락될 수 있음.
- **Navigation**: 탈퇴 완료 후 `navigation.reset()` 으로 스택 초기화 필수 — `navigate('Login')` 은 뒤로 가기 시 설정 화면으로 돌아갈 수 있음.
