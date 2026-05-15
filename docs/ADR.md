# Architecture Decision Records

> 자장(Jajang) 프로젝트의 핵심 결정 사항 기록. 결정이 생길 때마다 ADR-N 추가.

## 철학

- **MVP 속도 최우선** — 10~14주 출시 목표. 완성도보다 출시 우선.
- **외부 의존성 최소화** — GPU 인프라 / 모델 라이선스 / 무거운 AI 추론 모두 제거. CPU 워커 1대로 시작.
- **작동하는 최소 구현 선택** — 음원 변주·검증·셔플 모두 ffmpeg + librosa 만으로 처리. 후속 마일스톤에서 보완.
- **법적 안전 우선** — 음성 = 생체정보 / PD 음원 저작인접권 / 아동 대상 광고. 모두 출시 전 차단.

---

> 첫 결정이 생기면 아래 형식으로 추가. 억지로 채우지 말고 실제 결정 발생 시에만.

### ADR-001: AI 음성 합성 → DSP 후처리 전환

**결정**: OpenVoice V2 / F5-TTS / RVC / CosyVoice 등 AI 음성 클로닝 모델을 모두 폐기. ffmpeg DSP (afftdn 노이즈 제거 / equalizer EQ / aecho reverb / acrossfade) + librosa 분석/검증 으로 전환.

**이유**: M0 벤치마크 실행 전 모델 선택 불확실성이 MVP 진행을 막는 핵심 병목이었음. "AI clone" 보다 "진짜 부모가 직접 부른 자장가" 가 차별점으로 더 강력하다고 재정의. GPU warm pool 비용 / 모델 라이선스 / 추론 latency 불확실성 모두 회피.

**트레이드오프**: 음원 다양성 제한 (DSP 단조로움) — N≥2 클립 셔플 + crossfade 로 완화. 허밍 입력 → 노래 합성 같은 advanced 기능은 V3+ 백로그로 연기.

---

### ADR-002: 단일 1 loop 녹음 흐름 (쉬 / 허밍 모드 분기 폐기)

**결정**: F2 녹음 = 선택한 곡의 1 loop 길이 동안 자유 녹음 단일 흐름. "쉬 모드" / "허밍 모드" 분기 모두 폐기. S08 (녹음 모드 선택 화면) 폐기.

**이유**: 모드 분기는 유저 결정 부담 + 구현 복잡도 증가. 가이드 문구 ("따라불러도, 허밍해도, 쉬쉬 소리만 내도 좋습니다") 로 동일 효과 달성 가능. F4 DSP 파이프라인이 입력 다양성을 흡수.

**트레이드오프**: 모드별 최적화 (예: 허밍 전용 pitch correction) 손실. V2 백로그 에서 pitch correction 별도 재검토.

---

### ADR-003: LTD(평생결제) 없음 — 월/연 구독 전용

**결정**: IAP 상품 = 월간 ₩3,900 / 연간 ₩29,000 두 가지만. LTD (Lifetime Deal) 미도입.

**이유**: 구독 전환율 극대화 가 핵심 BM. LTD 는 MRR 희석 + 장기 LTV 측정 왜곡 위험. 7일 트라이얼 → 구독 전환을 주력 레버로 활용.

**트레이드오프**: 일회성 high-intent 유저 (LTD 선호층) 의 즉시 전환 기회 손실. 초기 매출 부스트 포기.

---

### ADR-004: 7일 트라이얼 server-side custom (RevenueCat trial 미사용)

**결정**: 가입 시 서버가 `trial_expires_at = NOW() + INTERVAL '7 days'` 자체 설정. Entitlement 체크 = (RevenueCat 유효 구독 존재) OR (`trial_expires_at > NOW()`). RevenueCat 의 trial 기능 미사용.

**이유**: RevenueCat trial 은 신용카드 등록 강제 / 자동 결제 전환 / 분석 데이터 제약이 있음. 자체 구현으로 카드 미요구 + 만료 후 자동 다운그레이드 동선을 자유롭게 통제. 전환율 측정도 자체 DB (`trial_expires_at` + `subscriptions.created_at`) 기준.

**트레이드오프**: trial 만료 추적 로직 자체 구현 부담. RevenueCat 통합 분석 (트라이얼 → 구독 funnel) 미활용.

---

### ADR-005: PD 6곡 + CC0 참조 멜로디만 사용 (상업 녹음본 일체 금지)

**결정**: 수록 곡 = 브람스 / 모차르트 / 슈베르트 / Twinkle / Rock-a-bye / Hush Little Baby 6곡 (전곡 Public Domain 확정). 참조 멜로디 = 직접 MIDI 생성 또는 IMSLP·Musopen CC0 소스만. 기존 상업 녹음본 사용 금지.

**이유**: PD 악곡이라도 특정 녹음본은 저작인접권이 잔존할 수 있음 → 출시 후 분쟁 리스크 사전 차단. 한국 자장가는 저작권 검토 부담으로 V2 연기.

**트레이드오프**: 한국 유저에게 익숙한 한국어 자장가 (예: 섬집 아기) V1 누락. CC0 소스 음질 한계 (전문 녹음본 대비) 수용.

---

### ADR-006: 무료 티어 음원 생성 3회 / 계정 제한

**결정**: 무료 플랜 유저는 **계정당 총 3회** 후처리 음원 생성 허용. 4번째 시도 → S14 업그레이드 팝업. Premium / Trial 유저는 무제한. 서버사이드 enforcement (클라이언트 우회 방지).

**이유**: 무료 무제한은 인프라 비용 + 구독 전환 압력 모두 약화. 3회는 "내 목소리 자장가" 가치를 충분히 체험하면서도 추가 사용은 구독으로 유도하는 균형점. 트라이얼 7일 (무제한) 종료 후에도 일부 유연성 제공.

**트레이드오프**: 3회 소진 후 이탈 가능성. 모니터링 (소진율 vs 전환율 vs 이탈율) → 필요 시 한도 완화 실험 가능.

---

### ADR-007: 모노레포 + React Native Bare + FastAPI 스택

**결정**: 단일 repo (`apps/mobile/` + `apps/api/`) 구조. 모바일 = React Native + Expo Bare 워크플로 (Managed 아님). 백엔드 = Python FastAPI + Celery + PostgreSQL.

**이유**:
- **Bare 워크플로**: react-native-track-player 등 백그라운드 재생 네이티브 모듈 필수 → Managed 워크플로 한계 회피.
- **FastAPI**: ffmpeg/librosa Python 생태계 직접 활용 + Celery 워커로 비동기 DSP 처리.
- **모노레포**: 1인 개발 + 작은 팀 가정에서 cross-package 변경 / 공통 타입 / 빌드 동기화 비용 절감.

**트레이드오프**: Bare 워크플로 = Expo OTA 업데이트 부분 제약. 모노레포 = 패키지 매니저 (npm workspaces / pnpm) lifecycle 함정 가능성 (개별 lock 관리 필요).

---

### ADR-008: M0 DSP self-test 출시 전 게이트화 (3항목)

**결정**: 개발 착수 전 1주 차에 M0 DSP self-test 수행 — 3항목 모두 통과해야 MVP 본 개발 진입.
1. **단조로움**: 동일 클립 3회 반복 청취 시 체감 변화 있음 (셔플 효과)
2. **이음새**: crossfade 구간에서 체감 무음·클릭 노이즈 없음
3. **노이즈**: SNR 15dB 이상 유지 (librosa 검증)
- Cold start 포함 end-to-end latency 30초 이내. 실패 시 NFR 완화 (60초) 재협의.

**이유**: ADR-001 의 DSP 전환 결정이 *실제로* 들을 만한 음원을 만드는지 사전 검증 필요. AI 합성에서 DSP 로 옮긴 후 출시 직전에 "역시 안 되네" 발견하면 회복 비용 폭증. M0 게이트로 sunk cost 1주에 제한.

**트레이드오프**: M0 1주가 명목 출시 일정에서 차감. 단조로움 실패 시 셔플 알고리즘 재설계 / 이음새 실패 시 crossfade 재조정 / 노이즈 실패 시 필터 파라미터 튜닝 → 최악 시 추가 1주 지연.

---

### ADR-009: 목소리 샘플 24시간 이내 삭제 (생체정보 보관 최소화)

**결정**: 유저가 업로드한 목소리 샘플은 DSP 생성 완료 후 서버에서 **24시간 이내** 자동 삭제. 생성된 mp3 결과물만 S3 / R2 에 유저 계정 연결로 보관.

**이유**: 음성 = 생체정보 → 개인정보보호법 / GDPR Art.9 적용. 보관 기간 최소화 = 법적 리스크 + 유출 시 피해 범위 최소화. 24h 는 재처리 / 디버깅 / 사용자 변심 후 재생성 요청에 대응 가능한 합리적 윈도우.

**트레이드오프**: 24h 후 유저가 같은 샘플로 재처리 원할 시 재녹음 필요. 분석/개선 목적의 장기 데이터 수집 불가 (자체 학습 모델 도입 시 다시 검토 필요).

> ⚠️ **v1.4.x+ 갱신** (Epic 19 ADR-010): MVP 부터 raw 음성은 *디바이스 영구 로컬* (서버 업로드 0). 본 ADR 의 24h 정책은 미래 sync 기능 도입 시 *완성 mp3 만* (raw 0) 업로드 시점부터 적용. 자세히 = ADR-010.

---

### ADR-010: Local DSP path 도입 + 서버 path 보존 + 미래 sync 정책

**결정**: v1.4.x 부터 mobile 디바이스 로컬 DSP path (`LocalDspService` + `DspPipeline` + `MinimalDspBridgeImpl` + `LocalCounterRepo`) 활성. 서버 DSP path (`/sessions/*` + Celery `dsp_processing` task + `services/dsp/*` + S3) 코드 **보존 (삭제 0 / 변경 0)**, 배포만 stop. 미래 sync 기능 진입 시 *완성 wav 만* (raw 0) 업로드 (`POST /sessions/{id}/upload-master` 신규 엔드포인트, 본 ADR 시점 = 경로명만 박힘).

**이유**:
- **인프라 비용 절감** — Celery worker + API server + S3 storage 모두 stop. 인프라 비용 0
- **오프라인** — 새벽 와이파이 끊긴 환경에서도 자장가 생성 가능 (서버 NW 의존 path 의 핵심 UX 약점 제거)
- **프라이버시** — raw 부모 음성이 디바이스 외 유출 0 (생체정보 안전 우선, ADR-009 강화)
- **외부 검증된 라이브러리 retire 인지** — `ffmpeg-kit` 본가 2025 retire (Story 1 task 01 spike 측정 NO_GO 재현)
- **C3 채택** — Story 1 Spike Gate (NS1~NS4) 결과 = afftdn 폐기 + highpass IIR + EQ + echo + crossfade. dep 0 + size 0 + server SSOT 재사용

**트레이드오프**:
- 서버 dead code 누적 → lint warning 허용. 단 V2+ AI 합성 부활 / sync 기능 진입 시 인프라 재구축 비용 회피 가치 우선
- mobile-only 한계 — raw 기반 재처리 (예: DSP 파라미터 튜닝 후 재생성) 불가. 다중 디바이스 동기화 = mp3 만
- 클라 카운터 우회 가능 (re-install / 시간 조작) — BM 손실 ≤ 무시 가능 수용 (sync 진입 시 서버 reconcile, 방식 = V2+ 결정)
- mp3 인코딩 미루기 — task 09/10 = `.wav` 출력. 미래 sync 진입 시 서버 측 또는 별 task 에서 인코딩 검토

**Epic-local 결정 (자세히)**: [docs/epics/epic-19-local-dsp/adr.md](epics/epic-19-local-dsp/adr.md) ADR-19A~19E.

- ADR-19A: 후보 set + C3 채택 (NS1~NS4 spike 결과)
- ADR-19B: 서버 path 코드 보존 + 배포 stop 정책
- ADR-19C: 미래 sync 정책 — raw 영구 로컬 / 완성 wav 만 서버 업로드
- ADR-19D: spike-driven epic 패턴 (PRD spec 확정을 spike 결과로 미룸)
- ADR-19E: 통합 브랜치 패턴 (long-lived `feature/local-dsp` + sub-PR + 옵션 c-1 수동 close)
