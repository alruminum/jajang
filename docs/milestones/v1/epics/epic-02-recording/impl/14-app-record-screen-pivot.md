---
depth: std
design: required
---

# impl/14 — 앱: 녹음 화면 v1.3.1 피벗 (S10 단일흐름 + 1 loop 자동종료)

**Epic**: 02 — 목소리 녹음 & 품질 검증  
**커버 스토리**: Story 3 재정의 (S10 단일흐름 — 모드 분기 제거 + 1 loop 기준 자동 종료 + BGM 단일 흐름)  
**선행 조건**: impl/13 완료 (RecordGuide params 변경 완료, mode 파라미터 제거), impl/10 완료 (useBgmPlayer 훅), impl/11 완료 (bgmTracks.ts)  
**예상 소요**: 3~4시간

---

## 1. 생성/수정할 파일 목록

```
apps/mobile/src/
├── screens/
│   └── RecordScreen.tsx              [수정 — mode 분기 제거 + 1 loop 자동종료 로직]
├── hooks/
│   └── useBgmPlayer.ts               [수정 — enabled 조건 단순화 (항상 true)]
└── data/
    └── bgmTracks.ts                  [수정 — loopDurationMs 필드 추가 (1 loop 길이)]
```

---

## 2. 설계 결정

### 모드 분기 완전 제거

impl/10에서 `isHummingMode = mode === 'humming'`으로 BGM/가사 박스를 조건부 노출했으나, v1.3.1에서 모드 자체가 폐기됨. 모든 녹음이 BGM 30% + 가사 박스 단일 흐름. `useBgmPlayer({ enabled: true })`로 항상 활성화.

### 1 loop 자동 종료

PRD §F2: "1 loop 종료 시 자동 녹음 종료". 고정 60초 타이머 → 곡별 실제 재생 길이 기준으로 변경.

**구현 방식**: `bgmTracks.ts`에 `loopDurationMs` 필드 추가 (각 곡 전체 1회 재생 길이). RecordScreen에서 녹음 시작 시 `setTimeout(stopRecording, loopDurationMs)` 등록. BGM 재생 종료 이벤트(`onPlaybackStatusUpdate.isFinished`)도 보조 종료 트리거로 활용.

```typescript
// data/bgmTracks.ts 기존 필드에 추가
interface BgmTrack {
  titleKo: string
  titleEn: string
  loopDurationMs: number  // 곡 전체 1회 재생 길이 (ms) — engineer가 실제 음원 기준 측정 필요
}

// 초기값 (엔지니어가 실측 후 교체)
export const BGM_TRACKS: Record<string, BgmTrack> = {
  brahms:    { titleKo: '브람스 자장가',   titleEn: "Brahms' Lullaby",          loopDurationMs: 120000 }, // 2분 placeholder
  mozart:    { titleKo: '모차르트 자장가', titleEn: "Mozart's Lullaby",         loopDurationMs: 140000 },
  schubert:  { titleKo: '슈베르트 자장가', titleEn: "Schubert's Lullaby",       loopDurationMs: 130000 },
  twinkle:   { titleKo: '반짝반짝 작은 별', titleEn: "Twinkle Twinkle",         loopDurationMs: 90000  },
  rockabye:  { titleKo: '자장자장',        titleEn: "Rock-a-bye Baby",          loopDurationMs: 100000 },
  hush:      { titleKo: '아기 달래기',     titleEn: "Hush Little Baby",         loopDurationMs: 110000 },
}
```

> 주의: placeholder 값. engineer가 실제 CC0 음원 파일 기준 `ffprobe` 또는 재생 테스트로 실측 후 교체 필수.

### 최대 녹음 길이 상한

BGM 없이 `loopDurationMs`만으로 종료되면 BGM 로드 실패 시 무한 녹음 가능성. 상한 = `loopDurationMs + 10000` (10초 버퍼). BGM 로드 실패 + 10초 초과 시 강제 종료.

---

## 3. RecordScreen 수정 범위

### 제거 항목

```typescript
// 제거
const { songKey, mode } = route.params
const isHummingMode = mode === 'humming'

// 제거 (useBgmPlayer enabled 조건)
const { startBgm, stopBgm, ... } = useBgmPlayer({
  songKey,
  enabled: isHummingMode,   // ← 이 조건 제거
  ...
})
```

### 변경 후

```typescript
const { songKey } = route.params   // mode 없음

const { startBgm, stopBgm, isPlaying: bgmIsPlaying, loadFailed: bgmLoadFailed } = useBgmPlayer({
  songKey,
  enabled: true,            // 항상 활성 (단일 흐름)
  onLoadError: () => setShowBgmFailToast(true),
})
```

### BGM/가사 박스 조건부 렌더 단순화

```typescript
// 변경 전: isHummingMode 조건
{isHummingMode && !bgmLoadFailed && bgmIsPlaying && (
  <Text style={styles.bgmChip}>♬ {songTitle} · 30%</Text>
)}
{isHummingMode && (
  <LyricsBox songKey={songKey} mode="recording" />
)}

// 변경 후: 항상 렌더
{!bgmLoadFailed && bgmIsPlaying && (
  <Text style={styles.bgmChip}>♬ {songTitle} · 30%</Text>
)}
<LyricsBox songKey={songKey} mode="recording" />
```

### 1 loop 자동 종료 로직

```typescript
const loopDurationMs = BGM_TRACKS[songKey]?.loopDurationMs ?? 120000

// 녹음 시작 시 타이머 등록 (기존 60초 고정 타이머 교체)
const startRecording = async () => {
  // ... 기존 recorder.record() 호출
  setPhase('recording')
  await startBgm()

  // 1 loop 기준 자동 종료 타이머
  loopTimerRef.current = setTimeout(() => {
    handleAutoStop()   // BGM 정지 + 녹음 정지 + S11 이동
  }, loopDurationMs)
}

// BGM 재생 완료 이벤트도 보조 트리거 (BGM이 loop=false 설정 시)
// useBgmPlayer에 onPlaybackEnd 콜백 추가:
const { startBgm, stopBgm } = useBgmPlayer({
  songKey,
  enabled: true,
  onLoadError: () => setShowBgmFailToast(true),
  onPlaybackEnd: () => handleAutoStop(),   // BGM 1회 재생 완료
})

const handleAutoStop = async () => {
  clearTimeout(loopTimerRef.current)
  if (isHummingMode) await stopBgm()   // v1.3.1: 항상 stopBgm()
  await stopBgm()
  const uri = await cleanupRecording()
  if (uri) navigation.navigate('Preview', { recordingUri: uri, songKey })
}
```

> useBgmPlayer에 `onPlaybackEnd` 콜백 추가 필요. impl/10의 `loop=true` 설정을 `loop=false`로 변경 (1회 재생 후 종료).

---

## 4. useBgmPlayer 수정 (loop=false + onPlaybackEnd 콜백)

```typescript
// hooks/useBgmPlayer.ts 수정

interface UseBgmPlayerOptions {
  songKey: string
  enabled: boolean
  onLoadError?: () => void
  onPlaybackEnd?: () => void   // 신규: BGM 1회 재생 완료 콜백
}

// 내부: player.loop = false (기존 true → false)
// onPlaybackStatusUpdate 리스너에서 isFinished === true 시 onPlaybackEnd() 호출
```

---

## 5. 추가 녹음 유도 문구

PRD §F2: "더 많이 녹음할수록 더 풍성해집니다" 문구. S10 UI 상단 또는 BGM chip 하단에 표시.

```typescript
// 카운트다운 또는 녹음 완료 후 미리듣기 화면에서 노출 (S11은 impl/04 담당)
// S10 자체: 파형 아래 보조 텍스트
<Text style={styles.encourageText}>
  더 많이 녹음할수록 더 풍성해집니다
</Text>
```

---

## 6. Design Ref

`design: required` — S10 화면 레이아웃 변경 (모드 분기 UI 제거, BGM chip/가사 박스 항상 표시).

engineer는 design-handoff.md + Pencil frame 참조. S10 frame ID 확인 필요.

---

## 7. 수용 기준

- [ ] (TEST) RecordScreen route.params에 `mode` 필드 없음 (TypeScript 컴파일 오류 없음)
- [ ] (MANUAL) 카운트다운 종료 시 BGM 재생 시작 (항상, 모드 조건 없음)
- [ ] (MANUAL) 가사 박스 항상 표시 (모드 조건 없음)
- [ ] (MANUAL) BGM 1 loop 종료(곡 전체 재생 완료) → 녹음 자동 종료 + S11 이동
- [ ] (MANUAL) 수동 종료(⏹ 탭) → BGM 정지 + S11 이동
- [ ] (MANUAL) 다시 녹음 → BGM 정지 → 카운트다운 재시작 → BGM 처음부터 재생
- [ ] (TEST) BGM 로드 실패 시: 토스트 "음악 없이 녹음할게요" + 가사 박스 유지 + loopDurationMs 기준 자동 종료
- [ ] (TEST) `bgmTracks.ts`에 `loopDurationMs` 필드 존재 확인 (6곡 모두)
- [ ] (MANUAL) 쉬 모드 분기 관련 코드 없음 (`grep -r "shush\|isHummingMode" src/screens/RecordScreen.tsx` → 0)

---

## 8. 주의사항

- `loopDurationMs` placeholder 값은 **engineer가 실측 후 반드시 교체** 필요. 측정 방법: `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 {파일}` 또는 재생 타이머 실측.
- `useBgmPlayer`의 `loop` 속성 변경(true → false)이 impl/10 구현과 충돌. impl/10은 허밍 모드 전용으로 `loop=true`였으나, 1 loop 종료 감지를 위해 `loop=false`로 변경 필요. 기존 테스트 회귀 확인 필수.
- 기존 `S10RecordScreen.test.tsx`에 `mode='humming'/'shush'` 테스트가 있으면 단일 흐름으로 수정 (depth=std, DOM assertion 변경으로 simple 불가).
- BGM 로드 실패 시 `loopDurationMs` 타이머는 정상 동작해야 함. BGM 없이도 1 loop 시간 후 자동 종료.
- `stopBgm` 중복 호출(onPlaybackEnd + handleAutoStop) 방지: `isStoppingRef.current` 플래그로 중복 실행 가드.
