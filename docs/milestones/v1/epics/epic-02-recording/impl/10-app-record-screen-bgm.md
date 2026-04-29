---
depth: std
design: optional
---

# impl/10 — 앱: 녹음 화면 BGM + 가사 박스 (S10) — #133

**Epic**: 02 — 목소리 녹음 & 품질 검증
**커버 스토리**: Story 3 갱신 (허밍 모드 한정 BGM 30% 재생 + 가사 박스)
**선행 조건**: impl/11 완료 (lyrics.ts, bgmTracks.ts), impl/09 완료 (LyricsBox 컴포넌트)
**이슈**: #133
**예상 소요**: 4~5시간

---

## 1. 생성/수정할 파일 목록

```
apps/mobile/src/
├── hooks/
│   └── useBgmPlayer.ts             [신규 — BGM 재생/정지 훅]
├── screens/
│   └── RecordScreen.tsx            [수정 — BGM 통합 + 가사 박스 + BGM chip]
└── components/
    └── LyricsBox.tsx               [impl/09에서 신규 생성 — 재사용]
```

---

## 2. 오디오 믹싱 정책 — 핵심 설계 결정

### 동시 녹음 + BGM 재생 가능 여부

iOS와 Android 모두 레코딩과 BGM 재생을 동시에 수행하려면 오디오 세션 설정이 선행되어야 한다.

**iOS**: `setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })` 설정 시 iOS 내부에서 `AVAudioSession.Category.playAndRecord`로 전환됨. 이 카테고리는 입력(마이크)과 출력(스피커)을 동시에 허용한다. expo-audio의 `setAudioModeAsync`가 이를 래핑하므로 추가 네이티브 설정 불필요.

**Android**: `setAudioModeAsync({ allowsRecording: true })` 설정 시 `AudioManager.MODE_IN_COMMUNICATION`으로 전환되어 녹음 + 재생 동시 가능. Android에서는 별도 AudioFocus 요청 없이 expo-audio 내부에서 처리됨.

**echo cancellation 영향**: `playAndRecord` 카테고리 활성화 시 iOS AEC(Acoustic Echo Cancellation)가 활성화될 수 있다. 헤드폰 미착용 시 스피커에서 나온 BGM이 마이크로 누출될 위험이 있으나, 30% 볼륨으로 제한하고 헤드폰 착용 가이드 제공. 자동 감지/강제 모달은 V2 후보(PRD §NOT in scope). 마이크 누출 risk 수용.

**결론**: 기존 `startRecording`의 `setAudioModeAsync` 호출 순서를 유지하고, BGM 플레이어를 그 이후 시점(카운트다운 종료 시)에 시작. 녹음 중단 시 BGM도 즉시 정지.

### useBgmPlayer vs RecordScreen 내 인라인

별도 `useBgmPlayer` 훅으로 분리. 이유:
1. RecordScreen이 이미 카운트다운/녹음/무음감지 로직으로 충분히 복잡 — 단일 책임 원칙
2. BGM 재생 라이프사이클(시작/볼륨램프/정지/cleanup)을 훅 내부에서 캡슐화
3. S10 재진입 시(다시 녹음) 훅 언마운트/리마운트로 BGM 재시작이 자동 처리됨

### BGM 자산: 서버 preview presigned URL 재사용

BGM 음원으로 F5 미리듣기와 동일 CC0 소스를 사용(PRD §F5). 클라이언트에서 `songsApi.getPreviewUrl(songKey)` 호출로 presigned URL을 얻어 재생. 앱 번들에 오디오 파일 포함하지 않음.

**30초 클립 loop**: expo-audio의 `AudioPlayer`는 `loop` 옵션 또는 재생 완료 이벤트(`onPlaybackStatusUpdate`) 수신 후 seek(0) + play()로 loop 처리. 녹음이 최대 60초이므로 30초 클립을 2회 loop하면 충분.

---

## 3. useBgmPlayer 훅 인터페이스

```typescript
// apps/mobile/src/hooks/useBgmPlayer.ts

interface UseBgmPlayerOptions {
  songKey: string
  enabled: boolean          // false면 플레이어 비활성 (쉬 모드)
  onLoadError?: () => void  // BGM 로드 실패 콜백
}

interface UseBgmPlayerReturn {
  isPlaying: boolean
  loadFailed: boolean
  startBgm: () => Promise<void>   // 카운트다운 종료 후 호출
  stopBgm: () => Promise<void>    // 녹음 종료/취소 시 호출
}

export function useBgmPlayer(options: UseBgmPlayerOptions): UseBgmPlayerReturn
```

**내부 구현 핵심**:

```typescript
// volume ramp: 0 → 30% over 300ms (UX-Flow 명세)
// expo-audio AudioPlayer.volume: 0.0~1.0
// ramp 구현: setInterval 30ms × 10회 = 300ms, 매 tick 0.03씩 증가

const startBgm = async () => {
  if (!enabled || loadFailed) return

  const { preview_url } = await songsApi.getPreviewUrl(songKey)
  // 로드 실패 시 → setLoadFailed(true) → onLoadError() 호출

  const player = createAudioPlayer({ uri: preview_url }, 0)   // volume=0 시작
  player.loop = true
  player.play()

  // volume ramp 0 → 0.3 over 300ms
  let currentVolume = 0
  const rampInterval = setInterval(() => {
    currentVolume = Math.min(0.3, currentVolume + 0.03)
    player.volume = currentVolume
    if (currentVolume >= 0.3) clearInterval(rampInterval)
  }, 30)

  playerRef.current = player
  setIsPlaying(true)
}

const stopBgm = async () => {
  if (!playerRef.current) return

  // volume ramp 30% → 0 over 200ms (UX-Flow 명세)
  let vol = playerRef.current.volume
  const rampInterval = setInterval(() => {
    vol = Math.max(0, vol - 0.03)
    if (playerRef.current) playerRef.current.volume = vol
    if (vol <= 0) {
      clearInterval(rampInterval)
      playerRef.current?.pause()
      playerRef.current?.remove()
      playerRef.current = null
      setIsPlaying(false)
    }
  }, 20)   // 200ms / 10 steps = 20ms per step
}

// 언마운트 cleanup
useEffect(() => {
  return () => {
    playerRef.current?.pause()
    playerRef.current?.remove()
  }
}, [])
```

**주의**: `songsApi.getPreviewUrl` 호출 시점은 `startBgm()` 호출 시점(카운트다운 종료). S09 진입 시 prefetch하지 않음. 이유: presigned URL 유효기간이 짧을 수 있고, S09에서 오래 머무른 후 S10 진입 시 URL 만료 가능성 있음. 카운트다운 3초 내 URL 로드가 완료되어야 하므로 충분함.

---

## 4. RecordScreen 수정 범위

### 추가할 import / state

```typescript
import { useBgmPlayer } from '../hooks/useBgmPlayer'
import { LyricsBox } from '../components/LyricsBox'

// route.params에서 mode 읽기 (기존에 songKey 있음, mode 추가)
const { songKey, mode } = route.params

const isHummingMode = mode === 'humming'

// BGM 로드 실패 토스트 상태
const [showBgmFailToast, setShowBgmFailToast] = useState(false)

const { startBgm, stopBgm, loadFailed: bgmLoadFailed } = useBgmPlayer({
  songKey,
  enabled: isHummingMode,
  onLoadError: () => setShowBgmFailToast(true),
})
```

### 카운트다운 종료 시점 BGM 시작

```typescript
// startRecording() 함수 내 — recorder.record() 호출 직후
setPhase('recording')

if (isHummingMode) {
  await startBgm()   // volume ramp 0→30% over 300ms
}
```

### 녹음 종료 시 BGM 정지

모든 종료 경로에서 BGM 정지 필요. `cleanupRecording` 함수 앞에 BGM 정지 삽입:

```typescript
const stopAndNavigate = async () => {
  if (isHummingMode) await stopBgm()   // volume ramp 30%→0 over 200ms
  const uri = await cleanupRecording()
  if (uri) {
    setLocalAudioUri(uri)
    navigation.navigate('Preview', { recordingUri: uri, songKey })
  }
}
```

취소(handleCancel) / 재시작(restartRecording)에서도 동일하게 stopBgm() 호출.

### 다시 녹음 시 BGM 재시작

```typescript
const restartRecording = async () => {
  if (isHummingMode) await stopBgm()    // 현재 BGM 즉시 정지
  await cleanupRecording()
  setElapsedSec(0)
  setLevels([])
  setCountdown(COUNTDOWN_START)
  silentSecRef.current = 0
  levelsRef.current = []
  setShowSilenceWarning(false)
  setPhase('countdown')
  // 카운트다운 재시작 → 완료 후 startBgm() 자동 호출 (startRecording 내부)
}
```

---

## 5. BGM 관련 UI 추가 (허밍 모드 녹음 중)

### BGM chip (상태 표시 텍스트)

```typescript
// 녹음 중 렌더 — 파형 상단
{isHummingMode && !bgmLoadFailed && isPlaying && (
  <Text style={styles.bgmChip}>♬ {songTitle} · 30%</Text>
)}
// BGM 로드 실패 토스트 (상단 임시 표시)
{showBgmFailToast && (
  <Text style={styles.bgmFailToast}>음악 없이 녹음할게요</Text>
)}
```

`songTitle`은 `bgmTracks.ts`(impl/11)의 `BGM_TRACKS[songKey].titleKo` 사용. API 재호출 없이 인-메모리 조회.

### 가사 박스 (허밍 모드 한정, 카운트다운 종료 후 표시)

```typescript
// 녹음 중 렌더
{isHummingMode && (
  <LyricsBox songKey={songKey} mode="recording" />
)}
```

가사 박스 위치: BGM chip 아래, 파형 위. UX-Flow S10 와이어프레임 참조.
fade-in 400ms: `LyricsBox` 내부에서 `Animated.Value` 처리(impl/09 공통 로직).

### 카운트다운 단계에서 BGM/가사 미노출

카운트다운 렌더(`phase === 'countdown'`)는 변경 없음. BGM chip, 가사 박스는 `phase === 'recording'` 렌더 블록에만 위치.

---

## 6. navigation/types.ts 변경

```typescript
// 기존
Record: { songKey: string; mode: 'humming' | 'shush' };

// 이미 mode 필드가 있으므로 변경 불필요
// RecordGuide에서 넘어올 때 이미 mode 전달됨 확인
```

impl/09에서 RecordGuide params에 songKey 추가하므로, RecordScreen으로 navigate 시에도 songKey가 정상 전달됨. types.ts의 `Record` 정의는 이미 `{ songKey: string; mode: 'humming' | 'shush' }` 포함 — 변경 불필요.

---

## 7. 애니메이션 명세 (UX-Flow S10)

| 요소 | 동작 | 구현 |
|---|---|---|
| BGM 시작 | volume ramp 0→30% 300ms | useBgmPlayer 내부 setInterval 30ms |
| BGM 정지 | volume ramp 30%→0 200ms | useBgmPlayer stopBgm 내부 |
| 가사 박스 등장 | fade-in 400ms (카운트다운 종료 시점) | LyricsBox Animated.Value |
| ⏹ pulse 링 | 빨간 pulse 1초 주기 | RecordScreen stopBtn Animated.loop |

---

## 8. 수용 기준

- [ ] 허밍 모드: 카운트다운 종료와 동시에 BGM 재생 시작 (volume ramp 0→30% 300ms)
- [ ] 허밍 모드: BGM 재생 중 가사 박스 노출 (fade-in 400ms)
- [ ] 허밍 모드: 녹음 종료(수동/자동) 시 BGM 즉시 정지 (volume ramp 30%→0 200ms)
- [ ] 허밍 모드: ✕ 취소 탭 → BGM 즉시 정지
- [ ] 허밍 모드: 다시 녹음 → 카운트다운 재시작 → 완료 후 BGM 처음부터 재생
- [ ] 쉬 모드: BGM 미재생, 가사 박스 미노출
- [ ] BGM 로드 실패 시: 상단 토스트 "음악 없이 녹음할게요" + BGM chip 미노출 + 가사 박스 유지
- [ ] 가사 미준비 fallback: songKey 미매핑 시 가사 박스 숨김 + "허밍해 주세요" 안내 + BGM chip 유지(정상 시)
- [ ] 카운트다운 단계: BGM/가사 박스/BGM chip 미노출
- [ ] iOS AudioMode: allowsRecording + playsInSilentMode 설정으로 동시 재생 가능

---

## 9. 주의사항

- `useBgmPlayer`의 `startBgm`은 async이므로 `startRecording` 내에서 `await startBgm()` 호출. 단, BGM 로드 실패가 녹음 시작을 블로킹하지 않도록 try-catch 내에서 처리 필요:
  ```typescript
  try {
    await startBgm()
  } catch {
    setShowBgmFailToast(true)
  }
  // 로드 실패 여부와 무관하게 녹음 진행
  ```
- presigned URL은 `useBgmPlayer` 내부에서 `songsApi.getPreviewUrl` 호출. S07에서 이미 preview URL을 한 번 요청했을 수 있으나, 두 번 요청은 허용 범위. 캐싱 최적화는 V2.
- expo-audio `createAudioPlayer`는 React 생명주기 외부에서 생성하므로 반드시 cleanup(`remove()`) 필요. useBgmPlayer 언마운트 effect에서 처리됨.
- `player.loop = true`가 expo-audio에서 지원되는지 실제 타입 정의 확인 필요. 미지원 시 `player.addListener('playbackStatusUpdate', ...)` + `isFinished` 감지 → `player.seekTo(0)` + `player.play()`로 대체.
- Android에서 `setAudioModeAsync({ allowsRecording: true })` 이후 BGM 재생이 정상 동작하는지 실기기 테스트 필요. Android AVD에서 마이크 시뮬레이션 제한이 있으므로 실기기 우선.
- `showBgmFailToast`는 3초 후 자동 숨김 처리 (`setTimeout` + `setShowBgmFailToast(false)`).
