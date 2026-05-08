---
depth: simple
design: required
related_issue: 225
related_story: epic-02 / Story 3 (S10 v1.3.1)
predecessor: 14-app-record-screen-pivot.md (logic) — 본 task = visual layer
---

# 15 · S10 RecordScreen — variant-C 시각 정제 (issue #225)

## 1. 컨텍스트

PR #227 (impl/14) 이 v1.3.1 단일흐름 *logic* 까지만 land 했고, design-handoff 의 "Selected Variant: C" *visual* 4 항목은 미반영 상태. issue #225 는 그 4 항목을 시각만 맞추는 시각-only 후속 task.

대상 파일: `apps/mobile/src/screens/RecordScreen.tsx` (1 파일, recording-phase JSX + StyleSheet 한정).

logic / state machine / BGM / 자동종료 / cleanup / 카운트다운은 일체 *변경 금지* — 이미 검증된 흐름. 본 task 는 (a) 타이머 fontSize, (b) 헤더에 "녹음 중" 라벨 추가, (c) 정지 버튼 outline ring 중첩 구조, (d) encourage 텍스트 색 토큰 교체 — 이 4 항목만.

## 2. 결정 근거

### 2.1 타이머 28px — 인라인 override 채택 (토큰 추가 X)

옵션 비교:

| 안 | 변경 | 영향 |
|---|---|---|
| (a) 인라인 `[Typography.timerMono, { fontSize: 28 }]` | 1 줄 (RecordScreen) | 0 spillover |
| (b) `Typography.timerMonoLg` 신규 토큰 | typography.ts + getTypography + 본 화면 | typography.ts 의 `getTypography` 도 동기화해야 함, 다른 화면에 unused 토큰 |

**채택: (a)**. 근거 — `FontSize.xxl = 28` 이 *이미* 토큰에 있어 hex/literal 28 직접 사용이 아닌 `FontSize.xxl` 참조로 토큰 정합성 확보 가능. variant-C 외에 28px timer 사용처 없음 (one-off). 디자인 토큰 인플레이션 회피.

스니펫:
```tsx
import { FontSize } from '../theme/tokens';
// …
timer: { ...Typography.timerMono, fontSize: FontSize.xxl, lineHeight: FontSize.xxl * 1.2 },
```

`lineHeight` 도 비례 조정 (`FontSize.xl * 1.2 = 26.4` → `FontSize.xxl * 1.2 = 33.6`) — 안 하면 28px 글자가 22px lineHeight 박스에 잘림.

### 2.2 "녹음 중" 라벨 — topBar 가운데 슬롯, textSecondary 컬러

design-handoff 본문에 라벨 위치/색/폰트 *정확한* 명시는 없음. 하지만 유추 근거:

- variant-C 의도 = "녹음 중" 상태가 timer 와 cancel 만으론 불충분하다는 것 → 헤더 노출. 가운데가 자연스러움.
- v1.2.1 디자인 토큰 표 (handoff §Design Tokens) `color-text-secondary = #7B80A0` = "취소, BGM 인디케이터, hint" 용도 — 라벨도 보조 정보 → secondary 적합.
- `font-heading = DM Sans` (취소·타이머·칩 와 동일) → DM Sans → `Typography.h3` 또는 `caption` 후보. `caption` 은 14px Noto Sans (한글 최적), 헤더 정보용으로 적합.

**채택**: textSecondary + caption (NotoSansKR 14px) — 한글 텍스트라 NotoSansKR 가 정합. design-handoff §Design Tokens 의 "font-body Noto Sans KR" 가 hint·가사·라벨 한글 전반 담당.

`topBar` 레이아웃을 `space-between` (2-슬롯) → 3-슬롯 `space-between` 으로 변경. 좌=취소, 중앙=라벨, 우=타이머. 라벨 슬롯은 자체 `flex: 1, textAlign: 'center'` 로 가운데 정렬.

대안 (배척): "녹음 중" 을 timer 위에 별도 행으로 추가 — 헤더 높이 증가, 가사박스 영역 침범. variant-C 인텐션은 in-header 표시.

### 2.3 정지 버튼 outline ring — Pressable + 외부 ring View + 내부 solid View

handoff: "외부 96dp + 내부 72dp". 옵션:

| 안 | 구조 | 단점 |
|---|---|---|
| (a) `borderWidth + padding` | 1 Pressable | borderWidth 가 hit-area 안쪽 — 정지 아이콘 정렬 어긋남 |
| (b) Pressable(96, 투명, border) + 안에 inner View(72, solid) | 중첩 2 View | 단순, hit-area = 96dp ring 전체 |

**채택: (b)**. ring stroke = 2dp 추정 (디자인 시안 표준). hit-area 가 96dp 전체로 커지므로 접근성 +. 내부 solid 72 는 기존 `stopBtn` 스타일 유지. 정지 사각 아이콘 `stopIcon` 도 그대로 inner 안에 박힘.

스니펫:
```tsx
<Pressable
  onPress={handleStopPress}
  accessibilityLabel="녹음 중지"
  testID="stop-recording-button"
  style={styles.stopRing}
>
  <View style={styles.stopBtn}>
    <View style={styles.stopIcon} />
  </View>
</Pressable>
```

```ts
stopRing: {
  width: 96, height: 96, borderRadius: 48,
  borderWidth: 2,
  borderColor: '#FF4444',  // = stopBtn 배경과 동색 — variant-C ring 톤
  justifyContent: 'center', alignItems: 'center',
},
stopBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#FF4444', justifyContent: 'center', alignItems: 'center' },
```

> Note: 현재 코드의 `#FF4444` 는 `darkColors.destructive = '#E85A5A'` 와 다른 hex. 이는 *기존 drift* 이며 본 task 범위 밖. 회귀 방지 위해 *그대로 유지*. 별건 cleanup 이슈로 분리 권장 (주의사항 §6.2).

회귀 가능성: `bottomRow` 의 `restartBtn` (좌, 80dp) + 정지 (중앙 96dp) + spacer (우, 80dp) 의 `space-between` 정렬에서 외부 96dp 가 80dp 보다 커져 상하 alignment 살짝 달라짐. `alignItems: 'center'` 가 이미 있어 수직 중앙 OK. 가로는 spacer 양쪽 80dp 균형 유지로 정중앙. 시각적 무영향.

### 2.4 encourage text accent 색 — `accentSecondary` (#C49A8A) 토큰

handoff §"v1.3.1 핵심 변경" 의 "encourage text … (accent 색, … variant-C visual)" → "accent 색" 의 후보:

- `accentPrimary = #5A7AA8` (slate blue) → cool, hint·waveform 용
- `accentSecondary = #C49A8A` (dusty rose / warm) → 격려·따뜻 톤

handoff §"Notes for Engineer (v1.3.1)" 에 "waveform accent: 코드 SSOT `#5A7AA8`" 가 *waveform 한정*임을 명시 → encourage 는 **waveform 과 다른 accent** 의도 → `accentSecondary` 가 합리적 (warm, 격려). 디자인 의도 ("더 풍성") 와 톤 일치.

대안 (배척): hex 직접 (`'#C49A8A'`) — 토큰 우회, drift 위험.

스니펫:
```tsx
import { darkColors } from '../theme/tokens';
// …
encourageText: { color: darkColors.accentSecondary, fontSize: 13, textAlign: 'center', marginTop: 8, marginBottom: 8 },
```

> 본 화면이 다른 직접 hex (`#0D0F1A`, `#7B80A0`, `#FF4444`) 를 *이미* 인라인으로 가지고 있음 — 본 task 는 *변경되는 4 줄만* 토큰화, 기존 drift 는 grand sweep 별건 (§6.2).

## 3. 도메인 모델 정합

`docs/domain-model.md` 미존재 (확인됨 — `Glob docs/domain-model.md` 결과 없음). 본 화면은 entity / aggregate 가 아닌 *presentation layer* — 도메인 객체 (`Recording`, `Song`) 는 store / hooks 경유. 본 task 는 시각 토큰만 → 도메인 정합 N/A.

## 4. 모듈 = 테스트 단위 정합 (self-check)

1. **테스트 단위 정합**: ✓
   - 입력 = phase='recording' + props (route.params.songKey) + state(elapsedSec)
   - 출력 = 4 항목 시각 (DOM 쿼리 + 스타일 prop 검증)
   - 의존 mock = `useBgmPlayer`, `LyricsBox`, `expo-audio`, `@react-navigation/native` (이미 `S10RecordScreen.bgm.test.tsx` 패턴 확립)

2. **의존성 묶음 정합**: ✓ — 새 import 1 개 (`darkColors`, `FontSize`). theme 모듈만 의존 추가, 다른 화면/훅 영향 0.

3. **테스트 가능성**: ✓ — 4 항목 모두 RTL `getByText` / `getByTestId` + style assertion 으로 검증 가능. 분할 불요 (시각 4 항목 = 1 파일 1 PR 단위가 최소 응집).

## 5. 인터페이스

추가/변경 import:
```tsx
import { darkColors, FontSize } from '../theme/tokens';
```

JSX 변경 (recording phase 만 — countdown phase 무변경):

```tsx
// (변경 전) topBar
<View style={styles.topBar}>
  <Pressable onPress={handleCancel} …>✕ 취소</Pressable>
  <Text style={styles.timer}>{formatTime(elapsedSec)}</Text>
</View>

// (변경 후) 3-슬롯
<View style={styles.topBar}>
  <Pressable onPress={handleCancel} accessibilityLabel="녹음 취소" testID="cancel-recording-button">
    <Text style={styles.cancelText}>✕ 취소</Text>
  </Pressable>
  <Text style={styles.recordingStatusLabel} testID="recording-status-label">녹음 중</Text>
  <Text style={styles.timer} testID="recording-timer">{formatTime(elapsedSec)}</Text>
</View>
```

```tsx
// (변경 전) 정지 단일 Pressable
<Pressable style={styles.stopBtn} …><View style={styles.stopIcon} /></Pressable>

// (변경 후) outline ring 중첩
<Pressable
  onPress={handleStopPress}
  accessibilityLabel="녹음 중지"
  testID="stop-recording-button"
  style={styles.stopRing}
>
  <View style={styles.stopBtn} pointerEvents="none">
    <View style={styles.stopIcon} />
  </View>
</Pressable>
```

StyleSheet 변경 (diff 단위):

```ts
// 변경
topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 20, paddingBottom: 12 },
timer: { ...Typography.timerMono, fontSize: FontSize.xxl, lineHeight: FontSize.xxl * 1.2 },
encourageText: { color: darkColors.accentSecondary, fontSize: 13, textAlign: 'center', marginTop: 8, marginBottom: 8 },
// 추가
recordingStatusLabel: { color: darkColors.textSecondary, fontSize: 14, fontFamily: 'NotoSansKR_400Regular', textAlign: 'center' },
stopRing: { width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderColor: '#FF4444', justifyContent: 'center', alignItems: 'center' },
// 무변경 (그대로)
stopBtn, stopIcon, bottomRow, restartBtn, restartText, spacer, …
```

### testID 신규
- `recording-status-label` — "녹음 중" 라벨 검증
- `recording-timer` — 28px fontSize 검증

기존 testID (`cancel-recording-button`, `stop-recording-button`, `restart-recording-button`) 는 *유지* — 기존 테스트 (`S10RecordScreen.bgm.test.tsx`) 회귀 방지.

## 6. 주의사항

### 6.1 logic / state 변경 금지

본 task 범위 = JSX 마크업 + StyleSheet 만. 아래는 *건드리지 마라*:
- `useState`, `useRef`, `useEffect`, `useCallback` 6 종 1 자도 변경 X
- `useBgmPlayer`, `useAudioRecorder` 호출 X
- `handleCancel`, `handleStopPress`, `handleAutoStop`, `restartRecording`, `startRecording`, `stopAndNavigate`, `cleanupRecording` 시그니처/본문 X
- `loopDurationMs` 계산, `BGM_TRACKS` 룩업 X
- `phase === 'countdown'` 분기 X — 카운트다운 화면 무변경

### 6.2 기존 hex drift 는 별건 — 본 task 에서 cleanup 금지

현재 RecordScreen 에 인라인 hex 다수 (`#0D0F1A`, `#7B80A0`, `#FF4444`, `#A9B0D0`, `#E0B070`, `#5A8A6A`, `#5A7AA8`). 본 task 는 *변경되는 styles entry* 만 토큰화 (encourageText). 다른 항목 grand sweep 은 별건 SPEC_ISSUE 로 분리 (issue #225 본문 외) — scope creep 회피.

### 6.3 DB 영향도

영향 없음 — UI 시각 변경 1 파일. 마이그레이션 / 테이블 / 컬럼 / 인덱스 무관.

### 6.4 Breaking Change

영향받는 파일: 없음.
- testID 추가만 (기존 X). 기존 4 testID 유지.
- export 시그니처 무변경 (`export function RecordScreen()`).
- props/route.params 무변경.
- import 추가 2 개 (`darkColors`, `FontSize`) — theme 배럴 export 에 이미 포함 (확인됨).

### 6.5 회귀 가능성

| 영역 | 회귀 검증 |
|---|---|
| `S10RecordScreen.bgm.test.tsx` 기존 패스 | 4 변경은 모두 *추가/스타일* — getByTestId('cancel-recording-button'), ('stop-recording-button'), getByText(/음악 없이/), LyricsBox mock render 어셔션 영향 X |
| 카운트다운 화면 | 변경 0 |
| 다시 시작 버튼 정렬 | bottomRow `space-between` + alignItems: 'center' 유지 → 수직 중앙 OK |
| stopRing 의 hit-area 96dp | accessibilityLabel + testID 가 outer Pressable 에 — A11y 무영향, hit-area 확장 |
| cancel + timer 좌우 위치 | 3-슬롯 `space-between` 에서 좌·우 끝, 가운데 라벨 → cancel/timer 위치 동일 |
| RTL/LTR | 한글 라벨 단일행, flexDirection: 'row' 그대로 |

### 6.6 폰트 family 검증

`NotoSansKR_400Regular` = `FontFamily.notoSansKR` 토큰값 (tokens.ts L77 확인). 폰트 미로딩 시 system fallback. `Typography.caption` 을 그대로 spread 해도 되나, caption 은 `FontSize.sm = 14` + `letterSpacing: 0.2` 포함 — 라벨용으로 적합. **2 안 비교**:

| 안 | 코드 |
|---|---|
| (a) 직접 fontFamily | `recordingStatusLabel: { color: …, fontSize: 14, fontFamily: FontFamily.notoSansKR, textAlign: 'center' }` |
| (b) caption spread | `recordingStatusLabel: { ...Typography.caption, textAlign: 'center' }` |

**채택: (b)** — Typography 토큰 활용, fontSize/lineHeight/letterSpacing 자동 정합. color 도 textSecondary 가 caption 디폴트 → 매칭.

스니펫 (확정):
```ts
recordingStatusLabel: { ...Typography.caption, textAlign: 'center' },
```

(import 에 `FontFamily` 불필요 — Typography.caption 이 이미 NotoSansKR 매핑.)

## 7. 핵심 로직

State machine / 데이터 흐름 변경 0. 시각 4 항목 패치만:

```
recording phase JSX render
  ├─ topBar: [cancel | "녹음 중" caption | timer 28px]
  ├─ bgmFailToast / bgmChip / LyricsBox / encourageText (accentSecondary) — 그대로
  ├─ waveformContainer — 그대로
  ├─ silenceWarning — 그대로
  └─ bottomRow: [restartBtn | stopRing(96, ring) > stopBtn(72, solid) > stopIcon | spacer]
```

의사코드 X — 전부 선언적 JSX 패치. §5 인터페이스 스니펫이 곧 구현.

## 8. 생성/수정 파일

| 경로 | 종류 | 비고 |
|---|---|---|
| `apps/mobile/src/screens/RecordScreen.tsx` | 수정 | JSX recording-phase + StyleSheet 4 항목 |
| `apps/mobile/src/__tests__/screens/S10RecordScreen.variantC.test.tsx` | 신규 (TEST) | variant-C 시각 4 항목 검증, 기존 `.bgm.test.tsx` 와 직교 |

테스트 파일 분리 근거: 기존 `.bgm.test.tsx` 는 BGM 통합 / 토스트 / 가사박스 등 *logic* 검증. 본 task = visual 정제 → 새 파일이 의도 분리 명확. mock 설정 (useBgmPlayer / LyricsBox / expo-audio / navigation) 은 동일하므로 기존 파일에서 mock 패턴 복사.

## 9. 수용 기준

| ID | 내용 | 검증 | 통과 조건 |
|---|---|---|---|
| REQ-001 | recording phase 진입 후 헤더에 "녹음 중" 라벨 노출 | (TEST) | `getByTestId('recording-status-label')` truthy + textContent === '녹음 중' |
| REQ-002 | "녹음 중" 라벨 색상 = `darkColors.textSecondary` (`#7B80A0`) | (TEST) | flatten된 style.color === '#7B80A0' |
| REQ-003 | "녹음 중" 라벨이 carriage 가운데 — topBar 가 3 children 포함 (cancel / label / timer) | (TEST) | render 후 cancel / label / timer 모두 presence + topBar children length 검증 (구조 변화) |
| REQ-004 | 타이머 fontSize 28 (`FontSize.xxl`) | (TEST) | `getByTestId('recording-timer')` style.fontSize === 28 |
| REQ-005 | 타이머 lineHeight 비례 (28 * 1.2 = 33.6) | (TEST) | style.lineHeight ≈ 33.6 (toBeCloseTo) |
| REQ-006 | 정지 버튼 외부 ring 96×96, borderWidth 2, borderRadius 48 | (TEST) | `getByTestId('stop-recording-button')` style.width/height === 96, borderWidth === 2, borderRadius === 48 |
| REQ-007 | 정지 버튼 ring 내부 solid 72×72 보존 | (TEST) | ring 의 first child View width/height === 72 (testID 추가 불필요 — children[0] 접근 또는 추가 testID `stop-button-inner` 부여 가능) |
| REQ-008 | encourage text 색상 = `darkColors.accentSecondary` (`#C49A8A`) | (TEST) | `getByText('더 많이 녹음할수록 더 풍성해집니다')` style.color === '#C49A8A' |
| REQ-009 | testID `cancel-recording-button` / `stop-recording-button` / `restart-recording-button` 회귀 보존 | (TEST) | 3 testID 모두 `getByTestId` 통과 |
| REQ-010 | 카운트다운 phase 시각 무변경 회귀 | (TEST) | phase='countdown' 시 cancelBtn + countdownNumber + countdownLabel 만 — recording-status-label 미존재 |
| REQ-011 | 직접 색·폰트·간격 리터럴 신규 추가 0 — 본 task 변경 영역 (timer / encourageText / recordingStatusLabel / stopRing) 에서 신규 hex/px 리터럴 0 (`stopRing.borderColor` `#FF4444` 는 기존 stopBtn 색 재사용 = drift 보존, §6.2) | (TEST) | RecordScreen.tsx 내 변경 4 styles entry 의 color/fontFamily 가 토큰 참조 (`darkColors.*`, `Typography.*`, `FontSize.*`) 임을 grep 로 확인 |

> REQ-007 은 children 접근으로도 가능하나 testID `stop-button-inner` 를 inner View 에 추가하면 안정. 추가 testID 1 개 부여 권장.

## 10. 선행 의존성

- impl/14 (PR #227) merge 완료 — *이미 base 에 land 됨* (8d125f9 커밋 이후). ✓
- 디자인 토큰 (`darkColors`, `FontSize.xxl`, `Typography.caption`) — 이미 존재. ✓
- jest-expo 설정 — epic-08 완료, `S10RecordScreen.bgm.test.tsx` 가 통과 중. ✓

## 11. 의존성 (디자인 토큰)

`docs/design.md` 의 components 섹션이 본 화면 컴포넌트를 *현재 명시 X* (확인 필요 시 별건). 다만 본 task 는 *기존* 화면 visual refinement → **theme 토큰 의존성** 명시:

- `src/theme/typography.ts` — `Typography.timerMono`, `Typography.caption`
- `src/theme/tokens.ts` — `darkColors.textSecondary`, `darkColors.accentSecondary`, `FontSize.xxl`

본 task 변경 4 styles entry 에서 색·폰트·간격은 토큰 참조만 사용 — REQ-011 로 강제.

## 12. 결론

READY_FOR_IMPL

MODULE_PLAN_READY
