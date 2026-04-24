---
depth: std
---

# impl/06 — Zustand + AsyncStorage/SecureStore 세션 관리

**Epic**: 01 — 인증 & 온보딩  
**커버 스토리**: Story 4 (세션 유지 + 만료 리다이렉트)  
**선행 조건**: impl/03 (네비게이터), impl/05 (useAuth 기본 버전)  
**예상 소요**: 3~4시간

---

## 1. 생성/수정할 파일 목록

```
apps/mobile/src/
├── store/
│   ├── auth-store.ts            [신규 — AuthSlice Zustand]
│   ├── player-store.ts          [신규 — PlayerSlice Zustand (빈 초기값)]
│   └── index.ts                 [신규 — store exports]
├── hooks/
│   └── useAuth.ts               [수정 — impl/05 기본 버전 완성]
└── screens/
    └── S01SplashScreen.tsx      [수정 — 세션 복원 로직을 store 기반으로 개선]
```

---

## 2. Zustand AuthSlice

### store/auth-store.ts

```typescript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AuthState {
  userId: string | null;
  accessToken: string | null;        // SecureStore에 저장 (민감), 여기서는 null
  entitlement: 'free' | 'trial' | 'premium';
  trialExpiresAt: string | null;     // ISO 8601
  isAuthenticated: boolean;
}

interface AuthActions {
  setAuth: (payload: {
    userId: string;
    accessToken: string;
    entitlement: 'free' | 'trial' | 'premium';
    trialExpiresAt?: string | null;
  }) => void;
  setEntitlement: (entitlement: 'free' | 'trial' | 'premium', trialExpiresAt?: string | null) => void;
  clearAuth: () => void;
}

const initialState: AuthState = {
  userId: null,
  accessToken: null,
  entitlement: 'free',
  trialExpiresAt: null,
  isAuthenticated: false,
};

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set) => ({
      ...initialState,

      setAuth: ({ userId, accessToken, entitlement, trialExpiresAt = null }) =>
        set({
          userId,
          accessToken,   // 주의: 민감 데이터. persist에 포함되나 AsyncStorage는 로컬 전용
          entitlement,
          trialExpiresAt,
          isAuthenticated: true,
        }),

      setEntitlement: (entitlement, trialExpiresAt = null) =>
        set({ entitlement, trialExpiresAt }),

      clearAuth: () => set(initialState),
    }),
    {
      name: 'jajang-auth',
      storage: createJSONStorage(() => AsyncStorage),
      // accessToken은 persist에서 제외 — SecureStore 별도 저장
      // Zustand persist에서 accessToken 포함은 편의를 위한 캐시 용도
      // 앱 재시작 시 SecureStore에서 재검증 필수
      partialize: (state) => ({
        userId: state.userId,
        entitlement: state.entitlement,
        trialExpiresAt: state.trialExpiresAt,
        isAuthenticated: state.isAuthenticated,
        // accessToken은 의도적으로 제외 — SecureStore에서 관리
      }),
    },
  ),
);
```

**설계 결정 — accessToken 이중 저장**:  
`accessToken`을 Zustand state에 두는 이유는 API 인터셉터(`api.ts`)에서 동기 접근을 위해서가 아님 — 인터셉터는 `SecureStore.getItemAsync` 비동기 호출. Zustand state의 `accessToken`은 컴포넌트에서 "현재 토큰이 있는지" 확인 용도 캐시.  
실제 토큰 원본은 SecureStore. `partialize`에서 `accessToken` 제외 이유: AsyncStorage는 암호화 없음, 토큰 노출 위험. 앱 재시작 시 SecureStore에서 재검증.

**entitlement 저장 위치**: AsyncStorage(persist). RevenueCat CustomerInfo는 앱 기동 시 갱신하므로 이 값은 "마지막 알려진 상태". 새로운 entitlement는 로그인/RevenueCat 조회 시 `setEntitlement`로 업데이트.

---

## 3. PlayerSlice (빈 초기값 — Epic 04에서 채울 것)

```typescript
// store/player-store.ts
import { create } from 'zustand';

interface PlayerState {
  currentTrackId: string | null;
  isPlaying: boolean;
  timerEndsAt: number | null;
  rewardedUnlockExpiresAt: number | null;
}

interface PlayerActions {
  setCurrentTrack: (trackId: string | null) => void;
  setPlaying: (isPlaying: boolean) => void;
  setTimer: (endsAt: number | null) => void;
  setRewardedUnlock: (expiresAt: number | null) => void;
}

export const usePlayerStore = create<PlayerState & PlayerActions>()((set) => ({
  currentTrackId: null,
  isPlaying: false,
  timerEndsAt: null,
  rewardedUnlockExpiresAt: null,

  setCurrentTrack: (trackId) => set({ currentTrackId: trackId }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setTimer: (endsAt) => set({ timerEndsAt: endsAt }),
  setRewardedUnlock: (expiresAt) => set({ rewardedUnlockExpiresAt: expiresAt }),
}));
```

---

## 4. store/index.ts

```typescript
export { useAuthStore } from './auth-store';
export { usePlayerStore } from './player-store';
```

---

## 5. useAuth 훅 (완성 버전)

```typescript
// src/hooks/useAuth.ts
import * as SecureStore from 'expo-secure-store';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '@store/auth-store';
import { AuthResponse } from '@services/auth-api';
import { RootStackParamList } from '@navigation/types';
import { clearConsentFlag } from '@hooks/useConsentFlag';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export function useAuth() {
  const { setAuth, clearAuth, setEntitlement } = useAuthStore();

  const saveSession = async (authResponse: AuthResponse) => {
    // 토큰 원본: SecureStore
    await SecureStore.setItemAsync('access_token', authResponse.access_token);
    await SecureStore.setItemAsync('refresh_token', authResponse.refresh_token);

    // 상태 캐시: Zustand
    setAuth({
      userId: authResponse.user_id,
      accessToken: authResponse.access_token,
      entitlement: authResponse.entitlement,
    });
    // impl/07에서 RevenueCat logIn 호출 + trialExpiresAt 업데이트
  };

  /**
   * 세션 만료 처리 — API 인터셉터 refresh 실패 시 호출
   * 로그인 화면으로 리다이렉트 (음원 데이터 유지 — clearAuth만, 캐시 미삭제)
   */
  const handleSessionExpired = async () => {
    await SecureStore.deleteItemAsync('access_token');
    await SecureStore.deleteItemAsync('refresh_token');
    clearAuth();
    // 네비게이션은 앱 레벨 이벤트로 처리 (아래 섹션 참조)
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync('access_token');
    await SecureStore.deleteItemAsync('refresh_token');
    clearAuth();
    // 계정 탈퇴 시 (S16): clearConsentFlag() 추가 호출
  };

  return { saveSession, logout, handleSessionExpired, setEntitlement };
}
```

---

## 6. 세션 만료 → 로그인 리다이렉트 설계

**문제**: axios 인터셉터(refresh 실패)에서 React Navigation에 직접 접근 불가 (Hook context 밖).  
**해결**: 이벤트 에미터 패턴으로 분리.

```typescript
// src/lib/session-events.ts
import { EventEmitter } from 'events';
export const sessionEvents = new EventEmitter();
export const SESSION_EXPIRED_EVENT = 'session_expired';
```

```typescript
// src/services/api.ts 인터셉터 수정 (impl/05에서 작성한 코드에 추가)
import { sessionEvents, SESSION_EXPIRED_EVENT } from '@lib/session-events';

// ... (기존 refresh 실패 catch 블록에)
catch {
  await SecureStore.deleteItemAsync('access_token');
  await SecureStore.deleteItemAsync('refresh_token');
  sessionEvents.emit(SESSION_EXPIRED_EVENT);  // 이벤트 발행
  throw error;
}
```

```typescript
// App.tsx에 추가 (NavigationContainer 내부 컴포넌트에서)
import { useEffect, useRef } from 'react';
import { sessionEvents, SESSION_EXPIRED_EVENT } from '@lib/session-events';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '@hooks/useAuth';

function SessionExpiredListener() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { handleSessionExpired } = useAuth();

  useEffect(() => {
    const handler = async () => {
      await handleSessionExpired();
      navigation.reset({
        index: 0,
        routes: [{ name: 'Auth' }],
      });
    };
    sessionEvents.on(SESSION_EXPIRED_EVENT, handler);
    return () => { sessionEvents.off(SESSION_EXPIRED_EVENT, handler); };
  }, []);

  return null;
}

// App.tsx 내 NavigationContainer 자식으로 추가
<NavigationContainer ...>
  <SessionExpiredListener />
  <RootNavigator />
</NavigationContainer>
```

**EventEmitter 선택 이유**: React Context / Zustand subscribe보다 간단. Navigation context가 필요한 컴포넌트(`SessionExpiredListener`)만 이벤트를 구독. axios 인터셉터는 프레임워크 중립적으로 유지.

**"음원 데이터 유지" 구현**: `clearAuth()`는 Zustand auth 상태만 초기화. 트랙 목록 캐시(PlayerStore)는 유지. API 재조회는 로그인 후 S06 홈 진입 시 처리.

---

## 7. S01 스플래시 세션 복원 개선

```typescript
// S01SplashScreen.tsx 수정 — store 기반으로 개선
import { useAuthStore } from '@store/auth-store';

export default function S01SplashScreen() {
  const navigation = useNavigation<NavProp>();
  const { isAuthenticated, clearAuth } = useAuthStore();

  useEffect(() => {
    const bootstrap = async () => {
      await new Promise(r => setTimeout(r, 1500));

      const consentGiven = await AsyncStorage.getItem('consent_given');
      if (consentGiven !== 'true') {
        navigation.replace('Auth');
        return;
      }

      // SecureStore에서 토큰 검증 (Zustand persist는 참고용)
      const accessToken = await SecureStore.getItemAsync('access_token');
      const refreshToken = await SecureStore.getItemAsync('refresh_token');

      if (accessToken && isTokenValid(accessToken)) {
        // 유효한 토큰 → Main 이동
        navigation.replace('Main');
      } else if (refreshToken) {
        // access 만료 + refresh 존재 → refresh 시도
        try {
          const { data } = await api.post('/auth/refresh', { refresh_token: refreshToken });
          await SecureStore.setItemAsync('access_token', data.access_token);
          await SecureStore.setItemAsync('refresh_token', data.refresh_token);
          // Zustand 업데이트는 useAuth.saveSession에 맡기는 대신 직접 업데이트
          navigation.replace('Main');
        } catch {
          clearAuth();
          navigation.replace('Auth');
        }
      } else {
        clearAuth();
        // consent는 있는데 로그인 안 된 상태 → Login으로
        navigation.replace('Auth');
      }
    };
    bootstrap();
  }, []);

  return ( /* 기존 UI */ );
}
```

**Splash에서 refresh 시도**: 앱 재시작 시 access_token이 만료됐어도 refresh_token이 유효하면 자동 로그인. 30일 refresh 만료 내에서 일반적인 재실행은 모두 자동 로그인됨.

---

## 8. 수용 기준

- [ ] 로그인 성공 후 앱 재실행 → S01에서 세션 검증 → Main 자동 진입 (S05 스킵)
- [ ] access_token 만료 + refresh_token 유효 → Splash에서 자동 갱신 → Main 진입
- [ ] refresh_token 만료 (30일 경과) → clearAuth → Auth/Login 이동
- [ ] API 호출 중 401 → 인터셉터 refresh → 성공 시 원 요청 재실행
- [ ] 인터셉터 refresh 실패 → `SESSION_EXPIRED` 이벤트 → `SessionExpiredListener` → Auth reset
- [ ] 세션 만료 후 재로그인 → S06 홈 복원 (음원 목록 유지)
- [ ] `useAuthStore.getState().entitlement` 로그인 후 올바른 값 ('free'/'trial'/'premium')

---

## 9. 주의사항

- **Zustand persist + AsyncStorage**: `zustand/middleware`의 `createJSONStorage` + `@react-native-async-storage/async-storage` 조합. 구 버전 `zustand` 에서 `AsyncStorage` 직접 전달 패턴은 v4에서 deprecated.
- **SecureStore vs AsyncStorage 역할 분리**: `access_token`, `refresh_token`은 SecureStore (암호화). userId, entitlement 등 비민감 상태는 AsyncStorage + Zustand persist.
- **앱 종료 후 재시작 시 Zustand hydration**: persist 미들웨어가 비동기 복원. 복원 전 상태에서 `isAuthenticated=false`일 수 있음. S01 Splash에서 SecureStore 직접 검증하는 이유.
- **EventEmitter Node.js 호환**: React Native의 `events` 패키지는 Node.js built-in과 동일 API. 별도 설치 불필요 (Metro bundler 포함).
