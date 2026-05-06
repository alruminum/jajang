// apps/mobile/src/hooks/useSessionPolling.ts
// 5초 폴링 + 30초 cutoff + foreground/background AppState 통합
// impl/07 §3 의사코드 정합

import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getSessionStatus } from '@services/api/sessions';

export type PollState =
  | { kind: 'polling'; elapsedSec: number }
  | { kind: 'timeout_notice'; elapsedSec: number }   // 30s 경과
  | { kind: 'completed'; presignedUrl: string }
  | { kind: 'failed'; error: string };

export function useSessionPolling(
  sessionId: string | null,
  opts?: {
    intervalMs?: number;        // default 5000
    timeoutNoticeMs?: number;   // default 30000
  },
): PollState {
  const intervalMs = opts?.intervalMs ?? 5000;
  const timeoutNoticeMs = opts?.timeoutNoticeMs ?? 30000;

  const [state, setState] = useState<PollState>({ kind: 'polling', elapsedSec: 0 });
  const startedAt = useRef(Date.now());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    startedAt.current = Date.now();

    const stop = () => {
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    };

    const tick = async () => {
      try {
        const res = await getSessionStatus(sessionId);
        const elapsedSec = Math.floor((Date.now() - startedAt.current) / 1000);

        if (res.status === 'completed' && res.presigned_url) {
          setState({ kind: 'completed', presignedUrl: res.presigned_url });
          stop();
          return;
        }
        if (res.status === 'failed') {
          setState({ kind: 'failed', error: res.error_message ?? 'DSP 처리에 실패했어요' });
          stop();
          return;
        }
        // processing / generating — 경과 시간에 따라 timeout_notice 전환
        if (Date.now() - startedAt.current >= timeoutNoticeMs) {
          setState({ kind: 'timeout_notice', elapsedSec });
        } else {
          setState({ kind: 'polling', elapsedSec });
        }
      } catch {
        // 네트워크 오류는 무시 — 다음 tick 에서 재시도
      }
    };

    // 즉시 1회 호출
    tick();
    timer.current = setInterval(tick, intervalMs);

    // foreground 복귀 시 즉시 tick (백그라운드 동안 status 변경 따라잡기)
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') tick();
    });

    return () => {
      stop();
      sub.remove();
    };
  }, [sessionId, intervalMs, timeoutNoticeMs]);

  return state;
}
