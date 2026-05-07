---
depth: simple
issue: 215
---

## 변경 대상

- **파일**: `apps/mobile/src/__tests__/screens/S06HomeScreen.test.tsx`
- **범위**: 파일 전체 교체 (12 tests → 12 tests, 1:1 대응)
- **요약**: 테스트가 구 아키텍처(tracks-api + AsyncStorage 기반)를 기준으로 작성돼 있고 현재 S06HomeScreen.tsx는 신 아키텍처(mastersSlice + MasterAudioCard + pendingSession)로 완전 교체됐음. 단순 mock 추가로는 불충분 — 테스트 전체를 현재 구현에 맞춰 재작성해야 12/12 GREEN 가능.

---

## 진단

요청 이슈 본문은 "MasterAudioCard mock 추가만 하면 된다"고 기술했으나, 실제 실행 결과와 소스를 교차 확인하니 범위가 더 넓음:

1. **즉시 충돌 (MasterAudioCard + EmptyMastersState)**: 두 컴포넌트 모두 `useTheme → useColorScheme` 호출. `react-native` mock에 `useColorScheme` 미포함 → 모든 12개 테스트가 동일 TypeError로 실패.
2. **구 API 의존 제거 필요**: 테스트는 `@services/tracks-api`, `AsyncStorage`, `status=completed` 필터 로직을 assert. 현재 S06HomeScreen.tsx에는 이 코드가 없음 → 관련 mock·assertions 무효.
3. **신 의존성 mock 추가 필요**: `@store/mastersSlice`, `@services/storage/pendingSession`, `@services/api/sessions`, `expo-secure-store`.
4. **assertions 재작성 필요**: 트랙 목록 = `mastersSlice.items`, 빈 상태 = `EmptyMastersState` (accessibilityLabel `"자장가 만들기"`), 트랙 아이템 tap → `navigate('Play', { trackId: session_id, presignUrl: presigned_url })`.

---

## 분기 enumeration

| 분기 | 위치 | fix 적용 | 비고 |
|---|---|---|---|
| `useFocusEffect → loadMasters()` 호출 | S06HomeScreen.tsx:73-77 | YES | 구 `getMyTracks` 대체 → `loadMasters` mock assert |
| `items.length > 0` → MasterAudioCard 렌더 | S06HomeScreen.tsx:79-93 | YES | MasterAudioCard mock 추가 + accessibilityLabel `"${displayName} 재생"` assert |
| `items.length === 0 && !isLoading` → EmptyMastersState | S06HomeScreen.tsx:136-143 | YES | EmptyMastersState mock 추가 + CTA 탭 → SongSelect assert |
| `isLoading && items.length === 0` → ActivityIndicator | S06HomeScreen.tsx:137-140 | NO (out-of-scope) | 로딩 스피너 표시 — 기존 테스트셋에 없던 케이스, 이번 수정 범위 외 |
| `justArrived != null` → JustArrivedMasterCard 렌더 | S06HomeScreen.tsx:113-125 | YES | JustArrivedMasterCard mock 추가 + pendingSession mock 연동 |
| `hasPending === true` → 처리 중 텍스트 렌더 | S06HomeScreen.tsx:127-133 | NO (out-of-scope) | 기존 테스트셋에 없던 케이스 |
| FAB "새 자장가 만들기" onPress → SongSelect | S06HomeScreen.tsx:166-172 | YES | 기존 테스트 그대로 유지 (accessibilityLabel 동일) |
| `showMiniPlayer` → MiniPlayer 렌더 | S06HomeScreen.tsx:175-179 | NO (out-of-scope) | 이미 null-mock 중, 노출 조건 assert 없음 |
| pendingSession completed → justArrived 세팅 | S06HomeScreen.tsx:49-71 | YES | loadPendingSession·getSessionStatus mock 연동 |
| pendingSession failed/404 → clearPendingSession | S06HomeScreen.tsx:57-69 | NO (out-of-scope) | 에러 케이스 — 기존 테스트셋에 없던 케이스 |

---

## 수정 내용

### 제거

- `jest.mock('@react-native-async-storage/async-storage', ...)` 전체
- `jest.mock('@services/tracks-api', ...)` + `mockGetMyTracks`, `mockGetNewlyCompletedTrack` 선언
- `mockAsyncStorage` requireMock 참조
- `makeTrack()` 헬퍼 (구 shape)
- 아래 테스트 케이스 (구 아키텍처 기준):
  - `status=completed 트랙만 목록에 포함한다`
  - `AsyncStorage에 lastChecked 값이 없으면 getNewlyCompletedTrack을 호출하지 않는다`
  - `AsyncStorage에 lastChecked 값이 있으면 getNewlyCompletedTrack을 호출한다`
  - `getNewlyCompletedTrack이 트랙을 반환하면 CompletedTrackCard를 표시한다`
  - `getNewlyCompletedTrack이 null을 반환하면 CompletedTrackCard를 표시하지 않는다`
  - `loadTracks 완료 후 AsyncStorage에 현재 시각을 기록한다`

### 추가 — mock

```typescript
// react-native mock에 useColorScheme 추가
useColorScheme: jest.fn().mockReturnValue('dark'),
ActivityIndicator: 'ActivityIndicator',

// mastersSlice
const mockLoadMasters = jest.fn();
const mockLoadMore = jest.fn();
jest.mock('@store/mastersSlice', () => ({
  useMastersStore: jest.fn(() => ({
    items: [],
    hasPending: false,
    nextCursor: null,
    isLoading: false,
    loadMasters: mockLoadMasters,
    loadMore: mockLoadMore,
  })),
}));

// pendingSession
jest.mock('@services/storage/pendingSession', () => ({
  loadPendingSession: jest.fn().mockResolvedValue(null),
  clearPendingSession: jest.fn().mockResolvedValue(undefined),
  savePendingSession: jest.fn().mockResolvedValue(undefined),
}));

// sessions API
const mockGetSessionStatus = jest.fn();
jest.mock('@services/api/sessions', () => ({
  getSessionStatus: (...args: any[]) => mockGetSessionStatus(...args),
}));

// expo-secure-store (pendingSession 내부 의존)
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// EmptyMastersState mock (useTheme 차단)
jest.mock('@components/EmptyMastersState', () => ({
  __esModule: true,
  default: ({ onCta }: any) =>
    require('react').createElement(
      'TouchableOpacity',
      { onPress: onCta, accessibilityLabel: '자장가 만들기' },
      require('react').createElement('Text', null, 'EmptyMastersState'),
    ),
}));

// MasterAudioCard mock (useTheme 차단)
// accessibilityLabel은 실제 컴포넌트와 동일: `${displayName} 재생`
jest.mock('@components/MasterAudioCard', () => ({
  __esModule: true,
  default: ({ songKey, onPlay }: any) => {
    const SONG_NAMES: Record<string, string> = {
      brahms: '브람스 자장가',
      mozart: '모차르트 자장가',
      schubert: '슈베르트 자장가',
    };
    return require('react').createElement(
      'TouchableOpacity',
      { onPress: onPlay, accessibilityLabel: `${SONG_NAMES[songKey] ?? songKey} 재생` },
      require('react').createElement('Text', null, songKey),
    );
  },
}));

// JustArrivedMasterCard mock
jest.mock('@components/JustArrivedMasterCard', () => ({
  __esModule: true,
  default: ({ onPlay, onDismiss }: any) =>
    require('react').createElement(
      'View',
      { accessibilityLabel: 'just-arrived-card' },
      require('react').createElement(
        'TouchableOpacity',
        { onPress: onPlay, accessibilityLabel: '자장가 재생' },
        null,
      ),
      require('react').createElement(
        'TouchableOpacity',
        { onPress: onDismiss, accessibilityLabel: '닫기' },
        null,
      ),
    ),
}));

// CompletedTrackCard — 기존 mock 유지 (혹시 남아있는 import 방어)
```

### 추가 — beforeEach

```typescript
beforeEach(() => {
  jest.clearAllMocks();
  mockLoadMasters.mockResolvedValue(undefined);
  mockGetSessionStatus.mockResolvedValue({ status: 'generating', presigned_url: null });
});
```

### 추가 — makeMaster 헬퍼

```typescript
const makeMaster = (overrides: Record<string, any> = {}) => ({
  session_id: 'session-1',
  song_key: 'brahms',
  presigned_url: 'https://example.com/audio.mp3',
  completed_at: '2024-01-01T00:00:00.000Z',
  dsp_duration_ms: null,
  ...overrides,
});
```

### 유지 — 변경 없는 테스트

- `"새 자장가 만들기" CTA 탭 시 SongSelect 화면으로 이동한다` — FAB accessibilityLabel 동일, assert 동일
- `getMyTracks API 에러 시 throw하지 않고 빈 목록을 유지한다` → `loadMasters 에러 시 throw하지 않는다` 로 이름만 변경, 패턴 동일

### 추가 — 신 아키텍처 테스트 케이스 (기존 12개 대체)

```
1. 화면 포커스 시 loadMasters를 호출한다
2. items가 있을 때 MasterAudioCard를 렌더한다
3. items가 없을 때 EmptyMastersState를 렌더한다
4. EmptyMastersState CTA 탭 시 SongSelect로 이동한다
5. 트랙 아이템 accessibilityLabel이 "[곡명] 재생" 형식이다
6. 트랙 아이템 탭 시 Play 화면으로 이동한다 (trackId=session_id, presignUrl=presigned_url)
7. "새 자장가 만들기" CTA 탭 시 SongSelect 화면으로 이동한다
8. loadMasters 에러 시 throw하지 않는다
9. pendingSession 없을 때 getSessionStatus를 호출하지 않는다
10. pendingSession 있고 completed 반환 시 JustArrivedMasterCard를 표시한다
11. pendingSession 있고 generating 반환 시 JustArrivedMasterCard를 표시하지 않는다
12. JustArrivedMasterCard 닫기 탭 시 카드가 사라진다
```

---

## 수용 기준

| REQ | 검증 방법 | 통과 조건 |
|---|---|---|
| REQ-215-A | `npm test src/__tests__/screens/S06HomeScreen.test.tsx` | 12/12 GREEN, 0 failed |
| REQ-215-B | `npm test` (전체) | 기존 통과 스위트 회귀 없음 |
