# SDK 연동 — 자장(Jajang)

**버전**: v1.3.1
**작성일**: 2026-04-24 / 최종 갱신: 2026-04-30

> v1.3.1 (2026-04-30): AI 음성 합성 관련 섹션 전면 삭제 (Replicate/Modal/RunPod/OpenVoice/F5-TTS/RVC/CosyVoice). §4 DSP 처리 도구 (ffmpeg + librosa) 섹션 신설. 보이스 클로닝 추상화 레이어 폐기.

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

const { customerInfo } = await Purchases.purchasePackage(selectedPackage);
```

### 구독 복원

```typescript
const customerInfo = await Purchases.restorePurchases();
```

### 서버 webhook (백엔드)

```python
# apps/api/routers/webhooks.py
@router.post("/webhooks/revenuecat")
async def revenuecat_webhook(payload: dict, db: AsyncSession = Depends(get_db)):
    event_type = payload.get("event", {}).get("type")
    customer_id = payload.get("event", {}).get("app_user_id")
    # 주요 이벤트: INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION, TRIAL_STARTED, TRIAL_CONVERTED
    await sync_subscription(db, customer_id, event_type, payload)
```

**webhook 검증**: `X-RevenueCat-Signature` 헤더 검증 필수.

### 주의사항
- Cancellation 시 `current_period_ends_at`까지 Premium 유지
- 트라이얼 D-1: `customerInfo.entitlements.active['premium'].expirationDate`로 만료일 확인

---

## 2. AdMob (react-native-google-mobile-ads)

### 목적
- 배너 광고: 무료 유저 S13 재생 화면 하단 고정
- Rewarded Ad: 무료 유저 백그라운드 언락 (월 7회)

### COPPA / GDPR 설정 (필수)

```typescript
import mobileAds, { MaxAdContentRating } from 'react-native-google-mobile-ads';

await mobileAds().initialize();
await mobileAds().setRequestConfiguration({
  maxAdContentRating: MaxAdContentRating.PG,
  tagForChildDirectedTreatment: false,
  tagForUnderAgeOfConsent: false,
});
```

**결정 근거**: PRD F10 "COPPA/GDPR: 아동 대상 광고 설정 비활성화". `tagForChildDirectedTreatment=false`는 아동 직접 사용 앱이 아니라는 선언.

### 배너 광고

```typescript
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

const adUnitId = __DEV__ ? TestIds.BANNER : process.env.ADMOB_BANNER_UNIT_ID;

<BannerAd
  unitId={adUnitId}
  size={BannerAdSize.FULL_BANNER}
  onAdFailedToLoad={() => setBannerVisible(false)}
/>
```

### Rewarded Ad

```typescript
import { RewardedAd, RewardedAdEventType, TestIds } from 'react-native-google-mobile-ads';

const adUnitId = __DEV__ ? TestIds.REWARDED : process.env.ADMOB_REWARDED_UNIT_ID;
const rewarded = RewardedAd.createForAdRequest(adUnitId);

rewarded.load();

rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward) => {
  // 서버에 언락 기록 → rewarded_ad_usage 업데이트
});

rewarded.addAdEventListener(RewardedAdEventType.CLOSED, () => {
  // 광고 닫힘 (완료 여부는 EARNED_REWARD로만 판별)
});
```

### 개발환경 분기

```typescript
const bannerUnitId = __DEV__ ? TestIds.BANNER : process.env.ADMOB_BANNER_UNIT_ID!;
const rewardedUnitId = __DEV__ ? TestIds.REWARDED : process.env.ADMOB_REWARDED_UNIT_ID!;
```

---

## 3. react-native-track-player (RNTP)

### 목적
- 백그라운드 오디오 재생 (iOS AVSession + Android ExoPlayer)
- Lockscreen 컨트롤 (F9)
- 단일 mp3 loop 재생 (crossfade는 서버 사전 처리)

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
import TrackPlayer, { Capability, RepeatMode } from 'react-native-track-player';

export async function setupAudioEngine() {
  await TrackPlayer.setupPlayer({
    minBuffer: 15,
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

### loop 재생 (crossfade는 서버 사전 처리)

```typescript
// apps/mobile/src/audio/AudioEngine.ts

export async function startLoopPlayback(masterAudioUrl: string, songName: string) {
  await TrackPlayer.reset();

  await TrackPlayer.add({
    url: masterAudioUrl,
    id: 'master',
    title: songName,
    artist: '내 목소리로 만든 자장가',
    artwork: require('../assets/album-art.png'),
  });

  // crossfade는 서버에서 이미 mp3에 구워진 상태
  // 단순 loop — RepeatMode.Queue (단일 트랙 큐 반복)
  await TrackPlayer.setRepeatMode(RepeatMode.Queue);
  await TrackPlayer.play();
}
```

**v1.3.1 변경점**: 기존 두 트랙 병렬 crossfade 구현 코드 폐기. 서버 사전 concat 방식으로 확정 — 클라이언트는 단순 loop만 담당.

### 타이머 fade-out

```typescript
// 타이머 만료 10초 전 → volume ramp 0→0 over 10s
export async function startFadeOut(durationMs: number = 10000) {
  const steps = 20;
  const stepMs = durationMs / steps;
  for (let i = steps; i >= 0; i--) {
    await TrackPlayer.setVolume(i / steps);
    await new Promise(r => setTimeout(r, stepMs));
  }
  await TrackPlayer.stop();
}
```

### 백그라운드 entitlement 체크

```typescript
AppState.addEventListener('change', async (nextState) => {
  if (nextState === 'background') {
    const { entitlement, rewardedUnlockExpiresAt } = usePlayerStore.getState();
    const isUnlocked = rewardedUnlockExpiresAt && Date.now() < rewardedUnlockExpiresAt;

    if (entitlement === 'free' && !isUnlocked) {
      await TrackPlayer.pause();
    }
    // premium / trial / rewarded_unlock → 재생 유지
  }
});
```

### Lockscreen 컨트롤

```typescript
await TrackPlayer.updateMetadataForTrack(0, {
  title: songName,
  artist: '내 목소리로 만든 자장가',
  artwork: require('../assets/album-art.png'),
});
```

---

## 4. DSP 처리 도구 (서버)

### 목적
- ffmpeg: 오디오 DSP 처리 (노이즈 제거 / EQ / reverb / concat / crossfade)
- librosa: 품질 분석 전용 (SNR 측정)

### ffmpeg

**설치**: 서버 OS 패키지 매니저 또는 Docker 이미지에 포함.

```bash
# Ubuntu/Debian
apt-get install -y ffmpeg

# 버전 확인 (4.x 이상 필요 — acrossfade 필터 지원)
ffmpeg -version
```

**주요 필터 참조**:

| 필터 | 용도 | 문서 |
|---|---|---|
| `afftdn` | 스펙트럼 노이즈 감소 | https://ffmpeg.org/ffmpeg-filters.html#afftdn |
| `equalizer` | 파라메트릭 EQ | https://ffmpeg.org/ffmpeg-filters.html#equalizer |
| `aecho` | reverb/에코 효과 | https://ffmpeg.org/ffmpeg-filters.html#aecho |
| `acrossfade` | 두 오디오 스트림 crossfade | https://ffmpeg.org/ffmpeg-filters.html#acrossfade |

**acrossfade 제약사항**:
- 두 개의 입력 스트림 필요. 단일 파일 자기 loop crossfade는 동일 파일을 두 번 입력(`-i file -i file`)으로 처리.
- N개 클립 체인 crossfade: filter_complex로 순차 연결.
- 파라미터 `d`: crossfade 길이(초). PRD 수용 기준 300ms = `d=0.3`.

### librosa

**설치**:
```bash
pip install librosa
```

**SNR 측정 의사코드**:

```python
import librosa
import numpy as np

def measure_snr(audio_path: str) -> float:
    """
    신호(음성) 대 잡음 비율 측정.
    librosa는 분석 전용 — DSP 처리는 ffmpeg 담당.
    """
    y, sr = librosa.load(audio_path, sr=None)

    # RMS 기반 단순 SNR 추정
    # signal = 전체 RMS, noise = 가장 조용한 구간 RMS
    frame_length = int(sr * 0.025)  # 25ms 프레임
    hop_length = int(sr * 0.010)    # 10ms hop

    rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]

    # 하위 10% 구간을 noise로 간주
    noise_floor = np.percentile(rms, 10)
    signal_rms = np.mean(rms)

    if noise_floor == 0:
        return float('inf')

    snr_db = 20 * np.log10(signal_rms / noise_floor)
    return float(snr_db)
```

**librosa 사용 범위 제한**:
- SNR 측정 (F3 서버 검증)
- 음량(RMS) 재확인
- 클리핑 검출 재확인
- DSP 처리(필터링, EQ, reverb, crossfade) 사용 금지 → ffmpeg 전담

---

## 5. S3 / Cloudflare R2

### 목적
- 녹음 클립 임시 저장 (`/recordings/` prefix)
- master mp3 저장 (`/masters/` prefix)
- presigned URL 발급

### S3 버킷 구조

```
jajang-audio/
├── recordings/
│   └── {session_id}/{recording_id}.m4a    # 생성 완료 후 24h 삭제
└── masters/
    └── {session_id}.mp3                   # 영구 (유저 삭제 요청 시)
```

### presigned URL 발급 (FastAPI)

```python
# apps/api/services/storage.py
import boto3
from botocore.config import Config

s3_client = boto3.client(
    's3',
    endpoint_url=settings.S3_ENDPOINT_URL,
    aws_access_key_id=settings.S3_ACCESS_KEY,
    aws_secret_access_key=settings.S3_SECRET_KEY,
    config=Config(signature_version='s3v4'),
)

def generate_upload_url(s3_key: str, content_type: str = 'audio/mp4', expires_in: int = 300) -> str:
    """클립 업로드용 presigned PUT URL (5분 만료)"""
    return s3_client.generate_presigned_url(
        'put_object',
        Params={'Bucket': settings.S3_BUCKET_NAME, 'Key': s3_key, 'ContentType': content_type},
        ExpiresIn=expires_in,
    )

def generate_download_url(s3_key: str, expires_in: int = 3600) -> str:
    """master mp3 다운로드용 presigned GET URL (1시간 만료)"""
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
    "ID": "auto-delete-recordings",
    "Prefix": "recordings/",
    "Status": "Enabled",
    "Expiration": {
      "Days": 2
    }
  }]
}
```

Celery가 24h 내 삭제하지 못한 경우 S3 lifecycle이 2일 후 자동 삭제.

### M0 비용 비교 기준
- S3 ap-northeast-2: PUT $0.005/1K, GET $0.0004/1K, 저장 $0.023/GB/월
- R2: 무료 PUT/GET 10M/월, 저장 $0.015/GB/월 (GET 무료)
- 1인 초기 단계: R2가 유리할 가능성 높음 (egress 무료) — M0 비용 시뮬레이션 후 확정

---

## 6. 인증 (Apple / Google OAuth)

### Apple Sign-In

```typescript
import appleAuth from '@invertase/react-native-apple-authentication';

const credential = await appleAuth.performRequest({
  requestedOperation: appleAuth.Operation.LOGIN,
  requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
});

await api.post('/auth/social', {
  provider: 'apple',
  id_token: credential.identityToken,
});
```

### Google Sign-In

```typescript
import { GoogleSignin } from '@react-native-google-signin/google-signin';

GoogleSignin.configure({
  webClientId: process.env.GOOGLE_WEB_CLIENT_ID,
});

const userInfo = await GoogleSignin.signIn();
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
