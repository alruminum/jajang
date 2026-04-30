/**
 * REQ-AUTH-STORE: auth-store (Zustand) 동작 검증
 * - setAuth: 사용자 인증 상태 저장
 * - clearAuth: 인증 상태 초기화
 */
import { useAuthStore } from '@store/auth-store';

// Zustand 스토어를 직접 불러와 상태를 테스트한다
// getState() / setState()를 사용해 스토어를 직접 조작

const AUTH_PAYLOAD = {
  userId: 'user-001',
  accessToken: 'access-token-abc',
  entitlement: 'free' as const,
};

beforeEach(() => {
  // 각 테스트 전 스토어 상태 초기화
  useAuthStore.getState().clearAuth();
});

// ─── setAuth ──────────────────────────────────────────────────────────────────
describe('REQ-AUTH-STORE: setAuth', () => {
  it('userId를 스토어에 저장한다', () => {
    useAuthStore.getState().setAuth(AUTH_PAYLOAD);

    expect(useAuthStore.getState().userId).toBe('user-001');
  });

  it('accessToken을 스토어에 저장한다', () => {
    useAuthStore.getState().setAuth(AUTH_PAYLOAD);

    expect(useAuthStore.getState().accessToken).toBe('access-token-abc');
  });

  it('entitlement를 스토어에 저장한다', () => {
    useAuthStore.getState().setAuth(AUTH_PAYLOAD);

    expect(useAuthStore.getState().entitlement).toBe('free');
  });

  it('entitlement가 trial인 경우도 정상 저장된다', () => {
    useAuthStore.getState().setAuth({ ...AUTH_PAYLOAD, entitlement: 'trial' });

    expect(useAuthStore.getState().entitlement).toBe('trial');
  });

  it('entitlement가 premium인 경우도 정상 저장된다', () => {
    useAuthStore.getState().setAuth({ ...AUTH_PAYLOAD, entitlement: 'premium' });

    expect(useAuthStore.getState().entitlement).toBe('premium');
  });

  it('setAuth를 두 번 호출하면 마지막 값으로 덮어쓴다', () => {
    useAuthStore.getState().setAuth(AUTH_PAYLOAD);
    useAuthStore.getState().setAuth({ ...AUTH_PAYLOAD, userId: 'user-002' });

    expect(useAuthStore.getState().userId).toBe('user-002');
  });
});

// ─── clearAuth ────────────────────────────────────────────────────────────────
describe('REQ-AUTH-STORE: clearAuth', () => {
  it('clearAuth 호출 후 userId가 초기값이 된다', () => {
    useAuthStore.getState().setAuth(AUTH_PAYLOAD);
    useAuthStore.getState().clearAuth();

    expect(useAuthStore.getState().userId).toBeFalsy();
  });

  it('clearAuth 호출 후 accessToken이 초기값이 된다', () => {
    useAuthStore.getState().setAuth(AUTH_PAYLOAD);
    useAuthStore.getState().clearAuth();

    expect(useAuthStore.getState().accessToken).toBeFalsy();
  });

  it('clearAuth 호출 후 entitlement가 초기값이 된다', () => {
    useAuthStore.getState().setAuth(AUTH_PAYLOAD);
    useAuthStore.getState().clearAuth();

    expect(useAuthStore.getState().entitlement).toBeFalsy();
  });

  it('setAuth 없이 clearAuth만 호출해도 에러가 발생하지 않는다', () => {
    expect(() => useAuthStore.getState().clearAuth()).not.toThrow();
  });
});
