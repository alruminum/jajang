---
depth: std
---

# #108 — 마이크 권한 흐름 버그픽스

## 이슈 요약
"녹음 시작할게요" 버튼 탭 시 OS 레벨 마이크 권한 팝업이 표시되지 않으며,
OS 설정에서 수동 허용 후에도 "마이크 접근이 필요해요" 모달이 계속 표시되어 녹음 불가.

**근본 원인 2개:**
1. `babel.config.js`의 module-resolver가 `expo-av` → `stubs/expo-av.js`로 강제 리다이렉트.
   stub의 `requestPermissionsAsync`는 항상 `{ status: 'granted' }`를 반환하므로
   실제 OS 권한 팝업이 절대 뜨지 않음 (granted 처리로 직행).
   단, 런타임 환경에 따라 stub resolve 경로가 달라지면 `expo-av` native module 미설치 상태가 노출됨.
2. `RecordGuideScreen.tsx`의 `handleStartRecording`이 `{ status, canAskAgain }` 중 `status`만 읽음.
   iOS/Android 모두 권한 최초 거부 후 `canAskAgain === false`가 되면
   `requestPermissionsAsync()` 재호출해도 OS 팝업 없이 즉시 `denied` 반환 → 무한 모달.

---

## 변경 파일 목록

| 파일 | 변경 내용 |
|---|---|
| `apps/mobile/package.json` | `expo-av` 런타임 의존성 추가 |
| `apps/mobile/babel.config.js` | `expo-av` stub alias 제거 |
| `apps/mobile/src/screens/RecordGuideScreen.tsx` | `handleStartRecording` 3-갈래 분기 |
| `apps/mobile/stubs/expo-av.js` | 테스트 전용 격리 주석 추가 (파일 유지, 런타임 제거) |
| `apps/mobile/src/__tests__/screens/S09RecordGuideScreen.test.tsx` | 신규 — 권한 분기 3-갈래 검증 |

---

## 1. package.json — expo-av 추가

### 변경 사유
`expo-av`가 `dependencies`에 없어 stub이 대신 쓰이고 있었음.
Expo SDK 55에서 `expo-av`는 deprecated이지만 여전히 설치·동작 가능.
RecordGuideScreen·RecordScreen이 `Audio.requestPermissionsAsync` / `Audio.Recording` 사용 중이므로
`expo-audio`(신 API)로의 전환은 별도 에픽으로 관리; 이번 버그픽스는 expo-av 설치로 최소 수정.

### 설치 명령 (engineer 실행)
```bash
cd apps/mobile
npx expo install expo-av
```
`npx expo install`을 사용해야 Expo SDK 55 호환 버전으로 고정됨 (`npm install` 금지).

---

## 2. babel.config.js — stub alias 제거

### 현재 (제거 대상)
```js
'expo-av': './stubs/expo-av.js',
```

### 변경 후
해당 줄 삭제. 런타임은 `node_modules/expo-av`를 직접 참조.

### 주의
- `stubs/expo-av.js` 파일 자체는 삭제하지 않음 → 향후 테스트 mock 참조용으로 보관.
- babel alias 제거 시 `vitest.config.ts`의 alias에 `expo-av` 항목이 없어도 무관
  (setup.ts에서 `vi.mock('expo-av', ...)` 로 완전 대체됨).

---

## 3. RecordGuideScreen.tsx — handleStartRecording 분기 보강

### 현재 로직 (Line 43–49)
```ts
const handleStartRecording = async () => {
  const { status } = await Audio.requestPermissionsAsync();
  if (status === 'granted') {
    navigation.navigate('Record', { mode, songKey: '' });
  } else if (status === 'denied') {
    setShowPermissionModal(true);
  }
};
```

### 변경 후 로직
```ts
const handleStartRecording = async () => {
  // 1차: 현재 권한 상태 확인 (팝업 없이)
  const current = await Audio.getPermissionsAsync();

  if (current.status === 'granted') {
    navigation.navigate('Record', { mode, songKey: '' });
    return;
  }

  // canAskAgain === true → OS 팝업 요청 가능
  if (current.canAskAgain) {
    const { status } = await Audio.requestPermissionsAsync();
    if (status === 'granted') {
      navigation.navigate('Record', { mode, songKey: '' });
    } else {
      // 요청했는데 거부됨 → 재요청 가능성 있으므로 모달은 표시하지 않음
      // (다음 탭 시 다시 canAskAgain 체크)
      // 단, 거부 후 canAskAgain=false로 바뀔 수 있으므로 모달 표시
      const after = await Audio.getPermissionsAsync();
      if (!after.canAskAgain) {
        setShowPermissionModal(true);
      }
    }
    return;
  }

  // canAskAgain === false → OS 팝업 불가, 설정 유도
  setShowPermissionModal(true);
};
```

### 분기 설명

| 상태 | 행동 |
|---|---|
| `granted` | 즉시 Record 화면 이동 |
| `canAskAgain === true` | `requestPermissionsAsync()` 호출 → OS 팝업 표시 → 허용 시 이동, 거부 후 `canAskAgain=false`면 설정 유도 모달 |
| `canAskAgain === false` | OS 팝업 띄울 수 없으므로 "설정으로 가기" 모달 즉시 표시 |

### 결정 근거
- iOS: 권한을 한 번 거부하면 시스템이 `canAskAgain = false`로 설정; 이후 재요청 불가
- Android: 두 번 거부 또는 "다시 묻지 않기" 선택 시 `canAskAgain = false`
- `getPermissionsAsync()`를 먼저 호출해 불필요한 팝업 재요청을 방지 (UX 개선)
- `requestPermissionsAsync()` 반환값도 `{ status, canAskAgain }` 모두 포함이므로
  최적화 시 2번 API 호출 → 1번으로 축소 가능하나, 가독성 위해 분리 유지

### import 변경 없음
`Audio.getPermissionsAsync`는 `expo-av`에 이미 존재하는 API.
기존 `import { Audio } from 'expo-av'`로 그대로 사용 가능.

---

## 4. stubs/expo-av.js — 런타임 격리 명시

### 변경 내용
파일 상단 주석을 아래로 교체:

```js
// ⚠️  테스트 전용 스텁 (TEST-ONLY STUB)
// 런타임(Expo/Babel) 에서는 절대 사용하지 않는다.
// babel.config.js의 module-resolver alias에서 expo-av 항목이 제거되었으므로
// 이 파일은 apps/mobile/src/__tests__/setup.ts의 vi.mock() 참조용으로만 보관.
// 런타임 권한 요청이 필요하면 node_modules/expo-av 를 직접 사용한다.
```

---

## 5. S09RecordGuideScreen.test.tsx — 신규 테스트 파일

**파일 경로**: `apps/mobile/src/__tests__/screens/S09RecordGuideScreen.test.tsx`

### 테스트 전략
- `expo-av`는 `setup.ts`에서 전역 mock되어 있으나 `Audio.getPermissionsAsync`가 없음 → 각 테스트에서 override
- `challengesApi.getRandomPhrase` mock 필요
- navigation mock 재사용 패턴 (`mockNavigate`)

### Mock 추가 대상 (setup.ts 미포함 → 테스트 파일 내 로컬 mock)
```ts
// setup.ts의 expo-av mock에 getPermissionsAsync 누락 → 테스트 파일에서 보완
vi.mock('expo-av', () => ({
  Audio: {
    getPermissionsAsync: vi.fn(),
    requestPermissionsAsync: vi.fn(),
    setAudioModeAsync: vi.fn().mockResolvedValue(undefined),
    Sound: { createAsync: vi.fn() },
  },
}))
```

### 테스트 케이스 목록

| ID | 시나리오 | 기대 결과 |
|---|---|---|
| REQ-01 | granted 상태에서 버튼 탭 | `navigate('Record', ...)` 호출 |
| REQ-02 | canAskAgain=true, requestPermissionsAsync → granted | `navigate('Record', ...)` 호출 |
| REQ-03 | canAskAgain=true, requestPermissionsAsync → denied, 이후 canAskAgain=false | 모달 표시 |
| REQ-04 | canAskAgain=false (최초 상태) | 모달 즉시 표시, OS 팝업 요청 없음 |
| REQ-05 | 모달 "설정으로 가기" 탭 | `Linking.openSettings()` 호출 |
| REQ-06 | 모달 "나중에" 탭 | 모달 닫힘 |
| REQ-07 | 가이드 목록 3개 항목 렌더링 | 조용한 방 / 20~30cm / 30초 이상 텍스트 존재 |
| REQ-08 | challengePhrase 로드 성공 | 문구가 화면에 표시 |

### 의사코드 — REQ-04 예시
```ts
it('REQ-04: canAskAgain=false → 모달 즉시 표시, requestPermissionsAsync 미호출', async () => {
  mockGetPermissions.mockResolvedValue({ status: 'denied', canAskAgain: false, granted: false });
  const { getByLabelText, findByText } = renderScreen();
  fireEvent.press(getByLabelText('녹음 시작'));
  expect(await findByText('마이크 접근이 필요해요')).toBeTruthy();
  expect(mockRequestPermissions).not.toHaveBeenCalled();
});
```

---

## 수정 순서 (engineer 권고)

```
1. npx expo install expo-av          # 패키지 설치 (package.json + package-lock 동시 갱신)
2. babel.config.js 수정              # stub alias 제거
3. stubs/expo-av.js 주석 교체        # 테스트 전용 명시
4. RecordGuideScreen.tsx 수정        # handleStartRecording 3-갈래 분기
5. S09RecordGuideScreen.test.tsx 신규 작성
6. npx vitest run                    # 기존 테스트 통과 + 신규 테스트 GREEN 확인
7. iOS 시뮬레이터 / Android 에뮬레이터 실기기 권한 흐름 수동 검증
```

---

## 검증 기준 (QA Pass 조건)

- [ ] 앱 최초 실행 → "녹음 시작할게요" 탭 → OS 권한 팝업 표시 (iOS / Android)
- [ ] 권한 허용 → Record 화면 이동
- [ ] 권한 한 번 거부 후 재탭 → 다시 OS 팝업 또는 "설정으로 가기" 모달 (canAskAgain 여부에 따라)
- [ ] OS 설정에서 수동 허용 후 앱 재진입 → 녹음 정상 시작
- [ ] vitest 전체 통과 (기존 회귀 없음)

---

## 관련 이슈

Closes #108
