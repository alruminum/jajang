# Reference — 자장(Jajang)

**버전**: v1.0 (Placeholder)  
**작성일**: 2026-04-24  
**상태**: 마일스톤 0 산출물 저장 위치 선언. M0 완료 후 각 섹션을 실제 데이터로 채운다.

> 이 파일은 architect가 설계 시 남긴 "M0에서 검증해야 할 항목 목록"과 "M0 완료 후 여기에 기록하라"는 placeholder다.  
> engineer는 구현 전 이 파일에서 해당 SDK/API의 확정 정보를 확인한다.  
> 추측으로 채우지 않는다. 실제 `.d.ts` 열람 또는 공식 문서 WebFetch로 확인한 내용만 기록한다.

---

## §1 GPU 인프라 벤치마크 결과 (M0 미완료)

### 측정 항목
- [ ] cold start 포함 end-to-end latency (목표: < 90초)
- [ ] warm 인스턴스 latency
- [ ] 요청당 비용 (월 1,000 요청 기준 추정)
- [ ] 동시 요청 처리 한도

### 후보 인프라
| 인프라 | API 엔드포인트 | 특이사항 |
|---|---|---|
| Replicate | https://api.replicate.com/v1/ | 비동기 prediction API, webhook 지원 |
| Modal | https://modal.com | Python 함수 단위 배포, cold start 제어 가능 |
| RunPod | https://api.runpod.ai/v2/ | 전용 GPU 또는 Serverless |

### 결정 (M0 후 기록)
```
선정 인프라: [미결]
선정 근거:
  - latency 측정 결과:
  - 비용 시뮬레이션:
  - cold start 대응 방안:
```

---

## §2 보이스 모델 벤치마크 결과 (M0 미완료)

### 측정 항목
- [ ] 부모 블라인드 테스트 "내 목소리 인식" 비율 (목표: ≥ 60%, 각 모델 5샘플)
- [ ] 생성 품질 (청취 평가 — 허밍 모드 / 쉿 모드 각각)
- [ ] 출력 포맷 (MP3 128kbps 이상 가능 여부)
- [ ] 입력 요구사항 (최소 샘플 길이, 포맷)

### 후보 모델 라이선스 확인
| 모델 | 라이선스 | 상업 이용 | 원문 URL | 확인 여부 |
|---|---|---|---|---|
| OpenVoice V2 | MIT | 가능 | https://github.com/myshell-ai/OpenVoice/blob/main/LICENSE | [ ] 원문 확인 |
| F5-TTS | CC-BY 4.0 | 조건부 | — | [ ] 원문 확인 |
| RVC / so-vits-svc | fork별 상이 | 불명확 | — | [ ] 원문 확인 |
| CosyVoice | Apache 2.0 | 가능 | — | [ ] 원문 확인 |

### 결정 (M0 후 기록)
```
선정 모델: [미결]
선정 근거:
  - 블라인드 테스트 결과:
  - 라이선스:
  - 제외된 모델 및 이유:
```

---

## §3 react-native-track-player v4 API 확인 (M1 전 필수)

### 확인 필요 항목
- [ ] `setVolume()` 호출 시 실제 오디오 스트림 볼륨 변경 동작 (JS bridge latency 측정)
- [ ] 두 RNTP 인스턴스 동시 생성 가능 여부 (v4 기준)
- [ ] `Event.PlaybackProgressUpdated` 이벤트 주기 (기본값, 설정 가능 여부)
- [ ] iOS AVSession category 설정 (믹스 재생 vs 독점 재생)
- [ ] `updateMetadataForTrack` API 이름 v4에서 변경 여부

### 확인 방법
```
node_modules/react-native-track-player/lib/typescript/ 하위 .d.ts 직접 열람
또는
https://rntp.dev/ 공식 문서 WebFetch
```

### 확인 결과 (M1 구현 전 기록)
```
버전: [미기록]
setVolume 동작: [미기록]
Progress 이벤트 주기: [미기록]
두 인스턴스 여부: [미기록]
iOS AVSession: [미기록]
```

---

## §4 RevenueCat SDK 확인 (M1 구현 전 필수)

### 확인 필요 항목
- [ ] `react-native-purchases` v7 정확한 import 경로
- [ ] `getCustomerInfo()` 반환 타입 구조 (`entitlements.active` 필드명)
- [ ] 트라이얼 기간 중 `productIdentifier` 값 패턴 (trial 판별 로직)
- [ ] `logIn()` vs `configure()` 호출 순서 제약
- [ ] webhook payload 스키마 (이벤트 타입 목록)
- [ ] `X-RevenueCat-Signature` 헤더 검증 방법

### 확인 방법
```
node_modules/react-native-purchases/dist/ .d.ts 직접 열람
https://docs.revenuecat.com/ WebFetch
```

### 확인 결과 (M1 구현 전 기록)
```
버전: [미기록]
CustomerInfo 구조: [미기록]
trial productIdentifier 패턴: [미기록]
webhook 이벤트 목록: [미기록]
```

---

## §5 AdMob (react-native-google-mobile-ads) 확인 (M1 구현 전 필수)

### 확인 필요 항목
- [ ] `react-native-google-mobile-ads` v13 정확한 import 경로
- [ ] `BannerAdSize.FULL_BANNER` vs `BANNER` 실제 크기 (dp 기준)
- [ ] `RewardedAd.createForAdRequest()` vs `InterstitialAd` API 차이
- [ ] `tagForChildDirectedTreatment` 설정 후 적용 확인 방법
- [ ] `onAdFailedToLoad` 콜백 에러 코드 목록

### 확인 결과 (M1 구현 전 기록)
```
버전: [미기록]
BannerAdSize: [미기록]
Rewarded API: [미기록]
```

---

## §6 S3 / Cloudflare R2 비용 비교 결과 (M0 병행)

### 비교 항목
- [ ] S3 ap-northeast-2 월 예상 비용 (업로드 1,000건/월, 다운로드 5,000건/월, 저장 10GB 기준)
- [ ] Cloudflare R2 동일 조건 비용
- [ ] R2 API S3 호환성 (boto3 `endpoint_url` 방식 동작 확인)

### 결정 (M0 후 기록)
```
선정 스토리지: [미결]
선정 근거:
```

---

## §7 멜로디 소스 체크리스트 (M0 병행)

| 곡 | 소스 사이트 | URL | CC0 확인 | 파일 형식 | 저장 경로 |
|---|---|---|---|---|---|
| 브람스 자장가 | [ ] IMSLP 또는 직접 생성 | — | [ ] | MIDI | melodies/brahms_lullaby.mid |
| 모차르트 자장가 | [ ] IMSLP 또는 직접 생성 | — | [ ] | MIDI | melodies/mozart_lullaby.mid |
| 슈베르트 자장가 | [ ] IMSLP 또는 직접 생성 | — | [ ] | MIDI | melodies/schubert_lullaby.mid |
| Twinkle Twinkle | [ ] 직접 생성 | — | [ ] 직접 생성 | MIDI | melodies/twinkle.mid |
| Rock-a-bye Baby | [ ] 직접 생성 | — | [ ] 직접 생성 | MIDI | melodies/rockabye.mid |
| Hush Little Baby | [ ] 직접 생성 | — | [ ] 직접 생성 | MIDI | melodies/hush.mid |

---

## §8 경쟁 리서치 결과 (M0 병행)

앱스토어 검색어 "lullaby", "baby sleep", "baby voice" 상위 20개 앱 스캔.

### 조사 항목
- [ ] BM 구조 (구독/LTD/광고 비중)
- [ ] 리뷰 pain point 3가지 추출
- [ ] "부모 목소리 개인화 AI 자장가" 카테고리 공백 확인

### 결과 (M0 후 기록)
```
pain point 1: [미기록]
pain point 2: [미기록]
pain point 3: [미기록]
V1 포지셔닝 reconfirm: [미기록]
```

---

## §9 NFR 검증 결과 (M0 후 기록)

| NFR | 목표 | M0 측정 결과 | 달성 여부 |
|---|---|---|---|
| AI 생성 응답시간 | < 90초 | [미기록] | [미결] |
| cold start latency | < 90초 포함 | [미기록] | [미결] |
| 블라인드 테스트 | ≥ 60% | [미기록] | [미결] |

### 미달 시 Contingency
- latency > 90초: warm pool 설정 or dedicated GPU or NFR 완화(2분) 재협의 (product-planner 에스컬레이션)
- 블라인드 테스트 < 60%: "단어 반복" 녹음 모드("잘 자라 우리 아기" 5회)로 전환
