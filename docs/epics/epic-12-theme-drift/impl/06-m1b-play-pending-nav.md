---
depth: std
task: 06
slug: m1b-play-pending-nav
story: Story 4 (M1 핵심 기능 화면 마이그레이션)
github_issue: 241
epic: 12
branch_prefix: chore/epic12-task06-m1b-play-pending-nav
---

# task 06 — M1 재생·대기·내비게이터 hex → ColorTokens 마이그레이션 (S11 / S12 / S13 / RecordMode / MainNavigator)

## 1. 목적 (왜)

- **M1 후반 플로우 라이트 깨짐 해소** (PRD Story 4 후반, Issue #241): 녹음 → 미리보기 (S11) → 생성 대기 (S12) → 재생 (S13) + 앱 전체 진입점 (MainNavigator) 은 M1 핵심 플로우 *마무리 절반*. task 05 가 홈→곡선택→녹음가이드→녹음 (S06/S07/RecordGuide/Record) 라이트 적용을 끝낸 위에서, 본 task 가 *플레이백 + 내비게이터* 라이트 적용을 일괄 마무리한다. v1 미해소 시 라이트 사용자가 "생성 후 재생 진입" 시 검은 배경 → 베이지 화면 흐름 깨짐 직격.
- **MainNavigator 라이트 적용 = 앱 전체 시각 정합 핵심**: Stack content background (`#0D0F1A`) + Bottom tab bar (`#12152B` + `#2A2E48` border + `#5A7AA8` active + `#7B80A0` inactive) + Legal header (`#0D0F1A` + `#EEF0F8`) 가 라이트 모드 진입 시 *모든 화면 진입 시* 다크 hex 그대로 노출 → 라이트 화면 내용 (베이지) 과 컨테이너 (검정) 시각 충돌. 본 task 가 *useTheme + screenOptions factory* 로 라이트 통합.
- **다크 회귀 0**: 자장 핵심 페르소나 (다크 사용자) 시각 변화 0 보장. `darkColors` 의 기존 15 토큰 + task 04 신규 9 토큰 = 24 토큰의 hex 가 발견 hex 와 정확 일치 또는 4dp 이내 흡수 (§3.2.2 위험 등재).
- **task 04 신규 9 토큰 활용 — 본 task 한정**: 본 task 5 파일 hex 매핑 분석 결과 (§3.2) — 신규 9 토큰 중 *어떤 것도 실제 매핑 대상 0* (모든 hex 가 기존 15 토큰으로 매핑 가능 또는 보류). task 04 신규 토큰은 *결제/구독/탈퇴 화면 한정* 의도였음 정합. 본 task = 기존 15 토큰만 사용.
- **신규 토큰 발견 시 보류 처리 (task 05 §3.3 옵션 B 패턴 차용)**: 본 task 5 파일에 24 토큰 + 4dp 흡수로도 매핑 불가능한 hex 2종 (`#FF6B6B`, `#5A8A6A`) 발견 → 본 task 보류 + Story 5 task 09 위임. system-design §1 룰 정합 (본 task 가 임의로 tokens.ts 신규 토큰 추가 X).
- **createStyles factory + useTheme 패턴 일관**: task 01~05 와 동일한 `makeStyles(colors)` + `useMemo` + `useTheme()` 패턴 차용. 신규 인프라 0.
- **RecordModeScreen 처리 — 정책 결정 명시**: L1 주석 + MainNavigator stack 등록 해제로 *dead code* 상태 (= S08 폐기, impl/13). 본 task §3.4 에서 처리 방향 명시 (옵션: skip / 토큰 교체 / 파일 삭제 위임).

## 2. 영향 파일 (실측 — grep + Read 직접 검증)

> **선행 검증**: `apps/mobile/src/screens/` 실제 ls 결과 — `S11PreviewScreen.tsx` / `S12GeneratingScreen.tsx` / `S13PlayScreen.tsx` / `RecordModeScreen.tsx` 모두 `S` prefix 그대로 (system-design §2 표 인용 정합). 본 plan 은 실제 경로 기준.

| 파일 (실제 경로) | hex 수 (직접 grep) | useTheme | StyleSheet 패턴 | 비고 |
|---|---|---|---|---|
| `apps/mobile/src/screens/S11PreviewScreen.tsx` | 17 (L218 / L244 인라인 2 + L300~390 static 15) | 미채택 | static StyleSheet.create + 인라인 2건 (WaveformVisualizer color prop + ActivityIndicator color prop) | |
| `apps/mobile/src/screens/S12GeneratingScreen.tsx` | 5 (L80~106 static) | 미채택 | static StyleSheet.create | 외부 컴포넌트 (`GeneratingAnimation` / `GeneratingTimeoutNotice` / `GeneratingFailureView`) 는 본 task 비대상 (task 07 또는 task 09 후속) |
| `apps/mobile/src/screens/S13PlayScreen.tsx` | 11 (L298~389 static) | 미채택 | static StyleSheet.create | LinearGradient 사용 0 — system-design §6 `gradientStart`/`gradientEnd` 후보 불필요 |
| `apps/mobile/src/screens/RecordModeScreen.tsx` | 10 (L109~130 static) | 미채택 | static StyleSheet.create | **S08 폐기 — L1 주석 + MainNav stack 등록 해제. 처리 정책 §3.4** |
| `apps/mobile/src/navigation/MainNavigator.tsx` | 7 (L33~37 tab + L51 stack content + L85~86 Legal header) | 미채택 | screenOptions 인라인 객체 (StyleSheet 없음) | screen-options 와 tab-bar-options 분리 검토 §3.5 |
| **합계** | **50** | — | — | system-design §2 표 (17+5+11+10+7=50) 와 본 plan 직접 grep 결과 일치 |

### 2.1 hex 전수 인용 (L번호 + hex + 의도 — engineer 가 1행씩 적용 가이드)

**S11PreviewScreen.tsx (17)** — L218/244 인라인 + L300~390 StyleSheet
- L218 `'#C49A8A'` (WaveformVisualizer color 인라인 prop — 정적 파형 색)
- L244 `'#5A7AA8'` (ActivityIndicator color 인라인 prop — processing spinner)
- L300 `'#0D0F1A'` (container backgroundColor)
- L305 `'#EEF0F8'` (title color)
- L311 `'#1A1D30'` (waveformCard backgroundColor)
- L322 `'#C49A8A'` (playIcon color — 재생 아이콘 앰버)
- L327 `'#7B80A0'` (timecode color)
- L332 `'#2A1A1A'` (errorBanner backgroundColor) — **`destructive` 다크 `#E85A5A` 의 *어두운 변형* (분위기 = 위험 배경). 4dp 흡수 검토 §3.2.2 + 위험 등재**
- L338 `'#FF6B6B'` (errorText color) — **`destructive` 다크 `#E85A5A` 와 채널차 ~17dp 초과. 보류 §3.2.3**
- L347 `'#7B80A0'` (processingText color)
- L351 `'#21253E'` (exhaustedBanner backgroundColor)
- L357 `'#5A8A6A'` (exhaustedText color) — **muted success 톤. task 05 §3.2.3 `silenceWarning` / DeleteTracksSheet 와 동일 hex 재사용 (3곳 누적). 보류 + Story 5 task 09 위임 §3.2.3**
- L362 `'#7B80A0'` (exhaustedSub color)
- L372 `'#5A7AA8'` (primaryBtn backgroundColor)
- L378 `'#0D0F1A'` (primaryBtnText color — CTA 위 짙은 텍스트)
- L384 `'#1A1D30'` (secondaryBtn backgroundColor)
- L390 `'#C49A8A'` (secondaryBtnText color)

**S12GeneratingScreen.tsx (5)** — L80~106 StyleSheet
- L80 `'#0D0F1A'` (container backgroundColor)
- L88 `'#EEF0F8'` (mainTitle color)
- L95 `'#7B80A0'` (subtitle color)
- L101 `'#7B80A0'` (backgroundNotice color)
- L106 `'#C49A8A'` (homeLink color — 홈으로 이동 링크)

**S13PlayScreen.tsx (11)** — L298~389 StyleSheet
- L298 `'#0D0F1A'` (container backgroundColor)
- L320 `'#EEF0F8'` (headerBackText color)
- L344 `'#EEF0F8'` (songTitle color)
- L350 `'#7B80A0'` (songSubtitle color)
- L364 `'#5A7AA8'` (playPauseBtn backgroundColor)
- L371 `'#0D0F1A'` (playPauseBtnText color)
- L383 `'#EEF0F8'` (timerBtnText color)
- L389 `'#5A7AA8'` (timerLabel color)
- (참고 — L295/L342/L348 주석 안 hex 3건: `// 배경: #0D0F1A`, `// 텍스트 주: #EEF0F8`, `// 텍스트 보조: #7B80A0`) — 주석은 grep 매치되지만 **본 task 가 손대지 X** (코드 색 리터럴 아님). 단 §4.5 회귀 테스트는 문자열 리터럴 wrap `'...'` 형태만 검사하므로 false positive 0.

**RecordModeScreen.tsx (10)** — L109~130 StyleSheet (S08 폐기 파일)
- L109 `'#0D0F1A'` (container backgroundColor)
- L111 `'#EEF0F8'` (title color)
- L112 `'#21253E'` (counterChip backgroundColor)
- L113 `'#7B80A0'` (counterText color)
- L115 `'#1A1D30'` (card backgroundColor)
- L125 `'#5A7AA8'` (cardPressed borderColor)
- L127 `'#EEF0F8'` (cardTitle color)
- L128 `'#7B80A0'` (cardDesc color)
- L129 `'#21253E'` (badge backgroundColor)
- L130 `'#5A7AA8'` (badgeText color)

**MainNavigator.tsx (7)** — L33~37 + L51 + L85~86
- L33 `'#12152B'` (Tab.Navigator screenOptions.tabBarStyle.backgroundColor — 탭바 배경)
- L34 `'#2A2E48'` (Tab.Navigator screenOptions.tabBarStyle.borderTopColor — 탭바 상단 구분선)
- L36 `'#5A7AA8'` (Tab.Navigator screenOptions.tabBarActiveTintColor — 활성 탭 아이콘/라벨)
- L37 `'#7B80A0'` (Tab.Navigator screenOptions.tabBarInactiveTintColor — 비활성 탭 아이콘/라벨)
- L51 `'#0D0F1A'` (Stack.Navigator screenOptions.contentStyle.backgroundColor — 스택 화면 배경)
- L85 `'#0D0F1A'` (Legal screen options.headerStyle.backgroundColor — Legal 화면 헤더 배경)
- L86 `'#EEF0F8'` (Legal screen options.headerTintColor — Legal 화면 헤더 텍스트)

## 3. 결정 근거 (선택 + 버린 대안)

### 3.1 createStyles factory 채택 (S11/S12/S13/RecordMode 4 파일)

system-design §3.1 기준 — 스타일 속성 수: S11=15+, S12=5, S13=11, RecordMode=10. 일관 factory 채택. 인라인 사용은 S11 L218 `WaveformVisualizer color` + L244 `ActivityIndicator color` 2건 한정 — 이는 컴포넌트가 받는 prop 이므로 factory 외부 `colors.accentSecondary` / `colors.accentPrimary` 직접 참조. task 01~05 패턴 그대로.

### 3.2 hex → token 매핑 분석 (본 task 한정 — 24 토큰 기준)

#### 3.2.1 기존 15 토큰 1:1 매핑되는 hex (회귀 0) — 본 task 5 파일 합계 47/50

| 발견 hex | 매핑 토큰 | 등장 위치 (출현 횟수) |
|---|---|---|
| `#0D0F1A` | `colors.bgPrimary` | S11 container/primaryBtnText, S12 container, S13 container/playPauseBtnText, RecMode container, MainNav stackContent/LegalHeader (8회) |
| `#12152B` | `colors.bgDeep` | MainNav tabBar bg (1회) |
| `#1A1D30` | `colors.surface` | S11 waveformCard/secondaryBtn, RecMode card (3회) |
| `#21253E` | `colors.surfaceHigh` | S11 exhaustedBanner, RecMode counterChip/badge (3회) |
| `#2A2E48` | `colors.border` | MainNav tabBar borderTop (1회) |
| `#5A7AA8` | `colors.accentPrimary` | S11 spinner prop/primaryBtn, S13 playPauseBtn/timerLabel, RecMode cardPressed border/badge text, MainNav tabActive (6회) |
| `#7B80A0` | `colors.textSecondary` | S11 timecode/processingText/exhaustedSub, S12 subtitle/backgroundNotice, S13 songSubtitle, RecMode counterText/cardDesc, MainNav tabInactive (8회) |
| `#C49A8A` | `colors.accentSecondary` | S11 waveform color prop/playIcon/secondaryBtnText, S12 homeLink (4회) |
| `#EEF0F8` | `colors.textPrimary` | S11 title, S12 mainTitle, S13 headerBack/songTitle/timerBtn, RecMode title/cardTitle, MainNav LegalHeaderTint (7회) |
| **합계** | — | **47 / 50 hex (94%)** — 9 토큰 매핑 |

> **매핑 회귀 검증**: 본 task 머지 후 다크 모드에서 위 9 hex 가 *그대로* 렌더링되는지 = `darkColors[<token>] === <발견 hex>` 정확 일치. tokens.ts 인용 검증 (`darkColors.bgPrimary === '#0D0F1A'` 등 9 행) — 본 task §4.5 회귀 테스트의 positive grep 으로 보장.

#### 3.2.2 4dp 이내 흡수 분기 결정 (PRD §3.2 + system-design §6 흐름)

| 발견 hex | 매핑 토큰 후보 | 다크 토큰 hex | 채널 차이 (R/G/B dp) | 결정 |
|---|---|---|---|---|
| `#2A1A1A` | `colors.destructive` (배경 변형) **또는** `task 04 destructiveBg` (`#2A1A0F`) | `#E85A5A` (destructive) / `#2A1A0F` (destructiveBg task 04 신규) | vs destructive: 채널차 매우 큼 (의미 다름 — bg vs fg) / vs destructiveBg: 0/0/+11 = ~4dp avg | **흡수 — task 04 `destructiveBg` (`#2A1A0F`)** ← 본 task 의존 = task 04 머지 후 진입 가정 (§11). 의도 정합 = "위험 영역 배경 다크 변형". B 채널 11dp 차이는 4dp 룰 *경계* (11/3 = 3.67 avg). 시각 식별 어려운 수준. **위험 등재 §10.3 위험 1** — 시각 회귀 발견 시 별도 PR 로 `errorBg` 신규 토큰 등재 검토 (task 04 destructiveBg 와 분리 가능) |

> task 04 의 `textOnAccent` (`#FFFFFF` 다크/라이트 양쪽 영구 흰색) 는 본 task 5 파일에 등장 hex 없음 (S11 L378 `#0D0F1A` 는 `bgPrimary` 매핑). task 04 신규 9 토큰 중 본 task 가 *실제 사용하는 것 = `destructiveBg` 1개* (위 표).

#### 3.2.3 흡수 불가 hex — 본 task 보류 + Story 5 task 09 위임 (task 05 §3.3 옵션 B 패턴 차용)

본 task 5 파일의 hex 중 24 토큰 + 4dp 흡수로 매핑 불가능한 hex 2종:

| 발견 hex | 등장 위치 (본 task 5 파일) | 외부 사용 (다른 파일) | 가장 가까운 토큰 | 채널 차이 | 의도 | 분기 결정 |
|---|---|---|---|---|---|---|
| `#FF6B6B` | S11 errorText (L338, 1회) | 없음 (본 task 한정) | `destructive #E85A5A` | +23/+17/+17 = ~19dp | "에러 메시지 텍스트 — 밝은 빨강 강조" | **본 task 보류 (옵션 B) + Story 5 task 09 위임** — 1곳 한정 + destructive 와 다른 *밝은* 변형. task 09 에서 `destructiveBright` 또는 `destructiveText` 등 신규 토큰 후보 |
| `#5A8A6A` | S11 exhaustedText (L357, 1회) | task 05 §3.2.3 인용 — RecordScreen silenceWarning (1회) + DeleteTracksSheet L252 (1회) — **3곳 누적 재사용 (본 task 추가로 확정)** | `success #6BCB77` | +17/-65/+3 = ~28dp | "횟수 소진 안내 — muted success 톤 (성공 / 안내 양쪽 분위기 — 안정적 차분 톤)" | **본 task 보류 (옵션 B) + Story 5 task 09 토큰 정의 강력 권고** — 3곳 누적 재사용 = 토큰화 필수 분기 |

#### 3.3 흡수 불가 hex 처리 옵션 분석 — 본 task 동작 결정

task 05 §3.3 의 옵션 분석 (A/B/C/D) 을 본 task 컨텍스트에 그대로 재적용:

| 옵션 | 본 task 동작 | 라이트 화면 결과 | 위험 |
|---|---|---|---|
| **A. 본 task 내 tokens.ts 수정 (신규 2 토큰 추가)** | 본 task 가 `destructiveBright` / `successMuted` 2 토큰 정의 + 적용 | 100% 라이트 적용 | system-design §1 룰 = "본 Epic 인프라 호출만 / Story 5 한정 수정". task 04 만 명시 위임. 본 task = 위임 받지 않음 → 임의 추가 시 SPEC_GAP |
| **B. 흡수 가능 hex만 토큰화 + 2 hex 군 보류** | 24 토큰 매핑 (9 토큰 직접 + 1 hex 흡수 = §3.2.1+§3.2.2) 만 교체. 2 hex 군 (`#FF6B6B`×1, `#5A8A6A`×1) 그대로 유지 | 라이트 모드에서 2 hex 군 = 다크 색 그대로 노출. *부분 깨짐*. 5 파일 hex 0 X | task 05 옵션 B 와 동일 trade-off. AC-1 (5 파일 hex 0) 본 task 미충족 (task 09 일괄 처리 시점으로 미룸) |
| **C. SPEC_GAP_FOUND escalate** | architect 가 product-planner / Story 5 task 09 에 "본 task 2 hex 군 + task 05 4 hex 군 일괄 토큰 정의" 책임 명시 요청 | (escalate 결과 따름) | 시간 비용 |
| **D. task 04 정의 패턴 차용 — 본 task 가 *제한적* tokens.ts 수정 (1 토큰만)** | `successMuted` 만 추가 (3곳 누적 재사용). `#FF6B6B` 는 보류 옵션 B | `#5A8A6A` 라이트 100% 적용. `#FF6B6B` 라이트 부분 깨짐 잔존 | system-design §1 룰 위배 — task 04 가 이미 예외 사례. 본 task 자체 결정 시 룰 일관성 훼손 |

**결정 = B (보류 명시) — task 05 와 동일 + §13 후속 권고에서 Story 5 task 09 우선순위 상승 강력 권고**.

이유:
- **system-design §1 / §8 룰 정합**: 본 task (NN=06) 는 신규 토큰 정의 위임 받지 않음. 추가 토큰 정의 = system-design 갱신 필요.
- **PRD §3.4 Story 4 우선순위 보존**: 본 task PR 이 출시 차단 일부 해소 (24 토큰 매핑 = 50 hex 중 약 48 hex = 96% 적용. 2 hex 군 2회 = 4% 보류). 다크 사용자 시각 회귀 0. 라이트 사용자에게 메인 플로우 컨테이너/타이틀/주요 텍스트/탭바/내비게이터 모두 라이트 적용 + "S11 errorText / exhaustedText" 2곳만 다크 hex 잔존.
- **Story 5 task 09 누적 보류 hex 일괄 처리**: 본 task (2) + task 05 (4) = 6 hex 군 (`#82B090`, `#A9B0D0` (task 05 흡수 위험), `#E0B070`, `#5A8A6A`, `#FF4444`, `#FF6B6B`) 누적. task 09 hex-lint 도입 시점에 일괄 토큰 정의 권고.

> **본 task 보류 hex 카운트**: §3.2.3 표 2 회 + §3.2.2 흡수 위험 등재 1 회 = 합 3 회. AC-1 (5 파일 hex 0) 은 task 09 또는 후속 일괄 처리 시점으로 미룸.

### 3.4 RecordModeScreen — S08 폐기 파일 처리 정책 결정

**발견**: L1 주석 = `// RecordModeScreen.tsx — S08 폐기 (impl/13). Navigation stack 등록 해제됨. 파일 삭제는 별도 클린업.` + MainNavigator L12/L56 = stack 등록 해제 + L7 RecordMode route 폐기.

**처리 옵션**:

| 옵션 | 동작 | 시각 영향 | 비용 | 위험 |
|---|---|---|---|---|
| **α. skip (본 task 대상 제외)** | RecordModeScreen.tsx 손대지 X. hex 10건 그대로 | 0 (진입 불가 화면) | 0 | 본 task plan §2 hex 합계 50 → 실제 작업 hex 40. AC-1 계산 시 RecMode 제외 명시 필요 |
| **β. 토큰 교체 (다른 4 파일과 동일 처리)** | useTheme + factory + 10 hex 매핑 | 0 (진입 불가) | +30 라인 (factory 도입) | 시각 영향 0 이지만 dead code 수정 — 본 task 의 *유효 작업 비율* 저하. PR 변경 라인 수 인플레이션 |
| **γ. 파일 삭제 (별도 클린업)** | `git rm src/screens/RecordModeScreen.tsx` | 0 | -131 라인 | 본 task 범위 외 (= "S08 폐기 클린업 = 별도 클린업" 주석 명시). 본 task 가 임의 삭제 시 epic 범위 일탈 |

**결정 = α (skip)**. 이유:
- **CLAUDE.md `📦 작업 순서` 정합**: 본 task = epic-12 theme-drift = "hex → 토큰 마이그레이션". RecModeScreen = navigation 등록 해제로 *유저 진입 0* → 시각 영향 0. 토큰화 노력 의미 0.
- **본 task 시각 회귀 검증 부담 감소**: REQ-008 (다크 시각 회귀 0 매뉴얼) 검증 대상에서 RecMode 제외. 4 화면 (S11/S12/S13/MainNav) 만.
- **삭제 클린업은 별도 epic / task 책임**: L1 주석이 명시 — "파일 삭제는 별도 클린업". 본 task 가 임의로 삭제 시 epic 범위 일탈. dcness backlog 에 `chore(cleanup): RecordModeScreen 폐기 파일 삭제` 후속 task 등록 권장 (§13).

> **본 task §2.1 hex 인용 시 RecMode 10건 포함 명시** = system-design §2 표의 50 합계 검증을 위한 직접 grep 결과. 실제 작업 hex = **40 (50 − 10)**. §4.5 회귀 테스트의 TARGET_FILES 배열에서 RecMode 제외.

### 3.5 MainNavigator — screenOptions factory 패턴

MainNavigator 는 StyleSheet 없이 *screenOptions 인라인 객체* 만 사용. factory 적용 방식:

```tsx
// Before — 인라인 hex
function HomeTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: '#12152B', borderTopColor: '#2A2E48' },
        tabBarActiveTintColor: '#5A7AA8',
        tabBarInactiveTintColor: '#7B80A0',
      }}
    >...</Tab.Navigator>
  );
}

// After — useTheme + factory
function HomeTabs() {
  const { colors } = useTheme();
  const screenOptions = useMemo(
    () => ({
      headerShown: false as const,
      tabBarStyle: {
        backgroundColor: colors.bgDeep,
        borderTopColor: colors.border,
      },
      tabBarActiveTintColor: colors.accentPrimary,
      tabBarInactiveTintColor: colors.textSecondary,
    }),
    [colors],
  );
  return <Tab.Navigator screenOptions={screenOptions}>...</Tab.Navigator>;
}
```

**Stack.Navigator** 도 동일 패턴 — `useTheme` + `useMemo` 로 `screenOptions` + 개별 `<Stack.Screen options={...}>` 인라인 (Legal) factory 화.

**대안 검토**:
- (1) 인라인 객체 그대로 + colors 만 useTheme 로 치환 → useMemo 불필요. 그러나 Tab.Navigator / Stack.Navigator 리렌더 시점에 객체 재생성 → react-navigation 내부 비교 시 reference 변경 → 잠재 리렌더 비용. useMemo 채택.
- (2) screenOptions 를 모듈 스코프 factory `makeScreenOptions(colors)` 분리 → S11~S13 와 동일 컨벤션 (S04~S06 도 동일). 본 task 채택 = useMemo 안에서 inline 객체 생성 (단순). 모듈 스코프 분리는 unnecessary indirection.

**Legal screen options 처리** (L82~87 인라인 `options={{...}}`):
- 옵션 A: `<Stack.Screen options={{...}}` 안에 `colors.bgPrimary` 직접 참조 — *부모 함수 (`MainNavigator`) 의 useTheme 클로저 캡처* 로 정합
- 옵션 B: legalOptions = useMemo factory 분리

**결정 = A** — Legal screen 만 `options` 사용 → 별도 useMemo 분리 오버엔지니어링. 부모 useTheme 클로저로 충분.

### 3.6 useMemo 캐싱 — task 01~05 일관

- S11/S12/S13/RecMode: `makeStyles(colors)` + `useMemo(() => makeStyles(colors), [colors])`
- MainNavigator: `useMemo(() => ({ screenOptions inline... }), [colors])` (HomeTabs / MainNavigator 각각)
- 모두 colors 참조 안정 (useTheme 내부 모듈 상수 직접 반환)

**S13PlayScreen 리렌더 빈도**: 재생 진행 0.5초 tick (positionSec 갱신) + 타이머 카운트다운 (1초 tick) + isPlaying 토글. `useMemo([colors])` 필수 — colors 변경 0 → makeStyles 호출 0 (mount 시 1회만).

### 3.7 S12 외부 컴포넌트 (`GeneratingAnimation` / `GeneratingTimeoutNotice` / `GeneratingFailureView`) 처리

본 task 비대상. 이유:
- `GeneratingAnimation` = visual animation 컴포넌트 (lottie 또는 SVG) — hex 사용 0 또는 별도 정책 (task 07 또는 task 09).
- `GeneratingTimeoutNotice` / `GeneratingFailureView` = 별도 컴포넌트 파일. 본 task 5 파일 외. 별도 task (task 07 또는 task 09) 책임.

본 task §2.1 의 S12 5 hex 매핑은 S12GeneratingScreen.tsx 의 *컨테이너/타이틀 영역* 만. 외부 컴포넌트 진입 시 (timeout_notice / failed 분기) 내부 hex 잔존 가능 — 본 task 회귀 테스트 범위 외.

### 3.8 외부 SDK / API / DB 영향 0

- **외부 SDK**: react-navigation (`@react-navigation/native-stack`, `@react-navigation/bottom-tabs`) — screenOptions factory 적용으로 props 변경 0 (Object reference 만 변경). 내부 동작 영향 0.
- **DB**: 영향 0 (`docs/db-schema.md` 참조 — 색상 토큰은 DB 와 무관).
- **API**: 변경 0.
- **navigation**: 라우트 정의 변경 0 (Stack.Screen name / component 동일). screenOptions 만 *동등한 객체* 로 교체. ParamList 타입 변경 0.
- **테스트 환경**: jest 설정 변경 0. 신규 회귀 테스트 1건만 추가.

## 4. 인터페이스 (TypeScript)

### 4.1 S11/S12/S13 화면 — 외부 시그니처 변경 0

기존 export default function 시그니처 유지:

```ts
// S11PreviewScreen.tsx
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '@navigation/types';
type Props = NativeStackScreenProps<MainStackParamList, 'Preview'>;
export default function S11PreviewScreen({ route, navigation }: Props): JSX.Element { ... }

// S12GeneratingScreen.tsx — 기존 시그니처 유지 (변경 0)
type Props = NativeStackScreenProps<MainStackParamList, 'Generating'>;
export default function S12GeneratingScreen({ route, navigation }: Props): JSX.Element { ... }

// S13PlayScreen.tsx — 기존 시그니처 유지
type Props = NativeStackScreenProps<MainStackParamList, 'Play'>;
export default function S13PlayScreen({ route, navigation }: Props): JSX.Element { ... }
```

### 4.2 MainNavigator — 외부 export 변경 0

```ts
// MainNavigator.tsx
export default function MainNavigator(): JSX.Element {
  const { colors } = useTheme();
  const stackScreenOptions = useMemo(() => ({
    headerShown: false as const,
    contentStyle: { backgroundColor: colors.bgPrimary },
  }), [colors]);
  const legalOptions = useMemo(() => ({
    title: '법적 정보',
    headerShown: true,
    headerStyle: { backgroundColor: colors.bgPrimary },
    headerTintColor: colors.textPrimary,
  }), [colors]);
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      ...
      <Stack.Screen name="Legal" component={LegalScreen} options={legalOptions} />
    </Stack.Navigator>
  );
}

// HomeTabs — 내부 함수, export X
function HomeTabs() {
  const { colors } = useTheme();
  const tabScreenOptions = useMemo(() => ({
    headerShown: false as const,
    tabBarStyle: {
      backgroundColor: colors.bgDeep,
      borderTopColor: colors.border,
    },
    tabBarActiveTintColor: colors.accentPrimary,
    tabBarInactiveTintColor: colors.textSecondary,
  }), [colors]);
  return <Tab.Navigator screenOptions={tabScreenOptions}>...</Tab.Navigator>;
}
```

### 4.3 makeStyles factory 시그니처 (S11/S12/S13)

```ts
import { StyleSheet } from 'react-native';
import type { ColorTokens } from '@theme/tokens';

// S11
const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary, paddingHorizontal: 20, paddingTop: 24 },
  title: { color: colors.textPrimary, fontSize: 20, fontFamily: 'NotoSansKR-Regular', marginBottom: 24 },
  waveformCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, marginBottom: 20 },
  playbackRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  playIcon: { color: colors.accentSecondary, fontSize: 22, marginRight: 12 },
  timecode: { color: colors.textSecondary, fontSize: 13, fontVariant: ['tabular-nums'] },
  // errorBanner: 흡수 (task 04 destructiveBg) — task 04 머지 가정 §11
  errorBanner: { backgroundColor: colors.destructiveBg, borderRadius: 12, padding: 14, marginBottom: 16 },
  // errorText: 보류 (§3.2.3 #FF6B6B)
  errorText: { color: '#FF6B6B', fontSize: 14 }, // TODO(task 09): destructiveBright 토큰 도입 후 교체
  processingBanner: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  processingText: { color: colors.textSecondary, fontSize: 14 },
  exhaustedBanner: { backgroundColor: colors.surfaceHigh, borderRadius: 12, padding: 14, marginBottom: 16 },
  // exhaustedText: 보류 (§3.2.3 #5A8A6A)
  exhaustedText: { color: '#5A8A6A', fontSize: 14, marginBottom: 4 }, // TODO(task 09): successMuted 토큰 도입 후 교체
  exhaustedSub: { color: colors.textSecondary, fontSize: 13 },
  buttonGroup: { gap: 12, marginTop: 'auto', marginBottom: 32 },
  primaryBtn: { height: 56, backgroundColor: colors.accentPrimary, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  primaryBtnText: { color: colors.bgPrimary, fontSize: 17, fontFamily: 'NotoSansKR-Regular' },
  secondaryBtn: { height: 52, backgroundColor: colors.surface, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  secondaryBtnText: { color: colors.accentSecondary, fontSize: 15 },
  btnDisabled: { opacity: 0.4 },
});

// S12 / S13 동일 패턴 — §5.2/5.3 인용
```

### 4.4 S11 인라인 prop 처리 (factory 외부)

```tsx
// S11 컴포넌트 본문 (factory 외부에서 colors 직접 참조)
function S11PreviewScreen(props: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  ...
  return (
    <View style={styles.container}>
      ...
      <WaveformVisualizer mode="static" levels={recordingLevels} color={colors.accentSecondary} playbackPosition={playbackPosition} />
      ...
      <ActivityIndicator size="small" color={colors.accentPrimary} style={{ marginRight: 8 }} />
      ...
    </View>
  );
}
```

### 4.5 회귀 테스트 — `m1b-play-pending-nav-processed-hex-map.test.ts`

```ts
/**
 * task 06 m1b-play-pending-nav
 *
 * 본 task 4 대상 파일 (S11/S12/S13/MainNav) 에서:
 * (1) 본 task 가 토큰화한 9 hex (기존 토큰) + 1 hex (task 04 destructiveBg 흡수)
 *     가 *factory 본문 외부 또는 인라인* 위치에 0건
 * (2) 신규 토큰 참조 (`colors.bgPrimary` 등 매핑된 토큰명) ≥1 회
 *
 * RecordModeScreen.tsx 는 §3.4 결정에 따라 본 회귀 테스트 대상 외 (skip α).
 * 보류 hex 2종 (#FF6B6B / #5A8A6A) 은 본 회귀 테스트가 negative assertion 으로 *허용* — task 09 위임 명시.
 *
 * task 09 (hex-lint 회귀 테스트) 도입 전까지의 1차 회귀 방지선.
 */
import * as fs from 'fs';
import * as path from 'path';

const TARGET_FILES = [
  'src/screens/S11PreviewScreen.tsx',
  'src/screens/S12GeneratingScreen.tsx',
  'src/screens/S13PlayScreen.tsx',
  'src/navigation/MainNavigator.tsx',
  // RecordModeScreen.tsx 제외 — §3.4 skip α
];

// task 06 가 토큰화한 hex (positive — 0건 강제)
const PROCESSED_HEX_LITERALS = [
  '#0D0F1A', '#12152B', '#1A1D30', '#21253E', '#2A2E48',
  '#5A7AA8', '#7B80A0', '#C49A8A', '#EEF0F8', '#2A1A1A',
];
// 3자리 hex 변형도 검사 (S11/S12/S13 에 없으나 향후 회귀 방지)
const PROCESSED_HEX_3DIGIT = ['#fff', '#FFF', '#000'];

// task 06 보류 hex (negative — 잔존 허용. task 09 위임)
const DEFERRED_HEX_LITERALS = ['#FF6B6B', '#5A8A6A'];

// 신규 토큰 참조 ≥1 회 (positive)
const NEW_TOKEN_REFS = [
  'colors.bgPrimary', 'colors.bgDeep', 'colors.surface', 'colors.surfaceHigh',
  'colors.border', 'colors.accentPrimary', 'colors.textSecondary',
  'colors.accentSecondary', 'colors.textPrimary', 'colors.destructiveBg',
];

describe('task 06 m1b-play-pending-nav — 처리 hex 잔존 0', () => {
  for (const rel of TARGET_FILES) {
    it(`${rel}: 처리 hex 10종 + 3자리 변형 0건`, () => {
      const abs = path.resolve(__dirname, '../../', rel);
      const src = fs.readFileSync(abs, 'utf-8');
      for (const hex of PROCESSED_HEX_LITERALS) {
        // ' 또는 " 로 wrap 된 문자열 리터럴 한정 (주석 안 # 제외)
        const re = new RegExp(`['"]${hex}['"]`, 'g');
        const matches = src.match(re);
        expect(matches).toBeNull();
      }
      // 3자리 hex 도 동일 (S13 의 경우 `'#fff'` 등 변형)
      for (const hex of PROCESSED_HEX_3DIGIT) {
        const re = new RegExp(`['"]${hex}['"]`, 'g');
        const matches = src.match(re);
        expect(matches).toBeNull();
      }
    });
  }
});

describe('task 06 m1b-play-pending-nav — 보류 hex 명시 (task 09 위임)', () => {
  it('S11PreviewScreen 의 #FF6B6B (errorText) — task 09 까지 잔존 허용', () => {
    const abs = path.resolve(__dirname, '../../', 'src/screens/S11PreviewScreen.tsx');
    const src = fs.readFileSync(abs, 'utf-8');
    // 명시적 negative — 본 task 머지 후에도 1건 존재 (보류 명시)
    expect(src.includes("'#FF6B6B'")).toBe(true);
  });
  it('S11PreviewScreen 의 #5A8A6A (exhaustedText) — task 09 까지 잔존 허용', () => {
    const abs = path.resolve(__dirname, '../../', 'src/screens/S11PreviewScreen.tsx');
    const src = fs.readFileSync(abs, 'utf-8');
    expect(src.includes("'#5A8A6A'")).toBe(true);
  });
});

describe('task 06 m1b-play-pending-nav — 신규 토큰 참조 ≥1', () => {
  for (const rel of TARGET_FILES) {
    it(`${rel}: 토큰 참조 ≥1`, () => {
      const abs = path.resolve(__dirname, '../../', rel);
      const src = fs.readFileSync(abs, 'utf-8');
      const found = NEW_TOKEN_REFS.filter((tok) => src.includes(tok));
      expect(found.length).toBeGreaterThanOrEqual(1);
    });
  }
});

describe('task 06 m1b-play-pending-nav — useTheme 도입 확인', () => {
  for (const rel of TARGET_FILES) {
    it(`${rel}: useTheme import 또는 호출 ≥1`, () => {
      const abs = path.resolve(__dirname, '../../', rel);
      const src = fs.readFileSync(abs, 'utf-8');
      expect(src.includes('useTheme')).toBe(true);
    });
  }
});
```

> task 05 의 `m1a-core-flow-processed-hex-map.test.ts` 와 동일 패턴 (positive grep + negative 보류 + useTheme 도입 assertion). negative 행 = 본 task 보류 hex 가 *잔존* 함을 *명시* — task 09 진입 시 본 부분 제거 (task 09 architect 책임).

## 5. 핵심 로직 (의사코드)

### 5.1 S11PreviewScreen 변환 (대표 — 17 hex, 인라인 prop 2건 + factory 15)

```
1. import 추가:
   import { useTheme } from '@hooks/useTheme';
   import { useMemo } from 'react';
   import type { ColorTokens } from '@theme/tokens';

2. 컴포넌트 본문 상단:
   const { colors } = useTheme();
   const styles = useMemo(() => makeStyles(colors), [colors]);

3. 인라인 prop 교체 (factory 외부):
   - L218: color="#C49A8A"  → color={colors.accentSecondary}
   - L244: color="#5A7AA8"  → color={colors.accentPrimary}

4. StyleSheet.create → makeStyles factory 추출:
   const makeStyles = (colors: ColorTokens) => StyleSheet.create({
     container:        { ..., backgroundColor: colors.bgPrimary, ... },
     title:            { color: colors.textPrimary, ... },
     waveformCard:     { backgroundColor: colors.surface, ... },
     playIcon:         { color: colors.accentSecondary, ... },
     timecode:         { color: colors.textSecondary, ... },
     errorBanner:      { backgroundColor: colors.destructiveBg, ... },  // task 04 흡수 §3.2.2
     errorText:        { color: '#FF6B6B', ... },                       // 보류 §3.2.3 + TODO(task 09)
     processingText:   { color: colors.textSecondary, ... },
     exhaustedBanner:  { backgroundColor: colors.surfaceHigh, ... },
     exhaustedText:    { color: '#5A8A6A', ... },                       // 보류 §3.2.3 + TODO(task 09)
     exhaustedSub:     { color: colors.textSecondary, ... },
     primaryBtn:       { backgroundColor: colors.accentPrimary, ... },
     primaryBtnText:   { color: colors.bgPrimary, ... },
     secondaryBtn:     { backgroundColor: colors.surface, ... },
     secondaryBtnText: { color: colors.accentSecondary, ... },
     btnDisabled:      { opacity: 0.4 },
   });

5. file-by-file grep 확인:
   /['"](#0D0F1A|#1A1D30|#21253E|#5A7AA8|#7B80A0|#C49A8A|#EEF0F8|#2A1A1A)['"]/g  → 0건
   /['"](#FF6B6B|#5A8A6A)['"]/g  → 정확 1건씩 (보류 명시)
   /colors\./g  → ≥10건

6. TypeScript 컴파일 GREEN (errorBanner: ColorTokens.destructiveBg 키 존재 검증 → task 04 머지 후 진입 가정).
```

### 5.2 S12GeneratingScreen 변환 (5 hex)

```
1~2. S11 동일 (useTheme + useMemo)
3. 인라인 prop = 없음
4. makeStyles factory:
   const makeStyles = (colors: ColorTokens) => StyleSheet.create({
     container:         { flex: 1, backgroundColor: colors.bgPrimary },
     center:            { ... },
     mainTitle:         { color: colors.textPrimary, ... },
     subtitle:          { color: colors.textSecondary, ... },
     backgroundNotice:  { color: colors.textSecondary, ... },
     homeLink:          { color: colors.accentSecondary, fontSize: 15, textDecorationLine: 'underline' },
   });

5. grep 검증:
   /['"](#0D0F1A|#7B80A0|#C49A8A|#EEF0F8)['"]/g  → 0건
   /colors\./g  → ≥5건
```

### 5.3 S13PlayScreen 변환 (11 hex)

```
1~2. S11 동일
3. 인라인 prop = 없음 (LinearGradient 사용 0 — system-design §6 gradient 후보 불필요)
4. makeStyles factory:
   const makeStyles = (colors: ColorTokens) => StyleSheet.create({
     container:        { flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center' },
     header:           { ... },
     headerBackBtn:    { ... },
     headerBackText:   { color: colors.textPrimary, fontSize: 22 },
     headerRight:      { ... },
     artContainer:     { ... },
     songInfo:         { ... },
     songTitle:        { color: colors.textPrimary, fontSize: 22, marginBottom: 6 },
     songSubtitle:     { color: colors.textSecondary, fontSize: 14 },
     sliderContainer:  { ... },
     playPauseBtn:     { backgroundColor: colors.accentPrimary, ... },
     playPauseBtnText: { color: colors.bgPrimary, fontSize: 24 },
     timerBtn:         { ... },
     timerBtnText:     { color: colors.textPrimary, fontSize: 22 },
     timerLabel:       { color: colors.accentPrimary, fontSize: 15, fontVariant: ['tabular-nums'] },
   });

5. 주석 안 hex 3건 (L295/L342/L348) — 손대지 X. 회귀 테스트가 wrap `'...'` 형식만 검사하므로 false positive 0.

6. grep 검증:
   /['"](#0D0F1A|#5A7AA8|#7B80A0|#EEF0F8)['"]/g  → 0건
   /colors\./g  → ≥8건
```

### 5.4 MainNavigator 변환 (7 hex — screenOptions factory)

```
1. import 추가:
   import { useTheme } from '@hooks/useTheme';
   import { useMemo } from 'react';

2. HomeTabs() 함수 본문:
   const { colors } = useTheme();
   const tabScreenOptions = useMemo(() => ({
     headerShown: false as const,
     tabBarStyle: {
       backgroundColor: colors.bgDeep,        // #12152B
       borderTopColor: colors.border,         // #2A2E48
     },
     tabBarActiveTintColor: colors.accentPrimary,   // #5A7AA8
     tabBarInactiveTintColor: colors.textSecondary, // #7B80A0
   }), [colors]);

3. MainNavigator() 함수 본문:
   const { colors } = useTheme();
   const stackScreenOptions = useMemo(() => ({
     headerShown: false as const,
     contentStyle: { backgroundColor: colors.bgPrimary },  // #0D0F1A
   }), [colors]);
   const legalOptions = useMemo(() => ({
     title: '법적 정보',
     headerShown: true,
     headerStyle: { backgroundColor: colors.bgPrimary },   // #0D0F1A
     headerTintColor: colors.textPrimary,                  // #EEF0F8
   }), [colors]);

4. JSX 변경:
   <Tab.Navigator screenOptions={tabScreenOptions}>...</Tab.Navigator>
   <Stack.Navigator screenOptions={stackScreenOptions}>
     ...
     <Stack.Screen name="Legal" component={LegalScreen} options={legalOptions} />
   </Stack.Navigator>

5. grep 검증:
   /['"](#0D0F1A|#12152B|#2A2E48|#5A7AA8|#7B80A0|#EEF0F8)['"]/g  → 0건
   /colors\./g  → ≥7건
```

### 5.5 RecordModeScreen — §3.4 skip α — 변경 0

```
변경 0. RecordModeScreen.tsx 손대지 X.
회귀 테스트 (§4.5) 대상에서 제외.
별도 backlog 추가: chore(cleanup): RecordModeScreen 폐기 파일 삭제 (epic-12 외부)
```

### 5.6 검증 절차

```
1. jest run:
   - m1b-play-pending-nav-processed-hex-map.test.ts (신규 — 4 파일 hex 0 + 토큰 ≥1 + useTheme 도입 + 보류 2 hex 명시 GREEN)
   - 기존 task 01~05 회귀 테스트 (auth-onboarding-no-raw-hex / paywall-processed-hex-map / settings-deletion-processed-hex-map / missing-tokens-applied / m1a-core-flow-processed-hex-map) 모두 GREEN
   - tokens.test.ts / typography.test.ts / useTheme.test.ts 회귀 0

2. TypeScript 컴파일 (`pnpm --filter mobile tsc --noEmit`) GREEN — useTheme + colors.destructiveBg 키 존재 검증

3. 시각 검증 (manual — REQ-008/009/010):
   - 다크 모드: S11 (Preview 진입) / S12 (Generating 진입 — fake sessionId) / S13 (Play 진입) / 탭바 (Home/Settings) / Legal 화면 진입 → Epic 12 작업 전 캡처와 동일 (회귀 0). RecMode 는 진입 불가 → 검증 대상 외.
   - 라이트 모드: 4 화면 + 탭바 + Legal → 베이지 팔레트 라이트 적용. S11 errorBanner 다크 (`#2A1A0F`) 라이트 (`#F4E8DC` — task 04 destructiveBg.light) 적용 + errorText `#FF6B6B` 잔존 시각 확인 (보류 명시).
```

## 6. 다른 모듈과의 경계

- **상위 의존**: `@theme/tokens` (변경 0 — 본 task 한정 사용. task 04 신규 9 토큰 중 `destructiveBg` 1개 활용), `@hooks/useTheme` (변경 0).
- **하위 의존 (적용 대상)**: 4 파일 (S11/S12/S13/MainNav). 본 task 가 *내부 구현만 수정* — export / Props / route name / ParamList 변경 0.
  - S11/S12/S13: `NativeStackScreenProps<MainStackParamList, '<Name>'>` Props 그대로
  - MainNavigator: `export default function MainNavigator()` 시그니처 그대로 + Stack.Navigator 안 Stack.Screen `name` / `component` 변경 0
- **외부 컴포넌트 영향 0**: `WaveformVisualizer` / `ActivityIndicator` (S11 인라인 prop) — 받는 color 타입은 string. 변경 0. `GeneratingAnimation` / `GeneratingTimeoutNotice` / `GeneratingFailureView` (S12) — 본 task 비대상.
- **graceful 동작**:
  - useTheme 부재 시 → ColorTokens fallback 보장 (`useTheme.ts` 기존 동작 — Provider 미설치 시 darkColors 반환). RN root `<ThemeProvider>` 가 `App.tsx` 에 이미 설치됨 (epic-12 task 01 인프라).
  - task 04 미머지 상태에서 본 task 진입 시 → `colors.destructiveBg` 키 부재 → TypeScript 컴파일 에러 + jest RED. 본 task 의존 게이트 = task 04 머지 (§11).
- **Breaking Change 검토**:
  - 4 파일 외부 export 시그니처 변경 0 → 다른 파일 import 영향 0
  - MainStackParamList 변경 0 → 다른 화면 route 호출 영향 0
  - Tab.Navigator / Stack.Navigator screenOptions 동작 = react-navigation 내부 처리 (객체 reference 만 변경) → 다른 동작 영향 0
  - **Breaking Change = 없음**
- **역방향 cascade 필요 시 DIP interface**: 불필요 (단방향 — 화면이 tokens/useTheme 를 import)
- **의존 부재 graceful**: useTheme + ColorTokens fallback 보장 (위 graceful 동작 참조)

## 7. 테스트 환경 영향

- 기존 jest 테스트 영향 0 (4 파일 내부 변경만 — Props/render 동작 변경 0)
- 신규 테스트 1개 (`m1b-play-pending-nav-processed-hex-map.test.ts`) — 회귀 방지 1차 방어선
- task 09 (hex-lint) 도입 후 본 테스트가 부분 중복 → task 09 head 에서 통합 결정 (architect MODULE_PLAN task 09 책임)

## 8. 모듈 = 테스트 단위 정합 (self-check)

1. **테스트 단위 정합**:
   - 4 파일 (S11/S12/S13/MainNav) 변환 → `m1b-play-pending-nav-processed-hex-map.test.ts` 의 fs.readFileSync + grep + 토큰 참조 + useTheme 도입 assertion 으로 명확 PASS/FAIL
   - 시각 회귀 0 → REQ-008 (다크 캡처 비교) + REQ-010 (라이트 캡처) 매뉴얼 검증
   - 변경 이유 단일 (= "M1 후반 4 파일 hex → 토큰 마이그레이션") — SRP 충족
2. **의존성 묶음 정합**:
   - 의존 = `@theme/tokens` + `@hooks/useTheme` (단방향). 역방향 cascade 0. DIP 불필요
   - 단독 lifecycle = 4 파일 useTheme 호출만 추가 + factory 도입. task 04 미머지 시 `destructiveBg` 부재 → 컴파일 에러 (의도된 게이트)
   - graceful 의존 부재 = useTheme.ts 의 fallback (darkColors 반환) 으로 보장
3. **테스트 가능성 ✓** — 4 파일 단위 + 1 회귀 테스트로 PASS/FAIL 명확. 모듈 분할/통합 권유 0

## 9. 수용 기준

| ID | 내용 | 검증 방법 | 통과 조건 |
|---|---|---|---|
| REQ-001 | 4 대상 파일 (S11/S12/S13/MainNav) 에 useTheme import + 호출 ≥1 회 도입 | (TEST) `m1b-play-pending-nav-processed-hex-map.test.ts` describe 'useTheme 도입 확인' 4 it | `pnpm --filter mobile test src/__tests__/theme/m1b-play-pending-nav-processed-hex-map.test.ts` → `useTheme 도입 확인` 4 it 모두 PASS |
| REQ-002 | S11PreviewScreen 의 9 매핑 hex (`#0D0F1A`, `#1A1D30`, `#21253E`, `#5A7AA8`, `#7B80A0`, `#C49A8A`, `#EEF0F8`, `#2A1A1A`) + 3자리 변형 (`#fff`/`#FFF`) 문자열 리터럴 0건 | (TEST) `m1b-play-pending-nav-processed-hex-map.test.ts` describe '처리 hex 잔존 0' S11 it | 동일 명령 → `S11PreviewScreen.tsx: 처리 hex 10종 + 3자리 변형 0건` PASS |
| REQ-003 | S12GeneratingScreen 의 4 매핑 hex (`#0D0F1A`, `#7B80A0`, `#C49A8A`, `#EEF0F8`) 문자열 리터럴 0건 | (TEST) 동일 describe S12 it | `S12GeneratingScreen.tsx: 처리 hex 10종 + 3자리 변형 0건` PASS |
| REQ-004 | S13PlayScreen 의 4 매핑 hex (`#0D0F1A`, `#5A7AA8`, `#7B80A0`, `#EEF0F8`) 문자열 리터럴 0건 (주석 안 hex 3건은 제외 — wrap `'...'` 형태 아님) | (TEST) 동일 describe S13 it | `S13PlayScreen.tsx: 처리 hex 10종 + 3자리 변형 0건` PASS |
| REQ-005 | MainNavigator 의 6 매핑 hex (`#0D0F1A`, `#12152B`, `#2A2E48`, `#5A7AA8`, `#7B80A0`, `#EEF0F8`) 문자열 리터럴 0건 | (TEST) 동일 describe MainNav it | `MainNavigator.tsx: 처리 hex 10종 + 3자리 변형 0건` PASS |
| REQ-006 | 4 대상 파일에 신규 토큰 참조 (`colors.<...>`) ≥1 회 — 매핑된 10 토큰명 중 ≥1 grep 매치 | (TEST) describe '신규 토큰 참조 ≥1' 4 it | 4 it 모두 PASS |
| REQ-007 | 본 task 보류 hex 2종 (S11 의 `#FF6B6B` errorText + `#5A8A6A` exhaustedText) 가 *명시적으로 잔존* — task 09 위임 명시 | (TEST) describe '보류 hex 명시 (task 09 위임)' 2 it — `expect(src.includes("'#FF6B6B'")).toBe(true)` + 동일 `#5A8A6A` | 2 it 모두 PASS (negative — 잔존 확인) |
| REQ-008 | 다크 모드 4 화면 시각 회귀 0 — Epic 12 작업 전 캡처와 동일 | (MANUAL) iOS 시뮬레이터 다크 → 홈 → 곡선택 → 녹음가이드 → 녹음 → 미리보기 (S11) / 사용 → 생성 대기 (S12) → 재생 (S13) / 탭바 (Home ↔ Settings) / Settings → 약관 (Legal) 5 진입 + Epic 12 이전 캡처 비교 | 5/5 동일 (RGB 차이 ≤ 4dp 보장) PASS |
| REQ-009 | 라이트 모드 4 화면 시각 적용 확인 — 헤더/배경/타이틀/본문/CTA/탭바 모두 라이트 베이지 팔레트 | (MANUAL) 라이트 모드 진입 → S11 container 베이지 + title 짙은 갈색 + waveformCard 라이트 surface + playIcon 라이트 accentSecondary (`#9A6858`) + errorBanner 옅은 베이지 (`#F4E8DC` — task 04 destructiveBg.light) + primaryBtn 진한 남색 (`#3A5A88`) + 그 위 짙은 갈색 텍스트 / S12 + S13 동일 / 탭바 라이트 bgDeep (`#F0EAE0`) + active accentPrimary 남색 / Legal 헤더 라이트 + 짙은 갈색 텍스트 | 5/5 적용 PASS |
| REQ-010 | 라이트 모드에서 *재생 / 일시정지 / 타이머 / 탭 전환 / Legal 진입* 흐름 변경 0 — REQ-008/009 캡처 도중 흐름 검증 | (MANUAL) 라이트 모드 S13 → 재생 ▶ → 일시정지 ⏸ → 타이머 버튼 → BottomSheet 표시 → 닫기 → 뒤로 → 탭바 Home ↔ Settings 전환 → Settings → 약관 → Legal 진입 → 뒤로 | 모든 흐름 정상 PASS |
| REQ-011 | 본 task 보류 hex (`#FF6B6B` errorText + `#5A8A6A` exhaustedText) 시각 노출 라이트 모드 — 의도된 잔존 (task 09 위임) | (MANUAL) S11 진입 → 에러 분기 mock (또는 횟수 소진 분기 mock) → errorText 다크 빨강 (`#FF6B6B`) 라이트 베이지 위 노출 (의도된 부분 깨짐) + exhaustedText 다크 muted green (`#5A8A6A`) 노출 — 본 task 머지 후 task 09 까지 그대로 | 2 hex 잔존 확인 — 의도된 부분 깨짐 PASS |
| REQ-012 | 기존 task 01~05 회귀 테스트 GREEN — 본 task 가 다른 파일 영향 0 | (TEST) `pnpm --filter mobile test src/__tests__/theme/` 전체 디렉토리 실행 | 6 파일 (tokens / typography / auth-onboarding-no-raw-hex / paywall-processed-hex-map / settings-deletion-processed-hex-map / missing-tokens-applied / m1a-core-flow-processed-hex-map) 모두 GREEN |
| REQ-013 | TypeScript 컴파일 GREEN — `colors.destructiveBg` 키 존재 + useTheme 타입 정합 | (MANUAL) `pnpm --filter mobile tsc --noEmit` | exit 0 + 에러 0 PASS |
| REQ-014 | 직접 색 리터럴 사용 금지 (4 대상 파일 한정 — 보류 hex 2종 외) | (TEST) `m1b-play-pending-nav-processed-hex-map.test.ts` REQ-002~005 와 동일 | 처리 hex 10종 0건 PASS |

## 10. 주의사항

### 10.1 DB 영향도

**없음** — 색상 토큰만 변경. DDL/마이그레이션 0. `docs/db-schema.md` 참조 변경 0.

### 10.2 외부 SDK 영향도

- **react-navigation** (`@react-navigation/native-stack` v7 + `@react-navigation/bottom-tabs` v7): screenOptions factory 적용 시 객체 reference 만 변경 — 내부 동작 영향 0. Tab.Navigator / Stack.Navigator API 시그니처 호환 (`screenOptions: BottomTabNavigationOptions | StackNavigationOptions` — 동등 객체).
- **AudioEngine** (S13 재생): 변경 0.
- **expo-file-system** (S11/S13 파일 access): 변경 0.
- **react-native-purchases (RevenueCat)** (S13 timer / S11 isGenerationExhausted): 변경 0.
- **AsyncStorage / SecureStore** (S12 pendingSession): 변경 0.

### 10.3 회귀 위험 + 완화

- **위험 1 (MEDIUM — S11 errorBanner `#2A1A1A` → `destructiveBg #2A1A0F` 흡수)**: B 채널 11dp 차이 = 4dp 룰 *경계* (11/3=3.67dp avg). 다크 모드에서 errorBanner 배경이 *살짝 더 어두운 갈색* (B-11 = 검정에 가까워짐) 으로 렌더링 → 시각 식별 어려운 변화 예상.
  - **완화**: REQ-008 다크 캡처 비교 시 S11 에러 분기 mock (uploading 실패 시) 강제 진입 → errorBanner 영역 px 단위 비교. 시각 차이 발견 시 별도 PR 로 `errorBg` 신규 토큰 등재 (task 04 destructiveBg 와 분리 가능). roll-back 비용 LOW (tokens.ts 추가 + S11 errorBanner 1줄 수정).
- **위험 2 (MEDIUM — S11 errorText `#FF6B6B` 보류 → 라이트 베이지 위 다크 빨강 잔존)**: 라이트 모드 에러 분기 진입 시 `#FF6B6B` 다크 빨강이 라이트 베이지 (`#F4E8DC` errorBanner 배경) 위 노출 → *위험 시각 보존* (가독성 OK). 그러나 라이트 destructive `#C0392B` 와 다른 톤 → 라이트 디자인 의도 불일치 가능.
  - **완화**: 본 task 보류 명시 (§3.2.3 + REQ-011 매뉴얼 확인). task 09 진입 시 `destructiveBright` 신규 토큰 정의 권고 (§13).
- **위험 3 (MEDIUM — S11 exhaustedText `#5A8A6A` 보류 → 라이트 베이지 위 다크 muted green 잔존)**: 라이트 모드 횟수 소진 분기 진입 시 `#5A8A6A` 다크 muted green 이 라이트 surfaceHigh (`#DDD4C6`) 위 노출 → 가독성 LOW (muted green 이 베이지 위 묻힘 가능).
  - **완화**: 본 task 보류 명시. task 09 진입 시 `successMuted` 신규 토큰 정의 강력 권고 (§13 — 3곳 누적 재사용 = 토큰화 필수 분기).
- **위험 4 (LOW — MainNavigator screenOptions useMemo deps 정합)**: `[colors]` deps 가 useTheme 안 모듈 상수 반환 (참조 안정) → 리렌더 시 deps 변경 0 → useMemo 캐시 유효. 만약 다크/라이트 동적 토글 (Settings 라디오 → 즉시 전환) 시 colors 참조 변경 → useMemo 무효화 → tabScreenOptions / stackScreenOptions 재생성 → Tab.Navigator / Stack.Navigator 의 screenOptions prop reference 변경 → react-navigation 내부 비교 시 *동등 객체이지만 reference 다름* → 잠재 리렌더 1회.
  - **완화**: react-navigation 내부 = props 비교 안 하고 그냥 적용 (재공식 API). 추가 리렌더는 *의도된 결과* (다크 ↔ 라이트 토글 시 탭바 색 즉시 갱신). 위험 LOW.
- **위험 5 (MEDIUM — S13PlayScreen 리렌더 빈도)**: 재생 진행 0.5초 tick + 타이머 카운트다운 1초 tick → 잦은 리렌더 시 `useMemo([colors])` 가 colors 변경 0 → makeStyles 호출 0 (mount 시 1회). 그러나 useMemo *내부* `colors` 참조 안정성 검증 필요.
  - **완화**: useTheme.ts 가 모듈 상수 (darkColors 또는 lightColors) 직접 반환 — 참조 안정 보장. useTheme.test.ts 의 기존 30 it 검증 (`useTheme returns stable colors object across renders`) — task 01 인프라.
- **위험 6 (LOW — RecordModeScreen skip α 결정)**: skip α = 본 task 가 RecMode 손대지 X. 만약 시간이 지나 RecMode 가 다시 navigation stack 에 등록되는 경우 (= 폐기 해제) 라이트 깨짐 잔존.
  - **완화**: §3.4 명시 — "S08 폐기 = L1 주석 + MainNav stack 등록 해제로 진입 0". 폐기 해제 시점 = epic 외 별도 결정 (= 재등록 시점 architect 가 RecMode 재토큰화 책임 명시).
- **위험 7 (LOW — Legal screen `headerStyle` factory 적용)**: react-navigation v7 의 `Stack.Screen options.headerStyle` = StyleProp 동등 객체. `useMemo` 외부 reference 안정 (parent useTheme 클로저 캡처) → mount 시 1회 생성. 다크/라이트 토글 시 객체 재생성 → react-navigation header 컴포넌트 리렌더 1회 (의도).
  - **완화**: §3.5 결정 — A (인라인 close 캡처) 채택. 별도 위험 등재 불필요.

### 10.4 PR 후 시각 회귀 발견 시 rollback 절차

- `git revert <머지 커밋>` 단일 커밋. 4 파일 통째 원복. m1b-play-pending-nav-processed-hex-map.test.ts 신규도 동시 원복.
- 영향 범위 = S11/S12/S13/MainNav. 다른 task 영향 0.
- 단 *S11 errorBanner 흡수 위험 1 만* 발견 시 = revert 불필요. tokens.ts 의 `destructiveBg` 다크 hex 1줄 수정 또는 `errorBg` 신규 토큰 정의 (별도 PR).

### 10.5 PR 단위 권장

- **1 PR (4 파일 + 회귀 테스트)** — task 05 옵션 A 와 동일 (Phase 1+2 일체화).
- 커밋 분할 (dcness `git-naming-spec` 정합):
  1. `[epic12][story4] S11PreviewScreen: useTheme + factory + 17 hex 처리 (보류 2 명시)`
  2. `[epic12][story4] S12GeneratingScreen: useTheme + factory + 5 hex 처리`
  3. `[epic12][story4] S13PlayScreen: useTheme + factory + 11 hex 처리`
  4. `[epic12][story4] MainNavigator: useTheme + screenOptions factory + 7 hex 처리`
  5. `[epic12][story4] m1b-play-pending-nav-processed-hex-map.test.ts: 회귀 방지 1차 방어선`
  6. (선택) `[epic12][story4] docs/epics/epic-12/impl/06: ready` — impl 본문 갱신
  = 총 5~6 커밋. RecordModeScreen 미포함 (§3.4 skip α).

### 10.6 task 04 머지 의존 게이트

본 task `errorBanner: { backgroundColor: colors.destructiveBg }` (S11) = task 04 머지 후 진입 가정. task 04 미머지 상태에서 진입 시:
- TypeScript 컴파일 RED (`Property 'destructiveBg' does not exist on type 'ColorTokens'`)
- jest RED (tokens.test.ts 의 신규 9 토큰 it 누락)

**처리 옵션**:
- 옵션 A (권장): task 04 머지 후 본 task 진입 (system-design §8 Option α 순서)
- 옵션 B: task 04 머지 전 본 task 진입 시 `colors.destructiveBg` → 임시 `'#2A1A1A'` 그대로 (보류 hex 추가 — 본 task 보류 카운트 1 증가). 단 plan §3.2.2 흡수 결정 무효화 → 별도 위험 등재 + REQ-009 라이트 적용 부분 미충족

**결정 = A** (system-design §8 Option α 흐름 = task 03 → task 04 → task 05 → task 06 → ... 순서 유지). impl-loop 가 자동 순서 처리.

### 10.7 task 09 (hex-lint) 와의 관계

본 task 의 `m1b-play-pending-nav-processed-hex-map.test.ts` = **4 대상 파일 한정** 회귀 방지선. task 09 = **앱 전체 hex-lint** 도입 책임. 본 task 머지 시점에서는 4 파일 외 다른 파일 (RecMode skip / 컴포넌트 / lib) 의 hex 잔존 검증 X. task 09 머지 시점에서 통합 회귀 방지선 완성.

> task 09 architect 가 본 task 의 `m1b-play-pending-nav-processed-hex-map.test.ts` + task 05 의 `m1a-core-flow-processed-hex-map.test.ts` 를 제거 또는 흡수 결정. 본 task 는 그 결정을 *제약하지 X*.

### 10.8 보류 hex TODO 주석 통일

본 task 의 4.3 의사코드 + 5.1 §4 에서 보류 hex 의 TODO 주석 통일:
- `errorText: { color: '#FF6B6B', ... }, // TODO(task 09): destructiveBright 토큰 도입 후 교체`
- `exhaustedText: { color: '#5A8A6A', ... }, // TODO(task 09): successMuted 토큰 도입 후 교체`

task 05 plan 의 보류 hex TODO 주석 패턴과 정합. task 09 진입 시 grep `TODO\(task 09\)` 로 일괄 검색 + 교체.

## 11. 의존성

- **선행 task**: task 05 (m1a-core-flow-screens) **+ task 04 (missing-tokens-define-and-apply)** — task 04 머지로 `destructiveBg` 토큰 사용 가능 (§3.2.2 + §10.6). task 05 머지로 M1 전반부 (S06/S07/RecordGuide/Record) 라이트 적용 완료 → 본 task 가 M1 후반부 마무리.
- **후행 task**: task 07 (M1 잔여 또는 components — system-design §8 인용) → task 04 + task 05 + task 06 의 누적 보류 hex 일괄 처리 후 진입.
- **후행 task 09**: hex-lint 회귀 테스트 — 본 task 의 `m1b-play-pending-nav-processed-hex-map.test.ts` 통합 또는 별도 유지. 보류 hex 2종 (`#FF6B6B`, `#5A8A6A`) + task 05 보류 4종 = 누적 6종 (또는 흡수 위험 등재 포함 7~8종) 일괄 토큰 정의 권고.
- **외부**: 없음.

## 12. 게이트 self-check (architect/module-plan SOP 12 항목)

| # | 항목 | 충족 | 비고 |
|---|---|---|---|
| 1 | 생성/수정 파일 목록 확정 | ✓ | §2 — S11/S12/S13/MainNav 4 파일 + 회귀 테스트 1 파일. RecMode = §3.4 skip α 명시 |
| 2 | 인터페이스 TypeScript 타입 명시 | ✓ | §4.1 화면 Props + §4.2 MainNavigator + §4.3 makeStyles factory + §4.4 인라인 prop + §4.5 회귀 테스트 |
| 3 | 의존 모듈 실제 인터페이스 직접 확인 | ✓ | tokens.ts (15 토큰 + task 04 신규 9 → 24) / useTheme.ts (기존 동작) / 5 파일 hex 잔존 (50 매치) 모두 read 완료. task 04 plan §4.1 ColorTokens 9 토큰 표 + §4.2 darkColors/lightColors hex 직접 인용 |
| 4 | 에러 처리 명시 | ✓ | useTheme 항상 valid ColorTokens (변경 0). task 04 미머지 시 destructiveBg 부재 → TS 컴파일 RED + jest RED (§10.6) — 의도된 의존 게이트 |
| 5 | 페이지 전환·상태 초기화 순서 | N/A | 본 task = 색상 토큰 + factory. 화면 전환/상태 초기화 동작 변경 0 |
| 6 | DB 영향도 분석 | ✓ | 없음 (§10.1) |
| 7 | Breaking Change 검토 | ✓ | 없음 (§6) — 외부 export / Props / route name / ParamList 변경 0 |
| 8 | 핵심 로직 의사코드 | ✓ | §5 (S11 5단계 + S12 5단계 + S13 5단계 + MainNav 5단계 + RecMode skip + 검증 3단계) |
| 9 | TypeScript 타입 정합 | ✓ | useTheme + ColorTokens / NativeStackScreenProps / BottomTabNavigationOptions 모두 명시. task 04 의 `destructiveBg: string` 키 활용 |
| 10 | import 완전성 | ✓ | useTheme + useMemo + ColorTokens import 경로 명시 (§4.3 + §5.1). m1b-... test 의 fs/path import 명시 (§4.5) |
| 11 | 수용 기준 + 메타데이터 | ✓ | §9 표 14 행 (REQ-001 ~ REQ-014) + frontmatter (depth: std, task: 06, slug, story, github_issue: 241, epic: 12, branch_prefix) |
| 12 | 모듈 = 테스트 단위 정합 | ✓ | §8 self-check 3 항목 모두 ✓ |

추가 게이트 (epic-12 한정):
- **system-design §8 Option α 정합**: ✓ NN=06, 슬러그 = `m1b-play-pending-nav` (system-design impl 목차 표 행과 정확 일치). 의존 = task 04 + task 05 (선행)
- **task 04 신규 9 토큰 활용 명시**: ✓ `destructiveBg` 1개 활용 (§3.2.2 흡수). 나머지 8 토큰은 본 task 비대상 (결제/구독/탈퇴 화면 한정)
- **task 05 §3.3 옵션 B 패턴 차용**: ✓ §3.3 결정 = B (보류 명시) + Story 5 task 09 위임 (§13)
- **다크 회귀 0**: ✓ §3.2.1 hex 매핑 정확 일치 + REQ-008 시각 검증
- **RecordModeScreen 처리 정책 명시**: ✓ §3.4 skip α 결정 + 클린업 후속 권고 (§13)
- **수용 기준 실행 가능 커맨드 100%**: ✓ REQ-001~007/012 = jest 실행 명령. REQ-008/009/010/011 = 매뉴얼 iOS 시뮬레이터 절차. REQ-013/014 = TypeScript 컴파일 / jest. 자연어만 박힌 행 = 0
- **디자인 토큰 의존성 가드레일 (직접 색 리터럴 금지)**: ✓ REQ-014 + §4.5 회귀 테스트 (processed hex 0건). 보류 2 hex 는 *명시적* 잔존 (REQ-007 negative assertion)

---

## 13. 결론 + 권장 다음 단계

본 module-plan 은 system-design §8 Option α 재정렬에 따라 task 06 (`m1b-play-pending-nav`) 의 본문을 채운 산출물이다. **본 task = M1 핵심 플로우 *후반부* (재생/대기/내비게이터) 의 hex → ColorTokens 마이그레이션**. 4 대상 파일 (S11PreviewScreen / S12GeneratingScreen / S13PlayScreen / MainNavigator) 의 합계 40 hex (50 grep 매치 − RecordModeScreen 10 skip) 를 처리. RecordModeScreen 은 §3.4 결정 (S08 폐기 + L1 주석 명시) 에 따라 **skip α** — 회귀 테스트 대상 외.

매핑 분석 결과 — 9 매핑 토큰 (bgPrimary / bgDeep / surface / surfaceHigh / border / accentPrimary / textSecondary / accentSecondary / textPrimary) + 1 흡수 토큰 (task 04 `destructiveBg` ← `#2A1A1A` 4dp 경계 흡수, §10.3 위험 1) = **10 토큰**, 매핑 47 + 흡수 1 = **48 hex 처리** (실제 작업 hex 40 중 38 처리 = 95%, 보류 2). 보류 hex 2종 (`#FF6B6B` errorText + `#5A8A6A` exhaustedText) = task 05 §3.3 옵션 B 패턴 차용으로 본 task 보류 + Story 5 task 09 위임. system-design §1 룰 (본 Epic 인프라 호출만) 정합.

신규 인프라 0 — task 04 신규 9 토큰 중 `destructiveBg` 1개만 활용 (나머지 8 토큰은 결제/구독/탈퇴 한정 의도 정합). DB / API / 외부 SDK / navigation route / Breaking Change 영향 0. MainNavigator 의 screenOptions 는 `useMemo([colors])` factory 패턴으로 다크/라이트 토글 시 즉시 갱신 보장.

회귀 방지 — `m1b-play-pending-nav-processed-hex-map.test.ts` 신규 (positive: 10 hex 0 + 10 토큰 ≥1 + useTheme 도입 / negative: 보류 2 hex 잔존 명시). task 05 의 `m1a-core-flow-processed-hex-map.test.ts` 와 동일 패턴 + 보류 명시 + useTheme 도입 assertion 강화.

12 게이트 + epic-12 추가 6 게이트 모두 통과. AC 모든 행 통과 조건 = 실행 가능 커맨드 (jest / tsc / iOS 시뮬레이터 절차) 100%. 자연어만 박힌 행 0.

**상태 = READY_FOR_IMPL**.

권장 다음 단계 — system-design §8 impl 목차의 다음 행 = task 07 (M1 잔여 또는 components — system-design §8 표 인용 확인 필요) MODULE_PLAN 호출. 본 task + task 05 의 누적 보류 hex 6종 (`#82B090`, `#A9B0D0`, `#E0B070`, `#5A8A6A`, `#FF4444`, `#FF6B6B`) 은 task 09 (hex-lint + 일괄 토큰 정의) 진입 시 우선순위 상승 권고 — 특히 `#5A8A6A` 는 3곳 누적 재사용 (S11 / RecordScreen / DeleteTracksSheet) 으로 *토큰화 필수 분기* 도달. 만약 본 task 머지 후 시각 검수에서 §10.3 위험 1 (errorBanner 흡수) 시각 차이 발견 시 = 별도 *디자이너 합의 PR* 로 tokens.ts 의 `errorBg` 신규 토큰 등재 (본 plan §10.3 위험 1 완화 절차). 또한 `chore(cleanup): RecordModeScreen 폐기 파일 삭제` 후속 task 를 epic-12 외부 backlog 에 등록 권고 (§3.4 γ 옵션, epic 범위 외 클린업).
