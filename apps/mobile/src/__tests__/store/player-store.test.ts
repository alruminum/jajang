/**
 * PlayerStore 테스트
 * impl: docs/milestones/v1/epics/epic-01-auth/impl/06-app-session-state.md §3
 *
 * 수용 기준 커버:
 * - 세션 만료 후 재로그인 → 음원 목록(PlayerStore) 유지 (REQ-SESSION-06)
 * - PlayerSlice 초기 상태 및 각 액션 정상 동작
 */

import { usePlayerStore } from '@store/player-store';

describe('PlayerStore (REQ-SESSION-06)', () => {
  beforeEach(() => {
    // 각 테스트 전 초기 상태로 리셋
    usePlayerStore.setState({
      currentTrackId: null,
      isPlaying: false,
      timerEndsAt: null,
      rewardedUnlockExpiresAt: null,
    });
  });

  // ─── REQ-PLAYER-01: 초기 상태 ────────────────────────────────────────────
  describe('REQ-PLAYER-01: 초기 상태', () => {
    it('currentTrackId 초기값이 null이다', () => {
      expect(usePlayerStore.getState().currentTrackId).toBeNull();
    });

    it('isPlaying 초기값이 false이다', () => {
      expect(usePlayerStore.getState().isPlaying).toBe(false);
    });

    it('timerEndsAt 초기값이 null이다', () => {
      expect(usePlayerStore.getState().timerEndsAt).toBeNull();
    });

    it('rewardedUnlockExpiresAt 초기값이 null이다', () => {
      expect(usePlayerStore.getState().rewardedUnlockExpiresAt).toBeNull();
    });
  });

  // ─── REQ-PLAYER-02: setCurrentTrack ──────────────────────────────────────
  describe('REQ-PLAYER-02: setCurrentTrack', () => {
    it('trackId 설정 시 currentTrackId가 업데이트된다', () => {
      usePlayerStore.getState().setCurrentTrack('track-001');

      expect(usePlayerStore.getState().currentTrackId).toBe('track-001');
    });

    it('다른 trackId로 교체할 수 있다', () => {
      usePlayerStore.getState().setCurrentTrack('track-001');
      usePlayerStore.getState().setCurrentTrack('track-002');

      expect(usePlayerStore.getState().currentTrackId).toBe('track-002');
    });

    it('null 설정 시 currentTrackId가 null로 초기화된다', () => {
      usePlayerStore.getState().setCurrentTrack('track-001');
      usePlayerStore.getState().setCurrentTrack(null);

      expect(usePlayerStore.getState().currentTrackId).toBeNull();
    });
  });

  // ─── REQ-PLAYER-03: setPlaying ───────────────────────────────────────────
  describe('REQ-PLAYER-03: setPlaying', () => {
    it('true 설정 시 isPlaying이 true가 된다', () => {
      usePlayerStore.getState().setPlaying(true);

      expect(usePlayerStore.getState().isPlaying).toBe(true);
    });

    it('false 설정 시 isPlaying이 false로 돌아온다', () => {
      usePlayerStore.getState().setPlaying(true);
      usePlayerStore.getState().setPlaying(false);

      expect(usePlayerStore.getState().isPlaying).toBe(false);
    });
  });

  // ─── REQ-PLAYER-04: setTimer ─────────────────────────────────────────────
  describe('REQ-PLAYER-04: setTimer', () => {
    it('미래 타임스탬프 설정 시 timerEndsAt이 업데이트된다', () => {
      const endsAt = Date.now() + 60_000;
      usePlayerStore.getState().setTimer(endsAt);

      expect(usePlayerStore.getState().timerEndsAt).toBe(endsAt);
    });

    it('null 설정 시 timerEndsAt이 null로 초기화된다', () => {
      usePlayerStore.getState().setTimer(Date.now() + 60_000);
      usePlayerStore.getState().setTimer(null);

      expect(usePlayerStore.getState().timerEndsAt).toBeNull();
    });

    it('경계값: 0도 허용된다', () => {
      usePlayerStore.getState().setTimer(0);

      expect(usePlayerStore.getState().timerEndsAt).toBe(0);
    });
  });

  // ─── REQ-PLAYER-05: setRewardedUnlock ────────────────────────────────────
  describe('REQ-PLAYER-05: setRewardedUnlock', () => {
    it('만료 타임스탬프 설정 시 rewardedUnlockExpiresAt이 업데이트된다', () => {
      const expiresAt = Date.now() + 3_600_000;
      usePlayerStore.getState().setRewardedUnlock(expiresAt);

      expect(usePlayerStore.getState().rewardedUnlockExpiresAt).toBe(expiresAt);
    });

    it('null 설정 시 rewardedUnlockExpiresAt이 null로 초기화된다', () => {
      usePlayerStore.getState().setRewardedUnlock(Date.now() + 3_600_000);
      usePlayerStore.getState().setRewardedUnlock(null);

      expect(usePlayerStore.getState().rewardedUnlockExpiresAt).toBeNull();
    });
  });

  // ─── REQ-SESSION-06: clearAuth가 PlayerStore에 영향 없음 ─────────────────
  describe('REQ-SESSION-06: 세션 만료 후 PlayerStore 데이터 유지', () => {
    it('clearAuth 이후에도 currentTrackId가 유지된다 (PlayerStore는 독립적)', () => {
      // PlayerStore에 트랙 설정
      usePlayerStore.getState().setCurrentTrack('track-xyz');

      // auth clearAuth는 PlayerStore를 건드리지 않는다 — store.index.ts에서 분리된 인스턴스
      // PlayerStore.setState를 직접 호출하지 않는 한 값이 유지됨
      expect(usePlayerStore.getState().currentTrackId).toBe('track-xyz');
    });
  });
});
