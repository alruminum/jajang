# Epic 02 — 목소리 녹음 & 품질 검증

**GitHub Epic Issue:** [#52](https://github.com/alruminum/jajang/issues/52)

**포함 기능:** F2 (목소리 녹음), F3 (샘플 품질 검증)  
**선행 조건:** Epic 01 완료 (로그인 상태), F5 자장가 선택 화면 (S07, Epic 02 내)  
**완료 기준:** 녹음 → 품질 검증 → DSP 생성 진입 가능한 상태

> v1.3.1 피벗 (2026-04-30): 쉬/허밍 모드 분기 폐기 → 단일 "1 loop 따라부르기" 흐름. S08(녹음 모드 선택 화면) 폐기. Story 2 전면 재정의. Story 3 단일흐름 + 이어폰 모달 + 1 loop 자동종료로 갱신. Story 6 카운터 표시 화면 목록 갱신.

---

## Story 1 — 자장가 선택 화면 (S07)

**As a** 로그인된 유저  
**I want** PD 자장가 6곡 중 하나를 선택하고 싶다  
**So that** 내 목소리로 만들 곡을 고를 수 있다

### 태스크 체크리스트

- [x] 6곡 목록 UI (곡명 + 작곡가 + 30초 미리듣기 버튼)
- [x] PD 자장가 오디오 에셋 번들 (앱 내 포함 또는 CDN)
- [x] 미리듣기: 탭 → 재생, 다시 탭 → 정지 (동시에 2곡 재생 불가)
- [x] 곡 선택 → 선택 상태 표시 → 다음 버튼 활성화
- [x] 이미 해당 곡으로 음원 생성 이력 있을 시 안내
- [ ] 무료 유저 "생성 N/3" 횟수 표시 (S07 포함 — PRD §F4)

### 수용 기준

- Given 자장가 선택 화면 / When 미리듣기 탭 / Then 해당 곡 30초 재생 후 자동 정지
- Given 곡 선택 후 다음 탭 / When / Then **S09 녹음 가이드** 화면 이동 (S08 없음)
- Given 두 곡 미리듣기 동시 시도 / When / Then 이전 곡 정지 후 새 곡 재생
- Given 무료 유저 / When S07 진입 / Then "생성 N/3" 표시

---

## ~~Story 2 — 녹음 모드 선택 화면 (S08)~~ — **v1.3.1 폐기**

> **[v1.3.1 피벗으로 폐기]** 쉬/허밍 모드 분기 제거로 S08(RecordModeScreen) 화면 자체가 불필요해짐.  
> S07(자장가 선택) → S09(녹음 가이드) 직결 네비게이션으로 대체.  
> impl/05-app-record-mode-screen.md 는 폐기 대상 (미구현 상태이므로 삭제).  
> 기존 `navigation/types.ts`의 `RecordMode` route 항목 제거 필요.

**관련 impl**: `impl/05-app-record-mode-screen.md` — 폐기, 신규 impl/13으로 대체

---

## Story 2 (재정의) — 녹음 가이드 화면 v1.3.1 (S09 단일흐름)

**GitHub Issue:** [#221](https://github.com/alruminum/jajang/issues/221)

**As a** 유저  
**I want** 녹음 시작 전 가사 미리보기와 이어폰 권장 안내, "1 loop 자유 녹음" 가이드를 보고 싶다  
**So that** 준비된 상태로 자연스럽게 1 loop 녹음할 수 있다

> v1.3.1 갱신: 쉬 모드 분기 완전 제거. 단일 흐름. 이어폰 미착용 모달 1회 노출. 생성 횟수 표시.

### 태스크 체크리스트

- [x] S09 단일 흐름 (모드 선택 없음): 선택 곡 가사 박스(1절 4~6줄) + 이어폰 권장 chip 항상 노출
- [x] 가이드 문구: "1 loop 동안 자유롭게 — 따라불러도, 허밍해도, 쉬쉬 소리만 내도 좋습니다"
- [x] 이어폰 미착용 감지 시 1회 경고 팝업 ("그래도 진행" 버튼 포함, 이후 재노출 없음)
- [x] 마이크 권한 요청 (미승인 시 설정 유도 팝업)
- [x] `navigation/types.ts` RecordGuide params: `{ songKey: string }` (mode 필드 제거)
- [x] S07(SongSelectScreen)에서 `RecordGuide: { songKey }` 직결 navigate (RecordMode 경유 없음)
- [x] 기존 S08 관련 route 항목 types.ts에서 제거
- [ ] 무료 유저 "생성 N/3" 표시

### 수용 기준

- Given S07에서 곡 선택 후 다음 탭 / When / Then S09 직결 이동 (S08 없음)
- Given S09 진입 / When 화면 로드 / Then 이어폰 chip + 가사 박스 항상 노출 (모드 분기 없음)
- Given 이어폰 미착용 / When 녹음 시작 시도 / Then 경고 팝업 1회 노출 ("그래도 진행" 포함)
- Given "그래도 진행" 선택 후 / When 이후 다시 시작 / Then 이어폰 경고 팝업 미노출
- Given 가사 미준비 songKey / When S09 진입 / Then 가사 박스 숨김 + "자유롭게 따라불러 주세요" 텍스트
- Given 마이크 권한 미승인 / When 녹음 시작 탭 / Then 권한 안내 팝업 노출

**관련 impl**: `impl/13-app-record-guide-pivot.md` (신규)

---

## Story 3 — 실시간 녹음 (S10, v1.3.1 단일흐름)

**GitHub Issue:** [#222](https://github.com/alruminum/jajang/issues/222)

**As a** 유저  
**I want** 마이크로 내 목소리를 1 loop 동안 녹음하고 싶다. BGM 30%와 가사 박스가 함께 나오길 원한다  
**So that** 자장가 DSP 후처리에 사용할 좋은 샘플을 만들 수 있다

> v1.3.1 갱신: 쉬 모드 분기 제거. 모든 녹음이 BGM 30% + 가사 박스. 1 loop 기준 자동 종료 (60초 고정 X). 추가 녹음 N≥1 유도 문구 ("한 번 더 녹음하면 더 풍성해집니다") 추가.

### 태스크 체크리스트

- [x] 마이크 권한 요청 (S09에서 선행 처리)
- [x] 카운트다운 3초 UI (BGM/가사 박스 미노출)
- [x] 실시간 음량 파형 시각화
- [x] `useBgmPlayer` 훅 (volume ramp 0→30% 300ms) — impl/10
- [x] BGM: 카운트다운 종료 → 재생 시작 (단일 흐름, 모드 분기 없음)
- [x] 가사 박스: 카운트다운 종료 → fade-in 400ms (단일 흐름)
- [x] 1 loop 자동 종료: 선택 곡 전체 재생 길이 기준 자동 종료 (고정 60초 X)
- [x] 1 loop 종료 시 BGM 즉시 정지
- [x] 무음 감지 10초 경고 (기존 유지)
- [x] BGM 로드 실패: 상단 토스트 "음악 없이 녹음할게요" + 녹음 계속 진행
- [x] 가사 미준비 fallback: 가사 박스 숨김 + "자유롭게 따라불러 주세요"
- [ ] 무료 유저 "생성 N/3" 표시
- [x] route.params: `{ songKey: string }` (mode 필드 제거)
- [x] 다시 녹음: BGM 정지 → 카운트다운 재시작 → BGM 처음부터 재생
- [ ] variant-C 시각 정제 (issue #225): 타이머 28px / "녹음 중" 라벨 / 정지버튼 outline ring 96+72 / encourage text accentSecondary — impl/15

### 수용 기준

- Given 카운트다운 종료 / When 녹음 시작 / Then BGM 30% volume ramp 시작 + 가사 박스 fade-in
- Given 1 loop 종료 / When 자동 종료 / Then BGM 즉시 정지 + S11(미리듣기) 이동
- Given 녹음 중 수동 종료 / When ⏹ 탭 / Then BGM volume ramp 정지 → S11 이동
- Given BGM 로드 실패 / When 카운트다운 종료 / Then 토스트 "음악 없이 녹음할게요" + 녹음 계속
- Given 다시 녹음 진입 / When S11→S10 재진입 / Then BGM 처음부터 재생 (volume ramp)

**관련 impl**: `impl/14-app-record-screen-pivot.md` (신규) · `impl/15-app-record-screen-variant-c-visual.md` (신규, issue #225 — variant-C 시각 정제)

---

## Story 4 — 녹음 미리듣기 & 재녹음 (S11)

**As a** 유저  
**I want** 녹음한 내용을 들어보고 마음에 안 들면 다시 녹음하고 싶다  
**So that** 좋은 샘플로 DSP 생성을 진행할 수 있다

> v1.3.1 갱신: "추가 녹음 유도 문구" ("한 번 더 녹음하면 더 풍성해집니다") 를 미리듣기 화면에 표시. 횟수 소진 시 생성하기 비활성 + 업그레이드 가이드.

### 태스크 체크리스트

- [x] 미리듣기 재생/일시정지 컨트롤
- [x] 파형 시각화 (녹음본)
- [x] "다시 녹음" 버튼 → 이전 파일 삭제 + 녹음 화면 복귀
- [x] "사용하기" 버튼 → 품질 검증 시작 (Story 5)
- [x] 다시 녹음 횟수 제한 없음
- [ ] 추가 녹음 유도 문구 ("한 번 더 녹음하면 더 풍성해집니다") 항상 표시
- [ ] 무료 3회 소진 시: "자장가 만들기" 버튼 비활성 + "무료 3회 소진 — 구독하면 무제한" 가이드 + "구독하기" CTA

### 수용 기준

- Given 미리듣기 화면 / When 재생 버튼 탭 / Then 녹음본 전체 재생
- Given "다시 녹음" 탭 / When / Then 이전 파일 로컬 삭제 + 녹음 화면 초기화
- Given "사용하기" 탭 (횟수 미소진) / When / Then 품질 검증 로딩 시작
- Given 무료 유저 3회 소진 / When S11 진입 / Then 생성하기 비활성 + 업그레이드 가이드 노출

---

## Story 5 — 샘플 품질 검증 (F3)

**As a** 시스템  
**I want** 녹음 샘플의 품질을 자동으로 검증하고 싶다  
**So that** DSP 처리 실패율을 줄이고 품질 낮은 샘플을 사전 차단할 수 있다

> v1.3.1: 길이 기준 = "1 loop 이상 (곡 전체 1회 재생 길이)". 고정 30초 기준 폐기. 모드별 분기 없음 — 단일 SNR 15dB 기준.

### 태스크 체크리스트

- [x] 클라이언트 1차 검증: 길이(1 loop 이상) / 음량(RMS -40dB~-6dB) / 클리핑(피크 3회 이하)
- [x] 서버 업로드 + 2차 검증: SNR 15dB 이상 (librosa 분석 전용)
- [x] 검증 중 로딩 UI ("샘플을 분석하고 있어요…")
- [x] 검증 실패 유형별 안내 메시지
- [x] 검증 실패 → 재녹음 버튼 (미리듣기 화면 복귀)
- [x] 검증 통과 → DSP 생성 화면(S12) 자동 이동

### 수용 기준

- Given 음량 기준 미달 / When 검증 / Then 재녹음 유도 + 이유 안내
- Given SNR 15dB 미만 / When 서버 검증 / Then 재녹음 유도 (잡음 메시지)
- Given 모든 기준 통과 / When 검증 완료 / Then DSP 생성 화면 자동 이동
- Given 서버 통신 오류 / When 검증 중 / Then 재시도 버튼 + "네트워크를 확인해주세요"

---

## Story 6 — 생성 횟수 카운터 표시 (무료 티어 3회)

**As a** 시스템  
**I want** 무료 유저의 DSP 음원 생성 횟수를 계정 단위로 제한하고 싶다  
**So that** 구독 전환 압력을 형성하고 서버 비용을 통제할 수 있다

> v1.3.1 갱신: 카운터 표시 화면 목록에서 S08 제거 (폐기). S07/S09/S10에만 표시.

### 태스크 체크리스트

- [x] 서버: 계정별 생성 횟수 카운터 (DB — 무료 유저 총 3회 한도)
- [x] 서버: 생성 성공 시 카운터 +1 (재시도 차감 없음)
- [x] 서버: 생성 요청 시 초과 여부 사전 검증 (클라이언트 우회 방지)
- [ ] 클라이언트: S07(자장가 선택) / **S09(녹음 가이드)** / S10(녹음) 화면에 "생성 N/3" 표시 (무료 유저만, S08 표시 항목 제거)
- [x] 클라이언트: 3/3 소진 후 생성 시도 → S14 업그레이드 팝업
- [x] Premium/Trial 유저: 횟수 카운터 적용 안 함, 횟수 UI 미노출

### 수용 기준

- Given 무료 유저 / When S07 진입 / Then "생성 N/3" 잔여 횟수 표시
- Given 무료 유저 / When S09 진입 / Then "생성 N/3" 표시 (S08 없음)
- Given 무료 유저 / When S10 진입 / Then "생성 N/3" 표시
- Given 생성 3회 소진 / When 4번째 생성 시도 / Then S14 업그레이드 팝업
- Given Premium 유저 / When S07 진입 / Then 횟수 표시 없음, 생성 무제한

---

## 관련 이슈

| 스토리 | GitHub Issue |
|---|---|
| Epic | [#52](https://github.com/alruminum/jajang/issues/52) |
| Story 1 | [#53](https://github.com/alruminum/jajang/issues/53) |
| Story 2 (구 S08, 폐기) | [#54](https://github.com/alruminum/jajang/issues/54) — v1.3.1 폐기 |
| Story 2 재정의 (S09 단일흐름) | [#221](https://github.com/alruminum/jajang/issues/221) |
| Story 3 갱신 (S10 단일흐름) | [#222](https://github.com/alruminum/jajang/issues/222) |
| Story 4 | [#56](https://github.com/alruminum/jajang/issues/56) |
| Story 5 | [#57](https://github.com/alruminum/jajang/issues/57) |
| Story 6 갱신 | [#64](https://github.com/alruminum/jajang/issues/64) |
