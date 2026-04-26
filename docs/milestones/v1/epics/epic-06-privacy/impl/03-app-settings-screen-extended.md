---
depth: std
design: skipped
---

# impl/03 — 앱: S16 SettingsScreen 데이터 관리 섹션 확장

**Epic**: 06 — 개인정보 & 데이터 관리  
**Story**: Story 1 (목소리 샘플 삭제), Story 2 (생성 음원 삭제)  
**예상 소요**: 5~7h

---

## 1. 생성 / 수정 파일

| 경로 | 작업 |
|---|---|
| `/Users/dc.kim/project/jajang/apps/mobile/src/screens/SettingsScreen.tsx` | 데이터 관리 섹션 추가: 목소리 샘플 삭제 + 음원 일괄 삭제 + 계정 탈퇴 진입점 |
| `/Users/dc.kim/project/jajang/apps/mobile/src/services/dataManagementApi.ts` | 신규 — 목소리 샘플 삭제 / 음원 삭제 API 래퍼 |
| `/Users/dc.kim/project/jajang/apps/mobile/src/components/DeleteTracksSheet.tsx` | 신규 — 음원 개별/전체 삭제 바텀 시트 |
| `/Users/dc.kim/project/jajang/apps/mobile/src/store/generationSlice.ts` | 음원 삭제 후 로컬 목록 갱신 액션 추가 |
| `/Users/dc.kim/project/jajang/apps/mobile/src/__tests__/SettingsScreen.test.tsx` | 신규 — 삭제 버튼 활성 조건 + 확인 다이얼로그 렌더링 테스트 |

---

## 2. 서버 API 의존 (Epic 02/03에서 기존 구현 확인 필요)

| 엔드포인트 | 용도 | 비고 |
|---|---|---|
| `DELETE /recordings/me/sample` | 목소리 샘플 즉시 삭제 | Epic 02 구현 확인. 없으면 신규 추가 요청 |
| `GET /users/me/voice-sample-status` | 샘플 존재 여부 조회 | 버튼 활성 조건 판단용 |
| `DELETE /tracks/{track_id}` | 개별 음원 삭제 | Epic 04 구현 확인 |
| `DELETE /tracks` | 전체 음원 삭제 (bulk) | 신규 엔드포인트 — Epic 06 범위 |

### `DELETE /tracks` bulk 삭제 스펙 (신규)

```
DELETE /tracks
Authorization: Bearer <access_token>
→ 204 No Content

동작: 해당 유저의 모든 completed 음원 S3 삭제 + DB 레코드 삭제
```

---

## 3. TypeScript 시그니처

### `services/dataManagementApi.ts`

```typescript
import { apiClient } from './apiClient'

export interface VoiceSampleStatus {
  hasSample: boolean
  sampleStatus: 'uploaded' | 'validated' | 'generation_started' | 'deleted' | null
}

export interface Track {
  id: string
  songKey: string
  createdAt: string
  s3Key: string | null
}

/** 목소리 샘플 존재 여부 조회 */
export async function getVoiceSampleStatus(): Promise<VoiceSampleStatus> {
  const res = await apiClient.get('/users/me/voice-sample-status')
  return res.data
}

/** 목소리 샘플 즉시 삭제 */
export async function deleteVoiceSample(): Promise<void> {
  await apiClient.delete('/recordings/me/sample')
}

/** 개별 음원 삭제 */
export async function deleteTrack(trackId: string): Promise<void> {
  await apiClient.delete(`/tracks/${trackId}`)
}

/** 전체 음원 일괄 삭제 */
export async function deleteAllTracks(): Promise<void> {
  await apiClient.delete('/tracks')
}
```

### `store/generationSlice.ts` 추가 액션

```typescript
// 기존 GenerationSlice 인터페이스에 추가
interface GenerationSlice {
  // ... 기존 필드
  removeTrack: (trackId: string) => void
  clearAllTracks: () => void
}

// Zustand 구현부에 추가
removeTrack: (trackId) =>
  set((state) => ({
    tracks: state.tracks.filter((t) => t.id !== trackId),
  })),

clearAllTracks: () =>
  set({ tracks: [] }),
```

### `components/DeleteTracksSheet.tsx` (바텀 시트)

```typescript
import React, { useCallback } from 'react'
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native'
import BottomSheet from '@gorhom/bottom-sheet'
import { Track, deleteTrack, deleteAllTracks } from '../services/dataManagementApi'
import { useGenerationStore } from '../store/generationSlice'
import { showToast } from '../utils/toast'

interface Props {
  tracks: Track[]
  onClose: () => void
}

export function DeleteTracksSheet({ tracks, onClose }: Props) {
  const { removeTrack, clearAllTracks } = useGenerationStore()

  const handleDeleteSingle = useCallback(async (track: Track) => {
    // 인라인 확인 다이얼로그 → 확인 후 API 호출
    await deleteTrack(track.id)
    removeTrack(track.id)
    showToast('삭제했어요')
  }, [removeTrack])

  const handleDeleteAll = useCallback(async () => {
    // 2단계 확인: "전부 삭제할까요? 되돌릴 수 없어요"
    await deleteAllTracks()
    clearAllTracks()
    showToast('모든 자장가를 삭제했어요')
    onClose()
  }, [clearAllTracks, onClose])

  return (
    <BottomSheet snapPoints={['60%', '90%']} onClose={onClose}>
      {/* 음원 목록 + 개별 삭제 */}
      <FlatList
        data={tracks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.trackName}>{songKeyToLabel(item.songKey)}</Text>
            <TouchableOpacity
              onPress={() => handleDeleteSingle(item)}
              accessibilityLabel={`${songKeyToLabel(item.songKey)} 삭제`}
            >
              <Text style={styles.deleteBtn}>삭제</Text>
            </TouchableOpacity>
          </View>
        )}
      />
      {/* 전체 삭제 CTA */}
      {tracks.length > 0 && (
        <TouchableOpacity
          style={styles.deleteAllBtn}
          onPress={handleDeleteAll}
          accessibilityLabel="모든 자장가 삭제"
        >
          <Text style={styles.deleteAllText}>모두 삭제하기</Text>
        </TouchableOpacity>
      )}
    </BottomSheet>
  )
}

function songKeyToLabel(key: string): string {
  const map: Record<string, string> = {
    brahms: '브람스 자장가',
    mozart: '모차르트 자장가',
    schubert: '슈베르트 자장가',
    twinkle: '반짝반짝 작은 별',
    rockabye: '록어바이 베이비',
    hush: '허시 리틀 베이비',
  }
  return map[key] ?? key
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  trackName: { flex: 1, color: '#EEF0F8', fontSize: 16 },
  deleteBtn: { color: '#E8A94A', fontSize: 14 },
  deleteAllBtn: { marginHorizontal: 20, marginBottom: 32, paddingVertical: 16,
    backgroundColor: '#21253E', borderRadius: 14, alignItems: 'center' },
  deleteAllText: { color: '#FF6B6B', fontSize: 16, fontWeight: '500' },
})
```

---

## 4. SettingsScreen 데이터 관리 섹션 로직

```typescript
// SettingsScreen.tsx 에 추가할 "내 데이터 관리" 섹션 핵심 로직

// 상태
const [sampleStatus, setSampleStatus] = useState<VoiceSampleStatus | null>(null)
const [isSampleDeleting, setIsSampleDeleting] = useState(false)
const [isTracksSheetOpen, setIsTracksSheetOpen] = useState(false)
const tracks = useGenerationStore((s) => s.tracks)

// 진입 시 샘플 상태 조회
useEffect(() => {
  getVoiceSampleStatus().then(setSampleStatus)
}, [])

// 목소리 샘플 삭제 핸들러
const handleDeleteVoiceSample = async () => {
  Alert.alert(
    '목소리 샘플 삭제',
    '삭제하면 복구할 수 없어요. 목소리 샘플을 삭제할까요?',
    [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제할게요',
        style: 'destructive',
        onPress: async () => {
          setIsSampleDeleting(true)
          try {
            await deleteVoiceSample()
            setSampleStatus({ hasSample: false, sampleStatus: 'deleted' })
            showToast('삭제했어요')
          } catch (e) {
            showToast('삭제 중 문제가 생겼어요. 다시 시도해주세요.')
          } finally {
            setIsSampleDeleting(false)
          }
        },
      },
    ]
  )
}
```

### 렌더링 조건

| 항목 | 활성 조건 | 비활성 조건 |
|---|---|---|
| 목소리 샘플 삭제 | `sampleStatus.hasSample === true` | 이미 삭제됨 → "이미 삭제되었어요" 그레이 텍스트 표시 |
| 생성 음원 삭제 | `tracks.length > 0` | 음원 없음 → 행 자체 숨김 또는 그레이 |
| 계정 탈퇴 | 항상 노출 | — |

---

## 5. 오프라인 대응

Story 2 수용 기준: "오프라인 상태 / When 삭제 요청 / Then 로컬만 즉시 삭제, 서버는 온라인 복귀 후 처리"

구현 방식:
```typescript
const handleDeleteTrack = async (track: Track) => {
  // 1. 로컬 즉시 반영
  removeTrack(track.id)
  showToast('삭제했어요')
  
  // 2. 서버 삭제 시도 (백그라운드)
  try {
    await deleteTrack(track.id)
  } catch (e) {
    if (isNetworkError(e)) {
      // 오프라인 삭제 큐에 추가 (AsyncStorage 기반 간단 큐)
      await enqueueOfflineDeletion({ type: 'track', id: track.id })
    }
    // 서버 실패해도 로컬 삭제는 유지 (재진입 시 서버와 불일치 가능)
    // 앱 재실행 시 서버 목록과 로컬 목록 diff → orphan 로컬 항목 처리
  }
}
```

**오프라인 삭제 큐**: `AsyncStorage` 에 `jajang:offline_deletions` 키로 배열 저장. 앱 재실행 + 네트워크 복귀 시 flush. V1 단순 구현 — 큐 항목 최대 50개, 초과 시 오래된 것 제거.

---

## 6. UX Flow 참조 (S16)

`docs/ux-flow.md` S16 와이어프레임 기준:

```
설정 화면 구조 (데이터 관리 섹션):
─────────────────────────────────
목소리 샘플 삭제      [→]    ← hasSample=true 시 활성
생성 음원 삭제        [→]    ← tracks.length > 0 시 활성  
계정 탈퇴             [→]    ← 항상, 경고 색상 텍스트
─────────────────────────────────
```

인터랙션 원칙 (UX Flow 그대로 구현):
- 목소리 샘플 삭제: Alert.alert 1단계 확인 → 즉시 삭제
- 생성 음원 삭제: DeleteTracksSheet 열기 → 개별/전체 선택
- 계정 탈퇴: AccountDeletionFlow (impl/04) 진입 — SettingsScreen 은 라우팅만 담당

---

## 7. 수용 기준

- [ ] 목소리 샘플 존재 시: "목소리 샘플 삭제" 버튼 활성 + 탭 시 확인 다이얼로그
- [ ] 목소리 샘플 없을 시: "이미 삭제되었어요" 비활성 상태 표시
- [ ] 생성 음원 삭제 탭: DeleteTracksSheet 개방, 개별/전체 삭제 동작
- [ ] 음원 삭제 완료 후: 토스트 "삭제했어요" + HomeScreen 음원 목록 갱신 (generationSlice)
- [ ] 오프라인 상태 개별 삭제: 로컬 즉시 제거 + 오프라인 큐 저장
- [ ] 계정 탈퇴 항목 탭: AccountDeletionFlow 화면 진입 (impl/04)
- [ ] accessibilityLabel 모든 CTA에 지정

---

## 8. 결정 근거

| 결정 | 근거 |
|---|---|
| 음원 삭제를 바텀 시트로 처리 | UX Flow S16 인터랙션 명세 그대로. 개별+전체 선택이 Alert 단독으로는 표현 불가 |
| 오프라인 삭제 큐 AsyncStorage | V1 규모에서 별도 sync 서비스 불필요. 앱 재실행 시 flush 패턴으로 충분 |
| 목소리 샘플 삭제 = 즉시 (48h 대기 없음) | Stories.md Story 1 수용 기준은 "48시간 이내 삭제 + 완료 알림"이나, UX Flow S16 인터랙션은 "서버 즉시 삭제 + 완료 토스트"로 명시. UX Flow 우선 적용. 48h 비동기 처리는 Epic 02 서버 구현 확인 후 맞춤 필요 — 불일치 있으면 product-planner 에스컬레이션 |

**주의: stories.md Story 1 수용 기준(48h)과 UX Flow S16(즉시 삭제) 간 불일치 감지.** 이 impl은 UX Flow 기준으로 구현하되, engineer는 구현 전 product-planner에 확인 요청 권장.
