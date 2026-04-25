---
depth: std
design: skipped
---

# impl/06 — 앱: 녹음 가이드 화면 (S09)

**Epic**: 02 — 목소리 녹음 & 품질 검증  
**커버 스토리**: Story 2 (가이드 + challenge-response), Story 3 (마이크 권한 요청)  
**선행 조건**: impl/05 완료 (RecordModeScreen, navigation type)  
**예상 소요**: 2~3시간

---

## 1. 생성/수정할 파일 목록

```
apps/mobile/src/
├── screens/
│   └── RecordGuideScreen.tsx    [신규 — S09 녹음 가이드 + challenge]
└── services/
    └── api/challenges.ts        [신규 — GET /challenges/random 클라이언트]
```

---

## 2. Challenge API 클라이언트

```typescript
// apps/mobile/src/services/api/challenges.ts

import { apiClient } from './client'

export interface ChallengeResponse {
  phrase: string
}

export const challengesApi = {
  getRandomPhrase: (): Promise<ChallengeResponse> =>
    apiClient.get('/challenges/random').then(r => r.data),
}
```

> **서버 엔드포인트**: `GET /api/v1/challenges/random`  
> 구현 위치: docs/voice-pipeline.md §8 `get_random_challenge()` 함수 기반.  
> 이 impl에서 서버 측 라우터 생성 포함 (아래 §3).

---

## 3. 서버 challenge 라우터 (소규모 추가)

```python
# apps/api/app/api/v1/challenges.py  [신규]

import random
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from app.core.security import decode_token

router = APIRouter(prefix="/challenges", tags=["challenges"])
bearer_scheme = HTTPBearer(auto_error=False)

CHALLENGE_PHRASES = [
    "달빛 아래 우리 아기 잠들어요",
    "자장 자장 우리 아기",
    "별빛 가득한 밤이에요",
    "엄마 아빠 목소리 들어봐요",
    "조용히 눈을 감아요",
]

def _require_auth(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)) -> str:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요해요")
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise JWTError("invalid token type")
        return payload["sub"]
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요해요")

@router.get("/random")
async def get_random_challenge(user_id: str = Depends(_require_auth)):
    """
    랜덤 challenge-response 문구 반환.
    서버는 클라이언트 녹음 내용과 대조하지 않음 (음성 인식 비용 불필요).
    화면 표시 + UX 마찰로 제3자 업로드 방지 (docs/voice-pipeline.md §8).
    """
    return {"phrase": random.choice(CHALLENGE_PHRASES)}
```

`apps/api/app/main.py`에 `from app.api.v1.challenges import router as challenges_router` + `include_router` 추가 필요.

---

## 4. RecordGuideScreen

```typescript
// apps/mobile/src/screens/RecordGuideScreen.tsx

import React, { useEffect, useState } from 'react'
import { View, Text, Pressable, StyleSheet, Alert, Linking, Modal } from 'react-native'
import { Audio } from 'expo-av'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import { challengesApi } from '../services/api/challenges'

type Props = NativeStackScreenProps<RootStackParamList, 'RecordGuide'>

const GUIDE_ITEMS = [
  '조용한 방에서 해주세요',
  '마이크를 입에서 20~30cm 거리로',
  '30초 이상 이어주세요',
]

const MODE_LABEL: Record<'humming' | 'shush', string> = {
  humming: '허밍 모드',
  shush: '쉿 모드',
}

export function RecordGuideScreen({ navigation, route }: Props) {
  const { mode } = route.params
  const [challengePhrase, setChallengePhrase] = useState<string | null>(null)
  const [showPermissionModal, setShowPermissionModal] = useState(false)

  useEffect(() => {
    // challenge-response 문구 요청
    challengesApi.getRandomPhrase()
      .then(r => setChallengePhrase(r.phrase))
      .catch(() => {
        // 네트워크 실패 시 기본 문구 fallback (오프라인 대비)
        setChallengePhrase('자장 자장 우리 아기')
      })
  }, [])

  const handleStartRecording = async () => {
    // 마이크 권한 확인 (expo-av)
    const { status } = await Audio.requestPermissionsAsync()

    if (status === 'granted') {
      navigation.navigate('Record', { mode })
    } else if (status === 'denied') {
      // 이미 거부됨 → 설정 이동 안내
      setShowPermissionModal(true)
    }
    // status === 'undetermined'은 requestPermissionsAsync가 자동 요청 → 결과가 즉시 granted/denied
  }

  return (
    <View style={styles.container}>
      {/* 모드 라벨 */}
      <Text style={styles.modeLabel}>[{MODE_LABEL[mode]}]</Text>
      <Text style={styles.title}>이렇게 해주세요</Text>

      {/* 가이드 항목 (stagger는 React Native Animated로 구현) */}
      <View style={styles.guideList}>
        {GUIDE_ITEMS.map((item, i) => (
          <View key={i} style={styles.guideItem}>
            <Text style={styles.checkmark}>✓</Text>
            <Text style={styles.guideText}>{item}</Text>
          </View>
        ))}
      </View>

      {/* Challenge-response 박스 */}
      {challengePhrase && (
        <View style={styles.challengeBox}>
          <Text style={styles.challengeLabel}>지금 직접 따라 읽어주세요:</Text>
          <Text style={styles.challengePhrase}>"{challengePhrase}"</Text>
        </View>
      )}

      {/* CTA */}
      <Pressable
        style={styles.cta}
        onPress={handleStartRecording}
        accessibilityLabel="녹음 시작"
      >
        <Text style={styles.ctaText}>녹음 시작할게요</Text>
      </Pressable>

      {/* 마이크 권한 거부 모달 */}
      <PermissionModal
        visible={showPermissionModal}
        onGoToSettings={() => {
          setShowPermissionModal(false)
          Linking.openSettings()
        }}
        onDismiss={() => setShowPermissionModal(false)}
      />
    </View>
  )
}

// ─────────────────────────
// 마이크 권한 거부 안내 모달
// ─────────────────────────
interface PermissionModalProps {
  visible: boolean
  onGoToSettings: () => void
  onDismiss: () => void
}

function PermissionModal({ visible, onGoToSettings, onDismiss }: PermissionModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={modal.overlay}>
        <View style={modal.sheet}>
          <Text style={modal.title}>마이크 접근이 필요해요</Text>
          <Text style={modal.desc}>
            목소리를 녹음하려면 마이크 권한이 필요해요.{'\n'}
            설정에서 마이크를 허용해주세요.
          </Text>
          <Pressable style={modal.primaryBtn} onPress={onGoToSettings}>
            <Text style={modal.primaryBtnText}>설정으로 가기</Text>
          </Pressable>
          <Pressable style={modal.secondaryBtn} onPress={onDismiss}>
            <Text style={modal.secondaryBtnText}>나중에</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#0D0F1A', paddingHorizontal: 20, paddingTop: 24 },
  modeLabel:        { color: '#F5C97A', fontSize: 13, marginBottom: 6 },
  title:            { color: '#EEF0F8', fontSize: 22, fontFamily: 'NotoSansKR-Regular', marginBottom: 28 },
  guideList:        { marginBottom: 28 },
  guideItem:        { flexDirection: 'row', marginBottom: 14, alignItems: 'flex-start' },
  checkmark:        { color: '#F5C97A', fontSize: 16, marginRight: 10, marginTop: 1 },
  guideText:        { color: '#EEF0F8', fontSize: 15, lineHeight: 24, flex: 1, fontFamily: 'NotoSansKR-Regular' },
  challengeBox: {
    backgroundColor: '#1A1D30',
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#2A2E48',
  },
  challengeLabel:   { color: '#7B80A0', fontSize: 13, marginBottom: 8 },
  challengePhrase:  { color: '#EEF0F8', fontSize: 18, fontFamily: 'NotoSansKR-Regular', lineHeight: 28 },
  cta:              { height: 56, backgroundColor: '#F5C97A', borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginTop: 'auto', marginBottom: 32 },
  ctaText:          { color: '#0D0F1A', fontSize: 17, fontFamily: 'NotoSansKR-Regular' },
})

const modal = StyleSheet.create({
  overlay:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet:            { backgroundColor: '#1A1D30', borderRadius: 20, padding: 24, width: '100%' },
  title:            { color: '#EEF0F8', fontSize: 18, fontFamily: 'NotoSansKR-Regular', marginBottom: 12 },
  desc:             { color: '#7B80A0', fontSize: 14, lineHeight: 22, marginBottom: 24 },
  primaryBtn:       { height: 52, backgroundColor: '#F5C97A', borderRadius: 26, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  primaryBtnText:   { color: '#0D0F1A', fontSize: 16, fontFamily: 'NotoSansKR-Regular' },
  secondaryBtn:     { height: 44, justifyContent: 'center', alignItems: 'center' },
  secondaryBtnText: { color: '#7B80A0', fontSize: 15 },
})
```

---

## 5. 네비게이션 타입 추가

```typescript
// apps/mobile/src/navigation/types.ts 에 추가

Record: { mode: 'humming' | 'shush' }
```

---

## 6. 관찰가능성

- 마이크 권한 거부 이벤트는 Sentry breadcrumb 기록 (UX 개선 판단 지표).
- challenge-response API 실패 시 fallback 사용 — Sentry warning 로그.

---

## 7. 수용 기준

- [ ] S09 진입 시 challenge 문구 API 호출 + 표시
- [ ] 네트워크 실패 시 기본 문구("자장 자장 우리 아기") fallback 표시
- [ ] 가이드 항목 3개 표시 (조용한 방, 거리, 30초 이상)
- [ ] CTA 탭 → 마이크 권한 요청
- [ ] 권한 허용 → S10(Record) 이동
- [ ] 권한 거부 → 권한 요청 모달 노출 (설정으로 가기 + 나중에)
- [ ] "설정으로 가기" 탭 → 기기 설정 앱 이동 (Linking.openSettings)
- [ ] "나중에" 탭 → 모달 닫기, 가이드 화면 유지

---

## 8. 주의사항

- `Audio.requestPermissionsAsync()`는 iOS에서 최초 1회만 시스템 팝업을 띄운다. 이후 거부 상태에서는 직접 설정으로 유도해야 한다. `Linking.openSettings()`가 iOS/Android 모두 동작.
- challenge 문구는 서버에서 랜덤 반환한다. 클라이언트 fallback 목록을 서버와 동일하게 유지할 필요는 없다 — UX 마찰 목적의 문구이므로 어떤 문구든 무방.
- `marginTop: 'auto'` on CTA: FlexBox에서 남은 공간을 차지해 CTA를 하단에 고정하는 패턴. SafeAreaView와 함께 사용 시 bottom padding 필요.
