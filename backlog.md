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
- [ ] ffmpeg DSP 파이프라인 프로토타입 실행 (afftdn/equalizer/aecho/acrossfade)
- [ ] 합격 기준 3항목: 단조로움(셔플 효과) / 이음새(crossfade 무음 없음) / 노이즈(SNR 15dB 이상)
- [ ] cold start 포함 end-to-end latency 30초 이내 실측
- [ ] 실패 contingency: 단조로움→셔플 재설계 / 이음새→crossfade 길이 조정 / 노이즈→필터 파라미터 재조정

> ~~보이스 모델 벤치마크~~ / ~~AI 모델 라이선스 확인~~ — v1.3.0 피벗으로 삭제 (GPU/AI 모델 불필요)

### M0 게이트
- [ ] 모든 체크리스트 통과 → 개발 단계 진입
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
- [x] Epic 03 — DSP 음원 후처리 생성 (v1.3.1 전면 재정의: impl/01~03 신규 미구현)
- [x] Epic 04 — 재생 & 백그라운드 (v1.3.1 갱신: Story 2 RepeatMode.Queue 전환 확인 필요)
- [x] Epic 05 — 수익화
- [x] Epic 06 — 개인정보 & 데이터 관리
- [ ] Epic 07 — 디자인 시스템 (Issue #87)
- [ ] Epic 08 — Mobile Test Infra (Issue #150)
- [ ] Epic 09 — Mobile Test Triage (Issue #157)
- [ ] 내부 베타 (TestFlight / Internal Test Track)
- [ ] 앱스토어 심사 통과 + 공개 출시
