---
depth: simple
---

# #97 — S08/S09 Navigator 와이어링 수정

## 요약

`MainNavigator.tsx`가 `RecordMode` · `RecordGuide` 라우트에 placeholder 파일을 연결하고 있어 S07 이후 자장가 생성 플로우 전체가 차단된다. 실제 구현 파일(`RecordModeScreen.tsx`, `RecordGuideScreen.tsx`)이 이미 존재하므로 import 교체 + placeholder 삭제만으로 완결된다.

## 근본 원인

| 라우트 | 현재 (placeholder) | 목표 (실구현) |
|---|---|---|
| `RecordMode` | `S08RecordModeScreen.tsx` (24줄, label only) | `RecordModeScreen.tsx` (131줄, named export) |
| `RecordGuide` | `S09RecordGuideScreen.tsx` (24줄, label only) | `RecordGuideScreen.tsx` (225줄, named export) |

## 수정 파일 목록

| 파일 | 작업 |
|---|---|
| `apps/mobile/src/navigation/MainNavigator.tsx` | import L12–13 교체 + component prop L56–57 교체 |
| `apps/mobile/src/screens/S08RecordModeScreen.tsx` | 삭제 |
| `apps/mobile/src/screens/S09RecordGuideScreen.tsx` | 삭제 |

## 상세 변경

### 1. `MainNavigator.tsx`

**L12 변경**
```diff
- import S08RecordModeScreen from '@screens/S08RecordModeScreen';
+ import { RecordModeScreen } from '@screens/RecordModeScreen';
```

**L13 변경**
```diff
- import S09RecordGuideScreen from '@screens/S09RecordGuideScreen';
+ import { RecordGuideScreen } from '@screens/RecordGuideScreen';
```

**L56 변경**
```diff
- <Stack.Screen name="RecordMode" component={S08RecordModeScreen} />
+ <Stack.Screen name="RecordMode" component={RecordModeScreen} />
```

**L57 변경**
```diff
- <Stack.Screen name="RecordGuide" component={S09RecordGuideScreen} />
+ <Stack.Screen name="RecordGuide" component={RecordGuideScreen} />
```

### 2. Placeholder 파일 삭제

```
apps/mobile/src/screens/S08RecordModeScreen.tsx  → 삭제
apps/mobile/src/screens/S09RecordGuideScreen.tsx → 삭제
```

## 테스트 파일 영향 분석

- `apps/mobile/src/__tests__/screens/S08RecordModeScreen.test.tsx`  
  → 이미 `import { RecordModeScreen } from '@screens/RecordModeScreen'`으로 실구현을 직접 import 중. **변경 불필요.**
- `S09RecordGuideScreen` 테스트 파일 없음. **없음.**

## 범위 외 (수정 금지)

- `S10RecordScreen.tsx` 및 MainNavigator의 S10 라인 — 이미 실구현 와이어링 완료
- `types/`, `store/recordingSlice` — 변경 불필요

## 검증

1. Android 에뮬레이터 앱 실행 → 로그인 → "자장가 만들기" → 곡 선택 → RecordMode 화면: 허밍/쉿 카드 2개 렌더링 확인
2. 카드 탭 → RecordGuide 화면 진입 확인
3. `npx vitest run` — 기존 테스트 회귀 없음 확인
