---
depth: std
design: required
---

# impl/13 — 앱: 녹음 가이드 화면 v1.3.1 피벗 (S09 단일흐름)

**Epic**: 02 — 목소리 녹음 & 품질 검증  
**커버 스토리**: Story 2 재정의 (S09 단일흐름 — 쉬 모드 분기 완전 제거 + 이어폰 모달 1회 정책 + S07 직결 네비게이션)  
**선행 조건**: impl/11 완료 (lyrics.ts, bgmTracks.ts), impl/09 완료 (LyricsBox 컴포넌트)  
**예상 소요**: 3~4시간

---

## 1. 생성/수정할 파일 목록

```
apps/mobile/src/
├── screens/
│   ├── RecordGuideScreen.tsx         [수정 — mode 분기 제거 + 이어폰 모달 1회 정책]
│   └── SongSelectScreen.tsx          [수정 — navigate RecordGuide 직결 (RecordMode 경유 제거)]
│   └── RecordModeScreen.tsx          [삭제 예약 — S08 폐기. 이번 impl에서 navigate 참조 제거 후]
└── navigation/
    └── types.ts                      [수정 — RecordMode route 제거, RecordGuide params 변경]
```

---

## 2. 설계 결정

### S08(RecordModeScreen) 폐기 → S07 직결 S09

PRD v1.3.0 §화면인벤토리: "S08(녹음 모드 선택) 화면 폐기". S07(자장가 선택) → S09(녹음 가이드) 직결. RecordModeScreen.tsx 는 파일을 삭제하지 않고 navigation/types.ts에서 route 정의만 제거 — 삭제는 별도 클린업 태스크.

### RecordGuide params 변경

```typescript
// 기존
RecordGuide: { mode: 'humming' | 'shush'; songKey: string }

// 변경 후
RecordGuide: { songKey: string }   // mode 제거 — 단일 흐름
```

Record params 도 동일하게 mode 제거:
```typescript
// 기존
Record: { songKey: string; mode: 'humming' | 'shush' }

// 변경 후
Record: { songKey: string }
```

### 이어폰 미착용 감지 — 1회만 노출

PRD §F2 + §위험/완화 표: "자동 감지/강제 모달 없음 (risk 수용)". 이어폰 자동 감지 구현 X.

**자동 감지 API 부재 확인**: `expo-audio`(v55.0.14)에는 이어폰 포트 감지 API 없음. `expo-av`도 프로젝트 미설치. PRD 자체도 "자동 감지는 V2 후보"로 명시 — 자동 감지 코드 작성 금지.

구현 방식 (단순 1회 모달): 첫 번째 녹음 시작 시 *항상* 이어폰 모달 표시. "그래도 진행" 탭 → `AsyncStorage.setItem('@jajang:earphone_warning_dismissed', 'true')` 저장 → 이후 앱 재실행해도 모달 미노출.

AsyncStorage 키 컨벤션: 기존 코드베이스 키 패턴 (`notif_permission_asked`, `LAST_CHECKED_KEY` 등) 이 prefix 미사용. 단, `@jajang:` prefix는 충돌 방지상 권장. 이번 impl에서는 `'@jajang:earphone_warning_dismissed'` 사용.

### 단일 흐름 RecordGuideScreen

- mode 파라미터 제거
- 이어폰 chip 항상 노출 (구 허밍 모드 한정 → 전체)
- 가사 박스 항상 노출 (구 허밍 모드 한정 → 전체)
- 가이드 문구 단일화: "1 loop 동안 자유롭게 — 따라불러도, 허밍해도, 쉬쉬 소리만 내도 좋습니다"

---

## 3. navigation/types.ts 변경

```typescript
// 제거
RecordMode: undefined

// 변경
RecordGuide: { songKey: string }   // mode 필드 제거

// 변경
Record: { songKey: string }        // mode 필드 제거
```

---

## 4. SongSelectScreen 수정 범위

```typescript
// 변경 전 (S07 → S08)
navigation.navigate('RecordMode')

// 변경 후 (S07 → S09 직결)
navigation.navigate('RecordGuide', { songKey: selectedSongKey })
```

`selectedSongKey`는 기존 recordingSlice 또는 로컬 state에서 읽음. 변경 없음.

---

## 5. RecordGuideScreen 수정 핵심 로직

### 이어폰 감지 로직 (의사코드)

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage'

const EARPHONE_WARNING_KEY = '@jajang:earphone_warning_dismissed'

// 녹음 시작 CTA 탭 핸들러
const handleStartRecording = async () => {
  // 마이크 권한 체크 (기존 로직 유지)
  const micGranted = await checkMicPermission()
  if (!micGranted) { showPermissionModal(); return }

  // 이어폰 경고 1회 노출 체크 (자동 감지 없음 — PRD §위험/완화)
  const warningDismissed = await AsyncStorage.getItem(EARPHONE_WARNING_KEY)
  if (!warningDismissed) {
    setShowEarphoneModal(true)
    return
  }

  // 모두 통과 → S10 이동
  navigation.navigate('Record', { songKey })
}

// 이어폰 자동 감지 없음 — PRD §위험/완화: "자동 감지는 V2 후보". 1회 모달 정책만 구현.

// "그래도 진행" 탭
const handleProceedWithoutEarphones = async () => {
  await AsyncStorage.setItem(EARPHONE_WARNING_KEY, 'true')
  setShowEarphoneModal(false)
  navigation.navigate('Record', { songKey })
}
```

### 모드 분기 제거 범위

- `const { mode, songKey } = route.params` → `const { songKey } = route.params`
- `const showHeadphoneChip = mode === 'humming'` → 삭제 (항상 표시)
- `const showLyricsBox = mode === 'humming'` → 삭제 (항상 표시)
- `const GUIDE_ITEMS = mode === 'humming' ? ... : ...` → 단일 GUIDE_ITEMS로 교체
- navigate 호출: `navigation.navigate('Record', { mode, songKey })` → `navigation.navigate('Record', { songKey })`

### 단일 가이드 문구

```typescript
const GUIDE_ITEMS = [
  '조용한 방에서 해주세요',
  '마이크를 입에서 20~30cm 거리로',
  '이어폰을 끼면 더 또렷하게 담겨요',
]

const GUIDE_HEADLINE = '1 loop 동안 자유롭게\n따라불러도, 허밍해도, 쉬쉬 소리만 내도 좋습니다\n더 많이 녹음할수록 더 풍성해집니다'
```

---

## 6. 이어폰 미착용 모달 컴포넌트 (인라인)

```typescript
// RecordGuideScreen.tsx 내부 인라인

interface EarphoneWarningModalProps {
  visible: boolean
  onProceed: () => void
  onCancel: () => void
}

function EarphoneWarningModal({ visible, onProceed, onCancel }: EarphoneWarningModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={modalStyles.overlay}>
        <View style={modalStyles.sheet}>
          <Text style={modalStyles.title}>이어폰을 끼면 더 잘 담겨요</Text>
          <Text style={modalStyles.body}>
            이어폰 없이 녹음하면 스피커 소리가 마이크에 섞일 수 있어요.{'\n'}
            그래도 진행할까요?
          </Text>
          <Pressable
            style={modalStyles.proceedBtn}
            onPress={onProceed}
            accessibilityLabel="이어폰 없이 진행하기"
          >
            <Text style={modalStyles.proceedText}>그래도 진행</Text>
          </Pressable>
          <Pressable
            style={modalStyles.cancelBtn}
            onPress={onCancel}
            accessibilityLabel="돌아가기"
          >
            <Text style={modalStyles.cancelText}>이어폰 끼고 할게요</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}
```

---

## 7. Design Ref

`design: required` — S09 화면 레이아웃 변경 (모드 선택 UI 완전 제거, 단일 가이드 흐름).

engineer는 design-handoff.md + Pencil frame 참조. S09 frame ID 확인 필요.

---

## 8. 수용 기준

- [ ] (TEST) S07에서 곡 선택 후 다음 탭 → RecordGuide 직결 이동 (RecordMode 경유 없음)
- [ ] (TEST) `navigation/types.ts`에 `RecordMode` route 없음 (`grep RecordMode src/navigation/types.ts` → 0)
- [ ] (TEST) RecordGuideScreen route.params에 `mode` 필드 없음 (TypeScript 컴파일 오류 없음)
- [ ] (BROWSER:DOM) S09 진입 시 이어폰 chip + 가사 박스 항상 노출 (모드 조건 없음)
- [ ] (MANUAL) 첫 녹음 시작 탭 → 이어폰 경고 팝업 노출 (이어폰 착용 여부 무관 — 1회 정책)
- [ ] (MANUAL) "그래도 진행" 탭 후 앱 재실행 → S09에서 녹음 시작 탭 시 경고 팝업 미노출
- [ ] (TEST) AsyncStorage `earphones_warning_dismissed = 'true'` 저장 확인
- [ ] (TEST) 가사 미준비 songKey → 가사 박스 숨김 + "자유롭게 따라불러 주세요" 텍스트 노출
- [ ] (TEST) CTA 탭 → `navigate('Record', { songKey })` — mode 파라미터 없음

---

## 9. 주의사항 및 코드베이스 영향 범위

### 이어폰 감지 API 없음 (확인 완료)
`expo-audio` v55.0.14 에는 이어폰 포트 감지 API 없음. `expo-av` 미설치. 자동 감지 코드 작성 금지. 1회 모달 = AsyncStorage 플래그만으로 구현.

### mode 제거 시 깨지는 테스트 파일 목록 (engineer 수정 필수)

| 파일 | 영향 내용 | 수정 방향 |
|---|---|---|
| `__tests__/screens/S09RecordGuideScreen.test.tsx` | `params: { mode: 'humming' }` + `navigate('Record', { mode: 'humming', songKey: '' })` 단언 | `mode` 제거, `songKey` 추가, navigate 단언 수정 |
| `__tests__/screens/S09RecordGuideScreen.refactor.test.tsx` | `renderWith({ mode: 'humming'|'shush', songKey })` 호출 14개 + 쉬모드/허밍모드 분기 케이스 | mode 파라미터 제거 + 단일 흐름 케이스로 통합 |
| `__tests__/screens/S07SongSelectScreen.test.tsx` | `navigate('RecordMode')` 단언 3곳 (`AC-08`, `free 2/3`, `free 3/3`) | `navigate('RecordGuide', { songKey })` 로 변경 |

### 추가 수정 대상 (navigation 관련)

- `RecordScreen.tsx` (기존 폐기 예정 파일) `handleCancel` → `navigation.navigate('RecordMode')` 참조. 이번 impl 범위 아님 — 별도 클린업.
- `S10RecordScreen.tsx` `handleCancel` → 동일하게 `RecordMode` 참조. 별도 클린업.
- `S11PreviewScreen.tsx` line 100~103: `mode: recordingMode ?? 'humming'` 를 Record params에 전달 → impl/14(RecordScreen mode 제거)와 함께 수정.
- `MainNavigator.tsx` — `RecordMode` Screen 등록 제거 + `RecordModeScreen` import 제거.

### 파일 삭제 정책
RecordModeScreen.tsx 파일 자체는 이번 impl에서 삭제하지 않는다. navigation stack에서 route + import 제거만. 파일 삭제는 별도 클린업 impl.

### AsyncStorage 키 컨벤션
기존 코드베이스 키(`notif_permission_asked`, `jajang:offline_deletions` 등)는 prefix가 혼재. 이번 impl은 `@jajang:` prefix 사용. 기존 키와 충돌 없음.
