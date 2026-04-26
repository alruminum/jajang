# Backlog — 자장(Jajang) v1

마일스톤: `v1`
업데이트: 2026-04-26 (v1.2 — Epic 01~06 impl 완료, PR #1~#82 머지)

## 마일스톤 0 — 선행 리서치 (1주)

구현 착수 전 블로킹 리서치. 산출물: `docs/reference.md`.

### 경쟁 리서치 (M0 병행)
- [ ] 앱스토어 검색어 "lullaby" / "baby sleep" / "baby voice" 상위 20개 앱 BM·리뷰 스캔
- [ ] "부모 목소리 개인화 AI 자장가" 카테고리 실제 공백 검증
- [ ] 경쟁사 리뷰 빈번 pain point 3가지 추출 → V1 포지셔닝 reconfirm

### 보이스 모델 벤치마크 (M0 병행)
- [ ] 후보 모델 4종 (OpenVoice V2 / F5-TTS / RVC·so-vits-svc / CosyVoice) 각 샘플 5개 생성
- [ ] 품질 / 추론 시간 / 비용 비교 리포트
- [ ] end-to-end latency 벤치마크 (cold start 포함 90초 NFR 달성 여부)
- [ ] 부모 블라인드 테스트 — "내 목소리 인식" ≥ 60% 합격 기준
- [ ] 실패 contingency 결정 — warm pool / NFR 완화(2분) / 허밍 → "단어 반복" 녹음 모드 전환

### 모델 상업 라이선스 확인 (M0 병행)
- [ ] OpenVoice V2 — MIT License 원문 확인
- [ ] F5-TTS — CC-BY 4.0 + 상업 이용 조건 원문 확인
- [ ] RVC / so-vits-svc — fork별 커뮤니티 라이선스 / 상업 배포 조건 각 fork 명시
- [ ] CosyVoice — Apache 2.0 원문 확인
- [ ] 라이선스 불명확 / 상업 배포 금지 모델 → 후보 제외

### M0 게이트
- [ ] 모든 체크리스트 통과 → 개발 단계 진입
- [ ] 실패 항목 발생 → 대안 결정 후 진입

---

## 에픽 목록

| # | 에픽 | 포함 기능 | 상태 | 경로 |
|---|---|---|---|---|
| 01 | 인증 & 온보딩 | F1, F13(게이트), F14 | ✅ 완료 (9 impl) | [epic-01-auth](docs/milestones/v1/epics/epic-01-auth/stories.md) |
| 02 | 목소리 녹음 & 품질 검증 | F2, F3, F5 | ✅ 완료 (8 impl) | [epic-02-recording](docs/milestones/v1/epics/epic-02-recording/stories.md) |
| 03 | AI 음원 생성 | F4 | ✅ 완료 (7 impl) | [epic-03-ai-generation](docs/milestones/v1/epics/epic-03-ai-generation/stories.md) |
| 04 | 재생 & 백그라운드 | F6, F7, F8, F9 | ✅ 완료 (7 impl) | [epic-04-playback](docs/milestones/v1/epics/epic-04-playback/stories.md) |
| 05 | 수익화 (광고 + IAP) | F10, F11, F12 | ✅ 완료 (5 impl) | [epic-05-monetization](docs/milestones/v1/epics/epic-05-monetization/stories.md) |
| 06 | 개인정보 & 데이터 관리 | F13(설정 UI) | ✅ 완료 (5 impl) | [epic-06-privacy](docs/milestones/v1/epics/epic-06-privacy/stories.md) |

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
- [x] Epic 02 — 목소리 녹음 & 품질 검증
- [x] Epic 03 — AI 음원 생성 (실제 GPU 추론은 M0 후 교체)
- [x] Epic 04 — 재생 & 백그라운드
- [x] Epic 05 — 수익화
- [x] Epic 06 — 개인정보 & 데이터 관리
- [ ] 내부 베타 (TestFlight / Internal Test Track)
- [ ] 앱스토어 심사 통과 + 공개 출시
