# Epic 02 — 목소리 녹음 & 품질 검증

**포함 기능:** F2 (목소리 녹음), F3 (샘플 품질 검증)  
**선행 조건:** Epic 01 완료 (로그인 상태), F5 자장가 선택 화면 (Epic 03에 포함되나 녹음 진입 전 필요)  
**완료 기준:** 녹음 → 품질 검증 → AI 생성 진입 가능한 상태

---

## Story 1 — 자장가 선택 화면

**As a** 로그인된 유저  
**I want** PD 자장가 6곡 중 하나를 선택하고 싶다  
**So that** 내 목소리와 합성할 곡을 고를 수 있다

### 태스크 체크리스트

- [ ] 6곡 목록 UI (곡명 + 작곡가 + 30초 미리듣기 버튼)
- [ ] PD 자장가 오디오 에셋 번들 (앱 내 포함 또는 CDN)
- [ ] 미리듣기: 탭 → 재생, 다시 탭 → 정지 (동시에 2곡 재생 불가)
- [ ] 곡 선택 → 선택 상태 표시 → 다음 버튼 활성화
- [ ] 이미 해당 곡으로 음원 생성 이력 있을 시 안내 ("이미 생성한 곡이에요. 다시 만들 수 있어요")

### 수용 기준

- Given 자장가 선택 화면 / When 미리듣기 탭 / Then 해당 곡 30초 재생 후 자동 정지
- Given 곡 선택 후 다음 탭 / When / Then 녹음 모드 선택 화면 이동
- Given 두 곡 미리듣기 동시 시도 / When / Then 이전 곡 정지 후 새 곡 재생

---

## Story 2 — 녹음 모드 선택 & 가이드

**As a** 유저
**I want** 허밍과 쉬 중 내게 맞는 녹음 방식을 선택하고, 허밍 모드에서는 가사 미리보기와 헤드폰 권장 안내를 보고 싶다
**So that** 더 자연스럽고 준비된 상태로 녹음할 수 있다

> v1.2.1 갱신 (#133): challenge-response 폐기 → 가사 미리보기 + 헤드폰 chip 추가

### 태스크 체크리스트

- [ ] 모드 선택 화면: 허밍 / 쉬 카드 UI + 각 모드 설명 (기존 유지)
- [ ] 가사 자산 모듈 신규 생성 (`data/lyrics.ts` — 6곡 한국어 1절 4~6줄)
- [ ] BGM 트랙 메타 모듈 신규 생성 (`data/bgmTracks.ts`)
- [ ] `LyricsBox` 컴포넌트 신규 생성 (가사 미리보기/녹음 모드 공통)
- [ ] S09 가이드 화면: challenge-response 박스 제거
- [ ] S09 허밍 모드: 헤드폰 권장 chip 노출 (세이지 그린 outline, 비인터랙티브)
- [ ] S09 허밍 모드: 선택 곡 가사 박스 노출 (1절 4~6줄, 400ms fade-in)
- [ ] S09 쉬 모드: 헤드폰 chip / 가사 박스 미노출
- [ ] S09 가사 미준비 fallback: 가사 박스 숨김 + "허밍해 주세요" 텍스트
- [ ] navigation/types.ts: RecordGuide 파라미터에 songKey 추가
- [ ] RecordModeScreen: navigate('RecordGuide', { mode, songKey }) 수정
- [ ] challenges API 클라이언트 삭제 (`services/api/challenges.ts`)
- [ ] 서버 challenges 엔드포인트 → 410 Gone 처리

### 수용 기준

- Given 허밍 모드 S09 진입 / When 화면 로드 / Then 헤드폰 chip + 선택 곡 가사 박스 노출 (challengesApi 호출 없음)
- Given 쉬 모드 S09 진입 / When 화면 로드 / Then 헤드폰 chip / 가사 박스 미노출
- Given 가사 미준비 songKey / When S09 진입 / Then 가사 박스 숨김 + "허밍해 주세요" 텍스트 (chip 유지)
- Given 녹음 시작할게요 탭 / When 권한 허용 / Then navigate('Record', { mode, songKey }) 전달됨
- Given GET /api/v1/challenges/random / When 호출 / Then HTTP 410 반환

---

## Story 3 — 실시간 녹음

**As a** 유저
**I want** 마이크로 내 목소리를 30~60초 녹음하고 싶다. 허밍 모드에서는 BGM 30%와 가사 박스가 함께 나오길 원한다
**So that** AI 자장가 생성에 사용할 좋은 샘플을 만들 수 있다

> v1.2.1 갱신 (#133): 허밍 모드 BGM 30% 재생 + 가사 박스 추가

### 태스크 체크리스트

- [ ] 마이크 권한 요청 (기존 유지)
- [ ] 카운트다운 3초 UI (기존 유지 — BGM/가사 박스 미노출)
- [ ] 실시간 음량 파형 시각화 (기존 유지)
- [ ] 타이머 표시 경과/최대 (기존 유지)
- [ ] 30초 미만 종료 다이얼로그 (기존 유지)
- [ ] 60초 자동 종료 (기존 유지)
- [ ] 무음 감지 10초 경고 (기존 유지)
- [ ] `useBgmPlayer` 훅 신규 생성 (BGM 재생/정지, volume ramp 0→30% 300ms)
- [ ] 허밍 모드: 카운트다운 종료 → BGM 재생 시작 (volume ramp)
- [ ] 허밍 모드: 녹음 종료(수동/자동/취소) → BGM 정지 (volume ramp 30%→0 200ms)
- [ ] 허밍 모드: 가사 박스 노출 (LyricsBox mode="recording", fade-in 400ms)
- [ ] 허밍 모드: BGM chip 표시 ("♬ 곡명 · 30%")
- [ ] 쉬 모드: BGM/가사 박스/BGM chip 미노출
- [ ] 허밍 모드 다시 녹음: BGM 정지 → 카운트다운 재시작 → BGM 처음부터 재생
- [ ] BGM 로드 실패: 상단 토스트 "음악 없이 녹음할게요" + 녹음 계속 진행
- [ ] 가사 미준비 fallback: 가사 박스 숨김 + "허밍해 주세요" (BGM chip 유지)

### 수용 기준

- Given 허밍 모드 카운트다운 종료 / When / Then BGM 30% volume ramp 시작 + 가사 박스 fade-in 노출
- Given 허밍 모드 녹음 종료 / When ⏹ 탭 (30초+) / Then BGM volume ramp 정지 → S11 이동
- Given 허밍 모드 녹음 중 / When 60초 경과 자동 종료 / Then BGM 즉시 정지
- Given 쉬 모드 / When 녹음 진행 / Then BGM/가사 박스/BGM chip 미노출 (기존 동작 유지)
- Given BGM 로드 실패 / When 카운트다운 종료 / Then 토스트 "음악 없이 녹음할게요" + 녹음 계속
- Given 허밍 모드 다시 녹음 / When S11→S10 재진입 / Then BGM 처음부터 재생 (volume ramp)

---

## Story 4 — 녹음 미리듣기 & 재녹음

**As a** 유저  
**I want** 녹음한 내용을 들어보고 마음에 안 들면 다시 녹음하고 싶다  
**So that** 좋은 샘플로 생성할 수 있다

### 태스크 체크리스트

- [ ] 미리듣기 재생/일시정지 컨트롤
- [ ] 파형 시각화 (녹음본)
- [ ] "다시 녹음" 버튼 → 이전 파일 삭제 + 녹음 화면 복귀
- [ ] "사용하기" 버튼 → 품질 검증 시작 (Story 5)
- [ ] 다시 녹음 횟수 제한 없음

### 수용 기준

- Given 미리듣기 화면 / When 재생 버튼 탭 / Then 녹음본 전체 재생
- Given "다시 녹음" 탭 / When / Then 이전 파일 로컬 삭제 + 녹음 화면 초기화
- Given "사용하기" 탭 / When / Then 품질 검증 로딩 시작

---

## Story 5 — 샘플 품질 검증

**As a** 시스템  
**I want** 녹음 샘플의 품질을 자동으로 검증하고 싶다  
**So that** AI 생성 실패율을 줄이고 품질 낮은 샘플을 사전 차단할 수 있다

### 태스크 체크리스트

- [ ] 클라이언트 1차 검증: 길이(30초+) / 음량(RMS -40dB~-6dB) / 클리핑(피크 3회 이하)
- [ ] 서버 업로드 + 2차 검증: SNR 15dB 이상
- [ ] 검증 중 로딩 UI ("샘플을 분석하고 있어요…")
- [ ] 검증 실패 유형별 안내 메시지
  - 너무 조용함: "조금 더 크게 녹음해주세요"
  - 잡음 과다: "조용한 공간에서 다시 녹음해주세요"
  - 너무 짧음: "30초 이상 녹음이 필요해요"
- [ ] 검증 실패 → 재녹음 버튼 (미리듣기 화면 복귀)
- [ ] 검증 통과 → AI 생성 화면 자동 이동 (Epic 03)

### 수용 기준

- Given 음량 기준 미달 / When 검증 / Then 재녹음 유도 화면 + 이유 안내
- Given SNR 15dB 미만 / When 서버 검증 / Then 재녹음 유도 (잡음 메시지)
- Given 모든 기준 통과 / When 검증 완료 / Then AI 생성 화면 자동 이동
- Given 서버 통신 오류 / When 검증 중 / Then 재시도 버튼 + "네트워크를 확인해주세요"

---

## 관련 이슈

| 스토리 | GitHub Issue |
|---|---|
| Epic | [#52](https://github.com/alruminum/jajang/issues/52) |
| Story 1 | [#53](https://github.com/alruminum/jajang/issues/53) |
| Story 2 | [#54](https://github.com/alruminum/jajang/issues/54) |
| Story 2/3 v1.2.1 갱신 | [#133](https://github.com/alruminum/jajang/issues/133) |
| Story 3 | [#55](https://github.com/alruminum/jajang/issues/55) |
| Story 4 | [#56](https://github.com/alruminum/jajang/issues/56) |
| Story 5 | [#57](https://github.com/alruminum/jajang/issues/57) |
