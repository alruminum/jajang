# Epic 12 — Theme Drift Fix: 직접 hex → Theme Token 마이그레이션

**버전**: v1  
**상태**: 계획  
**선행 조건**: Epic 11 (Mobile QA Tour Package) 완료 — main 0 failures 상태

---

## 1. Epic 목표 + 핵심 가치

자장 앱은 이미 dark/light 양쪽 색상 팔레트(`darkColors` / `lightColors`)와 `useTheme()` 훅을 갖추고 있다. 그러나 전체 화면의 약 59%가 여전히 직접 박힌 hex 값(`#0D0F1A`, `#EEF0F8` 등)을 사용하고 있어, iOS 시스템 라이트 모드나 사용자가 S16 설정에서 "라이트 모드"를 명시적으로 선택해도 해당 화면들은 다크 색상 그대로 렌더링된다. 첫 진입부터 인증·구독·설정 화면이 깨져 보이는 상황은 출시 직전 v1 품질을 위협하는 회귀이며, 사용자 신뢰 추락과 1성 리뷰 위험을 동반한다. 본 Epic은 모든 화면과 공유 컴포넌트의 hex를 `ColorTokens` 토큰으로 교체하고, light/dark 양쪽 모드에서 시각적으로 일관된 앱을 보장하는 것을 목표로 한다. 다크 모드 사용자(자장 핵심 페르소나, 야간 부모)의 현재 경험은 변화 0이며, 새로운 코드 삽입 시 직접 hex가 재등장하지 않도록 회귀 방지 인프라도 함께 구축한다.

---

## 2. 사용자 시나리오

### 시나리오 1 — 라이트 환경 사용자 (iOS 시스템 라이트 모드)
**Who**: iOS 기기를 낮 시간대나 시스템 자동 라이트 모드로 사용하는 부모  
**When**: 앱 첫 실행 또는 앱 사용 중 OS 라이트 전환  
**What**: S02 개인정보·S03 온보딩·S04 회원가입·S05 로그인 등 진입 초기 화면들이 어두운 배경·텍스트 그대로 노출  
**Why 문제**: "앱이 깨졌다"는 인식 → 첫인상 이탈 / 앱스토어 1성 리뷰 위험

### 시나리오 2 — 사용자 명시 라이트 선호
**Who**: S16 설정 화면에서 "라이트 모드"를 직접 선택한 사용자  
**When**: 토글 직후 다른 화면으로 이동  
**What**: 일부 화면만 라이트 적용, 나머지(AccountDeletion, S15Subscribe 등)는 다크 그대로 → 화면마다 배경 색이 다름  
**Why 문제**: 사용자가 명시적으로 선택한 설정이 무시됨 = 신뢰 추락

### 시나리오 3 — 다크 모드 사용자 (현재 상태 보존)
**Who**: 기본 다크 모드 사용자 (자장 핵심 페르소나, 야간 수면 루틴 부모)  
**When**: 본 Epic 작업 완료 후  
**What**: 모든 화면의 시각이 현재와 동일하게 유지됨  
**Why 보장**: 토큰 교체가 `darkColors` 기준으로 동일 hex를 유지하므로 다크 모드 회귀 0

---

## 3. 기능 스펙

### 3.1 전제 — 기존 인프라 재사용 (변경 X)

이미 구축된 인프라는 본 Epic에서 수정하지 않는다:
- `ColorTokens` 타입 (15 토큰): `accentPrimary`, `accentSecondary`, `bgPrimary`, `bgDeep`, `surface`, `surfaceHigh`, `textPrimary`, `textSecondary`, `border`, `destructive`, `success`, `overlay`, `accentPrimary14`, `accentPrimary20`, `accentPrimary33`
- `darkColors` / `lightColors` 팔레트 (토큰 값 변경 X)
- `useTheme()` 훅 — `{ colors: ColorTokens, isDark: boolean }` 반환 패턴
- S16 설정 화면의 system/dark/light 토글 UI

### 3.2 누락 토큰 정책

마이그레이션 중 현재 `ColorTokens`에 매핑되지 않는 시각 의도가 발견될 경우:
- 그라디언트 시작·종료 색상, 추가 surface 단계 등 → 마이그레이션 Story 진행 중 발견 즉시 목록 누적. 그라디언트의 경우 시작색과 종료색 각각 독립 토큰으로 정의하되, 흐름 방향(top→bottom / radial 등)은 토큰이 아닌 레이아웃 명세로 분리한다.
- Story 5 에서 누락 토큰을 `ColorTokens`에 추가하고 dark/light 양쪽 값 정의 후, 해당 화면에 소급 적용
- 토큰 추가 없이 "가장 가까운 기존 토큰"으로 대체 가능한 경우는 대체로 처리 (판단 기준: 시각 차이가 4dp 이내이거나 사용 맥락이 동일한 경우)
- `#000000AA` overlay 계열은 이미 `overlay` 토큰으로 흡수 가능

### 3.3 스타일 작성 패턴 (StyleSheet.create 제약)

React Native의 `StyleSheet.create`는 정적 스타일이라 `useTheme()` 훅을 내부에서 직접 사용할 수 없다. 각 화면은 다음 factory 패턴 중 하나를 선택한다:

**A. createStyles factory (권장 — 재사용 컴포넌트)**
```
const makeStyles = (colors) => StyleSheet.create({ ... colors.bgPrimary ... })
// 화면 내부: const styles = makeStyles(colors)
```

**B. inline style (단순 화면 — 스타일이 3개 이하인 경우)**
```
<View style={{ backgroundColor: colors.bgPrimary }}>
```

패턴 선택은 구현자 재량. 동일 화면 내 혼용 허용.

### 3.4 화면 그룹별 마이그레이션 스펙

#### 그룹 M0-A — 인증·온보딩 플로우 (출시 차단)

대상 화면: S01SplashScreen, S02PrivacyScreen, S03OnboardingScreen, S04SignupScreen, S05LoginScreen, LegalScreen  

각 화면에 대해:
- 유저 행동: 화면 진입 또는 시스템 테마 전환
- 시스템 반응: `useTheme()` 에서 현재 모드의 `ColorTokens` 반환 → 배경·텍스트·버튼·테두리 색이 모드에 맞게 렌더링
- 직접 hex 참조 제거 후 `colors.<token>` 교체
- `useTheme()` 미채택 화면은 훅 추가
- SocialAuthButtons 컴포넌트 포함

#### 그룹 M0-B — 결제·구독 화면 (출시 차단)

대상 화면: S14UpgradeSheet, S15SubscribeScreen, S17TrialExpiredScreen  

각 화면에 대해:
- 유저 행동: 구독 유도 CTA 진입 또는 구독 만료 후 리디렉션
- 시스템 반응: 모드에 맞는 배경·텍스트·강조색 렌더링
- 직접 hex 제거 + token 교체

#### 그룹 M0-C — Settings + Account Deletion (출시 차단)

대상 화면: S16SettingsScreen (일부 잔여 hex), AccountDeletionScreen  
- S16은 이미 `useTheme()` 채택 상태이나 24개 직접 hex 잔존 → 토큰으로 교체
- AccountDeletion: 27개 hex, `useTheme()` 미채택 → 훅 추가 + 전량 교체

#### 그룹 M1 — 핵심 기능 화면

대상 화면: S06HomeScreen, S07SongSelectScreen, S09RecordGuideScreen, S10RecordScreen, S11PreviewScreen, S12PendingScreen, S13PlayScreen, RecordModeScreen, useBackNavigation, MainNavigator  

각 화면에 대해:
- 유저 행동: 자장가 생성 플로우 진입·녹음·재생
- 시스템 반응: 모드에 맞는 색상 렌더링
- `useTheme()` 미채택 화면은 훅 추가 + hex 전량 교체

#### 그룹 M1 — 공유 컴포넌트

대상: JustArrivedMasterCard, MasterAudioCard, EmptyMastersState (이미 useTheme 채택 확인 후 잔여 hex 정리), SongListItem, TrackCard, CompletedTrackCard, MiniPlayer, TimerBottomSheet, TrialBadge, TrialExpiryBanner, EmptyTrackState

### 3.5 회귀 방지 인프라

**목표**: 신규 PR에서 직접 hex가 재삽입되는 것을 자동 차단

구현 방식 (택일 — Story 5에서 결정):

**옵션 A**: Jest 테스트 — `src/` 하위 전체 파일을 grep하여 `#[0-9A-Fa-f]{6}` 패턴 (단, `tokens.ts` 본체 + 테스트 파일 + `__mocks__` 제외) 발견 시 테스트 실패
- Given: CI에서 `npm test` 실행  
- When: `src/` 내 직접 hex 1건 이상 존재  
- Then: 테스트 suite 실패 + hex 위치 목록 출력

**옵션 B**: ESLint custom rule — `no-raw-hex-color` (regex 기반, `.ts`/`.tsx` 대상)

두 옵션 모두 `tokens.ts` 본체, `*.test.*`, `__mocks__` 는 예외 처리.

---

## 4. 수용 기준

### AC-1: 직접 hex 0
**Given** `apps/mobile/src/` (테스트 파일·`tokens.ts`·`__mocks__`·§3.2 명시적 예외 목록 등재분 제외)  
**When** `grep -r '#[0-9A-Fa-f]\{6\}' --include='*.ts' --include='*.tsx'` 실행  
**Then** 결과 0건 (예외 목록에 등재된 그라디언트 / 미커버 시각 의도 hex 는 Story 5 누락 토큰 추가 + 일괄 교체 시점에 0건 충족)

### AC-2: Light 모드 시각 검증 — 출시 차단 화면
**Given** 기기 또는 시뮬레이터를 라이트 모드로 설정  
**When** S02, S03, S04, S05, LegalScreen, S14, S15, S16, S17, AccountDeletion 각 진입  
**Then** 배경색이 밝은 계열(`bgPrimary: #FBF7F0`)이고 텍스트 가독성이 유지됨 (배경 위 텍스트 명도 대비 육안 확인)

### AC-3: Dark 모드 회귀 0
**Given** 기기를 다크 모드로 설정  
**When** Epic 12 작업 전·후 동일 화면 진입  
**Then** 모든 화면의 배경·텍스트·강조색이 시각적으로 동일 (다크 `ColorTokens` hex 값 동일 보장)

### AC-4: Light 모드 시각 검증 — M1 화면
**Given** 라이트 모드  
**When** S06, S10, S13, S09, S11 진입  
**Then** 배경색이 밝은 계열이고 텍스트 가독성 유지

### AC-5: 회귀 방지 테스트 통과
**Given** CI `npm test` 실행  
**When** 직접 hex 0건 상태  
**Then** hex-lint 테스트 suite GREEN

### AC-6: 시스템 테마 전환 반응
**Given** 앱이 "system" 테마 설정 상태  
**When** iOS 제어센터에서 라이트 ↔ 다크 전환  
**Then** 다음 화면 진입 시 전환된 모드 색상이 적용됨 (전환 즉시 반응은 iOS Re-render 정책 의존 — 명세 범위 외)

---

## 5. 우선순위

### M0 — 출시 차단 (v1 공개 전 필수)

| 우선순위 | 화면 그룹 | 이유 |
|---|---|---|
| 1 | 인증·온보딩 (S01~S05, LegalScreen) | 첫 진입 플로우 — light 깨짐 = 즉시 이탈 |
| 2 | 결제·구독 (S14, S15, S17) | 매출 직결 화면 — light 깨짐 = 구독 전환 손실 (가설 — 라이트 모드 사용자의 결제 화면 진입 시 시각 깨짐이 신뢰 추락 / 구독 이탈로 이어질 가능성. v1 출시 전이라 실측 데이터 없음 — 합리적 우선순위로 M0 유지) |
| 3 | Settings + AccountDeletion | 사용자가 테마 토글하는 화면 자체가 깨지면 모순 |

### M1 — 핵심 기능 (M0 완료 후 진행)

| 우선순위 | 화면 그룹 | 이유 |
|---|---|---|
| 4 | Home / 재생 / 녹음 플로우 (S06, S07, S09, S10, S11, S12, S13, RecordModeScreen) | 핵심 UX 플로우 |
| 5 | 공유 컴포넌트 (JustArrivedMasterCard, SongListItem, 기타) | 재사용 컴포넌트 — 여러 화면에 영향 |
| 6 | 회귀 방지 인프라 | Jest hex-lint 또는 ESLint custom rule — 신규 hex 자동 차단 |
| 7 | 누락 토큰 정비 | 마이그레이션 중 발견된 그라디언트 / 추가 surface → `ColorTokens` 공식 추가 |

---

## 6. Out-of-scope

- 다크 퍼스트 → 라이트 퍼스트 정책 전환 (정책 변경 X)
- Pencil 디자인 시스템 재정의 (별도 Epic 16)
- S10 외 Pencil 화면 매핑 확장 (Epic 16)
- iOS 시뮬레이터 자동 light/dark 스크린샷 비교 (Epic 14/15 후보)
- 컬러블라인드 / WCAG AA 대비 비율 전수 검증 (별도 접근성 Epic 후보)
- `lightColors` 팔레트 자체의 색상값 재조정 (디자인 결정 — 별도 논의)

---

## 7. 기술 환경 (NFR)

- **플랫폼**: React Native + Expo Bare 0.74 (iOS + Android)
- **스타일 제약**: `StyleSheet.create` 정적 — `createStyles(colors)` factory 또는 inline style 사용
- **다크 퍼스트 정책 유지**: `Colors` = `darkColors` alias (하위 호환) 유지
- **회귀 위험**: 1인 개발 + v1 출시 직전 — PR당 화면 수 제한 (4~6개 묶음 권장), 각 PR 후 light/dark 육안 검증
- **테스트 환경**: Epic 08~10 에서 구축된 jest-expo 기반 테스트 인프라 활용

---

## 8. 타임라인 및 구현 순서

| 단계 | Story | 내용 |
|---|---|---|
| 1 | Story 1 | M0-A: 인증·온보딩 화면 (S01~S05, LegalScreen, SocialAuthButtons) |
| 2 | Story 2 | M0-B: 결제·구독 화면 (S14, S15, S17) |
| 3 | Story 3 | M0-C: Settings + AccountDeletion |
| 4 | Story 4 | M1: 핵심 기능 화면 + 내비게이터 (S06, S07, S09, S10, S11, S12, S13, RecordModeScreen, useBackNavigation, MainNavigator) |
| 5 | Story 5 | 공유 컴포넌트 + 누락 토큰 정비 + 회귀 방지 인프라 |

Story 1~3 은 순차 진행 (M0 우선순위 순서). Story 4, 5 는 M0 완료 후 병렬 가능.

---

## 9. 후속 Epic 후보

| 후보 | 내용 | 선행 조건 |
|---|---|---|
| Epic 16 | Pencil 노드 매핑 확장 (S10 외 6 화면) | Epic 12 완료 + 디자인 폴리시 확정 |
| 접근성 Epic | WCAG AA 대비 비율 + 컬러블라인드 대응 | Epic 12 완료 |

---

## 10. 스코프 결정

**선택: Option C — Hold Scope** (요청 요구사항 정확히 이행)

포함: M0 + M1 전체 마이그레이션 + 회귀 방지 인프라  
제외: 팔레트 색상값 재조정, 라이트 퍼스트 전환, Pencil 매핑 확장  
BM 트레이드오프: 추가 기능 없음 — 기존 구독 전환 화면(S14/S15)의 라이트 모드 깨짐 수정으로 잠재 구독 손실 회복  
기술 리스크: 낮음 — 인프라 이미 완비, hex→token 교체는 기계적 작업, `darkColors` hex 동일 보장으로 다크 회귀 0
