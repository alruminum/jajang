# Backlog — 자장(Jajang) v1

마일스톤: `v1`
업데이트: 2026-04-30 (v1.3.1 — DSP 피벗 반영: Epic 02/03/04 stories·impl 갱신, Epic 03 명칭 변경)

## 마일스톤 0 — 선행 리서치 (1주)

구현 착수 전 블로킹 리서치. 산출물: `docs/reference.md`.

### 경쟁 리서치 (M0 병행)
- [ ] 앱스토어 검색어 "lullaby" / "baby sleep" / "baby voice" 상위 20개 앱 BM·리뷰 스캔
- [ ] "부모 목소리 개인화 AI 자장가" 카테고리 실제 공백 검증
- [ ] 경쟁사 리뷰 빈번 pain point 3가지 추출 → V1 포지셔닝 reconfirm

### DSP self-test (M0 병행, v1.3.1 대체)
- [x] ffmpeg DSP 파이프라인 프로토타입 실행 (afftdn/equalizer/aecho/acrossfade) — 2026-05-08 검증, [report](docs/m0-dsp-self-test.md)
- [x] 합격 기준 3항목: 단조로움(셔플 40% dominance ≤50%) / 이음새(mid-track 무음 0) / 노이즈(SNR 21.64dB ≥15)
- [x] cold start 포함 end-to-end latency 30초 이내 실측 — 0.94s 실측 (>30x 여유)
- [x] 실패 contingency: 모든 항목 첫 실행 PASS, contingency 발화 X

> ~~보이스 모델 벤치마크~~ / ~~AI 모델 라이선스 확인~~ — v1.3.0 피벗으로 삭제 (GPU/AI 모델 불필요)

### M0 게이트
- [x] 모든 체크리스트 통과 → 개발 단계 진입 (DSP 항목 PASS, 경쟁 리서치는 별도 트랙)
- [ ] 실패 항목 발생 → 대안 결정 후 진입

---

## 에픽 목록

| # | 에픽 | 포함 기능 | 상태 | 경로 |
|---|---|---|---|---|
| 01 | 인증 & 온보딩 | F1, F13(게이트), F14 | ✅ 완료 (9 impl) | [epic-01-auth](docs/milestones/v1/epics/epic-01-auth/stories.md) |
| 02 | 목소리 녹음 & 품질 검증 | F2, F3, F5 | 🔄 v1.3.1 갱신 (impl/13·14 신규, impl/05 폐기) | [epic-02-recording](docs/milestones/v1/epics/epic-02-recording/stories.md) |
| 03 | DSP 음원 후처리 생성 | F4 | 🔄 v1.3.1 전면 재정의 (AI→DSP, impl/01~03 신규) | [epic-03-ai-generation](docs/milestones/v1/epics/epic-03-ai-generation/stories.md) |
| 04 | 재생 & 백그라운드 | F6, F7, F8, F9 | 🔄 v1.3.1 갱신 (Story 2 RepeatMode.Queue 단순 loop) | [epic-04-playback](docs/milestones/v1/epics/epic-04-playback/stories.md) |
| 05 | 수익화 (광고 + IAP) | F10, F11, F12 | ✅ 완료 (5 impl) | [epic-05-monetization](docs/milestones/v1/epics/epic-05-monetization/stories.md) |
| 06 | 개인정보 & 데이터 관리 | F13(설정 UI) | ✅ 완료 (5 impl) | [epic-06-privacy](docs/milestones/v1/epics/epic-06-privacy/stories.md) |
| 07 | 디자인 시스템 | 디자인 토큰 + 폰트 로딩 + 화면 비주얼 폴리시 | 🔲 진행 중 (1 impl 계획) | [epic-07-design-system](docs/milestones/v1/epics/epic-07-design-system/impl/01-theme-tokens.md) |
| 08 | Mobile Test Infra | Vitest → Jest (jest-expo) 마이그레이션, RN Flow strip | 🔲 impl 계획 완료 | [epic-08-mobile-test-infra](docs/milestones/v1/epics/epic-08-mobile-test-infra/stories.md) · impl: [01](docs/milestones/v1/epics/epic-08-mobile-test-infra/impl/01-jest-infra.md) [02](docs/milestones/v1/epics/epic-08-mobile-test-infra/impl/02-setup-mock-jest-migration.md) [03](docs/milestones/v1/epics/epic-08-mobile-test-infra/impl/03-test-suite-green.md) |
| 09 | Mobile Test Triage | Jest 잔여 156 fails 카테고리별 정리, PR #149 merge 가능 상태 | 🔲 impl 계획 완료 | [epic-09-mobile-test-triage](docs/milestones/v1/epics/epic-09-mobile-test-triage/stories.md) · impl: [01](docs/milestones/v1/epics/epic-09-mobile-test-triage/impl/01-category-a-store-mock-esmodule.md) [02](docs/milestones/v1/epics/epic-09-mobile-test-triage/impl/02-category-b-pressable-event-mock.md) [03](docs/milestones/v1/epics/epic-09-mobile-test-triage/impl/03-category-c-async-teardown.md) [04](docs/milestones/v1/epics/epic-09-mobile-test-triage/impl/04-category-d-logic-fix-pr149.md) |
| 10 | Mobile Test Finalize + PR #149 Merge | 잔여 94 fails / 14 suites 카테고리별 정리 + PR #149 GREEN merge | 🔲 batch 분해 완료 (8 batches: 01~08) | [epic-10-mobile-test-finalize](docs/milestones/v1/epics/epic-10-mobile-test-finalize/stories.md) · [batch-list](docs/milestones/v1/epics/epic-10-mobile-test-finalize/batch-list.md) |
| 11 | Mobile QA Tour Package (`mobile-qa-tour`) | Android monkey + driven screenshot tour LLM 디자인 검수를 재사용 가능 npm 패키지로 캡슐화 + jajang 최초 consumer 통합 | 🔲 design 완료 (5 stories) | [epic-11-monkey-design-review](docs/milestones/v1/epics/epic-11-monkey-design-review/stories.md) · [system-design](docs/milestones/v1/epics/epic-11-monkey-design-review/system-design.md) |

## 구현 순서

마일스톤 0 → Epic 01 → Epic 02 → Epic 03 → Epic 04 → Epic 05 (병행) → Epic 06 (병행)

## 타임라인 (총 10~14주)

- 마일스톤 0: 1주 (벤치마크 + 경쟁 리서치 + 라이선스)
- 개발: 7~10주
- TestFlight(iOS) / Internal Test Track(Android) 내부 베타: 1주 (5~10명)
- 앱스토어 심사 제출 + 대기: 1~2주 (Apple IAP 포함 시 추가 심사 가능성)
- 공개 출시

## 체크리스트

- [ ] 마일스톤 0 — 선행 리서치 (벤치마크 미실행, MockInferenceClient로 우선 진행)
- [x] Epic 01 — 인증 & 온보딩
- [x] Epic 02 — 목소리 녹음 & 품질 검증 (v1.3.1 갱신: impl/13·14 신규 미구현)
- [x] Epic 03 — DSP 음원 후처리 생성 (v1.3.1 전면 재정의: Story 1~7 모두 완료, impl/01~07 merged)
- [x] Epic 04 — 재생 & 백그라운드 (v1.3.1 갱신: Story 2 RepeatMode.Queue 전환 확인 필요)
- [x] Epic 05 — 수익화
- [x] Epic 06 — 개인정보 & 데이터 관리
- [x] Epic 07 — 디자인 시스템 (Issue #87 완료 — 색상 교체·폰트 로딩 2026-04-26)
- [x] Epic 08 — Mobile Test Infra (Issue #150 완료)
- [x] Epic 09 — Mobile Test Triage (Issue #157 완료)
- [x] Epic 10 — Mobile Test Finalize + PR #149 Merge (Issue #166 완료, PR #149 merged)
- [x] Epic 11 — Mobile QA Tour Package + Jajang Integration (#181, Story 3 #185 완료)
- [x] Epic 12 — Theme drift fix (직접 hex → theme token 마이그레이션) — Issue #237 (task 01~09 모두 완료, hex-lint 회귀 방지 인프라 GREEN)
- [x] Epic 12 follow-up — RecordModeScreen.tsx 폐기 처리 + hex-lint 보강 — Issue #259 close, PR #260 merged (2026-05-13)
- [ ] Epic 13 — `mobile-qa-tour` 별도 레포 분리 + npm publish — semver 1.0.0 안정화 후
- [ ] Epic 14 — QA tour CI 자동화 (GitHub Actions) — PR merge 전 자동 실행
- [ ] Epic 15 — iOS 시뮬레이터 지원 — iOS QA 필요 시점
- [ ] Epic 16 — Pencil 노드 매핑 확장 (S10 외 6 화면) — 디자인 폴리시 마무리 단계
- [ ] Epic 17 — Deep-link 인프라 + Preview/Generating/Play 화면 tour — 30초 녹음 우회 mock 후
- [ ] Epic 18 — testID 확대 (82 → 19 screens × 5+ avg) — tour 좌표 fallback 의존 제거
- [ ] Epic 19 — Local DSP migration (server ffmpeg → mobile path 추가, server path 보존 + 미래 sync mp3-only 정책) — [stories](docs/epics/epic-19-local-dsp/stories.md) · 통합 브랜치 `feature/local-dsp` · ⚠️ Story 1 spike 결과 의존 (5 artifacts: build / ffprobe / 처리시간 / 앱 크기 / LGPL)
- [ ] 내부 베타 (TestFlight / Internal Test Track)
- [ ] 앱스토어 심사 통과 + 공개 출시
