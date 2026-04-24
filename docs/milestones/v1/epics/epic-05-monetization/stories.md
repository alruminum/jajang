# Epic 05 — 수익화 (광고 + IAP)

**포함 기능:** F10 (배너 광고), F11 (Rewarded Ad), F12 (IAP 구독 — 월/연)  
**선행 조건:** Epic 01 완료 (로그인 + 트라이얼), Epic 04 완료 (재생 화면)  
**완료 기준:** 광고 노출 / Rewarded Ad 언락 / 구독 결제 전체 플로우 동작

> **구현 순서 주의**: F12(IAP 구독 등록)를 먼저 구현한 후 F14(트라이얼), F11(Rewarded) 순으로 진행.

---

## Story 1 — IAP 구독 플랜 (RevenueCat) ← 최우선 구현

**As a** 유저  
**I want** 월간 또는 연간 구독을 결제하고 싶다  
**So that** 광고 없이 백그라운드 재생을 무제한으로 쓸 수 있다

### 태스크 체크리스트

- [ ] RevenueCat SDK 설정 (iOS/Android 앱스토어 연동)
- [ ] 구독 상품 설정: **월간 (₩3,900/월) / 연간 (₩29,000/년)** — LTD(평생결제) 없음
- [ ] 구독 화면 UI: 플랜 카드 + 혜택 목록 + 결제 버튼
- [ ] 혜택 표시: 광고 제거 + 백그라운드 무제한 + 오프라인 다운로드
- [ ] 결제 완료 → entitlement 즉시 부여 → 광고 제거 + 기능 해제
- [ ] 구독 복원 버튼 (기기 변경 시)
- [ ] 구독 취소 링크 (앱스토어/플레이스토어 이동)
- [ ] Apple IAP 강제 (앱스토어 규정 준수, 외부 결제 미노출)

### 수용 기준

- Given 구독 결제 완료 / When 앱 재실행 / Then Premium entitlement 유지 + 광고 없음
- Given 기기 변경 / When 복원 탭 / Then 구독 상태 복원
- Given 구독 취소 후 만료일 이전 / When 앱 실행 / Then 만료일까지 Premium 유지
- Given 연간 플랜 선택 / When 결제 / Then 월간 대비 절약 금액 강조
- Given LTD 옵션 탭 시도 / When / Then 해당 옵션 없음 (UI에 노출 안 됨)

---

## Story 2 — 배너 광고 (AdMob)

**As a** 무료 플랜 유저  
**I want** 앱을 무료로 쓸 수 있다  
**So that** 구독 없이도 기본 기능을 사용할 수 있다 (광고 수익으로 서비스 운영)

### 태스크 체크리스트

- [ ] Google Mobile Ads SDK 설정 (AdMob 계정, 앱 ID)
- [ ] 재생 화면 하단 배너 광고 컴포넌트
- [ ] 무료 플랜 유저에게만 노출, Premium/Trial 유저 숨김
- [ ] 광고 로드 실패 시 영역 collapse (빈 공간 없음)
- [ ] COPPA 설정: 아동 대상 광고 비활성화 (tagForChildDirectedTreatment = false)
- [ ] GDPR: EU 유저 동의 처리 (UMP SDK 연동)

### 수용 기준

- Given 무료 유저 / When 재생 화면 진입 / Then 하단 배너 광고 노출
- Given Premium 유저 / When 재생 화면 진입 / Then 광고 영역 없음
- Given 광고 로드 실패 / When / Then 영역 자동 collapse, UI 레이아웃 유지

---

## Story 3 — Rewarded Ad (오늘 밤 백그라운드 언락, 월 7회)

**As a** 무료 유저  
**I want** 광고를 보고 오늘 밤 백그라운드 재생을 쓰고 싶다  
**So that** 구독 없이도 한 번은 아기에게 들려줄 수 있다

### 태스크 체크리스트

- [ ] 업그레이드 팝업에 "광고 보고 오늘 밤 무료로 쓰기" 버튼 (트라이얼 유저에게는 미노출)
- [ ] Rewarded Ad 로드 + 노출 (AdMob Rewarded)
- [ ] 광고 시청 완료 검증 → 자정까지 백그라운드 재생 언락
- [ ] 언락 상태 로컬 저장 (자정 초기화)
- [ ] **월 7회 제한** (캘린더 월 기준 리셋) — 하루 1회 아님
- [ ] 월 7회 소진 시 "이번 달은 이미 모두 사용했어요" 안내
- [ ] 광고 로드 실패 시 "광고를 불러오지 못했어요" 안내
- [ ] 트라이얼 유저: 팝업 진입 시 Rewarded Ad 버튼 미노출 (이미 Premium 상태)

### 수용 기준

- Given 광고 시청 완료 / When / Then 자정까지 백그라운드 재생 허용
- Given 당월 이미 7회 시청 완료 / When 다시 시도 / Then "이번 달은 이미 모두 사용했어요" 메시지
- Given 광고 로드 실패 / When 버튼 탭 / Then "광고를 불러오지 못했어요" + 구독 유도
- Given 자정 경과 / When 앱 실행 / Then 해당 일 언락 초기화
- Given 캘린더 월 변경 / When 앱 실행 / Then 월 사용 횟수 초기화 (7회 복원)
- Given 트라이얼 유저 / When 업그레이드 팝업 진입 / Then Rewarded Ad 버튼 미노출

---

## Story 4 — 오프라인 다운로드 (Premium)

**As a** Premium 유저  
**I want** 생성된 자장가를 기기에 저장해두고 싶다  
**So that** 인터넷이 없는 환경에서도 재생할 수 있다

### 태스크 체크리스크

- [ ] Premium entitlement 확인 후 다운로드 버튼 노출
- [ ] 음원 로컬 저장 (앱 전용 디렉토리)
- [ ] 다운로드 상태 표시 (다운로드 중 / 완료)
- [ ] 오프라인 재생 가능 배지 표시
- [ ] 무료 유저 다운로드 시도 → 구독 유도 팝업

### 수용 기준

- Given Premium 유저 / When 다운로드 탭 / Then 로컬 저장 완료 + 오프라인 배지
- Given 오프라인 상태 / When 다운로드된 음원 탭 / Then 정상 재생
- Given 무료 유저 / When 다운로드 시도 / Then 구독 유도 팝업

---

## Story 5 — 업그레이드 유도 팝업 & 구독 화면 진입점

**As a** 시스템  
**I want** 무료 유저가 제한 기능을 시도할 때 구독으로 유도하고 싶다  
**So that** 전환율을 높일 수 있다

### 태스크 체크리스트

- [ ] 업그레이드 팝업 트리거 상황 정의:
  - 무료 유저가 화면 잠금 시 (백그라운드 제한)
  - 무료 유저가 오프라인 다운로드 시도 시
  - 트라이얼 만료 시
  - 무료 유저 AI 생성 횟수 3회 소진 시 (횟수 소진 메시지 포함)
- [ ] 팝업 UI: 혜택 요약 + "구독하기" CTA + "광고 보기" (Rewarded Ad, 트라이얼 중 미노출)
- [ ] 구독 화면: 설정 메뉴 + 팝업 CTA에서 진입 가능
- [ ] 팝업 닫기: X 버튼 or 바깥 탭 (닫아도 제한은 유지)

### 수용 기준

- Given 무료 유저 화면 잠금 / When / Then 업그레이드 팝업 노출
- Given 팝업에서 "구독하기" 탭 / When / Then 구독 화면 이동
- Given 팝업에서 "광고 보기" 탭 / When / Then Rewarded Ad 시작
- Given 팝업 닫기 / When / Then 팝업 닫힘 + 재생 일시정지 상태 유지
- Given 무료 유저 3회 소진 후 팝업 / When / Then 횟수 소진 안내 메시지 포함

---

## 관련 이슈

| 스토리 | GitHub Issue |
|---|---|
| Story 1 | — |
| Story 2 | — |
| Story 3 | — |
| Story 4 | — |
| Story 5 | — |
