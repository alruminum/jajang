---
depth: std
---

# #129 — S07 미리듣기가 화면 전환(blur) 후에도 계속 재생됨 — useEffect cleanup 누락이 아닌 *blur 미처리*

## 이슈 요약

S07SongSelectScreen에서 미리듣기 재생 중 `navigation.navigate('RecordMode')` 등으로 다른 화면으로 이동해도 오디오가 정지되지 않고 백그라운드에서 계속 재생된다.

이슈 본문은 "언마운트/blur 시 `player.remove()` 호출 없음"이라고 적혀 있으나, **실제 코드는 line 48-52에서 이미 unmount cleanup을 호출**하고 있다. 진짜 원인은 **NativeStack 환경에서 push-navigate 시 S07이 unmount되지 않는다**는 것 — Stack은 화면을 stack에 살려둔 채 새 화면을 push하므로 `useEffect(() => …, []);` 의 cleanup이 트리거되지 않는다 (`navigation/MainNavigator.tsx:55`, `navigation/RootNavigator.tsx`가 모두 `createNativeStackNavigator`).

해결: blur(포커스 잃음) 시점에 `player.pause() + player.remove() + 상태 리셋`을 강제하는 `useFocusEffect` cleanup으로 옮긴다. unmount 경로도 `useFocusEffect`의 unmount cleanup이 동일하게 처리한다.

비교: `S11PreviewScreen.tsx:75-77`의 useEffect cleanup은 `Preview → Generating` 이동 시 잘 동작하는 것처럼 보이지만, 같은 NativeStack에서 단지 우연히 동작 — 정확히는 `Preview` 이후 재진입 경로가 없어 회귀가 안 보일 뿐이다. 이번 이슈 범위는 S07만 처리. S11 변경은 범위 외.

## Depth 판정 근거: `std`

이슈 추천은 `simple`이지만 아래 두 가지로 `std`로 상향한다.

1. **테스트 인프라 신설**: 현재 `apps/mobile/src/__tests__/screens/S07SongSelectScreen.test.tsx`는 `@react-navigation/native` 자체를 mock하지 않는다. blur 시나리오를 검증하려면 `useFocusEffect` 동작을 외부에서 트리거할 수 있는 mock(=새 테스트 인프라)을 도입해야 한다 — S06 패턴(`__tests__/screens/S06HomeScreen.test.tsx:45-53`) 차용.
2. **새 cleanup 게이트 신설**: 단순 값/조건 변경이 아니라 "useFocusEffect 도입 → focus/blur 라이프사이클 게이트 추가"라는 새 라이프사이클 의존을 들임. `simple`의 정의("기존 구조 수정")보다는 "새 로직 구조 신설"에 더 가까움.
3. 기존 AC-09(unmount cleanup) 테스트는 그대로 통과해야 한다 — useFocusEffect cleanup이 unmount 시에도 호출되기 때문(react-navigation 7 동작). DOM/문구/testid 변경 없음.

## 수정 파일 목록

| 파일 | 변경 유형 | 상세 | 담당 |
|---|---|---|---|
| `apps/mobile/src/screens/S07SongSelectScreen.tsx` | hook 교체 | `useEffect`의 cleanup → `useFocusEffect` cleanup 이동. fetch는 `useEffect`에 유지 | engineer |
| `apps/mobile/src/__tests__/screens/S07SongSelectScreen.test.tsx` | mock 추가 + 신규 케이스 1건 | `@react-navigation/native` mock 추가, blur 시나리오 1건 추가, AC-09 무회귀 확인 | engineer |

> **[ENGINEER_SCOPE]**: `apps/mobile/src/screens/S07SongSelectScreen.tsx` 와 `apps/mobile/src/__tests__/screens/S07SongSelectScreen.test.tsx` 두 파일만 수정. 다른 화면(S11 등) 무변경. `apps/api/**` 무변경.

---

## 1. `apps/mobile/src/screens/S07SongSelectScreen.tsx`

### 변경 의도

- 줄 42-53의 `useEffect`를 두 책임으로 분리
  - **fetch (mount 1회)**: 곡 목록 로딩 — 그대로 `useEffect(() => { … }, [])` 유지. cleanup return 제거
  - **playback cleanup (focus/blur 라이프사이클)**: `useFocusEffect(useCallback(() => { return () => { … }; }, []))` 으로 이전. blur 시 + unmount 시 둘 다 cleanup 콜백 실행

### 코드 스니펫

```tsx
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
// (기존 imports 유지)

export function SongSelectScreen({ navigation }: Props) {
  // … 기존 state/store 코드 그대로 …

  // 곡 목록 fetch (mount 1회) — cleanup 분리됨
  useEffect(() => {
    songsApi.listSongs()
      .then(r => setSongs(r.songs))
      .catch(() => Alert.alert('', '목록을 불러오지 못했어요. 다시 시도해주세요'))
      .finally(() => setIsLoading(false));
  }, []);

  // 미리듣기 cleanup (focus/blur 라이프사이클)
  // - blur(다른 화면 navigate) 시 player 정지·해제 + 상태 리셋
  // - unmount 시에도 동일 cleanup이 실행됨 → AC-09 호환
  useFocusEffect(
    useCallback(() => {
      return () => {
        playerRef.current?.pause();
        playerRef.current?.remove();
        playerRef.current = null;
        setPreviewingKey(null);
        setPreviewLoadingKey(null);
      };
    }, []),
  );

  // … handlePreviewToggle / handleStartWithSong / return JSX 그대로 …
}
```

### 결정 근거

- **왜 `useFocusEffect` 인가**: NativeStack의 push-navigate는 unmount를 일으키지 않는다. focus/blur는 `@react-navigation/native`가 발행하는 라이프사이클이며 stack 내부에서도 정확히 트리거된다. `navigation.addListener('blur', …)` 도 가능하지만 cleanup 등록/해제를 수동 관리해야 해서 hook으로 캡슐화된 `useFocusEffect`가 일관성 있고 S06 선례가 있다.
- **fetch와 분리한 이유**: cleanup을 fetch와 같은 `useEffect`에 둘 경우, 만약 fetch 의존성을 추가할 일이 생기면 cleanup이 매 의존 변화마다 호출되어 미리듣기가 끊기는 회귀가 발생할 수 있다. 책임 분리.
- **상태 리셋(`setPreviewingKey(null)`, `setPreviewLoadingKey(null)`) 이유**: 다음에 화면으로 돌아왔을 때 "재생 중"으로 보이는 stale UI 차단. blur 시 플레이어는 이미 해제되므로 UI도 동기화되어야 한다.
- **`useCallback` 의존성 배열 `[]`**: cleanup 내부에서 참조하는 값(`playerRef`, setter)은 모두 안정적 참조(ref/state setter)이므로 매 focus마다 새 콜백 생성 불필요.
- **import 변경**: `useEffect` 옆에 `useCallback` 추가, `@react-navigation/native`에서 `useFocusEffect` 추가.

### 회귀 방어 — 기존 동작 보존

| 기존 동작 | 변경 후 |
|---|---|
| 곡 목록 fetch (mount 1회) | 그대로 |
| 같은 곡 다시 탭 → 정지 (line 64-67) | 그대로 |
| 두 번째 곡 탭 → 첫 곡 정지 후 두 번째 재생 (line 58-62) | 그대로 |
| 재생 완료 시 자동 정지 (line 79-85, `didJustFinish`) | 그대로 |
| 화면 unmount 시 player.remove | `useFocusEffect` cleanup이 unmount 시에도 호출 → 그대로 |
| 화면 blur 시 player.remove + 상태 리셋 | **신규 동작 (이슈 수정)** |

### 명시적 비-변경

- `handlePreviewToggle` 본문은 손대지 않는다 — line 56-91 그대로.
- `createAudioPlayer`/`addListener`/`didJustFinish` 흐름 변경 없음.
- 스타일/레이아웃/문구/testid 변경 없음.

---

## 2. `apps/mobile/src/__tests__/screens/S07SongSelectScreen.test.tsx`

### 변경 의도

1. `@react-navigation/native` mock 추가 — `useFocusEffect`의 focus 콜백을 즉시 호출하고, **테스트가 blur를 시뮬레이션할 수 있도록 cleanup 함수를 외부에서 호출 가능한 형태로 노출**.
2. 신규 시나리오 1건 추가 — "blur 시 player.remove 호출 + 상태 리셋".
3. AC-09(unmount cleanup) 케이스 무회귀 확인 — useFocusEffect cleanup이 unmount 시에도 호출되어 player.remove가 invoke되어야 함.

### mock 패턴

S06 mock(`S06HomeScreen.test.tsx:45-53`)을 변형해 cleanup 회수 가능 버전으로 사용:

```tsx
// 파일 상단 mock 블록(현재 line 33-43 부근)에 추가:
const mockUseFocusEffect = vi.hoisted(() => ({
  cleanup: null as (() => void) | null,
}))

vi.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    // focus 콜백을 즉시 실행하고, cleanup이 반환되면 외부에서 호출 가능하게 보관
    React.useEffect(() => {
      const cleanup = cb()
      if (typeof cleanup === 'function') {
        mockUseFocusEffect.cleanup = cleanup
      }
      return () => {
        // unmount 시에도 cleanup 트리거 (실제 react-navigation 동작 동등)
        if (typeof cleanup === 'function') {
          cleanup()
        }
      }
    }, [])
  },
}))
```

> 메모: `vi.hoisted`를 쓰는 이유 — `vi.mock` factory가 hoist되므로 외부 변수 캡처가 막힌다. `mockUseFocusEffect.cleanup`로 묶어 모듈 외부에서 시뮬레이션 가능.

### 신규 테스트 케이스

`describe('S07SongSelectScreen — AC-09 …')` 직후 또는 직전에 새 describe 추가:

```tsx
// ────────────────────────────────────────────
// #129: 화면 blur 시 미리듣기 정리
// ────────────────────────────────────────────
describe('S07SongSelectScreen — #129: blur 시 미리듣기 정리', () => {
  it('다른 화면으로 이동(blur)하면 player.remove와 상태 리셋이 호출된다', async () => {
    setupStoreMocks()

    const mockPlayer = makeMockPlayer()
    vi.mocked(createAudioPlayer).mockReturnValue(mockPlayer as any)
    vi.mocked(songsApi.getPreviewUrl).mockResolvedValue({
      song_key: 'brahms',
      preview_url: 'https://cdn.example.com/brahms.mp3',
      expires_in_seconds: 3600,
    })

    const navigation = makeMockNavigation()
    render(<SongSelectScreen navigation={navigation as any} route={{} as any} />)
    await waitFor(() => screen.getByText('자장가'))

    // 미리듣기 시작
    await act(async () => {
      fireEvent.press(screen.getByLabelText('자장가 미리듣기'))
    })
    expect(mockPlayer.play).toHaveBeenCalled()

    // blur 시뮬레이션 — useFocusEffect cleanup 강제 실행
    await act(async () => {
      mockUseFocusEffect.cleanup?.()
    })

    expect(mockPlayer.pause).toHaveBeenCalled()
    expect(mockPlayer.remove).toHaveBeenCalled()
  })
})
```

### AC-09 무회귀 명시

기존 AC-09 케이스(`unmount()` 호출 → `mockPlayer.remove` 검증)는 그대로 통과해야 한다. mock의 `React.useEffect(() => { … return () => cleanup(); }, [])` 분기가 unmount 시 cleanup을 호출하므로 AC-09 expectation이 그대로 만족된다.

만약 engineer가 mock을 다르게 구현하기로 결정한 경우(예: cleanup을 외부 ref로만 노출하고 unmount 시 자동 호출하지 않음), 그 경우엔 **AC-09 케이스가 깨지지 않도록 mock의 `useEffect cleanup` 안에서 cleanup을 명시 호출**해야 한다.

### `beforeEach` 보강

새 mock의 `cleanup` 캐시는 케이스 간 leak 방지를 위해 매 테스트 전 초기화:

```tsx
beforeEach(() => {
  vi.clearAllMocks()
  mockUseFocusEffect.cleanup = null
  vi.mocked(songsApi.listSongs).mockResolvedValue({ songs: MOCK_SONGS })
})
```

---

## 수용 기준 검증

| 기준 | 검증 방법 |
|---|---|
| S07 미리듣기 재생 중 `navigation.navigate('RecordMode')` 시 즉시 정지 | 신규 vitest 케이스 `#129: blur 시 미리듣기 정리` |
| S07 미리듣기 재생 중 화면 unmount 시 정지 (AC-09 무회귀) | 기존 vitest 케이스 `AC-09` 재실행 |
| 같은 화면 내 다른 곡 미리듣기 전환 (AC-03 무회귀) | 기존 vitest 케이스 `AC-03` 재실행 |
| 재생 완료 자동 정지 (AC-02 무회귀) | 기존 vitest 케이스 `AC-02` 재실행 |
| 실기기: 미리듣기 시작 → 다른 탭/화면 이동 → 오디오 즉시 정지 | engineer 디바이스 수동 확인(iOS + Android) |
| 실기기: 미리듣기 시작 → 같은 화면에서 다른 곡 탭 → 회귀 없음 | engineer 디바이스 수동 확인 |

---

## 주의사항

- **`useFocusEffect` cleanup은 focus 변경마다 호출**되는 점에 유의. 본 이슈에서는 cleanup이 매번 player를 정리해도 무해(다음 focus에서 새로 createAudioPlayer 됨), 하지만 미래에 "focus 유지된 채로 외부 modal 띄우기" 같은 시나리오가 추가되면 cleanup이 의도치 않게 트리거될 수 있다. 그 경우 `useFocusEffect` 의존성을 재검토할 것.
- **expo-audio `player.remove()`는 listener도 자동 정리**한다고 가정(line 82의 기존 패턴이 listener 별도 해제 없이 `player.remove()`만 호출하므로 동일 가정 채택). 가정이 깨지면 `addListener` 반환값을 ref에 저장 후 cleanup에서 `.remove()` 호출하는 패턴으로 보강해야 함 — 본 plan에선 기존 가정 유지.
- **`apps/api/**` 무변경**. 백엔드 라우트/응답 영향 0.
- **다른 화면(S11 등) 무변경**. S11은 별개 회귀 위험 — 본 이슈 범위 외.
- **테스트 mock의 `vi.hoisted` 사용 필수**. 일반 변수는 `vi.mock` factory에서 capture 불가.

## 범위 외 (절대 변경 금지)

- `apps/mobile/src/screens/S11PreviewScreen.tsx` — 별개 화면, 별개 회귀 위험.
- `apps/mobile/src/navigation/**` — Stack 구성 변경 없음.
- `apps/api/**` — 백엔드 무관.
- `prd.md` / `trd.md` / `docs/architecture.md` — 동작 자체는 명세대로(미리듣기 정지)이므로 문서 갱신 불필요.
- `S07SongSelectScreen.tsx`의 `handlePreviewToggle` / `handleStartWithSong` 본문 — 변경 금지.

---MARKER:LIGHT_PLAN_DONE---
