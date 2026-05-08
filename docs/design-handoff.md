# Design Handoff

---

## S10 녹음 화면 — v1.3.1 (Issue #222)

### Issue: #222
### Selected Variant: C (THREE_WAY)
### Target: S10 v1.3.1 — 단일흐름 (모드 분기 완전 제거, 1 loop 자동종료)

### Pencil Frame IDs:
| 상태 | Frame ID | 프레임명 |
|---|---|---|
| 카운트다운 | `llTp1` | S10 v1.2.1 — 카운트다운 (유지) |
| 녹음중 (단일흐름) | `2zWry` | S10 v1.3.1 — variant-C 녹음중 |
| fallback·BGM실패 | `AxV5Q` | S10 v1.2.1 — fallback·BGM실패 (유지) |
| fallback·가사없음 | `23JX3` | S10 v1.2.1 — fallback·가사없음 (유지) |

> **폐기**: `glazr` (쉬·녹음중), `O8tTG` (허밍·30초충족) — v1.3.1 에서 해당 상태 없음

### v1.3.1 핵심 변경 (v1.2.1 대비)
- 쉬/허밍 모드 분기 완전 제거 → 단일 흐름
- BGM chip + 가사박스 항상 표시 (조건부 렌더 없음)
- "30초 채워주세요" hint 제거 → encourage text "더 많이 녹음할수록 더 풍성해집니다" (accent 색, 가사박스 인라인 변형 — variant-C visual)
- 타이머: elapsed 단독 (`00:18`, `/MM:SS` 상한 표시 제거)
- "녹음 중" 상태 라벨 헤더에 추가 (variant-C visual)
- 정지버튼: 아웃링(outline ring) 스타일 — 외부 96dp + 내부 72dp (variant-C visual)
- 1 loop 자동종료: `bgmTracks.ts`의 `loopDurationMs` 기준
- production navigator 정리: `S10RecordScreen.tsx` (impl/10 BGM 미반영 dead 파일) 삭제, `RecordScreen.tsx` 로 wire-up

### Notes for Engineer (v1.3.1 추가)
- `isHummingMode` 완전 제거 — `useBgmPlayer({ enabled: true })`
- `loopDurationMs = BGM_TRACKS[songKey]?.loopDurationMs ?? 120000` — setTimeout 기준 자동종료
- `isStoppingRef` 중복 stop 가드 필수 (onPlaybackEnd + loopTimer 동시 트리거 방지)
- expo-audio: `player.loop = false`, `addListener('playbackStatusUpdate')` 로 isFinished 감지
- waveform accent: 코드 SSOT `#5A7AA8` 사용 (Pencil 프레임의 `#82B090` 은 drift — 무시)
- 타이머 사이즈: variant-C 28px (`Typography.timerMono` 의 `FontSize.xl=22` 으로는 부족 — variant-C 적용 시 inline override 또는 토큰 추가)

---

## S10 녹음 화면 — v1.2.1 (Issue #133)

### Issue: #133
### Selected Variant: A (SCREEN_ONE_WAY)
### Target: S10 녹음 화면 — 허밍 모드 BGM 30% + 가사 박스 추가, 6개 상태 완성
### Pencil Frame IDs:
| 상태 | Frame ID | 프레임명 |
|---|---|---|
| 카운트다운 | `llTp1` | S10 v1.2.1 — 카운트다운 |
| 허밍·녹음중(미달) | `r97aM` | S10 v1.2.1 — 허밍·녹음중(미달) |
| 쉬·녹음중 | `glazr` | S10 v1.2.1 — 쉬·녹음중 |
| 허밍·30초충족 | `O8tTG` | S10 v1.2.1 — 허밍·30초충족 |
| fallback·BGM실패 | `AxV5Q` | S10 v1.2.1 — fallback·BGM실패 |
| fallback·가사없음 | `23JX3` | S10 v1.2.1 — fallback·가사없음 |

### 스크린샷 경로
- `/Users/dc.kim/project/jajang/docs/llTp1.png` — 카운트다운
- `/Users/dc.kim/project/jajang/docs/r97aM.png` — 허밍 녹음중(미달)
- `/Users/dc.kim/project/jajang/docs/glazr.png` — 쉬 모드 녹음중
- `/Users/dc.kim/project/jajang/docs/O8tTG.png` — 허밍 30초 충족
- `/Users/dc.kim/project/jajang/docs/AxV5Q.png` — fallback BGM 실패
- `/Users/dc.kim/project/jajang/docs/23JX3.png` — fallback 가사 없음

---

### Design Tokens

| 토큰 | 값 | CSS 변수 | 용도 |
|---|---|---|---|
| color-bg-primary | `#0D0F1A` | `--color-bg-primary` | 화면 배경 |
| color-surface-1 | `#1A1D30` | `--color-surface-1` | 칩/카드 배경 |
| color-surface-2 | `#21253E` | `--color-surface-2` | 토스트 배경 |
| color-accent-sage | `#82B090` | `--color-accent-sage` | BGM 인디케이터, 카운트다운 숫자, 허밍 waveform 바 색상 |
| color-text-primary | `#EEF0F8` | `--color-text-primary` | 타이머 텍스트 |
| color-text-secondary | `#7B80A0` | `--color-text-secondary` | 취소, BGM 인디케이터, hint |
| color-error | `#E85A5A` | `--color-error` | 정지 버튼 |
| font-heading | `DM Sans` | `--font-heading` | 취소, 타이머, 칩, 카운트다운 숫자 |
| font-body | `Noto Sans KR` | `--font-body` | 가사, hint 텍스트 |
| font-mono | `DM Mono` | `--font-mono` | 타임코드 (00:18 / 01:00) |

---

### 6개 상태별 컴포넌트 구조

#### 1. 카운트다운 (Frame: llTp1)
```
Screen (390×844, bg: #0D0F1A)
└─ Header Row (horizontal, space-between)
   └─ 카운트다운 숫자 "3" (DM Sans 80px, #82B090, center)
      (취소 버튼 없음 — 카운트다운 중 취소 불가)
```
- 카운트다운 중 BGM·가사 박스 미노출
- 3→2→1 숫자 변경 (scale-down + fade 1s per digit)

#### 2. 허밍 녹음중 (미달, Frame: r97aM)
```
Screen (390×844, bg: #0D0F1A)
└─ Content (vertical, padding: 16 24 48 24)
   ├─ Header (horizontal, space-between)
   │   ├─ "✕ 취소" (DM Sans 15px, secondary)
   │   ├─ "00:18 / 01:00" (DM Mono 15px, primary)
   │   └─ 생성횟수 칩 (surface-1, r-12, 6/10 padding)
   ├─ [Spacer fill]
   ├─ Waveform Area (horizontal, center, height:120)
   │   └─ 15개 바 (width:4, gap:3, fill: #82B090, 각기 opacity·height 다름)
   ├─ BGM + Hint Row
   │   └─ "♬ 브람스 자장가 · 30%  |  30초 채워주세요"
   │       (Noto Sans KR 13px, secondary, center)
   └─ Stop Button Row (center, padding-top: 24)
       └─ 정지 버튼 (w:72 h:72, r:36, #E85A5A, outer shadow #E85A5A66 blur:20)
```

**가사 박스 구현 (엔지니어 담당 — 디자인 스펙)**:
- 위치: Spacer 영역 내 상단 배치 (waveform 바로 위)
- 스타일: `background: #1A1D30, borderRadius: 16, padding: 16px 20px`
- 폰트: `Noto Sans KR 15px, lineHeight: 1.6`
- 색상: 현재 라인 `#EEF0F8`, 이전/이후 라인 `#7B80A0`
- 진입 애니메이션: `opacity 0→1, duration 400ms, easing ease-out` (카운트다운 종료 시점)

**BGM 인디케이터 구현**:
- 텍스트: `♬ {곡명} · 30%` (서브텍스트 영역)
- 색상: `#82B090` (세이지, 음악 상태 표시)
- 음소거 토글 없음

#### 3. 쉬 모드 녹음중 (Frame: glazr)
```
Screen (390×844, bg: #0D0F1A)
└─ Content (vertical, padding: 16 24 48 24)
   ├─ Header (✕취소 · 00:32/01:00 · 생성칩)
   ├─ [Spacer fill]
   ├─ Waveform Area (accent-primary 색상 바 15개)
   ├─ "30초 채워주세요" (secondary, 14px, center)
   └─ Stop Button
```
- BGM 없음, 가사 박스 없음 (기존 동작 유지)

#### 4. 허밍 30초 충족 (Frame: O8tTG)
```
동일 구조, 차이점:
- 타이머: "00:35 / 01:00"
- Waveform 바: #82B090
- hint 영역: "♬ 브람스 자장가 · 30%" (안내 텍스트 없음)
- 정지 버튼: 강한 이중 outer shadow
  - shadow 1: blur:24 spread:4 color:#E85A5A88
  - shadow 2: blur:8 spread:0 color:#E85A5A44
```
- 30초 달성 시 정지 버튼 brief pulse 1회 → CSS: `@keyframes stopPulse { 0%{box-shadow:0 0 0 0 #E85A5A88} 100%{box-shadow:0 0 20px 8px transparent} }`

#### 5. Fallback — BGM 로드 실패 (Frame: AxV5Q)
```
동일 구조, 차이점:
- 타이머: "00:12 / 01:00"
- Waveform 바: #82B090 (가사 박스와 함께 유지)
- hint 영역: "⚠ 음악 없이 녹음할게요  |  30초 채워주세요" (secondary, 13px)
- BGM 인디케이터 없음 (chip 그대로 유지)
```
- 토스트 위치: 화면 상단 `position:absolute, top:96px`에 별도 토스트 컴포넌트 사용 가능
- 가사 박스는 정상 표시 (BGM 실패와 무관)

#### 6. Fallback — 가사 미준비 (Frame: 23JX3)
```
동일 구조, 차이점:
- 타이머: "00:14 / 01:00"
- 생성칩 영역: "가사 없음" 레이블 (secondary, 작은 폰트)
- Waveform 바: #82B090
- hint 영역: "♬ 브람스 자장가 · 30%  |  허밍해 주세요" (secondary, 13px)
- 가사 박스 미노출 (조건: 가사 자산 없음)
```

---

### Animation Spec

| 요소 | 트리거 | 스펙 | CSS |
|---|---|---|---|
| 카운트다운 숫자 | 1초마다 교체 | scale(1)→scale(0.8) + opacity 1→0, 0.6s | `transform: scale(0.8); opacity: 0; transition: all 0.6s ease-in` |
| BGM volume ramp (시작) | 카운트다운 0 도달 | 0%→30%, 300ms | Web Audio API `gainNode.linearRampToValueAtTime(0.3, now + 0.3)` |
| BGM volume ramp (종료) | 녹음 종료/취소 | 30%→0%, 200ms | `gainNode.linearRampToValueAtTime(0, now + 0.2)` |
| 가사 박스 등장 | 카운트다운 0 도달 | opacity 0→1, 400ms ease-out | `animation: lyricsIn 400ms ease-out forwards` |
| 실시간 파형 바 | 녹음 중 매 프레임 | 바 높이 음량에 비례 | `height: ${amplitude}px; transition: height 50ms linear` |
| 정지 버튼 pulse (30초 달성) | 30초 시점 1회 | 1회 pulse 링 | `animation: stopPulse 0.8s ease-out 1` |
| 정지 버튼 ongoing pulse (녹음중) | 녹음 중 | 1초 주기 반복 | `animation: recordingPulse 1s ease-in-out infinite` |

```css
@keyframes lyricsIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes stopPulse {
  0%   { box-shadow: 0 0 0 0 rgba(232, 90, 90, 0.5); }
  100% { box-shadow: 0 0 0 16px rgba(232, 90, 90, 0); }
}

@keyframes recordingPulse {
  0%, 100% { box-shadow: 0 0 20px 0 rgba(232, 90, 90, 0.4); }
  50%       { box-shadow: 0 0 30px 8px rgba(232, 90, 90, 0.7); }
}
```

---

### Notes for Engineer

1. **BGM 재생 제어**
   - BGM은 허밍 모드 전용. `recordingMode === 'humming'` 조건 확인
   - 카운트다운(3→0) 동안 BGM 미재생, 카운트 0 도달 시 `linearRampToValueAtTime(0.3, ...)` 로 볼륨 램프
   - 녹음 종료(자동/수동) 또는 취소 시 `linearRampToValueAtTime(0, now + 0.2)` 후 `audio.pause()`
   - 다시 녹음 버튼: BGM 동일 곡 처음부터 재생 (`audio.currentTime = 0`)
   - BGM 로드 실패(오류/타임아웃) 시: 토스트 "음악 없이 녹음할게요" 표시 후 BGM 없이 진행

2. **가사 박스 렌더링**
   - 가사 자산은 선택된 곡에 1:1 매핑 (곡별 한국어 1절 가사 JSON)
   - 가사 자산 없음 상태(`lyricsReady === false`): 박스 미노출, "허밍해 주세요" 안내만
   - 현재 라인 하이라이트: `color: #EEF0F8`, 이전/이후: `color: #7B80A0`
   - 박스 진입: `opacity: 0` → `opacity: 1`, `duration: 400ms`, BGM ramp와 동시 시작
   - 박스 높이: 가사 줄 수에 따라 동적 (4~6줄, lineHeight: 1.6)

3. **BGM 로드 실패 Edge Case 처리**
   - BGM URL 요청 타임아웃: 3초 기준
   - 실패 시 상태: `bgmFailed = true` → BGM chip UI 숨김, 토스트 노출, 가사 박스는 유지
   - 토스트 위치: 헤더 바로 아래, 스타일: `background: #21253E, borderRadius: 12, padding: 12px 16px`
   - 경고 아이콘: ⚠ (유니코드), color: `#E8BF6A`

4. **상태 전환 시 정리**
   - 취소 탭 → BGM 즉시 정지(ramp 200ms) → 취소 확인 팝업 → S08 이동
   - 30초 미만 종료 시도 → BGM 즉시 정지 → 다이얼로그 → 이어서 선택 시 BGM 재시작(동일 곡 position 유지 vs 처음부터, UX flow 기준 "처음부터")
   - 자동 종료(60초) → BGM 200ms fade-out → S11 이동

5. **기존 코드 충돌 주의**
   - 기존 `RecordingScreen`의 waveform 렌더링 로직 그대로 유지
   - `recordingMode` prop을 새로 받거나 Context에서 read
   - BGM 오디오 인스턴스는 `RecordingScreen` unmount 시 반드시 cleanup (`audio.pause(); audio.src = ''`)
   - 가사 데이터는 `S09`에서 preload 후 prop으로 전달 추천 (S10 진입 시 로딩 없이 즉시 표시)
