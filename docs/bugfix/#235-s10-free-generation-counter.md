---
depth: simple
issue: 235
type: FUNCTIONAL_BUG
labels: [bug, v01, epic-02]
related: [219]
---

# S10 RecordScreen — 무료 N/3 counter chip 추가

## 컨텍스트

Epic 02 Story 3 (S10 녹음 화면) 의 무료 사용자 잔여 생성 횟수 표시 (`testID="free-generation-counter"`) 가 RecordGuideScreen (S09, issue #219 에서 적용 완료) 에만 있고 RecordScreen (S10) 에는 누락. qa 가 FUNCTIONAL_BUG 로 분류 — Story 3 수용 기준 미충족. S09 패턴 그대로 이식 (동일 token / 동일 testID / 동일 데이터 소스).

## 변경 대상

| 파일 | 위치 | 변경 요약 |
|---|---|---|
| `apps/mobile/src/screens/RecordScreen.tsx` | recording phase JSX (L314~) + import + styles | `useAuthStore` 구독 → `isFreeUser` 일 때 `topBar` 직하 row 에 chip 렌더 |
| `apps/mobile/src/__tests__/screens/S10RecordScreen.variantC.test.tsx` | describe 블록 추가 | free / trial / premium 3-분기 렌더 검증 (단일 테스트 파일) |

## 추가 import (RecordScreen.tsx)

```ts
import { useAuthStore } from '@store/authSlice';
```

(기존 `@store/authSlice` alias 가 RecordGuideScreen 에서 사용 중 — tsconfig path 검증 불필요. 동일 alias 그대로 사용.)

## 변경 위치 — JSX

**recording phase return 블록 (L314~373) 만 변경**. countdown phase (L297~312) 에는 chip 미렌더 (S09 도 가이드 화면 헤더에만 노출 — 카운트다운 중 chip 노출하면 시각 노이즈, qa 수용 기준에도 명시 없음).

**삽입 위치**: `<View style={styles.topBar}>` 닫는 `</View>` (L326) 직후, `bgmFailToast` (L328) 보다 *위* — topBar 와 동선상 가장 가까운 우측 정렬 standalone row. 새 `<View style={styles.counterRow}>` 컨테이너 안에 chip 1개 우측 정렬.

```
<View style={styles.topBar}>...</View>
{isFreeUser && (
  <View style={styles.counterRow}>
    <View style={styles.counterChip} testID="free-generation-counter">
      <Text style={styles.counterText}>생성 {generationCount}/{FREE_GENERATION_LIMIT}</Text>
    </View>
  </View>
)}
{showBgmFailToast && ...}
```

## 추가 상수 / hook 구독

- `const FREE_GENERATION_LIMIT = 3;` — file-top constant 블록 (L28~33 근처)
- 함수 본문 도입부 (L77 `songKey` 분해 직후):
  ```ts
  const authState = useAuthStore() as unknown as {
    entitlement: 'free' | 'trial' | 'premium';
    generationCount: number;
  };
  const { entitlement, generationCount } = authState;
  const isFreeUser = entitlement === 'free';
  ```

S09 와 cast 패턴 동일하게 — `useAuthStore` selector 미사용 시 entire state 반환. 타입 안전성은 S09 와 동급으로 유지 (이번 fix 의 scope 가 아님).

## 추가 styles (StyleSheet 블록 L375~)

```ts
counterRow: {
  flexDirection: 'row',
  justifyContent: 'flex-end',
  paddingTop: 4,
  paddingBottom: 4,
},
counterChip: {
  backgroundColor: '#21253E',
  borderRadius: 20,
  paddingHorizontal: 12,
  paddingVertical: 6,
},
counterText: { color: '#7B80A0', fontSize: 13 },
```

S09 와 색·radius·padding 완전 동일. `counterRow` wrapper 만 추가 (S09 는 `header` flex row 안에서 title 옆에 두는 구조 — S10 의 `topBar` 는 cancel/status/timer 3-element 가 이미 `space-between` 으로 균형 잡혀 있어 안에 끼워넣으면 layout 깨짐. 따라서 별도 row 분리).

## 분기 enumeration

`RecordScreen` 본문에서 phase / entitlement 조합으로 chip 노출 여부가 갈리는 모든 경로:

| 분기 | 위치 | fix 적용 (chip 렌더) | 회귀 가능성 / out-of-scope 사유 |
|---|---|---|---|
| `phase === 'countdown'` (early return) | L297~312 | NO | 카운트다운 중 chip 노출은 qa 수용 기준 미언급 + 시각 노이즈. S09 도 헤더에만. 의도적 제외 |
| `phase === 'recording'` & `entitlement === 'free'` | L314~ recording return | YES | 신규 노출 — 핵심 수용 기준 1 |
| `phase === 'recording'` & `entitlement === 'trial'` | L314~ recording return | NO (`isFreeUser === false`) | 수용 기준 2 — 미렌더 보장 |
| `phase === 'recording'` & `entitlement === 'premium'` | L314~ recording return | NO (`isFreeUser === false`) | 수용 기준 2 — 미렌더 보장 |
| `phase === 'recording'` & BGM toast / silence warning / lyrics box | L328~346 | unaffected | chip wrapper row 가 topBar 직하에만 삽입되어 mid-screen 요소 layout 영향 없음 — 회귀 위험 낮음 |
| `restartRecording` 후 phase 가 'countdown' 으로 되돌아갈 때 | L177~192 | NO (countdown 분기로) | 재시작 → 카운트다운 → 다시 recording 진입 시 chip 자연 재렌더. store 값은 동일 instance 재구독이라 issue 없음 |

**최소 2 행 충족** (6 행 enumerate).

## 잠재 risk

- **Layout 충돌**: `topBar` 는 `paddingBottom: 12`, `bgmFailToast`/`bgmChip` 은 `marginTop: 4 / marginBottom: 8`. 새 `counterRow` 가 그 사이에 들어가면 chip 자체 padding (4+4) 만큼 vertical 공간 추가됨 (~30dp). recording 화면은 flex 컨테이너이고 `waveformContainer: { flex: 1 }` 이 가운데를 흡수하므로 bottom row 까지 밀림 없음 — **회귀 가능성 낮음**.
- **store import 부재 → mock 누락**: 기존 `S10RecordScreen.variantC.test.tsx` / `S10RecordScreen.bgm.test.tsx` 는 `@store/authSlice` 를 mock 하지 않음. RecordScreen 이 `useAuthStore` 호출하면 실제 zustand store 가 evaluate 되어 test 환경에서 `entitlement` undefined → `isFreeUser === false` 로 두 기존 테스트는 통과 (chip 미렌더 = 기존 동작). **다만 명시 mock 추가 권장** — engineer 가 두 test 파일 모두 `jest.mock('@store/authSlice')` 추가하고 default `{ entitlement: 'free', generationCount: 0 }` 정도로 setup. 그러면 기존 testID 검증과 충돌 없음 (variantC 는 timer/label/ring 검증, bgm 은 BGM chip 검증 — 모두 free chip 과 testID 겹치지 않음).
- **TypeScript 캐스트**: `as unknown as { ... }` 는 S09 패턴 그대로 차용. 정식 selector 타입 정비는 별도 리팩 task (out-of-scope).

## 수정 파일 (필수)

1. `apps/mobile/src/screens/RecordScreen.tsx` — import + constant + hook 구독 + JSX 삽입 + styles 3개 추가
2. `apps/mobile/src/__tests__/screens/S10RecordScreen.variantC.test.tsx` — `@store/authSlice` mock 추가 + free-generation-counter describe 블록 추가
3. `apps/mobile/src/__tests__/screens/S10RecordScreen.bgm.test.tsx` — `@store/authSlice` mock 1줄 추가 (default 값 — 기존 BGM 테스트 영향 차단). describe 추가 X.

## 테스트 outline (S10RecordScreen.variantC.test.tsx)

```ts
describe('S10 — free generation counter chip', () => {
  // helper: countdown 끝나고 recording phase 진입까지 act + advanceTimers + waitFor
  // (기존 variantC 테스트의 helper 재사용 — 동일 패턴)

  it('free entitlement → testID="free-generation-counter" 렌더 + "생성 N/3" 텍스트', async () => {
    useAuthStore.mockReturnValue({ entitlement: 'free', generationCount: 1 })
    const { findByTestId, getByText } = renderRecordScreen()
    await advanceToRecordingPhase()
    expect(await findByTestId('free-generation-counter')).toBeTruthy()
    expect(getByText('생성 1/3')).toBeTruthy()
  })

  it('trial entitlement → chip 미렌더', async () => {
    useAuthStore.mockReturnValue({ entitlement: 'trial', generationCount: 5 })
    const { queryByTestId } = renderRecordScreen()
    await advanceToRecordingPhase()
    expect(queryByTestId('free-generation-counter')).toBeNull()
  })

  it('premium entitlement → chip 미렌더', async () => {
    useAuthStore.mockReturnValue({ entitlement: 'premium', generationCount: 99 })
    const { queryByTestId } = renderRecordScreen()
    await advanceToRecordingPhase()
    expect(queryByTestId('free-generation-counter')).toBeNull()
  })
})
```

기존 variantC describe 블록의 timer/label/ring 검증 통과 보장 — 추가 mock 이 default `entitlement: 'free'` 라도 testID 충돌 없음 (`recording-timer`, `stop-recording-button` 등은 본 chip 과 다른 테스트 ID).

## 수용 기준

- **REQ-235-1** [unit-test]: free entitlement 에서 recording phase 진입 후 `getByTestId('free-generation-counter')` 가 element 반환 + 텍스트 `생성 {generationCount}/3` 일치 → 통과 시 OK
- **REQ-235-2** [unit-test]: entitlement === 'trial' 또는 'premium' 일 때 `queryByTestId('free-generation-counter') === null` → 두 케이스 모두 통과 시 OK
- **REQ-235-3** [regression-test]: 기존 `S10RecordScreen.variantC.test.tsx` 의 모든 기존 it 블록 (timer 28px / 녹음 중 라벨 / stop ring 96dp / encourage accentSecondary) + `S10RecordScreen.bgm.test.tsx` 의 모든 it 블록 그린 → 통과 시 OK

LIGHT_PLAN_READY — engineer simple 진행 권고.
