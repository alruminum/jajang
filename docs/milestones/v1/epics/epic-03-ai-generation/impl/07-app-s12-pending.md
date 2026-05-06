---
depth: std
---

# impl/07 — [Story 7 / #197] 앱: S12 생성 대기 화면 + pending session 복원

**Epic**: 03 — DSP 음원 후처리 생성
**커버 스토리**: Story 7 (S12 대기 화면 & 실패 처리, 클라이언트)
**선행 조건**: impl/03 (sessions API), impl/05 (mastersSlice)
**예상 소요**: 5~6시간

> **[v1.3.1 신규]** 구 impl/06(`GeneratingScreen` GPU 90초) 폐기 → DSP 30초 + S06 "방금 도착" 카드 + SecureStore session_id 복원.
> **carry-over** (validator UX_VALIDATION 1건): pending session 복원 정책 = SecureStore session_id 단일 저장.

---

## 1. 생성/수정 파일

```
apps/mobile/src/
├── screens/
│   ├── GeneratingScreen.tsx             [신규 — S12]
│   └── HomeScreen.tsx                   [수정 — pending session 복원 + "방금 도착" 카드]
├── services/api/
│   └── sessions.ts                      [신규 — initSession / postRecording / generate / getStatus]
├── services/storage/
│   └── pendingSession.ts                [신규 — SecureStore session_id 저장/조회/클리어]
├── store/
│   └── generationSlice.ts               [신규 — RTK slice (sessionId, status, pollState)]
├── hooks/
│   └── useSessionPolling.ts             [신규 — 5초 간격 폴링 + 30초 cutoff + foreground/background]
├── components/
│   ├── GeneratingAnimation.tsx          [신규 — 달/별 애니메이션]
│   ├── GeneratingTimeoutNotice.tsx      [신규 — "처리 중 (재시도 대기)" 메시지 + 홈 이동 버튼]
│   ├── GeneratingFailureView.tsx        [신규 — 재시도 버튼 + 에러 메시지]
│   └── JustArrivedMasterCard.tsx        [신규 — S06 "방금 도착" 카드]
└── navigation/
    └── types.ts                         [수정 — Generating screen 파라미터 + Play 진입]
```

---

## 2. 인터페이스

```typescript
// services/storage/pendingSession.ts
export async function savePendingSession(sessionId: string): Promise<void>;
export async function loadPendingSession(): Promise<string | null>;
export async function clearPendingSession(): Promise<void>;
//   SecureStore key: "pendingSessionId"
//   savePendingSession 은 POST /sessions/init 성공 시 1회 호출
```

```typescript
// services/api/sessions.ts
export type SessionStatus = "open" | "generating" | "completed" | "failed";

export async function initSession(p: {
  idempotency_key: string;
  song_key: string;
}): Promise<{ session_id: string; presigned_upload_url: string; s3_key: string; is_new: boolean }>;

export async function postRecording(sessionId: string, p: {
  s3_key: string;
  duration_ms: number;
}): Promise<{ recording_id: string }>;

export async function generateSession(sessionId: string): Promise<void>;
export async function getSessionStatus(sessionId: string): Promise<{
  session_id: string;
  status: SessionStatus;
  master_status: "pending"|"processing"|"completed"|"failed"|null;
  presigned_url: string | null;
  error_message: string | null;
}>;
```

```typescript
// hooks/useSessionPolling.ts
type PollState =
  | { kind: "polling"; elapsedSec: number }
  | { kind: "timeout_notice"; elapsedSec: number }   // 30s 경과
  | { kind: "completed"; presignedUrl: string }
  | { kind: "failed"; error: string };

export function useSessionPolling(sessionId: string | null, opts?: {
  intervalMs?: number;          // default 5000
  timeoutNoticeMs?: number;     // default 30000
}): PollState;
```

```typescript
// store/generationSlice.ts
type GenerationState = {
  sessionId: string | null;
  pollState: PollState | null;
  isRetrying: boolean;
};
// thunks: dispatchGenerate(sessionId) / retryGenerate(sessionId)
```

---

## 3. 의사코드

```typescript
// services/storage/pendingSession.ts
import * as SecureStore from "expo-secure-store";
const KEY = "pendingSessionId";

export const savePendingSession = (id: string) => SecureStore.setItemAsync(KEY, id);
export const loadPendingSession = () => SecureStore.getItemAsync(KEY);
export const clearPendingSession = () => SecureStore.deleteItemAsync(KEY);
```

```typescript
// hooks/useSessionPolling.ts
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { getSessionStatus } from "@/services/api/sessions";

export function useSessionPolling(sessionId, { intervalMs = 5000, timeoutNoticeMs = 30000 } = {}) {
  const [state, setState] = useState<PollState>({ kind: "polling", elapsedSec: 0 });
  const startedAt = useRef(Date.now());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    startedAt.current = Date.now();

    const tick = async () => {
      try {
        const res = await getSessionStatus(sessionId);
        const elapsedSec = Math.floor((Date.now() - startedAt.current) / 1000);

        if (res.status === "completed" && res.presigned_url) {
          setState({ kind: "completed", presignedUrl: res.presigned_url });
          stop();
          return;
        }
        if (res.status === "failed") {
          setState({ kind: "failed", error: res.error_message ?? "DSP 처리에 실패했어요" });
          stop();
          return;
        }
        // processing
        if (Date.now() - startedAt.current >= timeoutNoticeMs) {
          setState({ kind: "timeout_notice", elapsedSec });
        } else {
          setState({ kind: "polling", elapsedSec });
        }
      } catch (e) {
        // 네트워크 오류는 무시 (다음 tick 에서 재시도)
      }
    };

    const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };

    tick();   // 즉시 1회
    timer.current = setInterval(tick, intervalMs);

    // foreground 복귀 시 즉시 tick (백그라운드 동안 status 변경 따라잡기)
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") tick(); });

    return () => { stop(); sub.remove(); };
  }, [sessionId, intervalMs, timeoutNoticeMs]);

  return state;
}
```

```tsx
// screens/GeneratingScreen.tsx
function GeneratingScreen({ route, navigation }) {
  const { sessionId } = route.params;
  const pollState = useSessionPolling(sessionId);

  useEffect(() => {
    if (pollState.kind === "completed") {
      clearPendingSession();
      navigation.replace("Play", { url: pollState.presignedUrl });
    }
  }, [pollState]);

  if (pollState.kind === "polling") {
    return (
      <View>
        <GeneratingAnimation />
        <Text>30초 이내에 자장가가 도착해요</Text>
        <Button title="홈으로 이동" onPress={() => navigation.navigate("Home")} />
      </View>
    );
  }
  if (pollState.kind === "timeout_notice") {
    return (
      <GeneratingTimeoutNotice
        onHome={() => navigation.navigate("Home")}
      />
    );
  }
  if (pollState.kind === "failed") {
    return (
      <GeneratingFailureView
        error={pollState.error}
        onRetry={async () => {
          await generateSession(sessionId);   // 동일 session_id 재요청 — 카운터 차감 X (impl/06)
        }}
        onHome={() => navigation.navigate("Home")}
      />
    );
  }
  return null;
}
```

```tsx
// screens/HomeScreen.tsx — pending 복원 추가
function HomeScreen() {
  const [justArrived, setJustArrived] = useState<MasterItem | null>(null);

  useEffect(() => {
    (async () => {
      const sid = await loadPendingSession();
      if (!sid) return;

      try {
        const res = await getSessionStatus(sid);
        if (res.status === "completed" && res.presigned_url) {
          // "방금 도착" 카드 노출 데이터
          setJustArrived({
            session_id: sid,
            song_key: "lullaby", // GET /masters/me 에서 정확한 song_key 매칭
            presigned_url: res.presigned_url,
            completed_at: new Date().toISOString(),
            dsp_duration_ms: null,
          });
          await clearPendingSession();
        } else if (res.status === "processing") {
          // 여전히 처리 중 — Background Generation Banner (S12 진입 X)
          // mastersSlice 의 has_pending 으로 이미 표현 가능 — 별도 처리 X
        } else if (res.status === "failed") {
          await clearPendingSession();
          // toast: "생성 실패 — 다시 시도하기"
        }
      } catch (e: any) {
        if (e?.status === 404) {
          await clearPendingSession();   // orphan
        }
      }
    })();
  }, []);

  // ... (impl/05 의 mastersSlice items 렌더링)

  return (
    <>
      {justArrived && (
        <JustArrivedMasterCard
          songKey={justArrived.song_key}
          onPlay={() => nav.navigate("Play", { url: justArrived.presigned_url })}
          onDismiss={() => setJustArrived(null)}
        />
      )}
      {/* impl/05 의 PendingMasterCard / FlatList ... */}
    </>
  );
}
```

```typescript
// 통합 흐름 (RecordScreen → GeneratingScreen)
async function startGeneration(songKey: string, recordings: LocalClip[]) {
  const idem = uuid.v4();
  const init = await initSession({ idempotency_key: idem, song_key: songKey });
  await savePendingSession(init.session_id);   // 복원 키 저장

  for (const c of recordings) {
    await uploadToS3(init.presigned_upload_url, c.uri);
    await postRecording(init.session_id, { s3_key: init.s3_key, duration_ms: c.durationMs });
    await deleteLocalClip(c.uri);              // impl/04 헬퍼
  }
  await generateSession(init.session_id);

  navigation.navigate("Generating", { sessionId: init.session_id });
}
```

---

## 4. 결정 근거

### SecureStore 단일 session_id 저장 (carry-over 정책)
- system-design.md §7 채택안. 동시 다중 세션 race 회피 + 단순성.
- 대안 (`GET /sessions/me?status=processing`) 미채택 — 서버 endpoint 추가 + race 가드 복잡.

### 30초 cutoff = "재시도 비활성 + 홈 이동 활성" (재시도 버튼 활성 X)
- Celery retry 가 진행 중일 수 있음 — 클라이언트 재시도 = 동일 task 중복 dispatch 위험
- 서버 `status=failed` (Celery 모든 retry 소진) 도달 시에만 재시도 활성

### 폴링 5초 (백오프 X)
- DSP 평균 7~15초 + soft_time_limit 35초 → 5초 간격이면 평균 2~5회 폴링
- 백오프 도입 시 코드 복잡도 vs 절약 RTT 가성비 X

### foreground 복귀 시 즉시 tick
- 백그라운드 30초 후 복귀 → 다음 interval 까지 5초 더 기다림 = UX 손실
- AppState `active` 감지 시 즉시 1회 tick

---

## 5. 다른 모듈 경계

- **impl/03 (sessions API)**: `getSessionStatus` 응답 구조 정합. 본 impl 의 `useSessionPolling` 이 이 응답을 *유일한* status source 로 사용.
- **impl/05 (HomeScreen + mastersSlice)**: HomeScreen 은 (a) mastersSlice 목록 (impl/05) + (b) pending 복원 카드 (본 impl) 두 영역 합성. 충돌 시 본 impl 의 `JustArrivedMasterCard` 가 상단, mastersSlice items 가 하단.
- **impl/04 (`deleteLocalClip`)**: `startGeneration` 흐름 내 클립 업로드 직후 호출.
- **Epic 04 (재생)**: `navigation.replace("Play", { url: presignedUrl })` 진입점. `PlayScreen.params.url` 타입 정합 필요.
- **Epic 02 (RecordScreen)**: `startGeneration(songKey, recordings)` 호출 시점은 RecordScreen 의 "녹음 완료" CTA. 본 impl 의 함수를 RecordScreen 이 import.

---

## 6. 수용 기준

- [ ] (TEST) `pendingSession.save/load/clear` — SecureStore key "pendingSessionId" 정합
- [ ] (TEST) `useSessionPolling` 첫 tick 즉시 (interval 대기 X)
- [ ] (TEST) 5초 간격 polling (mocked timer)
- [ ] (TEST) `status=processing` 30초 미만 → state.kind="polling"
- [ ] (TEST) `status=processing` 30초 경과 → state.kind="timeout_notice"
- [ ] (TEST) `status=processing` 30초 후에도 폴링 계속 → 이후 `status=completed` 도달 시 즉시 "completed"
- [ ] (TEST) `status=completed` 수신 → `clearPendingSession` + `navigation.replace("Play", { url })`
- [ ] (TEST) `status=failed` → `GeneratingFailureView` + 재시도 버튼 활성
- [ ] (TEST) 재시도 탭 → `generateSession(sameId)` 호출 (새 session_id 생성 X)
- [ ] (TEST) "홈으로 이동" → `navigation.navigate("Home")` (SecureStore 클리어 X — 처리 계속)
- [ ] (TEST) HomeScreen mount + SecureStore 에 sid 존재 + `status=completed` → `JustArrivedMasterCard` 노출 + SecureStore 클리어
- [ ] (TEST) HomeScreen mount + SecureStore 에 sid 존재 + 404 → SecureStore 클리어 (orphan)
- [ ] (TEST) HomeScreen mount + SecureStore 부재 → `JustArrivedMasterCard` 미노출
- [ ] (TEST) AppState `active` 복귀 → 즉시 추가 tick
- [ ] (MANUAL) S12 진입 → 앱 강제 종료 → 재실행 → S06 + "방금 도착" 카드 (DSP 완료 가정)

---

## 7. 주의사항

- `useSessionPolling` cleanup 에서 `clearInterval` + `AppState.removeEventListener` 둘 다 해제. 누락 시 unmounted state 에서 setState 호출 → React warning + 메모리 누수.
- `idempotency_key` 는 `RecordScreen` 진입 시 1회 생성 → 동일 사용자가 빠르게 재시도해도 같은 키 사용 시 서버가 기존 session 반환 (impl/03 §4 멱등성). 새 세션 원할 때만 새 UUID.
- `JustArrivedMasterCard.song_key` 는 `getSessionStatus` 응답에 *없음* → 정확한 song_key 표시 위해 `mastersSlice.items` 에서 `session_id` 매칭 또는 별도 `GET /sessions/{id}` 추가 필요. MVP 는 generic 라벨 ("자장가") 표시 후 탭 시 PlayScreen 에서 정확한 메타 표시.
- expo-secure-store 는 iOS Keychain / Android SharedPreferences (encrypted) — *동기 X*. async 호출 강제.
- `useSessionPolling` 은 sessionId 변경 시 새 interval. 같은 sessionId 가 다시 props 로 들어와도 `useEffect` deps 비교로 재시작 안 됨 (정합).

---

MODULE_PLAN_READY
