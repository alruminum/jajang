/**
 * session-events 테스트
 * impl: docs/milestones/v1/epics/epic-01-auth/impl/06-app-session-state.md §6
 *
 * 수용 기준 커버:
 * - 인터셉터 refresh 실패 → SESSION_EXPIRED 이벤트 발행 (REQ-SESSION-05)
 */

import { EventEmitter } from 'events';
import { sessionEvents, SESSION_EXPIRED_EVENT } from '../../lib/session-events';

describe('session-events (REQ-SESSION-05)', () => {
  afterEach(() => {
    // 각 테스트 간 리스너 격리
    sessionEvents.removeAllListeners();
  });

  // ─── 상수 검증 ────────────────────────────────────────────────────────────
  describe('SESSION_EXPIRED_EVENT 상수', () => {
    it("'session_expired' 문자열 값을 가진다", () => {
      expect(SESSION_EXPIRED_EVENT).toBe('session_expired');
    });
  });

  // ─── EventEmitter 인스턴스 검증 ──────────────────────────────────────────
  describe('sessionEvents 인스턴스', () => {
    it('EventEmitter 인스턴스이다', () => {
      expect(sessionEvents).toBeInstanceOf(EventEmitter);
    });
  });

  // ─── 이벤트 발행/구독 ────────────────────────────────────────────────────
  describe('이벤트 발행', () => {
    it('emit 시 on으로 등록된 핸들러가 호출된다', () => {
      const handler = vi.fn();
      sessionEvents.on(SESSION_EXPIRED_EVENT, handler);

      sessionEvents.emit(SESSION_EXPIRED_EVENT);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('여러 핸들러를 등록하면 모두 호출된다', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      sessionEvents.on(SESSION_EXPIRED_EVENT, handler1);
      sessionEvents.on(SESSION_EXPIRED_EVENT, handler2);

      sessionEvents.emit(SESSION_EXPIRED_EVENT);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('once 핸들러는 첫 번째 emit에서만 호출된다', () => {
      const handler = vi.fn();
      sessionEvents.once(SESSION_EXPIRED_EVENT, handler);

      sessionEvents.emit(SESSION_EXPIRED_EVENT);
      sessionEvents.emit(SESSION_EXPIRED_EVENT);

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 구독 해제 ───────────────────────────────────────────────────────────
  describe('리스너 해제', () => {
    it('off 이후 emit 시 핸들러가 호출되지 않는다', () => {
      const handler = vi.fn();
      sessionEvents.on(SESSION_EXPIRED_EVENT, handler);
      sessionEvents.off(SESSION_EXPIRED_EVENT, handler);

      sessionEvents.emit(SESSION_EXPIRED_EVENT);

      expect(handler).not.toHaveBeenCalled();
    });

    it('특정 핸들러만 off 하면 나머지 핸들러는 계속 동작한다', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      sessionEvents.on(SESSION_EXPIRED_EVENT, handler1);
      sessionEvents.on(SESSION_EXPIRED_EVENT, handler2);
      sessionEvents.off(SESSION_EXPIRED_EVENT, handler1);

      sessionEvents.emit(SESSION_EXPIRED_EVENT);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });
});
