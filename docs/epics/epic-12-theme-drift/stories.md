# Epic 12 — Theme Drift Fix: 직접 hex → Theme Token 마이그레이션

**목표:** 앱 전체에 직접 박힌 hex 색상값을 `ColorTokens` 토큰으로 교체하여, light/dark 양쪽 모드에서 모든 화면이 일관되게 렌더링되도록 보장한다.  
**선행 조건:** Epic 11 완료 — main 0 failures 상태  
**완료 기준:**
1. `apps/mobile/src/` (테스트·tokens.ts·`__mocks__` 제외) 내 직접 hex 6자리 참조 0건
2. light 모드에서 M0 화면 전체 배경색이 밝은 계열 (`bgPrimary: #FBF7F0`) 렌더링 확인
3. dark 모드 회귀 0 — 다크 `ColorTokens` hex 동일 보장
4. 회귀 방지 인프라 (Jest hex-lint 또는 ESLint rule) GREEN

**GitHub Epic Issue:** [#237](https://github.com/alruminum/jajang/issues/237)

---

## Story 1 — M0 인증·온보딩 화면 마이그레이션

**GitHub Issue:** [#238](https://github.com/alruminum/jajang/issues/238)

**As a** iOS 라이트 모드 / 시스템 자동 라이트 모드 사용자  
**I want** 앱 첫 진입 플로우(스플래시 → 개인정보 동의 → 온보딩 → 회원가입 → 로그인)의 모든 화면이 현재 모드에 맞는 색상으로 렌더링되길 원한다  
**So that** 첫인상에서 "앱이 깨졌다"는 인식 없이 신뢰 있게 진입할 수 있다.

### 대상 화면·컴포넌트

- S01SplashScreen
- S02PrivacyScreen (17 hex)
- S03OnboardingScreen (10 hex)
- S04SignupScreen (16 hex)
- S05LoginScreen (15 hex)
- LegalScreen (8 hex)
- SocialAuthButtons (4 hex)

### 동작 명세

- 유저 행동: 기기를 라이트 모드로 설정 후 앱 진입 또는 각 화면으로 이동
- 시스템 반응: `useTheme()`에서 `lightColors`를 반환하고 화면의 배경·텍스트·버튼·테두리가 라이트 팔레트로 렌더링됨
- `useTheme()` 미채택 화면에 훅 추가 + 직접 hex 전량 `colors.<token>` 으로 교체

### 수용 기준

- Given S02 ~ S05, LegalScreen, SocialAuthButtons에서 라이트 모드 진입 / When 화면 렌더링 / Then 배경색이 `lightColors.bgPrimary(#FBF7F0)` 계열로 밝게 표시됨
- Given 다크 모드 진입 / When 동일 화면 렌더링 / Then 배경색이 `darkColors.bgPrimary(#0D0F1A)` 그대로 유지 (회귀 0)
- Given `grep -r '#[0-9A-Fa-f]\{6\}'` 대상 파일 실행 / When Story 1 완료 후 / Then 대상 6 파일에서 직접 hex 0건

---

## Story 2 — M0 결제·구독 화면 마이그레이션

**GitHub Issue:** [#239](https://github.com/alruminum/jajang/issues/239)

**As a** 구독 전환 유저 또는 구독 만료 후 재진입 유저  
**I want** S14 업그레이드 시트, S15 구독 화면, S17 트라이얼 만료 화면이 현재 모드에 맞는 색상으로 렌더링되길 원한다  
**So that** 매출 직결 화면에서 라이트 모드 깨짐으로 인한 구독 전환 손실이 없다.

### 대상 화면

- S14UpgradeSheet (12 hex)
- S15SubscribeScreen (22 hex)
- S17TrialExpiredScreen (10 hex)

### 동작 명세

- 유저 행동: 트라이얼 만료 / 업그레이드 CTA 탭 / 구독 화면 직접 진입 (라이트 모드)
- 시스템 반응: 구독 화면 전체 배경·가격 텍스트·CTA 버튼·구분선이 `lightColors` 팔레트로 렌더링됨
- `useTheme()` 추가 + hex 전량 교체

### 수용 기준

- Given S15SubscribeScreen 라이트 모드 진입 / When 화면 렌더링 / Then 배경색 밝은 계열 + 가격·혜택 텍스트 가독성 유지
- Given S14UpgradeSheet 라이트 모드 진입 / When 시트 올라옴 / Then 시트 배경 `surface(#E8E0D4)` 계열 렌더링
- Given 다크 모드 / When S14·S15·S17 진입 / Then 현재 다크 색상 동일 유지 (회귀 0)
- Given 대상 3 파일 grep / When Story 2 완료 후 / Then 직접 hex 0건

---

## Story 3 — M0 Settings + AccountDeletion 화면 마이그레이션

**GitHub Issue:** [#240](https://github.com/alruminum/jajang/issues/240)

**As a** 설정 화면에서 테마를 라이트로 전환한 사용자  
**I want** 설정 화면 자체와 계정 삭제 화면이 선택한 모드에 맞게 렌더링되길 원한다  
**So that** 테마 토글하는 화면이 깨져 보이는 모순이 없다.

### 대상 화면

- S16SettingsScreen (24 잔여 hex — 이미 `useTheme()` 채택)
- AccountDeletionScreen (27 hex — `useTheme()` 미채택)

### 동작 명세

- S16: 이미 `useTheme()` 채택 상태이나 24개 직접 hex 잔존 → 전량 token 교체
- AccountDeletion: `useTheme()` 추가 + 27개 hex 전량 교체
- 유저 행동: S16에서 라이트 전환 직후 화면 이동 또는 계정 삭제 화면 진입
- 시스템 반응: 진입한 화면이 라이트 팔레트로 렌더링됨

### 수용 기준

- Given S16 라이트 모드 진입 / When 화면 렌더링 / Then 섹션 배경 `surface`, 텍스트 `textPrimary` 라이트 값 적용
- Given AccountDeletionScreen 라이트 모드 진입 / When 화면 렌더링 / Then 배경·텍스트·경고 색상이 라이트 팔레트 적용
- Given 다크 모드 / When S16·AccountDeletion 진입 / Then 현재 다크 색상 동일 유지
- Given 대상 2 파일 grep / When Story 3 완료 후 / Then 직접 hex 0건

---

## Story 4 — M1 핵심 기능 화면 마이그레이션

**GitHub Issue:** [#241](https://github.com/alruminum/jajang/issues/241)

**As a** 라이트 모드를 선호하는 자장가 생성 사용자  
**I want** 홈·녹음·재생 플로우 전체가 현재 모드에 맞는 색상으로 렌더링되길 원한다  
**So that** 라이트 모드에서도 핵심 사용 플로우가 시각적으로 일관되게 동작한다.

### 대상 화면·모듈

| 화면·모듈 | hex 수 (실측) |
|---|---|
| S06HomeScreen | 11 |
| S07SongSelectScreen | 6 |
| S09RecordGuideScreen | 17 |
| S10RecordScreen | 13 |
| S11PreviewScreen | 17 |
| S12PendingScreen | 5 |
| S13PlayScreen | 11 |
| RecordModeScreen | 10 |
| useBackNavigation | 7 |
| MainNavigator | 7 |
| LyricsBox | 5 |
| WaveformVisualizer | 2 |

### 동작 명세

- 유저 행동: 홈 → 자장가 만들기 → 곡 선택 → 녹음 → 미리듣기 → 재생 전체 플로우 (라이트 모드)
- 시스템 반응: 각 화면 배경·텍스트·버튼·네비게이터 색상이 `lightColors` 팔레트로 렌더링됨
- `useTheme()` 미채택 파일에 훅 추가 + hex 전량 교체

### 수용 기준

- Given S06HomeScreen 라이트 모드 진입 / When 렌더링 / Then 홈 배경 밝은 계열 + MasterCard 배경 `surface` 라이트값
- Given S10RecordScreen 라이트 모드 진입 / When 렌더링 / Then 녹음 배경 밝은 계열 + 타이머 텍스트 `textPrimary` 라이트값
- Given S13PlayScreen 라이트 모드 / When 재생 화면 진입 / Then 배경·컨트롤 색상 라이트 팔레트 적용
- Given MainNavigator 라이트 모드 / When 탭 바 렌더링 / Then 탭 배경·아이콘 색상 라이트 팔레트 적용
- Given 다크 모드 / When 대상 모든 화면 진입 / Then 현재 다크 색상 동일 유지 (회귀 0)
- Given 대상 파일 전체 grep / When Story 4 완료 후 / Then 직접 hex 0건

---

## Story 5 — 공유 컴포넌트 + 누락 토큰 정비 + 회귀 방지 인프라

**GitHub Issue:** [#242](https://github.com/alruminum/jajang/issues/242)

**As a** 개발팀  
**I want** 재사용 컴포넌트의 직접 hex가 제거되고, 마이그레이션 중 발견된 누락 토큰이 `ColorTokens`에 공식 추가되며, 신규 PR에서 직접 hex가 재삽입되면 자동 차단되길 원한다  
**So that** 라이트/다크 일관성이 앞으로도 자동 보장된다.

### 대상 컴포넌트

- JustArrivedMasterCard (7 hex)
- MasterAudioCard (이미 useTheme 채택 — 잔여 hex 확인)
- EmptyMastersState (이미 useTheme 채택 — 잔여 hex 확인)
- SongListItem (이미 useTheme 채택 — 잔여 hex 확인)
- TrackCard (이미 useTheme 채택 — 잔여 hex 확인)
- CompletedTrackCard
- MiniPlayer (이미 useTheme 채택 — 잔여 hex 확인)
- TimerBottomSheet (이미 useTheme 채택 — 잔여 hex 확인)
- TrialBadge (이미 useTheme 채택 — 잔여 hex 확인)
- TrialExpiryBanner (이미 useTheme 채택 — 잔여 hex 확인)
- EmptyTrackState (이미 useTheme 채택 — 잔여 hex 확인)
- 기타 1~6 hex 보유 파일 (마이그레이션 Story 1~4 후 잔존 파일 일괄 처리)

### 누락 토큰 정비

Story 1~4 진행 중 발견한 매핑 불가 시각 의도를 본 Story에서 공식화한다. 현재 후보 목록 (구현 전 가설 — 실측 후 확정):

| 후보 토큰 | 예상 용도 | 비고 |
|---|---|---|
| `gradientStart` | S13PlayScreen 배경 그라디언트 시작색 | top 방향 |
| `gradientEnd` | S13PlayScreen 배경 그라디언트 종료색 | bottom 방향 |
| `surfaceMid` | S09/S11 카드 중간 단계 surface | `surface`와 `surfaceHigh` 사이 |

- Story 1~4 수행 중 위 목록 외 추가 발견 시 이 표에 누적 후 본 Story 시작 시 일괄 반영
- 대체 가능한 경우(`surface`로 흡수 가능 등)는 토큰 추가 생략
- 추가 토큰이 없으면 이 단계 skip

### 회귀 방지 인프라

**옵션 A (Jest) 구현 시**:
- `__tests__/theme/no-raw-hex.test.ts` 신규 생성
- `apps/mobile/src/` 전체 파일 내 `#[0-9A-Fa-f]{6}` 패턴 검색
- 예외: `tokens.ts`, `*.test.*`, `__mocks__`
- hex 발견 시 파일명·행 번호 목록 출력 + 테스트 실패

**옵션 B (ESLint rule) 구현 시**:
- `eslint-plugin-no-raw-hex` 또는 `no-restricted-syntax` 활용
- `.ts`, `.tsx` 대상 `#[0-9A-Fa-f]{6}` 패턴 error 처리
- `tokens.ts` overrides 예외

### 동작 명세

- 유저 행동 (미래): 개발자가 신규 화면에 `#RRGGBB` 직접 입력
- 시스템 반응: CI 또는 lint에서 즉시 오류 발생 + 토큰 사용 안내

### 수용 기준

- Given `apps/mobile/src/` 전체 grep (tokens.ts·테스트·`__mocks__` 제외) / When Story 5 완료 후 / Then 직접 hex 0건 (AC-1 최종 충족)
- Given 회귀 방지 테스트 suite 실행 / When hex 0건 상태 / Then GREEN
- Given 임의로 `#ABCDEF` 추가한 파일 / When 회귀 방지 suite 실행 / Then 해당 파일명·행 출력 + FAIL
- Given tokens.ts 본체 / When 회귀 방지 검사 / Then 예외 처리로 오탐 0

---

## Story 의존성

```
Story 1 (M0 인증·온보딩) ──┐
Story 2 (M0 결제·구독)   ──┤ 순차 (M0 우선순위 순서)
Story 3 (M0 Settings)    ──┘
                            ↓
Story 4 (M1 핵심 기능) ──┐
                         ├─→ 병렬 가능 (M0 완료 후)
Story 5 (컴포넌트+인프라)─┘
```

Story 1~3은 출시 차단 항목으로 순차 진행. Story 4, 5는 M0 완료 후 병렬 가능하나 1인 개발 환경에서는 순차 권장.

---

## 관련 이슈

| 스토리 | GitHub Issue |
|---|---|
| Epic | [#237](https://github.com/alruminum/jajang/issues/237) |
| Story 1 | [#238](https://github.com/alruminum/jajang/issues/238) |
| Story 2 | [#239](https://github.com/alruminum/jajang/issues/239) |
| Story 3 | [#240](https://github.com/alruminum/jajang/issues/240) |
| Story 4 | [#241](https://github.com/alruminum/jajang/issues/241) |
| Story 5 | [#242](https://github.com/alruminum/jajang/issues/242) |
