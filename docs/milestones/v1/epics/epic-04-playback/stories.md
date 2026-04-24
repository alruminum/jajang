# Epic 04 — 재생 & 백그라운드

**포함 기능:** F6 (재생), F7 (백그라운드 재생), F8 (타이머), F9 (Lockscreen 컨트롤)  
**선행 조건:** Epic 03 완료 (mp3 파일 로컬 캐시 준비)  
**완료 기준:** 재생 → 화면 잠금 → 백그라운드 재생 10시간 전체 플로우 동작

---

## Story 1 — 재생 화면 기본 컨트롤

**As a** 유저  
**I want** 생성된 자장가를 재생/일시정지하고 볼륨을 조절하고 싶다  
**So that** 아기에게 편하게 들려줄 수 있다

### 태스크 체크리스트

- [ ] 재생 화면 UI: 곡명, 재생/일시정지 버튼, 볼륨 슬라이더
- [ ] 재생 상태 시각화 (재생 중 애니메이션 또는 파형)
- [ ] 볼륨 슬라이더 → 즉시 반영
- [ ] 무료 플랜: 화면 하단 배너 광고 영역 (F10 연계)
- [ ] Premium/Trial: 광고 영역 없음

### 수용 기준

- Given 재생 화면 / When 재생 버튼 탭 / Then 음악 재생 시작
- Given 재생 중 / When 일시정지 탭 / Then 즉시 일시정지
- Given 볼륨 슬라이더 이동 / When / Then 즉시 볼륨 반영

---

## Story 2 — Seamless Loop (crossfade)

**As a** 유저  
**I want** 자장가가 끊김 없이 무한 반복되길 원한다  
**So that** 아기가 자는 내내 자연스럽게 들릴 수 있다

### 태스크 체크리스트

- [ ] react-native-track-player 기반 seamless loop 설정
- [ ] 트랙 끝 300ms 전부터 crossfade 시작 (다음 루프 페이드인)
- [ ] 최대 10시간 연속 재생 (클라이언트 루프, 서버 재요청 없음)
- [ ] 10시간 경과 시 페이드아웃 후 자동 종료 + 화면 알림
- [ ] 로컬 캐시 파일 기반 재생 (스트리밍 아님)

### 수용 기준

- Given 재생 중 트랙 끝 도달 / When crossfade 구간 / Then 무음 없이 루프 재생
- Given 10시간 경과 / When 타이머 미설정 / Then 페이드아웃 + 자동 종료 알림
- Given 오프라인 상태 (Premium 다운로드) / When 재생 / Then 인터넷 없이 정상 재생

---

## Story 3 — 백그라운드 재생

**As a** Premium/Trial 유저  
**I want** 폰을 잠그거나 다른 앱으로 이동해도 재생이 계속되길 원한다  
**So that** 아기가 잠드는 내내 음악을 틀어둘 수 있다

### 태스크 체크리스트

- [ ] react-native-track-player 백그라운드 오디오 모드 설정
- [ ] iOS: Background Modes — Audio 선언
- [ ] Android: Foreground Service + 알림 채널 설정
- [ ] Premium/Trial 유저: 화면 잠금 후에도 재생 유지
- [ ] 무료 유저 (트라이얼 아님): 화면 잠금 시 재생 일시정지 + 업그레이드 팝업 (앱 포그라운드 복귀 시)
- [ ] Rewarded Ad 언락 유저: 자정까지 백그라운드 허용 (F11 연계)

### 수용 기준

- Given Premium 유저 / When 홈 버튼으로 배경 이동 / Then 재생 계속
- Given 무료 유저 / When 화면 잠금 / Then 재생 일시정지
- Given 무료 유저 / When 앱 복귀 / Then "백그라운드 재생은 Premium에서" 팝업
- Given Rewarded Ad 완료 유저 / When 화면 잠금 / Then 자정까지 재생 유지

---

## Story 4 — 수면 타이머

**As a** 유저  
**I want** 일정 시간 후 자동으로 음악이 꺼지길 원한다  
**So that** 아기가 잠들면 불필요하게 재생되지 않도록 할 수 있다

### 태스크 체크리스트

- [ ] 재생 화면 타이머 아이콘 탭 → 옵션 시트
- [ ] 옵션: 30분 / 1시간 / 2시간 / 6시간 / 10시간
- [ ] 타이머 설정 후 화면 내 잔여 시간 표시 ("2시간 후 종료")
- [ ] 타이머 종료 1분 전: 로컬 푸시 알림 (알림 허용 시)
- [ ] 종료 시: 10초 페이드아웃 후 재생 완전 종료
- [ ] 타이머 취소: 타이머 아이콘 탭 → "타이머 끄기" 옵션
- [ ] 재생 수동 종료 시 타이머 초기화

### 수용 기준

- Given 타이머 2시간 설정 / When 2시간 경과 / Then 10초 페이드아웃 후 종료
- Given 타이머 1분 전 / When 알림 허용 / Then 로컬 푸시 발송
- Given 재생 수동 정지 / When / Then 타이머 초기화
- Given 타이머 설정 중 앱 종료/재실행 / When / Then 타이머 상태 유지

---

## Story 5 — Lockscreen 컨트롤

**As a** Premium/Trial 유저  
**I want** 잠금화면에서 재생/일시정지를 제어하고 싶다  
**So that** 폰을 잠근 채로도 음악을 끄거나 켤 수 있다

### 태스크 체크리스트

- [ ] Now Playing 정보 설정: 앱명 + 곡명 + (선택) 앨범 아트
- [ ] iOS: MPNowPlayingInfoCenter 연동
- [ ] Android: MediaSession 연동
- [ ] 잠금화면 미디어 카드: 재생/일시정지 버튼 동작
- [ ] 이어폰 버튼 (재생/일시정지) 하드웨어 제어 연동

### 수용 기준

- Given 백그라운드 재생 중 / When 잠금화면 진입 / Then 미디어 카드 + 곡명 표시
- Given 미디어 카드 일시정지 탭 / When / Then 재생 즉시 중단
- Given 이어폰 버튼 / When 한 번 누름 / Then 재생/일시정지 토글

---

## 관련 이슈

| 스토리 | GitHub Issue |
|---|---|
| Story 1 | — |
| Story 2 | — |
| Story 3 | — |
| Story 4 | — |
| Story 5 | — |
