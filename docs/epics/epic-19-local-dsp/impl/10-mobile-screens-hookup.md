---
depth: std
design: not-required
story: 2
task_index: 3/3
---

# 10 — mobile-screens-hookup

RecordMode/Preview/Generating 화면의 서버 생성 호출 사이트를 `LocalDspService` 로 교체하고, 무료 카운터 UI + sample 합성 dev 진입점 + airplane mode E2E를 추가한다. task 08 (sample assets) + task 09 (local-dsp 모듈) PASS 후 진입.

---

## 사전 준비 (먼저 read 필수)

아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `docs/epics/epic-19-local-dsp/architecture.md` — §3.2 (Story 2 mobile path 구조) + §3.5 (데이터 흐름) + §6 (구현 순서) + §8 (impl 목차)
- `docs/epics/epic-19-local-dsp/stories.md` — Story 2 AC-1~AC-5
- `docs/ARCHITECTURE.md` — 기존 음원 생성 시퀀스 확인
- `docs/ADR.md` — 관련 결정 확인

의존 task slug 확인 (머지된 PR 검색):

```bash
gh pr list --search "08-sample-asset-fixtures" --state merged --base feature/local-dsp --json number,url --jq '.[0]'
gh pr list --search "09-mobile-local-dsp-module" --state merged --base feature/local-dsp --json number,url --jq '.[0]'
```

의존 task 산출물 파일 확인 (read 필수):

- `apps/mobile/assets/samples/` — task 08 이 박은 fixture 목록 확인 (lullaby-sample.{wav,mp3}, voice-sample.{wav,m4a})
- `apps/mobile/src/audio/local-dsp/LocalDspService.ts` — 실제 공개 인터페이스 확인
- `apps/mobile/src/audio/local-dsp/LocalCounterRepo.ts` — `peek()` / `increment()` 시그니처 확인

기존 화면 코드 (반드시 read):

- `apps/mobile/src/screens/S11PreviewScreen.tsx` — `handleUseRecording` 흐름: 현재 S3 upload + 서버 검증 + `Generating` 화면 이동. 이것이 교체 대상
- `apps/mobile/src/screens/S12GeneratingScreen.tsx` — sessionId polling. task 09 완료 후 local path 로 교체 대상
- `apps/mobile/src/screens/RecordScreen.tsx` — 카운터 UI 위치 파악 (`isFreeUser` + `generationCount` 참조 중)
- `apps/mobile/src/screens/S07SongSelectScreen.tsx` — `generationCount` 진입 차단 로직 위치 (서버 카운터 기반 — 교체 범위 판단 필요)
- `apps/mobile/src/store/generationSlice.ts` — `setSessionId` / `setPollState` 시그니처
- `apps/mobile/src/store/recordingSlice.ts` — `localAudioUri` / `selectedSongKey` 확인
- `apps/mobile/src/navigation/types.ts` — `MainStackParamList` 에 `LocalGenerating` 추가 필요 여부 판단
- `apps/mobile/src/services/api/generations.ts` — 파일 자체 보존 대상 (호출 site 0 확인)

---

## Scope

**이 task 가 다루는 레이어/모듈**:

1. `apps/mobile/src/screens/S11PreviewScreen.tsx` — `handleUseRecording` 내 서버 호출 → `LocalDspService.startJob` 교체
2. `apps/mobile/src/screens/S12GeneratingScreen.tsx` (또는 신규 `S12LocalGeneratingScreen.tsx`) — local job polling 처리
3. `apps/mobile/src/screens/RecordScreen.tsx` — 카운터 표시 소스를 `LocalCounterRepo.peek()` 로 교체
4. `apps/mobile/src/screens/S07SongSelectScreen.tsx` — 진입 차단 소스를 `LocalCounterRepo.peek()` 로 교체 (서버 `generationCount` 제거)
5. `apps/mobile/src/screens/__tests__/` — 카운터 UI + LocalDspService 분기 테스트
6. (dev-only) `apps/mobile/src/screens/DevSampleDemoScreen.tsx` — `__DEV__` gate sample 합성 진입점

**이 task 가 건드리지 않는 것**:

- `apps/mobile/src/audio/local-dsp/*` — task 09 산출물, 절대 수정 X
- `apps/mobile/assets/samples/*` — task 08 산출물, 수정 X
- `apps/mobile/src/services/api/generations.ts` — 파일 보존, 호출 site 추가 금지
- `apps/api/*` — 변경 0
- `apps/mobile/src/store/generationSlice.ts` — `setSessionId` / `setPollState` 시그니처 보존. local path 용 상태가 필요하면 신규 필드 추가만 허용 (기존 필드 삭제/변경 X)

---

## 인터페이스

### 1. S11PreviewScreen — handleUseRecording 교체 분기

```typescript
// 기존 흐름 제거 대상 (서버 path):
//   recordingsApi.initUpload() → recordingsApi.uploadToS3() → recordingsApi.completeUpload()
//   → recordingsApi.validateSample() → navigation.navigate('Generating', { sessionId })
//
// 신규 흐름 (local path):
//   LocalCounterRepo.peek() → count >= 3 → navigate('UpgradeSheet', { variant: 'generation_exhausted' })
//   → LocalDspService.startJob({ inputUri: localAudioUri, songKey: selectedSongKey })
//   → navigation.navigate('LocalGenerating', { jobId })

type LocalUploadPhase =
  | 'idle'
  | 'checking_counter'   // LocalCounterRepo.peek() 중
  | 'processing'         // LocalDspService.startJob() 진행 중
  | 'error';

// 핵심 invariant:
// - startJob 호출 전 반드시 counter.peek() → count < 3 확인 (guard)
// - startJob 은 async, UI는 'processing' 상태로 spinner 표시
// - startJob 성공 → navigation.navigate('LocalGenerating', { jobId: job.id })
// - startJob 실패 (Error) → phase='error', errorMessage 표시
```

### 2. MainStackParamList 확장 (navigation/types.ts)

```typescript
// 추가 필요:
LocalGenerating: {
  jobId: string;  // LocalGenerationJob.id (UUID)
};
```

### 3. S12LocalGeneratingScreen (신규 또는 S12 확장)

```typescript
// 입력: route.params.jobId (string)
// LocalDspService.pollStatus(jobId) 를 interval (1초) 로 폴링
// completed → navigation.replace('Play', { trackId: jobId, trackUrl: outputUri })
// failed → 에러 메시지 + 재시도 버튼 (재시도 = startJob 재호출 X, 이전 화면으로 goBack)
// UI: GeneratingAnimation 컴포넌트 재사용 가능 (기존 S12 동일 레이아웃)

// pollStatus 시그니처 (task 09 산출물에서 확인 필수):
// LocalDspService.pollStatus(jobId: string): Promise<LocalJobPollResult>
// type LocalJobPollResult =
//   | { status: 'processing' }
//   | { status: 'completed'; outputUri: string }
//   | { status: 'failed'; error: string }
```

### 4. RecordScreen — 카운터 UI 소스 교체

```typescript
// 기존: authStore.generationCount (서버 기반, 현재 하드코딩 0)
// 신규: LocalCounterRepo.peek() 결과 (AsyncStorage)
//
// - 컴포넌트 마운트 / focus 복귀 시 peek() 호출 → counterCount 상태 갱신
// - 차단 UI: count >= FREE_GENERATION_LIMIT (=3) 시 stop 버튼 disabled + tooltip
//   "무료 3회 사용 완료. 구독하면 계속 만들 수 있어요"
// - testID: 'local-free-counter' (기존 'free-generation-counter' 는 변경 없이 병행 가능,
//   단 소스가 LocalCounterRepo 임을 주석 명시)
```

### 5. S07SongSelectScreen — 진입 차단 소스 교체

```typescript
// 기존: authStore.generationCount (서버 기반)
// 신규: LocalCounterRepo.peek() 결과
//
// - useFocusEffect 내 peek() 호출 → localCount 상태 갱신
// - generationsLeft = FREE_GENERATION_LIMIT - localCount
// - count >= 3 → CTA opacity 0.4 + disabled + 탭 시 UpgradeSheet 이동
```

### 6. DevSampleDemoScreen (신규, `__DEV__` gate)

```typescript
// 위치: apps/mobile/src/screens/DevSampleDemoScreen.tsx
// 조건: if (__DEV__) 블록 내 또는 파일 자체를 __DEV__ 체크로 early return

// 입력 fixture 경로 (task 08 확정 후 read):
//   lullabyUri = Asset.fromModule(require('../../assets/samples/lullaby-sample.wav')).uri
//   voiceUri   = Asset.fromModule(require('../../assets/samples/voice-sample.wav')).uri
//   (m4a fallback: require('../../assets/samples/voice-sample.m4a'))

// 동작:
//   버튼 "샘플 합성 시작" → LocalDspService.startJob({ inputUri: voiceUri, songKey: 'sample' })
//   → 완료 시 outputUri 를 console.log + Text 표시
//   → LocalCounterRepo.peek() 결과도 표시 (카운터 +1 확인용)
//
// production build 에 포함 금지:
//   - navigation 에 등록 시 __DEV__ 조건 guard 필수
//   - 파일 자체는 존재해도 되나 navigator 에 등록 X (production)
//   - 또는 별도 DevNavigator 에만 등록 + __DEV__ 분기
```

---

## 핵심 로직 (의사코드)

### S11PreviewScreen.handleUseRecording (교체 후)

```
async handleUseRecording():
  if !localAudioUri or !selectedSongKey → return

  setPhase('checking_counter')
  counter ← await LocalCounterRepo.peek()
  if counter.count >= counter.limit:
    navigation.navigate('UpgradeSheet', { variant: 'generation_exhausted' })
    setPhase('idle')
    return

  setPhase('processing')
  try:
    job ← await LocalDspService.startJob({ inputUri: localAudioUri, songKey: selectedSongKey })
    generationStore.setSessionId(job.id)
    generationStore.setPollState({ status: 'processing' })
    navigation.navigate('LocalGenerating', { jobId: job.id })
  catch err:
    setPhase('error')
    setErrorMessage('생성에 실패했어요. 다시 시도해주세요')
```

### S12LocalGeneratingScreen polling

```
onMount:
  intervalId ← setInterval(async () {
    result ← await LocalDspService.pollStatus(jobId)
    if result.status == 'completed':
      clearInterval(intervalId)
      generationStore.setPollState({ status: 'completed', uri: result.outputUri })
      navigation.replace('Play', { trackId: jobId, trackUrl: result.outputUri })
    else if result.status == 'failed':
      clearInterval(intervalId)
      generationStore.setPollState({ status: 'failed', error: result.error })
      setFailed(true)
  }, 1000)

onUnmount:
  clearInterval(intervalId)
```

---

## 수용 기준

| REQ | 내용 | 검증 | 통과 조건 |
|---|---|---|---|
| REQ-001 | sample fixture + LocalDspService 합성 → 단일 mp3 파일 출력 | (MANUAL) | DevSampleDemoScreen 에서 "샘플 합성 시작" 탭 → console.log 에 `file://.../*.mp3` URI 출력 + `ls -la <uri>` 또는 `ffprobe -f mp3 <uri>` 에러 없음. 또는: `npx jest apps/mobile/src/__tests__/audio/local-dsp/integration.test.ts` → `sample synthesis → 1 mp3` 통과 |
| REQ-002 | `services/api/generations.ts` 호출 site 0 — raw 녹음 서버 유출 0 | (TEST) | `grep -rn "generationsApi\." apps/mobile/src/screens/ apps/mobile/src/hooks/` → 0 lines 출력 |
| REQ-003 | `services/api/recordings.ts` 업로드 호출 site 0 (S11 교체 후) | (TEST) | `grep -rn "recordingsApi\.initUpload\|recordingsApi\.uploadToS3" apps/mobile/src/screens/S11PreviewScreen.tsx` → 0 lines 출력 |
| REQ-004 | 카운터 +1 (status=completed 직후) | (TEST) | `npx jest apps/mobile/src/__tests__/screens/S11PreviewScreen.test.tsx` → `counter increments on completed` 통과. (task 09 LocalDspService mock 사용) |
| REQ-005 | count >= 3 시 S07SongSelect CTA disabled + S11 UpgradeSheet 이동 | (TEST) | `npx jest apps/mobile/src/__tests__/screens/S07SongSelectScreen.test.tsx` → `disables CTA when counter exhausted` 통과 |
| REQ-006 | airplane mode (네트워크 0) 에서 sample 합성 완료 | (MANUAL) | 디바이스에서 Settings → Airplane Mode ON → DevSampleDemoScreen "샘플 합성 시작" → outputUri 출력 확인. screenshot 을 `docs/epics/epic-19-local-dsp/spike-results/10-airplane-mode-e2e.png` 로 저장 |
| REQ-007 | DevSampleDemoScreen 이 production build 미포함 | (TEST) | `grep -rn "DevSampleDemoScreen" apps/mobile/src/navigation/` → `__DEV__` 조건 guard 내부에만 등록 확인. `NODE_ENV=production grep -rn "DevSampleDemoScreen" apps/mobile/src/navigation/` 결과에 조건 없는 등록 0 |
| REQ-008 | 기존 generationSlice `setSessionId` / `setPollState` 시그니처 보존 | (TEST) | `npx jest --testPathPattern="generationSlice\|generation-store"` → 기존 테스트 회귀 0 |

**통합 빌드 검증 커맨드:**

```bash
cd apps/mobile
npm run type-check
# 타입 에러 0 (LocalDspService / LocalCounterRepo 임포트 경로 포함)

npm test -- --testPathPattern="S11Preview|S07SongSelect|LocalGenerating|generationSlice"
# 모든 신규 + 기존 테스트 통과
```

---

## 주의사항

1. **git 커밋 금지**: 이 impl 파일 실행 중 `git add`, `git commit`, `git push` 명령 실행 금지. 코드 변경만 수행.

2. **`services/api/generations.ts` 파일 수정 금지**: 호출 site 0 상태 유지. import 제거는 호출 화면 파일에서만 (파일 자체 보존).

3. **`apps/mobile/src/audio/local-dsp/*` 수정 금지**: task 09 산출물. 인터페이스가 불일치하면 이 파일을 맞추지 말고 SPEC_GAP_FOUND 로 보고.

4. **`__DEV__` gate 누락 시 App Store 심사 위험**: DevSampleDemoScreen 은 `if (__DEV__)` 블록 밖에서 절대 등록 X. console.log 는 `__DEV__` 내부에만.

5. **LocalCounterRepo.peek() 는 async**: React 상태로 캐싱하되 `useFocusEffect` 에서 재조회 (화면 복귀 시 카운터 갱신). `useEffect([])` 1회만 호출하면 재녹음 후 카운터 미갱신 버그.

6. **S11PreviewScreen 기존 서버 path 코드**: 제거 대상이나 Story 3 보존 정책 감안하여 주석 처리 선택 가능 (삭제 X 를 선호). 단 실행 경로에서 완전 제거 필수.

7. **navigation.replace vs navigate**: `LocalGenerating` 화면으로 이동 시 `navigate` (뒤로 가기 허용). `Play` 화면으로 이동 시 `replace` (생성 완료 후 back 방지 — 기존 S12 패턴 동일).

8. **pollStatus interval 누수**: S12LocalGeneratingScreen unmount 시 반드시 `clearInterval`. useEffect return 에 cleanup 박기.

9. **task 09 산출물 인터페이스 사전 확인 의무**: `LocalDspService.ts` / `LocalCounterRepo.ts` 를 read 하지 않고 시그니처 추측 금지 (제1 룰).

---

## DB 영향도

영향 없음. `LocalCounterRepo` 는 `AsyncStorage` 기반 클라이언트 로컬 저장소 사용. 서버 DB 변경 0.

---

## 다른 모듈과의 경계

| 의존 방향 | 모듈 | 역할 | 부재 시 동작 |
|---|---|---|---|
| 상향 의존 | `LocalDspService` (task 09) | DSP 처리 + job 관리 | `LocalDspService` 미존재 → 빌드 에러. task 09 PASS 후 진입 필수 |
| 상향 의존 | `LocalCounterRepo` (task 09) | 카운터 read/write | `LocalCounterRepo` 미존재 → 빌드 에러. task 09 PASS 후 진입 필수 |
| 상향 의존 | `assets/samples/*` (task 08) | DevSampleDemoScreen fixture 입력 | 파일 미존재 → `Asset.fromModule` 런타임 에러. task 08 PASS 후 진입 필수 |
| 하향 의존 | `generationSlice` | sessionId / pollState 업데이트 | 기존 시그니처 유지. local path 는 jobId를 sessionId 로 저장 |
| 하향 의존 | `services/api/generations.ts` | 보존 대상, 호출 X | import 0, 파일 존재만 유지 |

---

## Breaking Change 검토

| 변경 | 영향 파일 | 회귀 가능성 |
|---|---|---|
| S11PreviewScreen `handleUseRecording` 서버 path 제거 | `S11PreviewScreen.tsx` | 기존 서버 path 테스트 있으면 수정 필요. `recordingsApi.initUpload` mock 테스트 → 제거 또는 skip 처리 |
| S07SongSelectScreen 카운터 소스 변경 | `S07SongSelectScreen.tsx` | `authStore.generationCount` mock 테스트 → `LocalCounterRepo.peek` mock 으로 교체 필요 |
| `MainStackParamList` 에 `LocalGenerating` 추가 | `navigation/types.ts` | 기존 타입 체크 회귀 없음 (추가만) |
| RecordScreen 카운터 소스 변경 | `RecordScreen.tsx` | `free-generation-counter` testID 기반 테스트 → 소스 변경 확인 필요 |

기존 `__tests__` 파일 중 위 4개 화면을 assertion 하는 파일 확인 후 mock 소스 교체 필수:

```bash
grep -rn "generationCount\|generationsApi\|initUpload\|uploadToS3" apps/mobile/src/__tests__/
```
