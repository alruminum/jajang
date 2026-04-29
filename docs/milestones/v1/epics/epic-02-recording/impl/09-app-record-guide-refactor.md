---
depth: std
design: optional
---

# impl/09 — 앱: 녹음 가이드 화면 리팩토링 (S09) — #133

**Epic**: 02 — 목소리 녹음 & 품질 검증
**커버 스토리**: Story 2 갱신 (challenge-response 제거 → 가사 미리보기 + 헤드폰 chip)
**선행 조건**: impl/11 완료 (lyrics.ts, bgmTracks.ts 자산 모듈)
**이슈**: #133
**예상 소요**: 2~3시간

---

## 1. 생성/수정할 파일 목록

```
apps/mobile/src/
├── screens/
│   └── RecordGuideScreen.tsx      [수정 — challenge 제거 + 가사박스 + 헤드폰chip]
├── components/
│   └── LyricsBox.tsx              [신규 — 가사 박스 컴포넌트]
└── services/
    └── api/challenges.ts          [삭제 예약 — impl/12에서 처리]
```

삭제 대상 (impl/12에서 실행):
- `apps/mobile/src/services/api/challenges.ts`

---

## 2. 설계 결정

### challenge-response 박스 → 가사 미리보기 박스 교체 근거

PRD v1.2.1 §F2: "challenge-response 문구는 폐기(가사 박스로 대체)". challenge-response는 안티봇 수단으로 설계되었으나, PRD 결정으로 이번 마일스톤에서 검증 약화 risk를 수용하고 라이브 녹음 강제 + TOS로 대체. 가사 박스는 안티봇 검증 수단이 아님.

### 가사 데이터 접근 방식: 동기 인-메모리 상수 모듈

`lyrics.ts` (impl/11)에서 `export const LYRICS` 상수를 동기 import. 이유:
- 가사 6곡 전체 용량이 수 KB 미만 → 번들에 포함해도 무방
- API 왕복 없이 즉시 표시 (S09는 카운트다운 시작 전 정적 안내 화면)
- 비동기 로딩 중 로딩 상태 처리 비용 불필요

### 헤드폰 chip: 비인터랙티브 텍스트 chip

UX-Flow S09: "비인터랙티브 (안내 텍스트). 자동 헤드폰 감지·강제 모달은 V2". chip 탭 이벤트 없음 — 단순 View + Text. 카피: "이어폰을 끼면 더 또렷하게 담겨요". 허밍 모드에만 노출, 쉬 모드에서 미노출.

### 가사 미준비 fallback

`lyrics.ts`에 없는 songKey가 전달될 경우 가사 박스를 숨기고 "허밍해 주세요" 텍스트 표시. 6곡 모두 출시 시점 가사 준비되므로 안전망 코드만 유지.

### RecordGuide 네비게이션 파라미터 변경

현재 `RecordGuide: { mode: 'humming' | 'shush' }` — songKey 추가 필요. S08(RecordModeScreen)에서 RecordGuide 이동 시 `songKey`를 전달하도록 수정.

```typescript
// navigation/types.ts 변경
RecordGuide: { mode: 'humming' | 'shush'; songKey: string };
```

RecordModeScreen.tsx에서 navigate('RecordGuide', { mode, songKey }) 호출부 확인 후 수정.

---

## 3. LyricsBox 컴포넌트 인터페이스

```typescript
// apps/mobile/src/components/LyricsBox.tsx

interface LyricsBoxProps {
  songKey: string              // 'brahms' | 'hush' | 'mozart' | 'schubert' | 'twinkle' | 'rockabye'
  mode: 'preview' | 'recording'  // S09=preview (정적), S10=recording (정적, 동일 컴포넌트)
}

// lyrics.ts에서 해당 songKey lookup
// 없으면 null 반환 (fallback: 컴포넌트 미렌더)
```

**렌더 조건**:
- `mode=preview` (S09): 타이틀 + 구분선 + 가사 줄 목록. 배경 `#1A1D30`, radius 16, border `#2A2E48`
- `mode=recording` (S10): S09와 동일 스타일. 패딩 차이 없음 (동일 컴포넌트 재사용)

**fallback 렌더**: lyrics 없음 → `<Text>"허밍해 주세요"</Text>` (박스 없이 단순 텍스트). 허밍 모드에서 songKey 미매핑 시 적용.

---

## 4. RecordGuideScreen 수정 핵심 로직 (의사코드)

```typescript
// 변경 전: challengesApi.getRandomPhrase() useEffect + challengePhrase state
// 변경 후: lyrics.ts에서 동기 조회

import { LYRICS } from '../data/lyrics'      // impl/11 신규
import { LyricsBox } from '../components/LyricsBox'

// route.params: { mode, songKey }
const { mode, songKey } = route.params

// challenge 관련 state/effect 전부 제거
// challengesApi import 제거

// 헤드폰 chip: 허밍 모드 한정 노출
const showHeadphoneChip = mode === 'humming'

// 가사 박스: 허밍 모드 한정 노출
const showLyricsBox = mode === 'humming'

// CTA 탭: navigate('Record', { mode, songKey }) — songKey 전달
```

**제거 대상**:
- `import { challengesApi }` 구문
- `useState<string | null>(null)` for challengePhrase
- `useEffect(() => { challengesApi.getRandomPhrase()... })` 블록
- challenge 박스 JSX (`challengePhrase != null && <View style={styles.challengeBox}>...`)

**추가 대상**:
- `import { LyricsBox }` 구문
- 헤드폰 chip View (`showHeadphoneChip && <HeadphoneChip />`)
- `{showLyricsBox && <LyricsBox songKey={songKey} mode="preview" />}`

---

## 5. 가이드 항목 수정 (허밍/쉬 모드 분기)

```typescript
const GUIDE_ITEMS_HUMMING = [
  '조용한 방에서 해주세요',
  '마이크를 입에서 20~30cm 거리로',
  '30초 이상 이어주세요',
]

const GUIDE_ITEMS_SHUSH = [
  '조용한 방에서 해주세요',
  '마이크를 입에서 20~30cm 거리로',
  '쉬이이~ 길게 30초 이상 해주세요',
]

const GUIDE_ITEMS = mode === 'humming' ? GUIDE_ITEMS_HUMMING : GUIDE_ITEMS_SHUSH
```

---

## 6. HeadphoneChip 인라인 컴포넌트

LyricsBox와 달리 재사용 빈도 낮으므로 RecordGuideScreen 파일 내 인라인 정의.

```typescript
// RecordGuideScreen.tsx 내부

function HeadphoneChip() {
  return (
    <View style={chipStyles.container}>
      <Text style={chipStyles.icon}>🎧</Text>
      <Text style={chipStyles.text}>이어폰을 끼면 더 또렷하게 담겨요</Text>
    </View>
  )
}

const chipStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#82B090',      // 세이지 그린 outline
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    marginBottom: 20,
  },
  icon:  { fontSize: 14, marginRight: 6 },
  text:  { color: '#82B090', fontSize: 13, fontFamily: 'NotoSansKR-Regular' },
})
```

---

## 7. RecordModeScreen 수정 범위

S08(RecordModeScreen)의 RecordGuide navigate 호출에 `songKey` 파라미터 추가. RecordModeScreen은 `selectedSongKey`를 store에서 읽으므로:

```typescript
// RecordModeScreen.tsx — navigate 호출부
navigation.navigate('RecordGuide', {
  mode,
  songKey: selectedSongKey ?? '',  // useRecordingStore에서 읽음
})
```

`selectedSongKey`가 빈 문자열인 경우 → LyricsBox fallback 처리로 안전하게 처리됨.

---

## 8. 애니메이션 (UX-Flow 명세)

| 요소 | 동작 | 구현 방법 |
|---|---|---|
| 가이드 항목 | stagger fade-in 50ms 간격 | `Animated.timing` + `useEffect` loop |
| 가사 박스 | fade-in 400ms | `Animated.Value` 0→1, `useEffect` on mount |
| 헤드폰 chip | static (애니메이션 없음) | 정적 렌더 |

MVP 시 stagger 애니메이션 구현 복잡도가 높으면 단순 fade-in으로 대체 가능 (engineer 판단). 단, 가사 박스 400ms fade-in은 PRD/UX 명세이므로 구현 필수.

---

## 9. 수용 기준

- [ ] S09 진입 시 challengesApi 호출 없음 (네트워크 요청 제거 확인)
- [ ] 허밍 모드 진입 시: 헤드폰 chip 노출 (세이지 그린 outline, 비인터랙티브)
- [ ] 허밍 모드 진입 시: 선택 곡 가사 박스 노출 (400ms fade-in, 1절 4~6줄)
- [ ] 쉬 모드 진입 시: 헤드폰 chip 미노출, 가사 박스 미노출
- [ ] 가사 미준비 fallback: songKey 미매핑 시 가사 박스 숨김 + "허밍해 주세요" 텍스트 (chip은 유지)
- [ ] CTA 탭 → navigate('Record', { mode, songKey }) — songKey 전달됨
- [ ] 마이크 권한 요청 로직 기존과 동일 (getRecordingPermissionsAsync → requestRecordingPermissionsAsync)
- [ ] 권한 거부 → PermissionModal 노출

---

## 10. 주의사항

- `RecordGuide` route params에 `songKey` 추가 후 types.ts 변경 필수. 변경 누락 시 TypeScript 오류 발생.
- S08에서 `selectedSongKey`가 store에 설정되어 있는지 확인. S07에서 이미 `setSelectedSong`이 호출되므로 정상이나, deep-link 등 비정상 진입 시 빈 문자열 방어 처리 필요.
- `challengesApi` import 제거 후 `services/api/index.ts`에서 re-export 구문도 함께 제거 확인 (impl/12에서 정리).
- 색상: 헤드폰 chip border/text는 `#82B090` (Sage Mist accent). 기존 파일에서 `#5A7AA8` (secondary blue)를 사용하는 부분이 있으므로 혼용 주의.
