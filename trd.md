# TRD — 자장(Jajang)

**버전**: v1.0  
**작성일**: 2026-04-24  
**상태**: 초안 — System Design 완료 (M0 벤치마크 이후 §3 GPU 인프라·모델 섹션 확정 예정)

### 변경 이력
| 버전 | 날짜 | 요약 |
|---|---|---|
| v1.0 | 2026-04-24 | 최초 작성 — PRD v1.1 기반 System Design |
| v1.1 | 2026-04-25 | §8 환경변수: GOOGLE_CLIENT_ID 추가 (소셜 인증 aud 검증) |
| v1.2 | 2026-04-24 | Epic 03: §2 서버 구조 확장 (inference/, generations, tracks), §3 카운터 상태머신 보완, §8 MOCK_GPU 등 환경변수 추가 |

---

## §1 기술 스택

### 프론트엔드
| 항목 | 기술 | 버전 기준 | 선택 이유 |
|---|---|---|---|
| 크로스플랫폼 프레임워크 | React Native + Expo Dev Client | SDK 52+ (Bare workflow) | 1인 개발 생산성 + 네이티브 모듈 접근 필수 (RNTP, AdMob) |
| 백그라운드 재생 | react-native-track-player | v4.x | 유일하게 iOS AV Session + Android ExoPlayer 공식 추상화 제공 |
| 구독/IAP | RevenueCat React Native SDK | v7.x | 크로스플랫폼 entitlement 관리, 트라이얼 설정 UI 없이 가능 |
| 광고 | react-native-google-mobile-ads | v13.x | AdMob 공식 RN 래퍼, 배너 + Rewarded 모두 지원 |
| 상태 관리 | Zustand | v4.x | 경량 + persist 미들웨어로 구독 상태 로컬 캐시 |
| 네비게이션 | React Navigation v7 | — | Stack + BottomSheet 조합 |
| 오디오 녹음 | expo-av / expo-audio | SDK 52 | Bare workflow에서 마이크 접근, RNTP와 충돌 없음 |

### 백엔드
| 항목 | 기술 | 선택 이유 |
|---|---|---|
| API 서버 | Python FastAPI | 비동기 처리, GPU 추론 클라이언트와 동일 언어, type hint |
| 태스크 큐 | Celery + Redis | 24h 샘플 삭제 스케줄러 + 비동기 생성 작업 분리 |
| DB ORM | SQLAlchemy 2.x (async) | FastAPI 비동기 스택 통일 |
| DB 마이그레이션 | Alembic | SQLAlchemy 표준 |
| 인증 | JWT (RS256) + bcrypt | Apple/Google OAuth → 서버 토큰 발행 |
| 파일 저장 | AWS S3 또는 Cloudflare R2 | M0 비용 비교 후 확정, API 호환 |

### 인프라 (M0 이후 확정)
| 항목 | 후보 | 확정 기준 |
|---|---|---|
| GPU 추론 | Replicate / Modal / RunPod | M0 end-to-end latency < 90s, 비용/요청, cold start |
| 보이스 모델 | OpenVoice V2 / F5-TTS / RVC / CosyVoice | M0 블라인드 테스트 ≥ 60%, 상업 라이선스 |
| DB 호스팅 | Supabase PostgreSQL 또는 RDS | 1인 운영 관리 부담 최소 |
| Redis | Upstash Redis 또는 ElastiCache | Celery 브로커 |

### 보안
- HTTPS 전송 전용 (HTTP 리다이렉트)
- S3 오디오: presigned URL (만료 1시간), 공개 버킷 아님
- 목소리 샘플: 업로드 완료 즉시 S3 private prefix(`/samples/`) — 24h 내 자동 삭제
- API 인증: Authorization: Bearer (RS256 JWT), refresh token rotation
- 시크릿 관리: 환경변수 (Railway/Render secret store 또는 AWS Secrets Manager)

---

## §2 프로젝트 구조

```
jajang/
├── apps/
│   └── mobile/                    # React Native + Expo Bare
│       ├── src/
│       │   ├── screens/           # S01~S17
│       │   ├── components/        # C06 미니플레이어, 공용 UI
│       │   ├── store/             # Zustand slices (auth, player, subscription, generation)
│       │   ├── services/          # API 클라이언트, RevenueCat, AdMob 래퍼
│       │   ├── audio/             # AudioEngine (RNTP 래퍼, crossfade, timer)
│       │   └── utils/             # 클라이언트 품질 검증 (RMS, 피크)
│       ├── ios/                   # Info.plist (UIBackgroundModes: audio)
│       └── android/               # AndroidManifest (FOREGROUND_SERVICE)
│
├── apps/
│   └── api/                       # FastAPI 백엔드
│       ├── api/v1/                # auth, voices, recordings, generations, tracks
│       ├── models/                # SQLAlchemy ORM (User, VoiceSample, GeneratedTrack, GenerationCounter, ...)
│       ├── schemas/               # Pydantic v2 request/response
│       ├── services/              # VoicePipeline, StorageService, CounterService
│       │   └── inference/         # VoiceInferenceClient ABC + MockClient + factory
│       ├── tasks/                 # Celery tasks (sample_cleanup, generation)
│       └── core/                  # config, security, db session (async + sync)
│
├── docs/                          # 설계 문서
└── backlog.md
```

---

## §3 핵심 로직

### 생성 횟수 카운터 상태머신
```
[무료 유저 생성 시도]
    │
    ▼
CHECK counter (SELECT FOR UPDATE) — 업로드 전
    │
    ├─ count >= 3 → 즉시 거부 (402) → 클라이언트 S14 팝업
    │
    └─ count < 3 → 업로드 허용
                        │
                        ▼
                  GPU 추론 실행
                        │
                        ├─ 성공 → counter + 1 (commit) → mp3 반환
                        │
                        └─ 실패 → counter 롤백 없음 (시도 자체는 차감)
                                  단, 클라이언트 '재시도' = 동일 job_id 재사용 → 차감 없음
```

**설계 결정**: enforcement는 업로드 전 check_and_reserve()에서 SELECT FOR UPDATE로 처리. 생성 실패(서버 오류/타임아웃) 시 카운터 증가하지 않음 — 최종 성공(Celery task completed) 시에만 increment_on_success()로 +1. 재시도는 동일 `job_id`로 is_new=false 반환 — 이중 차감 원천 차단. status='failed' 재시도는 새 job_id 생성 필요.

### crossfade 상태머신
```
[트랙 재생 중, 남은 시간 ≤ crossfade_duration]
    │
    ▼
Track A volume: 1.0 → 0.0 (300ms linear ramp)
Track B volume: 0.0 → 1.0 (동시 시작)
    │
    ▼
Track A 완료 → unload
Track B 계속 재생 (= 새 Track A 역할)
```

### 백그라운드 재생 entitlement 체크
```
[화면 잠금 / 홈 버튼 이벤트]
    │
    ▼
AppState 'background' 감지
    │
    ├─ entitlement = premium/trial/rewarded_unlock_today
    │       → RNTP 계속 재생
    │
    └─ entitlement = free
            → RNTP pause()
            → S14 팝업 (foreground 복귀 시)
```

---

## §4 DB 스키마

상세 DDL → `docs/db-schema.md` 참조

주요 테이블:
- `users` — 계정 정보, 이메일/소셜 provider
- `voice_samples` — 업로드 경로, 품질 검증 상태, 예약 삭제 timestamp
- `generated_tracks` — S3 경로, 연결 곡명, 생성 상태
- `generation_counters` — 계정별 누적 생성 횟수 (무료 전용, SELECT FOR UPDATE)
- `rewarded_ad_usage` — 월별 Rewarded Ad 시청 횟수 + 당일 언락 만료 timestamp
- `subscriptions` — RevenueCat webhook 미러 (entitlement, 만료일)

---

## §5 SDK 연동

상세 → `docs/sdk.md` 참조

| SDK | 목적 | 주의사항 |
|---|---|---|
| RevenueCat | 구독 entitlement | 신규 가입 즉시 트라이얼 활성화, webhook으로 서버 동기화 |
| AdMob | 배너 + Rewarded | COPPA: tag_for_child_directed_treatment=false |
| react-native-track-player | 백그라운드 재생 | crossfade는 두 트랙 병렬 로드 방식으로 직접 구현 |
| OpenVoice V2 (또는 M0 선정 모델) | 보이스 SVC | M0 라이선스 원문 확인 필수 |

---

## §6 전역 상태 (Zustand)

```typescript
interface AuthSlice {
  userId: string | null
  accessToken: string | null
  entitlement: 'free' | 'trial' | 'premium'
  trialExpiresAt: string | null
}

interface PlayerSlice {
  currentTrackId: string | null
  isPlaying: boolean
  timerEndsAt: number | null       // timestamp ms
  rewardedUnlockExpiresAt: number | null  // 자정 timestamp
}

interface SubscriptionSlice {
  generationCount: number          // 서버 동기화
  rewardedAdUsedThisMonth: number
}
```

---

## §7 화면 컴포넌트

17 screens + 1 component — 상세 스펙 → `docs/ux-flow.md` 참조

핵심 컴포넌트:
- `AudioEngine` — RNTP 래퍼, crossfade, timer fade-out
- `WaveformVisualizer` — 실시간(녹음 중) + 정적(미리듣기) 두 모드
- `MiniPlayer` (C06) — S06 하단 고정, Premium/Trial 전용
- `UpgradeSheet` (S14) — 두 variant: background-unlock / generation-exhausted

---

## §8 환경변수

```bash
# 공통
DATABASE_URL=postgresql+asyncpg://...
REDIS_URL=redis://...
JWT_PRIVATE_KEY=...    # RS256
JWT_PUBLIC_KEY=...

# 스토리지
S3_BUCKET_NAME=jajang-audio
S3_REGION=ap-northeast-2
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
CLOUDFLARE_R2_ENDPOINT=...   # R2 선택 시

# GPU 인프라 (M0 이후 확정)
REPLICATE_API_TOKEN=...
MODAL_TOKEN_ID=...
RUNPOD_API_KEY=...

# 소셜 인증
GOOGLE_CLIENT_ID=...    # Google OAuth 클라이언트 ID (aud 검증용)

# 모바일 (앱 빌드 시)
REVENUECAT_IOS_API_KEY=...
REVENUECAT_ANDROID_API_KEY=...
ADMOB_IOS_APP_ID=...
ADMOB_ANDROID_APP_ID=...
ADMOB_BANNER_UNIT_ID=...
ADMOB_REWARDED_UNIT_ID=...

# 개발 환경
ENV=development           # development | staging | production
MOCK_GPU=true             # 개발환경 GPU 추론 mock 분기 (M0 전 반드시 true)
INFERENCE_PROVIDER=mock   # mock | replicate | modal (M0 이후 변경)
MOCK_LATENCY_MS=3000      # MockInferenceClient 대기 시간
MOCK_FAIL_RATE=0.0        # MockInferenceClient 실패율 테스트용 (0.0~1.0)
```

---

## §9 NFR 달성 전략

| NFR | 목표 | 전략 |
|---|---|---|
| AI 생성 응답시간 | 90초 이내 | M0 벤치마크 → cold start 보정 (warm pool or dedicated instance) |
| 재생 loop gap | crossfade 300ms 이상 | 두 트랙 병렬 로드 방식 (§3 crossfade 상태머신) |
| 목소리 샘플 보관 | 생성 후 24h 이내 삭제 | Celery Beat 주기 1h + S3 lifecycle 백업 |
| 보안 | presigned URL, HTTPS | S3 private, 만료 1h presigned URL |
| 오프라인 재생 | Premium 유저 | 로컬 파일시스템 저장 (expo-file-system) + RNTP 로컬 경로 |
| 접근성 | VoiceOver/TalkBack 핵심 CTA | accessibilityLabel 모든 CTA에 필수 |
