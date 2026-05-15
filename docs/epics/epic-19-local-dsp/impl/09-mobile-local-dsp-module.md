---
depth: std
design: not-required
story: 2
task_index: 2/3
---

# Task 09 — mobile-local-dsp-module

`apps/mobile/src/audio/local-dsp/` 4 모듈 구현 + 3 jest 파일 작성.  
Story 1 Spike Gate ADOPTED = C3 (afftdn 강등 + highpass IIR + EQ + echo + crossfade, dep 0) 결과 기반.

---

## 사전 준비 (먼저 read 필수)

다음 파일들을 읽고 아키텍처와 설계 의도를 파악하라:

- `docs/epics/epic-19-local-dsp/architecture.md` — §3.2 모듈 구조 / §3.3 의존 그래프 / §3.4 독립성 / §3.5 데이터 흐름
- `docs/epics/epic-19-local-dsp/stories.md` — Story 2 AC-1~AC-5
- `docs/epics/epic-19-local-dsp/spike-results/04-ns1-afftdn-perceptual.log` — highpass IIR 파라미터 근거 (SNR diff ≤0.13dB, C3 viable 확정)
- `docs/epics/epic-19-local-dsp/spike-results/05-ns2-pure-js-perf.log` — C1 viability + NS2 스크립트 실측 파라미터 SSOT
- `apps/api/app/services/dsp/ffmpeg_service.py` — 서버 DspService 상수 (진짜 SSOT)
- `apps/mobile/scripts/spike-ns2-pure-js-perf.ts` — 재사용 DSP 함수 5개 (applyHighpass / applyBiquadEq / applyDelay / applyCrossfade / applySpectralGate)
- `apps/mobile/src/store/generationSlice.ts` — setSessionId / setPollState 시그니처 확인
- 의존 task `08-sample-asset-fixtures`: engineer 가 `gh pr list --search "08-sample-asset-fixtures" --state merged --json url --jq '.[0].url'` 로 머지 PR 추적 후 read (sample asset URI 경로 패턴 확인)

---

## MinimalDspBridge 내부 구현 결정 (C3, module-architect 확정)

**선택: NS2 pure-JS (Hermes typed-array 산술)**  
근거: NS2 spike log (05-ns2-pure-js-perf.log) 에서 Galaxy S24+ (고사양) chain4 = 323ms 확정. afftdn 제외 C3 chain = highpass(78ms) + biquadEq(98ms) + delay(94ms) + crossfade(50ms) = **323ms << 30,000ms**. dep 0 + size 0. NS3 (react-native-audio-api) 는 MP3 export 미지원 (FileFormat enum에 Mp3 없음 = NS3 log §3단계 실측) 으로 추가 bridge 필요 → C2 대비 복잡도 증가. C3에서는 pure-JS가 명백히 우위.

`apps/mobile/scripts/spike-ns2-pure-js-perf.ts` 의 `applyHighpass` / `applyBiquadEq` / `applyDelay` / `applyCrossfade` 4 함수를 MinimalDspBridge 내부로 이식 (copy, not import — spike 스크립트는 prod 번들 포함 금지 주석 명시).

---

## Scope

**본 task가 다루는 것**:
- `apps/mobile/src/audio/local-dsp/LocalDspService.ts`
- `apps/mobile/src/audio/local-dsp/DspPipeline.ts`
- `apps/mobile/src/audio/local-dsp/MinimalDspBridge.ts`
- `apps/mobile/src/audio/local-dsp/LocalCounterRepo.ts`
- `apps/mobile/src/audio/local-dsp/__tests__/DspPipeline.test.ts`
- `apps/mobile/src/audio/local-dsp/__tests__/LocalCounterRepo.test.ts`
- `apps/mobile/src/audio/local-dsp/__tests__/LocalDspService.test.ts`

**본 task가 건드리지 않는 것**:
- `apps/mobile/src/screens/*` — task 10 작업
- `apps/mobile/assets/samples/*` — task 08 작업 (읽기 의존만)
- `apps/api/*` — 변경 0 (Story 3 보존)
- `apps/mobile/src/services/api/generations.ts` — 호출 site 0 (코드 변경 X)
- `apps/mobile/scripts/spike-ns2-pure-js-perf.ts` — 읽기 참조만, 수정 X

---

## 인터페이스

### 공통 타입 (파일: `local-dsp/types.ts` 또는 각 파일 상단 inline)

```typescript
/** 단방향 job 상태 — pending → processing → completed | failed */
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

/** 디바이스 내 단일 DSP 처리 작업 */
export interface LocalGenerationJob {
  jobId: string;          // UUID (crypto.randomUUID() or uuid lib)
  status: JobStatus;
  inputUri: string;       // file:// 로컬 녹음 경로
  outputUri: string | null; // status=completed 일 때만 non-null
  songKey: string;
  createdAt: number;      // Date.now()
  error?: string;
}

/** DSP step 유형 */
export type DspStep =
  | { type: 'highpass'; f: number }
  | { type: 'eq'; f: number; width_type: 'h'; width: number; g: number }
  | { type: 'echo'; delay_ms: number; decay: number; in_gain: number; out_gain: number }
  | { type: 'crossfade-tri'; d_sec: number };

/** MinimalDspBridge 실행 결과 */
export interface DspResult {
  outputUri: string;
  durationMs: number;
}
```

### DspPipeline.ts

```typescript
/**
 * pure function — 서버 DspService 상수와 동일한 파라미터 set 반환 (afftdn 제외).
 * 외부 의존 0. jest 단독 테스트 가능.
 *
 * ⚠️ SSOT = apps/api/app/services/dsp/ffmpeg_service.py DspService 상수 (2026-05-13 스냅샷)
 * NS2 spike script 가 서버 코드 직접 읽어 정합 확인함.
 * architecture.md §3.1.A 의 파라미터 기술 (f=300/width_type=o, delay=1000ms 등)은
 * spec 예시 수준이며 실제 서버 코드와 다름 → 본 파일은 서버 코드 SSOT 따름.
 */
export function buildSteps(params: {
  inputUri: string;
  songKey: string;
  outputUri: string;
}): DspStep[];
```

**buildSteps 반환값 (고정)**:
```
[
  { type: 'highpass', f: 80 },
  { type: 'eq', f: 2500, width_type: 'h', width: 200, g: 3 },
  { type: 'echo', delay_ms: 100, decay: 0.3, in_gain: 0.6, out_gain: 0.3 },
  { type: 'crossfade-tri', d_sec: 0.3 },
]
```

근거: 서버 `DspService` 상수 직접 읽음 — `EQ_FREQ=2500, EQ_WIDTH=200(width_type=h), AECHO_IN=0.6, AECHO_OUT=0.3, AECHO_DELAY=100, AECHO_DECAY=0.3, CROSSFADE_D=0.3`.

### MinimalDspBridge.ts

```typescript
/** DIP interface — 가속 옵션 교체 가능성을 위해 추상화. 구현체 = MinimalDspBridgeImpl */
export interface IDspBridge {
  execute(
    steps: DspStep[],
    inputUri: string,
    outputUri: string,
  ): Promise<DspResult>;
}

/** C3 pure-JS 구현체 (Hermes typed-array 산술) */
export class MinimalDspBridgeImpl implements IDspBridge {
  execute(
    steps: DspStep[],
    inputUri: string,
    outputUri: string,
  ): Promise<DspResult>;
}

/** default export = MinimalDspBridgeImpl 인스턴스 (LocalDspService 주입용) */
export const defaultDspBridge: IDspBridge;
```

**핵심 구현 규칙**:
- `applyHighpass` / `applyBiquadEq` / `applyDelay` / `applyCrossfade` 4 함수를 `spike-ns2-pure-js-perf.ts` 에서 **파일 내부로 직접 복사**. `import` 금지 (spike 스크립트 = prod 번들 포함 금지 명시)
- WAV read: `expo-file-system` `FileSystemFile.bytes` 대신 **`expo-file-system/build/ExpoFileSystem`** 또는 `expo-file-system` legacy API (`readAsStringAsync` + base64) 사용 — NS2 spike log 에서 `FileSystemFile.bytes` API path resolution 실패 확인됨. 대안: `expo-file-system` `readAsStringAsync(uri, { encoding: 'base64' })` → base64 → ArrayBuffer
- MP3 encode: task 09 scope에서는 **WAV 출력**으로 한정. MP3 인코딩은 task 10 또는 별도 bridge (scope creep 방지). `outputUri` = `.wav` 확장자. 단 `DspResult.outputUri` 에 실제 파일 경로 반환
- `crossfade-tri` step: segment 분할 기준 = 입력 audio를 절반 분할하여 양쪽에 적용

### LocalCounterRepo.ts

```typescript
const STORAGE_KEY = 'jajang:local-dsp-counter';
const DEFAULT_LIMIT = 3;

export interface CounterState {
  count: number;
  limit: number;
}

export class LocalCounterRepo {
  /** 현재 count 조회. AsyncStorage 미초기화 시 { count: 0, limit: 3 } 반환 */
  peek(): Promise<CounterState>;

  /** count + 1. count >= limit 이면 throw FREE_LIMIT_REACHED. 원자적 read-modify-write */
  increment(): Promise<void>;

  /** count = 0 으로 리셋 (V2+ 용) */
  reset(): Promise<void>;
}

/** invariant 위반 에러 */
export class FreeLimitReachedError extends Error {
  constructor(count: number, limit: number);
}
```

**핵심 규칙**:
- `increment()` 는 `peek()` → count >= limit 확인 → throw → count+1 write 순서로 단일 AsyncStorage call 체인
- count 는 0 미만이 될 수 없음: read 시 `Math.max(0, parsed.count)`
- jest 에서 `AsyncStorage` = `@react-native-async-storage/async-storage/jest/async-storage-mock` 사용

### LocalDspService.ts

```typescript
export class LocalDspService {
  constructor(
    bridge: IDspBridge,           // MinimalDspBridgeImpl 또는 mock
    counterRepo: LocalCounterRepo, // 실제 또는 mock
  );

  /**
   * DSP job 시작.
   * 1. counterRepo.peek() → count >= limit 시 throw FreeLimitReachedError
   * 2. job 생성 (status=pending), generationSlice.setSessionId(job.jobId) 호출
   * 3. generationSlice.setPollState({ status: 'pending' })
   * 4. bridge.execute(DspPipeline.buildSteps({inputUri, songKey, outputUri}), inputUri, outputUri)
   * 5. 성공: counterRepo.increment() → status=completed → setPollState({ status: 'completed', uri: result.outputUri })
   * 6. 실패: status=failed → setPollState({ status: 'failed', error })
   * @returns 생성된 jobId
   */
  startJob(params: {
    inputUri: string;
    songKey: string;
    outputUri: string;
  }): Promise<string>;

  /**
   * 현재 진행 중인 job 취소 (best-effort).
   * processing 상태에서는 DSP 완료 후 cancelled 처리.
   * generationSlice.setPollState({ status: 'failed', error: 'cancelled' })
   */
  cancel(jobId: string): void;

  /** 현재 job 상태 반환. 없으면 null */
  pollStatus(jobId: string): LocalGenerationJob | null;
}
```

**핵심 규칙**:
- `startJob` 은 `generationSlice.setSessionId` / `setPollState` 를 직접 import 호출 (Zustand 직접 접근)
- `counterRepo.increment()` 호출 위치: bridge.execute 성공 **직후**, status=completed 처리 **직전**. 이 순서가 "status=completed 직후 단일 transaction" 의미
- bridge.execute 실패 시 increment 호출 X
- 현재 실행 중인 job = 모듈 스코프 `Map<string, LocalGenerationJob>` 으로 관리 (in-memory, 재시작 시 초기화 OK)

---

## 핵심 로직

```
// LocalDspService.startJob 흐름
async startJob({ inputUri, songKey, outputUri }):
  counter = await counterRepo.peek()
  if counter.count >= counter.limit: throw FreeLimitReachedError

  job = { jobId: uuid(), status: 'pending', inputUri, outputUri: null, songKey }
  jobs.set(job.jobId, job)
  generationSlice.setSessionId(job.jobId)
  generationSlice.setPollState({ status: 'pending' })

  job.status = 'processing'
  generationSlice.setPollState({ status: 'processing' })

  try:
    steps = DspPipeline.buildSteps({ inputUri, songKey, outputUri })
    result = await bridge.execute(steps, inputUri, outputUri)
    await counterRepo.increment()          // 완료 직후 단일 tx
    job.status = 'completed'
    job.outputUri = result.outputUri
    generationSlice.setPollState({ status: 'completed', uri: result.outputUri })
  catch (err):
    job.status = 'failed'
    job.error = err.message
    generationSlice.setPollState({ status: 'failed', error: err.message })

  return job.jobId
```

---

## 수용 기준

| REQ | 내용 | 검증 | 통과 조건 |
|---|---|---|---|
| REQ-001 | DspPipeline.buildSteps() 반환 step 4개: highpass(f=80) / eq(f=2500,width=200,g=3) / echo(delay_ms=100,in_gain=0.6,out_gain=0.3) / crossfade-tri(d_sec=0.3) | (TEST) | `pnpm test apps/mobile/src/audio/local-dsp/__tests__/DspPipeline.test.ts` → `buildSteps returns 4 steps matching server SSOT` 통과 |
| REQ-002 | DspPipeline 은 real input (mock X) 으로 step set 비교 — snapshot test 포함 | (TEST) | 위 커맨드 → snapshot diff 0 (`.toMatchSnapshot()` 또는 `toEqual` deep compare) |
| REQ-003 | LocalCounterRepo.peek() 초기값 { count: 0, limit: 3 } | (TEST) | `pnpm test apps/mobile/src/audio/local-dsp/__tests__/LocalCounterRepo.test.ts` → `peek returns initial state` 통과 |
| REQ-004 | LocalCounterRepo.increment() 3회 후 4회째 FreeLimitReachedError throw | (TEST) | 위 커맨드 → `throws FreeLimitReachedError on 4th increment` 통과 |
| REQ-005 | LocalCounterRepo count ≥ 0 invariant: 음수 count read 시 0으로 clamping | (TEST) | 위 커맨드 → `clamps negative count to 0` 통과 |
| REQ-006 | LocalDspService.startJob() — count=3 진입 시 FreeLimitReachedError throw, bridge.execute 미호출 | (TEST) | `pnpm test apps/mobile/src/audio/local-dsp/__tests__/LocalDspService.test.ts` → `throws FreeLimitReachedError when count at limit` 통과 |
| REQ-007 | LocalDspService.startJob() 성공 시 status 전이: pending → processing → completed | (TEST) | 위 커맨드 → `status transitions pending→processing→completed on success` 통과 |
| REQ-008 | LocalDspService.startJob() 성공 시 counterRepo.increment() 1회 호출 | (TEST) | 위 커맨드 → mock increment 호출 횟수 assert (`toHaveBeenCalledTimes(1)`) 통과 |
| REQ-009 | LocalDspService.startJob() bridge 실패 시 status=failed, increment 미호출 | (TEST) | 위 커맨드 → `status=failed on bridge error, increment not called` 통과 |
| REQ-010 | generationSlice.setSessionId / setPollState 호출 — startJob 성공 시 setSessionId(jobId) + setPollState(completed) 확인 | (TEST) | 위 커맨드 → generationSlice mock assert 통과 |
| REQ-011 | AC-2 준수 — 서버 upload 호출 site 0 | (TEST) | `grep -r "generationsApi\|api\.post\|api\.put\|fetch.*upload" apps/mobile/src/audio/local-dsp/ | wc -l` 결과 = 0 |
| REQ-012 | MinimalDspBridge.execute() — WAV 입력 경로 존재 시 DspResult 반환 (outputUri non-null) | (MANUAL) | 실기기 또는 jest+fs mock 환경에서 task 10 연동 시 확인 (task 10 범위로 이관 가능) |
| REQ-013 | TypeScript 타입 체크 통과 | (TEST) | `cd apps/mobile && npx tsc --noEmit 2>&1 | grep "local-dsp" | wc -l` 결과 = 0 |

**전체 jest 실행 커맨드**:
```bash
cd apps/mobile && npx jest src/audio/local-dsp --passWithNoTests=false
```

---

## 주의사항

1. **git commit 금지** — 구현 완료 후 commit/push 하지 마라. 커밋은 메인 Claude가 PR 플로우에서 처리한다.

2. **spike 스크립트 import 금지** — `apps/mobile/scripts/spike-ns2-pure-js-perf.ts` 를 prod 번들에 import 금지. 파일 상단에 "PROD 번들 포함 금지" 주석 명시. DSP 함수는 `MinimalDspBridge.ts` 안으로 **직접 복사**하라.

3. **DspPipeline mock 우회 금지** — DspPipeline 테스트는 real `buildSteps()` 호출 + step set 직접 비교. mock으로 대체하면 서버 SSOT 정합 검증 의미 없어짐.

4. **서버 파라미터 SSOT** — `architecture.md §3.1.A` 의 파라미터 기술 (`f=300/width_type=o/width=2`, `delay_ms=1000`, `in_gain=0.8/out_gain=0.9`) 과 실제 `ffmpeg_service.py` 서버 코드가 다르다. 서버 코드 (`EQ_FREQ=2500, EQ_WIDTH=200(width_type=h), AECHO_DELAY=100, AECHO_IN=0.6, AECHO_OUT=0.3`) 가 진짜 SSOT. NS2 spike script가 서버 코드 직접 읽어 확인. **본 impl 파일 `## 인터페이스` 섹션의 buildSteps 반환값을 따르라.**

5. **MP3 인코딩 scope 제한** — task 09 scope 에서 `MinimalDspBridge.execute()` 의 outputUri 는 `.wav` 파일로 출력. MP3 인코딩은 task 10 (screen hookup 단계) 이후 scope 또는 별도 bridge. 이유: MP3 encode 는 `react-native-audio-api` 미지원 (NS3 log 실측), `lamejs` 등 추가 dep 도입 결정은 task 10 arch에서 분리.

6. **WAV read — expo-file-system FileSystemFile.bytes 사용 금지** — NS2 spike log 에서 `FileSystemFile.bytes` path resolution 실패 확인. `expo-file-system` `readAsStringAsync(uri, { encoding: 'base64' })` → base64decode → ArrayBuffer 방식 사용.

7. **AsyncStorage mock** — `LocalCounterRepo.test.ts` 에서 `jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))` 사용.

8. **generationSlice 직접 import** — `LocalDspService.ts` 에서 `useGenerationStore` import 후 `.getState().setSessionId(...)` / `.getState().setPollState(...)` 패턴. hook (useXxx) 직접 호출 금지 (React 컴포넌트 외부에서 실행됨).

---

## DB 영향도

영향 없음. `LocalCounterRepo` 는 `AsyncStorage` (RN 로컬 key-value) 만 사용. `apps/api` DB 변경 0. 서버 DDL 변경 0.

---

## 다른 모듈과의 경계

| 의존 모듈 | 방향 | 부재 시 동작 |
|---|---|---|
| `task 08` sample assets | 읽기 (inputUri 경로 패턴 확인) | task 10 실기기 테스트 전까지 jest 에서는 mock uri 사용 |
| `generationSlice` | LocalDspService → 단방향 호출 | store import 실패 시 startJob throw (graceful 불필요 — must-have) |
| `AsyncStorage` | LocalCounterRepo → 읽기/쓰기 | jest mock 으로 대체 |
| `MinimalDspBridge` (IDspBridge) | LocalDspService constructor injection | mock bridge 주입으로 LocalDspService 단독 테스트 가능 |
| `task 10` screens | 역방향 없음 — task 10 이 LocalDspService 를 import | task 10 미존재 시 본 모듈 무영향 |
