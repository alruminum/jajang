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

**실측 확인 (grep 완료):**

소스 파일 `stopPropagation` 실재 위치:
- `apps/mobile/src/components/SongListItem.tsx:77` — inner `Pressable` `onPress` 핸들러. **수정 대상.**
- `apps/mobile/src/components/MiniPlayer.tsx:161` — `handlePlayPause(e: GestureResponderEvent)`. **수정 불필요** (아래 §MiniPlayer 제외 근거 참조).

영향 테스트 파일 실재 목록 (grep 완료):
- `apps/mobile/src/__tests__/components/SongListItem.test.tsx` — `'자장가 미리듣기'` label fireEvent.press 3건
- `apps/mobile/src/__tests__/screens/S07SongSelectScreen.test.tsx` — `'자장가 미리듣기'` / `'자장가 미리듣기 정지'` label fireEvent.press 9건 (AC-02/03/09/#129 describe)

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

**MiniPlayer.tsx 제외 근거 (실측):**
`handlePlayPause`는 `TouchableOpacity` `onPress`에 연결 (line 190). `TouchableOpacity`는 inner 전용 핸들러라 버블링 이슈가 다른 패턴. MiniPlayer 전용 테스트 파일 없음 (`grep MiniPlayer src/__tests__` → 0건). 현재 fails 목록과 무관하므로 수정 X.

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

**확정 영향 테스트 파일 (grep 실측):**
- `apps/mobile/src/__tests__/components/SongListItem.test.tsx` — 이벤트 핸들러 describe 3 케이스
- `apps/mobile/src/__tests__/screens/S07SongSelectScreen.test.tsx` — AC-02/03/09/#129 describe, `'자장가 미리듣기'` label fireEvent.press 9건

**제외 확정 (stopPropagation 무관):**
- `TrackCard.test.tsx` — TrackCard 소스에 stopPropagation 없음
- `TrialBadge.test.tsx` — react-test-renderer create 방식, fireEvent 없음
- `EmptyTrackState.test.tsx` — TouchableOpacity 문자열 mock, Pressable 무관

---

## 의사코드 (수정 절차)

```
1. SongListItem.tsx 수정 (단일 파일, 단일 라인)
   - inner Pressable onPress: (e) => { e.stopPropagation(); onPreviewToggle() }
     → onPress={onPreviewToggle}
   - GestureResponderEvent import 불필요 여부 확인 (SongListItem은 e 미사용 후 import 없음 — 확인 완료)

2. SongListItem.test.tsx 이벤트 전파 분리 케이스 PASS 확인 (자동 분리 원리):
   - RNTL의 fireEvent.press는 해당 element의 onPress만 호출
   - outer Pressable('자장가 선택')를 press해도 inner Pressable onPress는 호출 X
   - inner Pressable('자장가 미리듣기')를 press해도 outer Pressable onPress는 호출 X
   → e.stopPropagation() 없어도 이벤트 분리 테스트 PASS

3. S07SongSelectScreen.test.tsx 확인:
   - SongListItem 내부를 거쳐 미리듣기 버튼 press → stopPropagation 제거 후 동일 동작

4. npm test 2>&1 | grep "stopPropagation" 재확인
   - 소스 2건(SongListItem line 77, MiniPlayer line 161) 중 SongListItem만 제거됨
   - MiniPlayer는 테스트 없으므로 TypeError 발생 안 함 → 0 test failures

5. 전략 B는 전략 A로 완전 해결되면 불필요 (SongListItem 단일 수정으로 충분 예상)
```

---

## 결정 근거

**전략 A 선택 이유:**
- `e.stopPropagation()` 은 브라우저 DOM 패턴. RN Pressable에서 이벤트 객체가 항상 유효하다고 보장되지 않음
- RNTL v12에서 nested Pressable press는 inner handler만 호출 (버블링 없음)
- 소스 단순화 → 이후 어떤 test runner에서도 동일 동작

**전략 B fallback 이유:**
- 컴포넌트 로직 변경 없이 테스트만 조정하는 경우
- MiniPlayer는 테스트 없어 현재 fails에 기여 X → 전략 B 대상에서도 제외

**MiniPlayer.tsx 보존 결정:**
`handlePlayPause`의 `e.stopPropagation()`은 nested TouchableOpacity 분리 목적. 현재 MiniPlayer 테스트 없어 TypeError 발생 안 함. 테스트 추가 시점에 재검토.

---

## 수용 기준

- (TEST) `npm test apps/mobile/src/__tests__/components/SongListItem.test.tsx` GREEN
  - 특히 `'미리듣기 버튼 탭 시 onSelect는 호출되지 않는다 (이벤트 전파 분리)'` PASS
- (TEST) `npm test apps/mobile/src/__tests__/screens/S07SongSelectScreen.test.tsx` GREEN
  - AC-02/03/09/#129 describe 포함 (미리듣기 버튼 press 9건)
- (MANUAL) `npm test` 실행 후 총 fails 수 이전 대비 감소 (SongListItem + S07 영향 케이스 해소)
- **회귀 보호:** `npm test 2>&1 | grep -E 'Tests:.*passed'` 수치 >= 478 (batch 1 완료 후 기준)
