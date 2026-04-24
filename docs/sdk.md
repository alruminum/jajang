# SDK 연동 — 자장(Jajang)

**버전**: v1.0  
**작성일**: 2026-04-24

> 이 문서는 연동 방법과 주의사항을 기록한다. 실제 API 이름·import 경로·버전 차이는 마일스톤 0에서 `.d.ts` 직접 열람 또는 공식 문서 WebFetch로 검증 후 `docs/reference.md`에 정리한다. 이 문서의 코드 스니펫은 설계 의도를 전달하는 의사코드 수준이며, 구현 시 공식 문서 우선.

---

## 1. RevenueCat

### 목적
- 구독 구매 (월간 / 연간)
- 7일 트라이얼 자동 시작
- entitlement 조회 (`free` / `trial` / `premium`)
- 구독 복원 (기기 변경)
- 서버 webhook 수신 → DB 동기화

### 설정

```typescript
// apps/mobile/src/services/revenue-cat.ts
import Purchases from 'react-native-purchases';

// 앱 초기화 시 (App.tsx)
Purchases.configure({
  apiKey: Platform.select({
    ios: process.env.REVENUECAT_IOS_API_KEY,
    android: process.env.REVENUECAT_ANDROID_API_KEY,
  }),
});

// 유저 로그인 직후 (user_id 연결)
await Purchases.logIn(userId);
```

### 트라이얼 자동 시작

RevenueCat 대시보드에서 상품 설정 시 trial period를 7일로 지정.
신규 가입 완료 후 `Purchases.logIn(userId)` 호출만으로 트라이얼 자동 시작.
별도 서버 로직 필요 없음.

### Entitlement 조회

```typescript
const customerInfo = await Purchases.getCustomerInfo();
const isPremium = customerInfo.entitlements.active['premium'] !== undefined;

// entitlement 상태 판별 로직
function getEntitlement(customerInfo: CustomerInfo): 'free' | 'trial' | 'premium' {
  const active = customerInfo.entitlements.active;
  if (!active['premium']) return 'free';
  if (active['premium'].productIdentifier.includes('trial')) return 'trial';
  return 'premium';
}
```

### 구독 구매

```typescript
const offerings = await Purchases.getOfferings();
const monthly = offerings.current?.availablePackages.find(p => p.identifier === 'monthly');
const annual = offerings.current?.availablePackages.find(p => p.identifier === 'annual');

// 구매 실행
const { customerInfo } = await Purchases.purchasePackage(selectedPackage);
// customerInfo에서 entitlement 즉시 확인 후 Zustand 업데이트
```

### 구독 복원

```typescript
const customerInfo = await Purchases.restorePurchases();
// 복원된 구독이 있으면 entitlement 업데이트
```

### 서버 webhook (백엔드)

```python
# apps/api/routers/webhooks.py
@router.post("/webhooks/revenuecat")
async def revenuecat_webhook(payload: dict, db: AsyncSession = Depends(get_db)):
    event_type = payload.get("event", {}).get("type")
    customer_id = payload.get("event", {}).get("app_user_id")
    
    # 주요 이벤트: INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION, TRIAL_STARTED, TRIAL_CONVERTED
    # subscriptions 테이블 UPSERT
    await sync_subscription(db, customer_id, event_type, payload)
```

**webhook 검증**: RevenueCat 대시보드에서 shared secret 설정 → `X-RevenueCat-Signature` 헤더 검증 필수.

### 주의사항
- Cancellation 시 `current_period_ends_at`까지 Premium 유지 (LTD 없음)
- 트라이얼 D-1 알림: RevenueCat SDK의 `customerInfo.entitlements.active['premium'].expirationDate`로 만료일 확인 → 앱 진입 시 D-1 여부 체크

---

## 2. AdMob (react-native-google-mobile-ads)

### 목적
- 배너 광고: 무료 유저 S13 재생 화면 하단 고정
- Rewarded Ad: 무료 유저 백그라운드 언락 (월 7회)

### COPPA / GDPR 설정 (필수)

```typescript
// 앱 초기화 시 (App.tsx)
import mobileAds, { MaxAdContentRating } from 'react-native-google-mobile-ads';

await mobileAds().initialize();
await mobileAds().setRequestConfiguration({
  maxAdContentRating: MaxAdContentRating.PG,
  tagForChildDirectedTreatment: false,   // 부모용 앱 — 아동 직접 타겟 아님
  tagForUnderAgeOfConsent: false,
});
```

**결정 근거**: PRD F10 "COPPA/GDPR: 아동 대상 광고 설정 비활성화". `tagForChildDirectedTreatment=false`는 아동 직접 사용 앱이 아니라는 선언 — 앱 포지셔닝(부모용 도구)과 일치. 이 설정이 누락되면 앱스토어 심사 또는 AdMob 정책 위반 가능.

### 배너 광고

```typescript
// S13 재생 화면 (무료 유저만 렌더)
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

const adUnitId = __DEV__ ? TestIds.BANNER : process.env.ADMOB_BANNER_UNIT_ID;

<BannerAd
  unitId={adUnitId}
  size={BannerAdSize.FULL_BANNER}
  onAdFailedToLoad={() => setBannerVisible(false)}   // 로드 실패 시 collapse
/>
```

**광고 로드 실패 처리**: `onAdFailedToLoad` 콜백에서 배너 컨테이너 `display: none` 또는 height 0으로 collapse. 빈 공간 노출 금지 (PRD F10 수용 기준).

### Rewarded Ad

```typescript
import { RewardedAd, RewardedAdEventType, TestIds } from 'react-native-google-mobile-ads';

const adUnitId = __DEV__ ? TestIds.REWARDED : process.env.ADMOB_REWARDED_UNIT_ID;
const rewarded = RewardedAd.createForAdRequest(adUnitId);

// 사전 로드 (S14 팝업 진입 전)
rewarded.load();

// 시청 완료 콜백
rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward) => {
  // 서버에 언락 기록 → rewarded_ad_usage 업데이트
  // PlayerSlice.rewardedUnlockExpiresAt = 자정 timestamp
});

rewarded.addAdEventListener(RewardedAdEventType.CLOSED, () => {
  // 광고 닫힘 (완료 여부는 EARNED_REWARD로만 판별)
});
```

### 개발환경 분기

```typescript
// 개발환경에서는 TestIds 사용, 프로덕션에서는 실제 Unit ID
const bannerUnitId = __DEV__ ? TestIds.BANNER : process.env.ADMOB_BANNER_UNIT_ID!;
const rewardedUnitId = __DEV__ ? TestIds.REWARDED : process.env.ADMOB_REWARDED_UNIT_ID!;
```

---

## 3. react-native-track-player (RNTP)

### 목적
- 백그라운드 오디오 재생 (iOS AVSession + Android ExoPlayer)
- Lockscreen 컨트롤 (F9)
- Seamless loop + crossfade (두 트랙 병렬 방식, 커스텀 구현)

### 앱 설정

**iOS Info.plist:**
```xml
<key>UIBackgroundModes</key>
<array>
    <string>audio</string>
</array>
```

**Android AndroidManifest.xml:**
```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
```

### 초기화

```typescript
// apps/mobile/src/audio/AudioEngine.ts
import TrackPlayer, { Capability, Event } from 'react-native-track-player';

export async function setupAudioEngine() {
  await TrackPlayer.setupPlayer({
    minBuffer: 15,     // 15초 버퍼
    maxBuffer: 60,
    backBuffer: 30,
  });

  await TrackPlayer.updateOptions({
    capabilities: [Capability.Play, Capability.Pause, Capability.Stop],
    compactCapabilities: [Capability.Play, Capability.Pause],
    notificationCapabilities: [Capability.Play, Capability.Pause],
  });
}
```

### crossfade 구현 (두 트랙 병렬 방식)

```typescript
// apps/mobile/src/audio/AudioEngine.ts

const CROSSFADE_MS = 300;
let crossfadeTimer: ReturnType<typeof setTimeout> | null = null;

export async function startCrossfadeLoop(trackUrl: string) {
  await TrackPlayer.reset();
  
  // 트랙 A: 현재 재생
  await TrackPlayer.add({ url: trackUrl, id: 'track-a' });
  // 트랙 B: 다음 루프 (동일 URL, crossfade 타이밍에 volume 0으로 추가)
  await TrackPlayer.add({ url: trackUrl, id: 'track-b' });
  
  await TrackPlayer.play();
  
  // 진행 이벤트 구독
  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, async ({ position, duration }) => {
    if (duration - position <= CROSSFADE_MS / 1000 + 0.05) {
      triggerCrossfade();
    }
  });
}

async function triggerCrossfade() {
  if (crossfadeTimer) return;  // 중복 방지
  
  const steps = 10;
  const stepMs = CROSSFADE_MS / steps;
  
  for (let i = 0; i <= steps; i++) {
    const volA = 1 - i / steps;
    const volB = i / steps;
    await TrackPlayer.setVolume(volA);  // Track A fade out
    // Track B는 별도 AudioContext 또는 두 번째 RNTP 인스턴스로 fade in
    // 구현 상세는 마일스톤 1에서 RNTP v4 API 확인 후 확정
    await new Promise(r => setTimeout(r, stepMs));
  }
  
  crossfadeTimer = null;
  // Track A 리셋, Track B를 새 Track A로 교체
}
```

**주의**: RNTP v4에서 두 인스턴스 동시 실행 가능 여부는 `docs/reference.md`에서 확인 필요. 단일 인스턴스의 경우 `setVolume`으로 단방향 fade만 가능하며, 두 번째 오디오 소스로 `expo-av` 병행 사용 검토.

### Lockscreen 컨트롤

```typescript
// 현재 트랙 메타데이터 설정 → Lockscreen에 표시
await TrackPlayer.updateMetadataForTrack(trackIndex, {
  title: songName,
  artist: '내 목소리로 만든 자장가',
  artwork: require('../assets/album-art.png'),
});
```

### 백그라운드 entitlement 체크

```typescript
// AppState 변경 이벤트 (foreground → background)
AppState.addEventListener('change', async (nextState) => {
  if (nextState === 'background') {
    const { entitlement, rewardedUnlockExpiresAt } = usePlayerStore.getState();
    const isUnlocked = rewardedUnlockExpiresAt && Date.now() < rewardedUnlockExpiresAt;
    
    if (entitlement === 'free' && !isUnlocked) {
      await TrackPlayer.pause();
      // S14 팝업은 foreground 복귀 시 표시
    }
    // premium / trial / rewarded_unlock → 재생 유지
  }
});
```

---

## 4. 보이스 클로닝 API (M0 선정 이후 확정)

### 현재 상태
M0 벤치마크 미완료 — GPU 인프라(Replicate/Modal/RunPod)와 모델(OpenVoice V2/F5-TTS/RVC/CosyVoice) 미선정.
이 섹션은 M0 완료 후 `docs/reference.md` 결과물을 기반으로 업데이트.

### 공통 인터페이스 설계 (추상화 레이어)

```python
# apps/api/services/voice_pipeline.py

from abc import ABC, abstractmethod

class VoiceInferenceClient(ABC):
    @abstractmethod
    async def run(
        self,
        sample_s3_key: str,    # 업로드된 목소리 샘플
        melody_s3_key: str,    # CC0 MIDI 또는 참조 멜로디
        song_key: str,
    ) -> str:
        """추론 실행 → 결과 mp3 S3 key 반환"""
        ...
    
    @abstractmethod
    async def get_status(self, job_id: str) -> dict:
        """비동기 추론 상태 조회"""
        ...

# 구체 구현체 (M0 이후)
class ReplicateClient(VoiceInferenceClient): ...
class ModalClient(VoiceInferenceClient): ...
class RunPodClient(VoiceInferenceClient): ...
```

### 개발환경 Mock

```python
# ENV=development 또는 MOCK_GPU=true 시 사용
class MockVoiceInferenceClient(VoiceInferenceClient):
    async def run(self, sample_s3_key, melody_s3_key, song_key) -> str:
        await asyncio.sleep(3)  # 지연 시뮬레이션
        return "mocks/generated-lullaby.mp3"
    
    async def get_status(self, job_id):
        return {"status": "completed", "output": "mocks/generated-lullaby.mp3"}
```

### 모델 선택 기준 (M0)
| 기준 | 합격 기준 |
|---|---|
| 품질 | 부모 블라인드 테스트 "내 목소리 인식" ≥ 60% |
| 속도 | cold start 포함 end-to-end latency < 90초 |
| 라이선스 | 상업 이용 가능 (원문 확인) |
| 비용 | 요청당 비용 예측 (월 1,000 요청 기준) |

---

## 5. S3 / Cloudflare R2

### 목적
- 목소리 샘플 임시 저장 (`/samples/` prefix)
- 생성된 mp3 저장 (`/tracks/` prefix)
- presigned URL 발급 (클라이언트 직접 업로드/다운로드)

### S3 버킷 구조

```
jajang-audio/
├── samples/
│   └── {user_id}/{job_id}.wav    # 24h 후 삭제
└── tracks/
    └── {user_id}/{job_id}.mp3    # 영구 (유저 삭제 요청 시)
```

### presigned URL 발급 (FastAPI)

```python
# apps/api/services/storage.py
import boto3
from botocore.config import Config

s3_client = boto3.client(
    's3',
    endpoint_url=settings.S3_ENDPOINT_URL,  # R2: https://{account}.r2.cloudflarestorage.com
    aws_access_key_id=settings.S3_ACCESS_KEY,
    aws_secret_access_key=settings.S3_SECRET_KEY,
    config=Config(signature_version='s3v4'),
)

def generate_upload_url(s3_key: str, expires_in: int = 300) -> str:
    """샘플 업로드용 presigned PUT URL (5분 만료)"""
    return s3_client.generate_presigned_url(
        'put_object',
        Params={'Bucket': settings.S3_BUCKET_NAME, 'Key': s3_key, 'ContentType': 'audio/wav'},
        ExpiresIn=expires_in,
    )

def generate_download_url(s3_key: str, expires_in: int = 3600) -> str:
    """트랙 다운로드용 presigned GET URL (1시간 만료)"""
    return s3_client.generate_presigned_url(
        'get_object',
        Params={'Bucket': settings.S3_BUCKET_NAME, 'Key': s3_key},
        ExpiresIn=expires_in,
    )
```

### S3 Lifecycle 백업 정책

```json
{
  "Rules": [{
    "ID": "auto-delete-samples",
    "Prefix": "samples/",
    "Status": "Enabled",
    "Expiration": {
      "Days": 2
    }
  }]
}
```

Celery가 24h 내 삭제하지 못한 경우(장애 등) S3 lifecycle이 2일 후 자동 삭제로 백업.

### M0 비용 비교 기준
- S3 ap-northeast-2: PUT $0.005/1K, GET $0.0004/1K, 저장 $0.023/GB/월
- R2: 무료 PUT/GET 10M/월, 저장 $0.015/GB/월 (GET 무료)
- 1인 초기 단계: R2가 유리할 가능성 높음 (egress 무료) — M0 비용 시뮬레이션 후 확정

---

## 6. 인증 (Apple / Google OAuth)

### Apple Sign-In

```typescript
// react-native-apple-authentication
import appleAuth from '@invertase/react-native-apple-authentication';

const credential = await appleAuth.performRequest({
  requestedOperation: appleAuth.Operation.LOGIN,
  requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
});

// credential.identityToken → 서버로 전송
await api.post('/auth/social', {
  provider: 'apple',
  id_token: credential.identityToken,
});
```

### Google Sign-In

```typescript
// @react-native-google-signin/google-signin
import { GoogleSignin } from '@react-native-google-signin/google-signin';

GoogleSignin.configure({
  webClientId: process.env.GOOGLE_WEB_CLIENT_ID,
});

const userInfo = await GoogleSignin.signIn();
// userInfo.idToken → 서버로 전송
await api.post('/auth/social', {
  provider: 'google',
  id_token: userInfo.idToken,
});
```

### 서버 토큰 검증 (FastAPI)

```python
# apps/api/services/auth.py

async def verify_apple_token(id_token: str) -> dict:
    """Apple public key로 JWT 검증"""
    # JWKS endpoint: https://appleid.apple.com/auth/keys
    ...

async def verify_google_token(id_token: str) -> dict:
    """Google tokeninfo 또는 certificates로 검증"""
    # https://www.googleapis.com/oauth2/v3/certs
    ...
```
