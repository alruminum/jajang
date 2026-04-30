# TRD — 자장(Jajang)

**버전**: v1.3.1
**작성일**: 2026-04-24
**상태**: 갱신 — PRD v1.3.1 반영 (AI 합성 → DSP 전환, recording 모델 재정의)

### 변경 이력
| 버전 | 날짜 | 요약 |
|---|---|---|
| v1.0 | 2026-04-24 | 최초 작성 — PRD v1.1 기반 System Design |
| v1.1 | 2026-04-25 | §8 환경변수: GOOGLE_CLIENT_ID 추가 (소셜 인증 aud 검증) |
| v1.2 | 2026-04-24 | Epic 03: §2 서버 구조 확장 (inference/, generations, tracks), §3 카운터 상태머신 보완, §8 MOCK_GPU 등 환경변수 추가 |
| v1.3 | 2026-04-24 | Epic 05: §2 서버 구조 확장 (rewarded/, subscription_service), §4 rewarded_ad_usage migration 0004, §6 SubscriptionSlice rewardedAdMonthKey 추가, §7 S15/S16/S17 화면 추가 |
| v1.4 | 2026-04-24 | Epic 06: §2 audit_log 모델 + AccountDeletionService + LegalScreen/AccountDeletionScreen/DeleteTracksSheet, §3 hard_delete 스케줄 추가, §4 audit_logs 테이블 migration 0005, §6 AuthSlice clearAuthState 추가, §7 신규 화면 3개 추가 |
| v1.5 | 2026-04-26 | Epic 07: §1 @expo-google-fonts 3종 추가, §2 src/theme/ + src/hooks/useFonts.ts 신설, §7 디자인 토큰 시스템 추가 |
| v1.6 | 2026-04-26 | Epic 07 impl-02: §7 토큰 값 확정 — Colors(12종+파생3), FontFamily(6종), FontSize(7단계), Radius(4단계), Spacing(6단계), Typography 프리셋(8종). |
| v1.7 | 2026-04-30 | PRD v1.3.1 반영: §1 GPU 인프라 삭제 + ffmpeg/librosa 추가, §2 서버 구조 갱신(DSP 서비스 / recording 모델), §3 생성 시퀀스 갱신(DSP 방식) + crossfade 상태머신 갱신, §4 DB 테이블 재정의(recording_sessions/recordings/master_audios), §5 SDK 갱신(보이스 클로닝 삭제), §8 환경변수 갱신(GPU 관련 삭제) |

---

## §1 기술 스택

### 프론트엔드
| 항목 | 기술 | 버전 기준 | 선택 이유 |
|---|---|---|---|
| 크로스플랫폼 프레임워크 | React Native + Expo Dev Client | SDK 52+ (Bare workflow) | 1인 개발 생산성 + 네이티브 모듈 접근 필수 (RNTP, AdMob) |
| 백그라운드 재생 | react-native-track-player | v4.x | iOS AV Session + Android ExoPlayer 공식 추상화 |
| 구독/IAP | RevenueCat React Native SDK | v7.x | 크로스플랫폼 entitlement 관리 |
| 광고 | react-native-google-mobile-ads | v13.x | AdMob 공식 RN 래퍼, 배너 + Rewarded |
| 상태 관리 | Zustand | v4.x | 경량 + persist 미들웨어 |
| 네비게이션 | React Navigation v7 | — | Stack + BottomSheet 조합 |
| 오디오 녹음 | expo-av / expo-audio | SDK 52 | 마이크 접근, RNTP와 충돌 없음 |
| 폰트 로딩 | expo-font + @expo-google-fonts | — | DM Sans / DM Mono / Noto Sans KR 번들 로딩 |

### 백엔드
| 항목 | 기술 | 선택 이유 |
|---|---|---|
| API 서버 | Python FastAPI | 비동기 처리, type hint |
| 태스크 큐 | Celery + Redis | DSP 처리 비동기 분리 + 24h 샘플 삭제 스케줄러 |
| DSP 처리 | ffmpeg (subprocess) | afftdn / equalizer / aecho / acrossfade — CPU만 필요, GPU 불필요 |
| 음성 분석 | librosa | SNR 측정 + 음량/클리핑 검출 전용 (DSP 처리는 ffmpeg 담당) |
| DB ORM | SQLAlchemy 2.x (async) | FastAPI 비동기 스택 통일 |
| DB 마이그레이션 | Alembic | SQLAlchemy 표준 |
| 인증 | JWT (RS256) + bcrypt | Apple/Google OAuth → 서버 토큰 발행 |
| 파일 저장 | AWS S3 또는 Cloudflare R2 | M0 비용 비교 후 확정, API 호환 |

### 인프라
| 항목 | 후보 | 확정 기준 |
|---|---|---|
| DB 호스팅 | Supabase PostgreSQL 또는 RDS | 1인 운영 관리 부담 최소 |
| Redis | Upstash Redis 또는 ElastiCache | Celery 브로커 |
| 오디오 저장 | AWS S3 또는 Cloudflare R2 | M0 비용 시뮬레이션 후 확정 |

> GPU 인프라 (Replicate / Modal / RunPod) 전면 제거. ffmpeg CPU 워커 1대로 MVP 시작 — 수요 증가 시 워커 수평 확장.

### 보안
- HTTPS 전송 전용 (HTTP 리다이렉트)
- S3 오디오: presigned URL (만료 1시간), 공개 버킷 아님
- 녹음 클립: `recordings/` prefix, private ACL — master_audio 완료 후 24h 삭제
- API 인증: Authorization: Bearer (RS256 JWT), refresh token rotation
- 시크릿 관리: 환경변수 (Railway/Render secret store 또는 AWS Secrets Manager)

---

## §2 프로젝트 구조

```
jajang/
├── apps/
│   └── mobile/                    # React Native + Expo Bare
│       ├── src/
│       │   ├── screens/           # S01~S17 (S08 폐기)
│       │   ├── components/        # C06 미니플레이어, 공용 UI
│       │   ├── store/             # Zustand slices (auth, player, subscription, generation)
│       │   ├── services/          # API 클라이언트, RevenueCat, AdMob 래퍼
│       │   ├── audio/             # AudioEngine (RNTP 래퍼, loop, timer)
│       │   ├── theme/             # 디자인 토큰 (tokens.ts, typography.ts, spacing.ts, index.ts)
│       │   ├── hooks/             # useFonts.ts
│       │   └── utils/             # 클라이언트 품질 검증 (RMS, 피크)
│       ├── ios/                   # Info.plist (UIBackgroundModes: audio)
│       └── android/               # AndroidManifest (FOREGROUND_SERVICE)
│
├── apps/
│   └── api/                       # FastAPI 백엔드
│       ├── api/v1/                # auth, sessions, recordings, masters, rewarded, webhooks
│       ├── models/                # SQLAlchemy ORM (User, RecordingSession, Recording, MasterAudio, GenerationCounter, RewardedAdUsage, AuditLog)
│       ├── schemas/               # Pydantic v2 request/response
│       ├── services/              # DspService, StorageService, CounterService, SubscriptionService, RewardedService, AccountDeletionService
│       │   └── dsp/               # ffmpeg subprocess 래퍼 (노이즈 제거 / EQ / reverb / concat / acrossfade)
│       ├── tasks/                 # Celery tasks (dsp_processing, clip_cleanup, hard_delete_users)
│       └── core/                  # config, security, db session (async + sync)
│
├── docs/                          # 설계 문서
└── backlog.md
```

**v1.7 변경점**:
- `services/inference/` (VoiceInferenceClient ABC + MockClient + factory) → `services/dsp/` (ffmpeg 래퍼) 교체
- ORM 모델: `VoiceSample` + `GeneratedTrack` → `RecordingSession` + `Recording` + `MasterAudio`
- API 라우터: `generations` → `sessions` / `recordings` / `masters`

---

## §3 핵심 로직

### 음원 생성 시퀀스 (DSP 방식)

```
[클라이언트 POST /sessions/init {session_id, song_key}]
    │
    ▼
CHECK counter (SELECT FOR UPDATE) — 세션 생성 전
    │
    ├─ count >= 3 (무료 유저) → 즉시 거부 (402) → 클라이언트 S14 팝업
    │
    └─ count < 3 또는 premium/trial
                        │
                        ▼
                  INSERT recording_sessions
                  presigned upload URL 발급 → 클라이언트 S3 업로드
                        │
                        ▼
                  POST /sessions/{id}/recordings (클립 등록)
                  INSERT recordings
                        │
                        ▼
                  POST /sessions/{id}/generate
                  Celery DSP task dispatch
                        │
                        ▼
                  ffmpeg DSP (afftdn→EQ→reverb→concat→acrossfade)
                        │
                        ├─ 성공 → S3 master mp3 업로드
                        │         UPDATE master_audios status=completed
                        │         counter + 1 (무료 유저)
                        │
                        └─ 실패 → UPDATE master_audios status=failed
                                  counter 롤백 없음 (아직 미증가)
                                  재시도 = 동일 session_id → DSP 재실행 (차감 없음)
```

### 생성 횟수 카운터 상태머신

```
[무료 유저 생성 시도]
    │
    ▼
CHECK counter (SELECT FOR UPDATE) — POST /sessions/init
    │
    ├─ count >= 3 → 즉시 거부 (402) → 클라이언트 S14 팝업
    │
    └─ count < 3 → 세션 생성 허용
                        │
                        ▼
                  DSP 처리 (Celery)
                        │
                        ├─ 성공 → counter + 1 (commit)
                        │
                        └─ 실패 → counter 변경 없음
                                  재시도 = 동일 session_id → 차감 없음
```

**클립 추가 정책**: "다시 녹음" 후 "사용하기" → 동일 session에 recording 추가. 세션 상태 = open → generating. 카운터 미차감.

### 계정 탈퇴 삭제 흐름 (계단형 + 30일 hard delete)

```
DELETE /users/me 수신
    │
    ▼
구독 활성 체크 → is_active=True 이면 422 반환
    │
    ▼
BEGIN TRANSACTION
  S3 녹음 클립 삭제 → S3 master mp3 삭제 (실패 시 로그만)
  users.deleted_at = NOW()  (CASCADE: 연관 테이블 DB 레코드 삭제)
  audit_log(account_deletion_requested) 기록
COMMIT
→ 202 반환

[30일 후] Celery Beat hard_delete_expired_users (매일 03:00 KST)
  → users 행 완전 제거 + audit_log(account_hard_deleted)
  → audit_logs 는 FK 없으므로 유지
```

### crossfade 구현 — 서버 사전 concat 방식

```
[POST /sessions/{id}/generate 수신]
    │
    ▼
Celery DSP task:
    1. recordings 조회 (session 내 validated 클립)
    2. S3 다운로드 → /tmp/
    3. 각 클립 개별 DSP (afftdn → equalizer → aecho)
    4. 셔플 (N=1: [A,A], N≥2: 직전 제외 Fisher-Yates)
    5. ffmpeg acrossfade concat → master.mp3
    6. S3 업로드 (masters/{session_id}.mp3)
    7. /tmp/ 정리

[클라이언트 재생]
    └─ 단일 master.mp3를 RepeatMode.Queue loop
       crossfade 이미 구워진 상태 → 클라이언트 추가 처리 없음
```

**acrossfade 구현 메모**: `ffmpeg -i A -i B -filter_complex "[0][1]acrossfade=d=0.3:c1=tri:c2=tri" output.mp3`. N=1 케이스: `-i A -i A`. N≥2: filter_complex 체인.

### 백그라운드 재생 entitlement 체크

```
[화면 잠금 / 홈 버튼 이벤트]
    │
    ▼
AppState 'background' 감지
    │
    ├─ entitlement = premium/trial
    │       → RNTP 계속 재생
    │
    ├─ entitlement = free, rewardedUnlockExpiresAt > Date.now()
    │       → RNTP 계속 재생 (자정까지)
    │
    └─ entitlement = free, 언락 없음
            → RNTP pause()
            → S14 팝업 (foreground 복귀 시)
```

---

## §4 DB 스키마

상세 DDL → `docs/db-schema.md` 참조

주요 테이블:
- `users` — 계정 정보, 이메일/소셜 provider
- `recording_sessions` — 세션 단위 (멱등성 키, song_key, status). 카운터 차감 단위.
- `recordings` — 녹음 클립 (N개, 24h 삭제 대상)
- `master_audios` — DSP 결과 mp3 (session당 1개)
- `generation_counters` — 무료 유저 누적 생성 횟수 (SELECT FOR UPDATE)
- `rewarded_ad_usage` — 월별 Rewarded Ad 시청 횟수 + 당일 언락 만료
- `subscriptions` — RevenueCat webhook 미러
- `audit_logs` — 계정 탈퇴 감사 로그 (FK 없음)

**마이그레이션 현황**:
- 0001~0005: 기존 (users, voice_samples[폐기], generated_tracks[폐기], rewarded_ad_usage, audit_logs)
- 0006: recording_sessions + recordings + master_audios 신설 + 구 테이블 폐기 (신규 작성 필요)

---

## §5 SDK 연동

상세 → `docs/sdk.md` 참조

| SDK | 목적 | 주의사항 |
|---|---|---|
| RevenueCat | 구독 entitlement | 신규 가입 즉시 트라이얼 활성화, webhook으로 서버 동기화 |
| AdMob | 배너 + Rewarded | COPPA: tag_for_child_directed_treatment=false |
| react-native-track-player | 백그라운드 재생 | 단일 master mp3 RepeatMode.Queue loop (crossfade 서버 처리) |
| ffmpeg | DSP 처리 | afftdn / equalizer / aecho / acrossfade — CPU만, GPU 불필요 |
| librosa | 음성 분석 | SNR 측정 + 음량/클리핑 검출 전용. DSP 처리는 ffmpeg 담당. |

---

## §6 전역 상태 (Zustand)

```typescript
interface AuthSlice {
  userId: string | null
  accessToken: string | null
  entitlement: 'free' | 'trial' | 'premium'
  trialExpiresAt: string | null
  clearAuthState: () => void
}

interface PlayerSlice {
  currentSessionId: string | null   // recording_sessions.id (구: currentTrackId)
  isPlaying: boolean
  timerEndsAt: number | null
  rewardedUnlockExpiresAt: number | null
}

interface SubscriptionSlice {
  generationCount: number
  rewardedAdUsedThisMonth: number
  rewardedAdMonthKey: string       // 'YYYY-MM'
  rewardedUnlockExpiresAt: number | null
}
```

**v1.7 변경점**: `PlayerSlice.currentTrackId` → `currentSessionId` (recording_sessions.id 참조).

---

## §7 화면 컴포넌트

16 screens + 1 component — 상세 스펙 → `docs/ux-flow.md` 참조

> S08 (녹음 모드 선택) 폐기 (PRD v1.3.0). 총 17 → 16 screens.

**디자인 토큰 시스템** (`src/theme/`) — impl-02에서 파일·값 확정:
- `tokens.ts` — Colors(12종 + 파생 투명도 3종), FontFamily(6종), FontSize(7단계), Radius(4단계), pure constants
- `typography.ts` — Typography 프리셋 8종
- `spacing.ts` — Spacing 6단계 (xs=4 ~ xxl=48)
- `index.ts` — 배럴 export
- `useFonts.ts` — expo-font 폰트 로딩 훅

핵심 컴포넌트:
- `AudioEngine` — RNTP 래퍼, 단일 mp3 loop, timer fade-out
- `WaveformVisualizer` — 실시간(녹음 중) + 정적(미리듣기) 두 모드
- `MiniPlayer` (C06) — S06 하단 고정, Premium/Trial 전용
- `UpgradeSheet` (S14) — 두 variant: background-unlock / generation-exhausted
- `SubscribeScreen` (S15) — 월/연 플랜 선택 + RevenueCat purchasePackage + 복원
- `SettingsScreen` (S16) — 구독 관리 딥링크 + 플랜 업그레이드 + 데이터 삭제 + 로그아웃
- `TrialExpiredScreen` (S17) — 트라이얼 만료 안내 + 구독 CTA + 무료 전환
- `AccountDeletionScreen` — 탈퇴 2단계 확인
- `LegalScreen` — 개인정보처리방침 / 이용약관
- `DeleteTracksSheet` — 음원 개별/전체 삭제 바텀 시트

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
MOCK_DSP=true             # 개발환경 DSP 처리 mock 분기 (ffmpeg 미설치 환경)
MOCK_LATENCY_MS=3000      # MockDspService 대기 시간
```

**v1.7 삭제된 환경변수** (GPU 인프라 제거):
- `REPLICATE_API_TOKEN`
- `MODAL_TOKEN_ID`
- `RUNPOD_API_KEY`
- `MOCK_GPU` → `MOCK_DSP`로 대체
- `INFERENCE_PROVIDER` → 불필요 (ffmpeg 단독)
- `MOCK_FAIL_RATE` → 유지 (DSP 실패율 테스트에도 유용)

---

## §9 NFR 달성 전략

| NFR | 목표 | 전략 |
|---|---|---|
| DSP 응답시간 | 30초 이내 | M0 self-test — ffmpeg subprocess 동기 처리. 초과 시 NFR 완화(60초) 재협의 |
| 재생 loop gap | 체감 무음 없음 (crossfade 300ms 이상) | 서버 acrossfade 사전 처리 (d=0.3, c1=c2=tri). 클라이언트는 단순 loop |
| 목소리 클립 보관 | master_audio 완료 후 24h 이내 삭제 | Celery Beat 주기 1h + S3 lifecycle 백업 |
| 보안 | presigned URL, HTTPS | S3 private, 만료 1h presigned URL |
| 오프라인 재생 | Premium 유저 | 로컬 파일시스템 저장 (expo-file-system) + RNTP 로컬 경로 |
| 접근성 | VoiceOver/TalkBack 핵심 CTA | accessibilityLabel 모든 CTA에 필수 |
