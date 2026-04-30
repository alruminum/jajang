---
depth: std
---

# impl/02 — 카테고리 B: Pressable `stopPropagation` 이벤트 mock 수정

**Story:** #159 (카테고리 B: ~39 fails — `Cannot read property 'stopPropagation' of undefined`)
**선행 조건:** impl/01 완료 (카테고리 A 0 fails)
**후행 조건:** impl/03 (카테고리 C) 시작 가능

**context budget:** file edits ≤ 20 / tool uses ≤ 60 — 단일 호출 가능 (영향 파일 소수)

---

## 근본 원인

jest-expo preset의 react-native mock이 `Pressable` 을 `string` ('Pressable') export 처리.
`fireEvent.press(element)` 시 실제 이벤트 객체 대신 빈 객체 또는 `undefined` 가 `onPress(e)` 로 전달됨.
`SongListItem` 의 inner Pressable이 `onPress={(e) => { e.stopPropagation(); ... }}` 호출 → `TypeError`.

**실측 확인:**
```bash
npm test 2>&1 | grep "stopPropagation"
```
예상 파일: SongListItem, (MiniPlayer — 별도 확인)

---

## 수정 전략

두 가지 접근 중 파일별 적합한 것 선택:

**전략 A — 컴포넌트 핸들러 단순화 (소스 수정, 권장)**
`SongListItem.tsx` 내부 Pressable의 `onPress` 에서 `e.stopPropagation()` 제거.
`@testing-library/react-native` v12에서 nested Pressable 이벤트 버블링은
RNTL 자체가 내부적으로 처리하므로 `stopPropagation` 명시 불필요.
테스트 `'이벤트 전파 분리'` 케이스는 nested Pressable이면 RNTL에서 자동 분리.

**전략 B — 테스트 fireEvent에 mock event 명시 (테스트 수정)**
```ts
fireEvent.press(element, {
  nativeEvent: {},
  stopPropagation: jest.fn(),
  preventDefault: jest.fn(),
})
```

**판단:** 전략 A 우선. `e.stopPropagation()` 은 웹 패턴이며 RN에서 nested Pressable 분리는
`onPress` prop 단독으로 충분. 전략 A로 해결 안 되는 파일만 전략 B 적용.

---

## 수정 파일 목록

### 소스 파일 수정 (전략 A)

| 파일 | 변경 내용 |
|---|---|
| `apps/mobile/src/components/SongListItem.tsx` | inner Pressable `onPress={(e) => { e.stopPropagation(); onPreviewToggle(); }}` → `onPress={onPreviewToggle}` |
| `apps/mobile/src/components/MiniPlayer.tsx` | `e.stopPropagation()` 호출 존재 확인 → 동일 패턴 적용 (grep으로 확인 후) |

### 테스트 파일 수정 (전략 B — 필요한 경우만)

전략 A 후 `npm test 2>&1 | grep "stopPropagation"` 재확인.
잔여 발생 파일에 한해 `fireEvent.press` mock event 추가:

```ts
fireEvent.press(element, {
  nativeEvent: {},
  stopPropagation: jest.fn(),
  preventDefault: jest.fn(),
})
```

**잠재 대상 (grep 후 확인):**
- `apps/mobile/src/__tests__/components/SongListItem.test.tsx` (이벤트 핸들러 describe)
- `apps/mobile/src/__tests__/components/TrackCard.test.tsx`
- `apps/mobile/src/__tests__/components/TrialBadge.test.tsx`
- `apps/mobile/src/__tests__/components/EmptyTrackState.test.tsx`

---

## 의사코드 (수정 절차)

```
1. npm test 2>&1 | grep "stopPropagation" 으로 정확한 영향 파일 목록 확인

2. SongListItem.tsx 수정
   - inner Pressable onPress: (e) => { e.stopPropagation(); onPreviewToggle() }
     → onPress={onPreviewToggle}
   - SongListItem.test.tsx 의 '이벤트 전파 분리' 케이스 여전히 PASS 확인
     (nested Pressable → RNTL이 이벤트 버블링 자동 차단)

3. MiniPlayer.tsx stopPropagation 존재 시 동일 패턴 적용

4. npm test 2>&1 | grep "stopPropagation" 재확인
   - 0건이면 완료
   - 잔여 있으면 전략 B (테스트 fireEvent mock event 추가) 적용

5. 각 영향 파일 npm test <파일> GREEN 확인
```

---

## 결정 근거

**전략 A 선택 이유:**
- `e.stopPropagation()` 은 브라우저 DOM 패턴. RN Pressable에서 이벤트 객체가 항상 유효하다고 보장되지 않음
- RNTL v12에서 nested Pressable press는 inner handler만 호출 (버블링 없음)
- 소스 단순화 → 이후 어떤 test runner에서도 동일 동작

**전략 B fallback 이유:**
- 컴포넌트 로직 변경 없이 테스트만 조정하는 경우 (MiniPlayer 등 실제로 event 객체가 의미있는 경우)

---

## 수용 기준

- (TEST) `npm test 2>&1 | grep "stopPropagation"` 결과 0건
- (TEST) `npm test apps/mobile/src/__tests__/components/SongListItem.test.tsx` GREEN
  - 특히 `'미리듣기 버튼 탭 시 onSelect는 호출되지 않는다 (이벤트 전파 분리)'` PASS
- (TEST) 카테고리 B 영향 파일 각각 `npm test <파일>` GREEN
- (MANUAL) `npm test` 실행 후 총 fails 수 이전 대비 ~39 감소
- **회귀 보호:** `npm test 2>&1 | grep -E 'Tests:.*passed'` 수치 >= 442
