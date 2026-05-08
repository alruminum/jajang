---
depth: simple
issue: 219
qa_enum: FUNCTIONAL_BUG
---

# #219 — RecordGuide 가이드 문구 단일화 + 무료 유저 카운터 chip

## 변경 대상

- **파일**: `apps/mobile/src/screens/RecordGuideScreen.tsx`
- **테스트**: `apps/mobile/src/__tests__/screens/S09RecordGuideScreen.test.tsx`, `apps/mobile/src/__tests__/screens/S09RecordGuideScreen.refactor.test.tsx` (현재 GUIDE_HEADLINE 텍스트를 직접 매치하지 *않음* — `getByText('녹음 시작')` 등 다른 노드만 검사. 헤드라인 문구 자체에 대한 단언은 두 파일 모두 0건. → 헤드라인 변경만으로는 테스트 갱신 불필요. 카운터 chip 추가에 대한 신규 단언만 필요.)
- **요약**: ① `GUIDE_HEADLINE` 상수를 단일 라인 + em-dash 로 교체, ② S07 와 100% 동일한 패턴으로 entitlement === 'free' 일 때만 "생성 N/3" 카운터 chip 노출.

## 분기 enumeration

수정 대상 = `RecordGuideScreen` 함수 컴포넌트 본체 + 모듈 상단 상수. 호출 사이트는 `MainNavigator` 의 `Stack.Screen name="RecordGuide"` 1곳 (route 컨트랙트 변경 없음 — props 시그니처 그대로).

| 분기 / 위치 | fix 적용 | 회귀 가능성 / 사유 |
|---|---|---|
| `GUIDE_HEADLINE` 상수 (line 29) → `<Text style={styles.title}>{GUIDE_HEADLINE}</Text>` (line 85) | YES | 단일 라인화로 `styles.title.marginBottom: 28` 간격이 시각상 더 비어 보일 수 있으나 디자인 영향만, 동작 회귀 X |
| `entitlement === 'free'` 분기 → 카운터 chip 렌더 | YES (신규 추가) | S07 와 동일 패턴이므로 unknown 캐스트로 안티패턴 답습. Epic 03 정식 store 통합 시 일괄 정리 필요 — out-of-scope |
| `entitlement === 'trial' \| 'premium' \| null` 분기 | YES (chip 미노출 — falsy 분기) | 회귀 X |
| 권한 분기 3종 (granted / canAskAgain=true / canAskAgain=false) — `handleStartRecording` | NO | out-of-scope (#219 항목 1·2 모두 헤드라인 + chip 만, 권한 흐름 무관) |
| 이어폰 모달 1회 정책 (`EARPHONE_WARNING_KEY` AsyncStorage) | NO | out-of-scope (이미 통과 항목, 본 fix 와 직교) |
| 가사 박스 fallback (`lyricsAvailable` 분기) | NO | out-of-scope (이미 통과 항목) |
| `HeadphoneChip` 컴포넌트 | NO | out-of-scope (별도 이어폰 chip — 카운터 chip 과 시각적 위치 충돌 가능성은 디자인이지 동작 X) |

## 수정 내용

### 1. GUIDE_HEADLINE 상수 (line 29)

```diff
- const GUIDE_HEADLINE = '1 loop 동안 자유롭게\n따라불러도, 허밍해도, 쉬쉬 소리만 내도 좋습니다\n더 많이 녹음할수록 더 풍성해집니다';
+ const GUIDE_HEADLINE = '1 loop 동안 자유롭게 — 따라불러도, 허밍해도, 쉬쉬 소리만 내도 좋습니다';
```

em-dash 문자: U+2014 (—). 하이픈 (-) 또는 en-dash (–) 아님.

### 2. 카운터 chip — S07 패턴 그대로 복제

import 추가:
```typescript
import { useAuthStore } from '../store/authSlice';
```

`FREE_GENERATION_LIMIT` 상수 모듈 상단 추가 (S07 와 동일 값 3):
```typescript
const FREE_GENERATION_LIMIT = 3;
```

`RecordGuideScreen` 본체 — `useState` 다음 라인에 entitlement / generationCount 읽기 (S07 line 30~36 1:1 복제):
```typescript
const authState = useAuthStore() as unknown as {
  entitlement: 'free' | 'trial' | 'premium';
  generationCount: number;
};
const { entitlement, generationCount } = authState;
const isFreeUser = entitlement === 'free';
```

JSX — `<Text style={styles.title}>{GUIDE_HEADLINE}</Text>` 위치를 헤더 컨테이너로 감싸고 우측에 chip 배치:
```tsx
<View style={styles.header}>
  <Text style={styles.title}>{GUIDE_HEADLINE}</Text>
  {isFreeUser && (
    <View style={styles.counterChip}>
      <Text style={styles.counterText}>생성 {generationCount}/{FREE_GENERATION_LIMIT}</Text>
    </View>
  )}
</View>
```

스타일 — S07 patterns 와 동일 (`styles.header`, `styles.counterChip`, `styles.counterText` 신규 추가). 기존 `styles.title.marginBottom: 28` 은 `styles.header` 로 옮기고 title 의 marginBottom 은 0 으로 (헤더 row 내부 정렬 — S07 와 동일).

### 3. 테스트 갱신 (카운터 chip 신규 단언만)

기존 두 테스트 파일은 `useAuthStore` 를 mock 하지 않음 (현재 컴포넌트가 사용 안 했으므로). chip 추가 후 컴포넌트가 store 를 읽으면서 두 파일 모두에서 `useAuthStore()` 가 실행되므로 mock 추가 필요. 두 파일 공통 — describe 블록 위 jest.mock:

```typescript
jest.mock('../../store/authSlice', () => ({
  useAuthStore: jest.fn(() => ({ entitlement: 'free', generationCount: 1 })),
}));
```

(import alias 가 `@store/authSlice` 인지 상대경로인지는 engineer 가 다른 테스트 mock 패턴 확인 후 통일 — S07 테스트 패턴 따르면 됨.)

`S09RecordGuideScreen.test.tsx` — "가이드 렌더링" describe 에 신규 it 추가:
```typescript
it('REQ-08: free 유저 진입 시 "생성 N/3" 카운터 chip이 노출된다', () => {
  const { getByText } = renderScreen();
  expect(getByText('생성 1/3')).toBeTruthy();
});

it('REQ-09: trial/premium 유저 진입 시 카운터 chip이 노출되지 않는다', () => {
  (useAuthStore as jest.Mock).mockReturnValueOnce({ entitlement: 'premium', generationCount: 5 });
  const { queryByText } = renderScreen();
  expect(queryByText(/생성 \d+\/3/)).toBeNull();
});
```

## 수용 기준

- REQ-219-A (TEST): GUIDE_HEADLINE 상수 = `'1 loop 동안 자유롭게 — 따라불러도, 허밍해도, 쉬쉬 소리만 내도 좋습니다'` (em-dash U+2014 포함, 개행 0건). validator 는 `RecordGuideScreen.tsx` 를 read 해서 `\n` 문자가 GUIDE_HEADLINE 안에 없는지 + em-dash 1회 등장 확인.
- REQ-219-B (TEST): jest 통과 — `apps/mobile/src/__tests__/screens/S09RecordGuideScreen.test.tsx` + `S09RecordGuideScreen.refactor.test.tsx`. 신규 카운터 chip 단언 (free → "생성 1/3" 노출, premium → 미노출) 포함 PASS.

## 검증 방향 (validator:BUGFIX_VALIDATION)

1. `RecordGuideScreen.tsx` 읽고 GUIDE_HEADLINE 상수 값이 정확히 단일 라인 (개행 문자 0개) + em-dash 포함인지 확인.
2. `useAuthStore` import + `entitlement === 'free'` 조건부 chip 렌더 JSX 존재 확인.
3. `cd apps/mobile && npm test -- S09RecordGuideScreen` 실행 → 두 파일 모두 PASS.
4. 기존 권한 분기·이어폰 모달·가사 fallback 테스트가 모두 깨지지 않고 통과하는지 확인 (회귀 가드).
5. out-of-scope: prebuild / E2E / 수동 시뮬레이터 — 본 fix 는 단일 컴포넌트 + 단위 테스트 범위.

LIGHT_PLAN_READY
