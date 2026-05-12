---
depth: std
task: 08
slug: shared-components
story: Story 5 (공유 컴포넌트 + 누락 토큰 정비 + 회귀 방지 인프라)
github_issue: 242
epic: 12
branch_prefix: chore/epic12-task08-shared-components
---

# task 08 — 공유 컴포넌트 hex → ColorTokens 마이그레이션 + 2 차 누락 토큰 흡수

## 1. 목적 (왜)

- **AC-1 최종 충족 task** (PRD §4): `apps/mobile/src/` 전체 grep `#[0-9A-Fa-f]{6}` (테스트·tokens.ts·`__mocks__` 제외) 결과를 *task 09 (hex-lint) 진입 전 거의 0건* 으로 떨어뜨린다. task 01~07 처리 후 잔여는 components/ 6 파일 (29 hex) + 다른 화면의 누적 보류 hex 7 종에 한정 — 본 task 가 6 파일 일괄 + 누적 보류 일부 흡수 + 신규 3 토큰 정의로 처리. 잔여 hex 4 매치 (`#82B090` ×2 / `#FF4444` ×2) 만 task 09 책임.
- **PRD §3.4 공유 컴포넌트 정리 일괄 종결** (Story 5): PRD 명시 11 컴포넌트 + 미명시 5 컴포넌트 = 16 컴포넌트 합 — 본 task 한 PR 로 종결. PRD 명시 11 중 10 (`CompletedTrackCard` / `MasterAudioCard` / `EmptyMastersState` / `SongListItem` / `TrackCard` / `MiniPlayer` / `TimerBottomSheet` / `TrialBadge` / `TrialExpiryBanner` / `EmptyTrackState`) 는 *이미 hex 0* (useTheme 채택 완료) 확인 — 본 task 변경 없음. 잔여 = JustArrivedMasterCard + 미명시 5 (`DeleteTracksSheet` / `GeneratingFailureView` / `GeneratingTimeoutNotice` / `VolumeSlider` / `AlbumArtRotating`) = **6 파일 29 hex**.
- **누적 보류 hex 5 종 흡수** (task 05 §3.3 + task 06 §10.3 위임분): task 05~07 plan 에서 task 09 위임된 hex 7 고유종 (`#82B090` / `#E0B070` / `#5A8A6A` / `#FF4444` / `#FF6B6B`) 중 본 task 가 *5 등장 위치 / 3 고유 hex* (`#5A8A6A` task05 silenceWarning + task06 exhaustedText + 본 task DeleteTracksSheet deleteBtn 3곳 / `#FF6B6B` task06 errorText + 본 task DeleteTracksSheet deleteAllText 2곳 / `#E0B070` task05 bgmFailToast 1곳) 를 신규 토큰 3종 정의 + 일괄 교체로 해소. 잔여 보류 hex 2 종 4 매치 (`#82B090` ×2 / `#FF4444` ×2) 만 task 09 위임.
- **본 task = 미니 task 04 역할 일부 + 공유 컴포넌트 일괄**: architect 자율 판단 (mode prompt §"누적 보류 hex 처리"). 누적 보류 ≥ 5 고유 hex (= 3 흡수 + 2 잔여) → 별도 task `08a` 신설 대신 본 task 안에 신규 토큰 정의 섹션 흡수. 근거: (a) 본 task 가 *마지막 컴포넌트 처리 task* — tokens.ts 추가 PR 을 분리 시 task 09 진입 지연 + 라이트 모드 부분 깨짐 잔존 시간 ↑. (b) 신규 토큰 3 = task 04 신규 9 보다 적음, 변경 라인 수 작음. (c) 본 task 작업자 (engineer) 가 컴포넌트 패치 + tokens 정의 *한 PR* 에서 처리 → 검토 부담 감수 가능. (d) 라이트 hex 결정 비용 = 디자이너 부재 컨텍스트 → architect 1차 추정 (§3.5 근거).
- **다크 회귀 0**: 다크 사용자 (자장 핵심 페르소나) 시각 변화 0 보장. `darkColors` 의 기존 15 토큰 + task 04 신규 9 + 본 task 신규 3 = 27 토큰 hex 가 발견 hex 와 정확 일치 또는 4dp 이내 흡수 (§3.2.2 위험 등재).
- **task 04 신규 9 토큰 활용 분석 — 본 task 한정 0**: 본 task 6 파일 29 hex 매핑 결과 (§3.2) — task 04 신규 9 토큰 중 *실제 매핑 대상 0*. 모든 29 hex 가 기존 15 토큰 또는 본 task 신규 3 토큰 또는 4dp 흡수로 처리. task 04 의 *결제·구독·탈퇴 화면 한정* 의도 정합.
- **createStyles factory + useTheme 패턴 일관**: task 01~07 와 동일한 `makeStyles(colors)` + `useMemo` + `useTheme()` 패턴 차용. 6 파일 모두 useTheme 미채택 상태 → 본 task 가 *6 파일 모두 useTheme 채택* + factory 도입.

## 2. 영향 파일 (실측 — grep + Read 직접 검증)

### 2.0 PRD 명시 11 컴포넌트 useTheme 상태 (직접 grep 검증)

> `grep -En 'useTheme' src/components/<file>.tsx` 결과:

| 파일 | useTheme | hex 잔존 (직접 grep) | 본 task 처리 |
|---|---|---|---|
| `apps/mobile/src/components/CompletedTrackCard.tsx` | ✓ 채택 (L8/L22) | **0** | 변경 없음 |
| `apps/mobile/src/components/MasterAudioCard.tsx` | ✓ 채택 (L6/L16) | **0** | 변경 없음 |
| `apps/mobile/src/components/EmptyMastersState.tsx` | ✓ 채택 (L6/L13) | **0** | 변경 없음 |
| `apps/mobile/src/components/SongListItem.tsx` | ✓ 채택 (L4/L23) | **0** | 변경 없음 |
| `apps/mobile/src/components/TrackCard.tsx` | ✓ 채택 (L6/L16) | **0** | 변경 없음 |
| `apps/mobile/src/components/MiniPlayer.tsx` | ✓ 채택 (L31/L38/L95) | **0** | 변경 없음 |
| `apps/mobile/src/components/TimerBottomSheet.tsx` | ✓ 채택 (L23/L51) | **0** | 변경 없음 |
| `apps/mobile/src/components/TrialBadge.tsx` | ✓ 채택 (L5/L14) | **0** | 변경 없음 |
| `apps/mobile/src/components/TrialExpiryBanner.tsx` | ✓ 채택 (L8/L21) | **0** | 변경 없음 |
| `apps/mobile/src/components/EmptyTrackState.tsx` | ✓ 채택 (L6/L12) | **0** | 변경 없음 |
| `apps/mobile/src/components/JustArrivedMasterCard.tsx` | ✗ 미채택 | **7** | 본 task §2.1 |

→ PRD 명시 11 중 10 = *이미 hex 0* 검증 완료. 본 task 가 변경하지 X — **회귀 방지 차원에서 §9 REQ-013 에 10 파일 hex 0 유지 검증 추가**.

### 2.1 본 task 대상 파일 (직접 grep + Read 검증)

| 파일 (실제 경로) | hex 수 (직접 grep) | useTheme | StyleSheet 패턴 | 비고 |
|---|---|---|---|---|
| `apps/mobile/src/components/JustArrivedMasterCard.tsx` | 7 (L47/52/58/59/62/67/68) | 미채택 | static StyleSheet.create | PRD 명시. 6자리 hex 7건. S06 홈에서만 사용 |
| `apps/mobile/src/components/DeleteTracksSheet.tsx` | 9 (L212/223/228/244/248/252/256/265/270) | 미채택 | static StyleSheet.create | PRD 미명시. 9건 + rgba 1건 (L209 `rgba(0,0,0,0.5)`). S16 settings → DeleteTracksSheet 진입 + Modal |
| `apps/mobile/src/components/GeneratingFailureView.tsx` | 5 (L46/52/59/66/67) | 미채택 | static StyleSheet.create | PRD 미명시. S12 DSP 실패 view |
| `apps/mobile/src/components/GeneratingTimeoutNotice.tsx` | 4 (L41/48/56/62) | 미채택 | static StyleSheet.create | PRD 미명시. S12 timeout view |
| `apps/mobile/src/components/VolumeSlider.tsx` | 3 (L112/119/126) | 미채택 | static StyleSheet.create | PRD 미명시. S13 재생 화면 볼륨 슬라이더. 3 hex 모두 trackBackground/trackFill/thumb |
| `apps/mobile/src/components/AlbumArtRotating.tsx` | 1 (L63) | 미채택 | static StyleSheet.create | PRD 미명시. S13 앨범 아트. URI 로드 전 placeholder backgroundColor 1건 |
| **합계** | **29** | — | — | system-design §2 표 (7+9+5+4+3+1=29) 및 PRD 표 정합 |

> **rgba 별도**: `DeleteTracksSheet.tsx` L209 `'rgba(0, 0, 0, 0.5)'` (backdrop) — 6자리 hex regex 미포함이나 색상 리터럴. `colors.overlay` (다크 `#000000AA` alpha 67% / 라이트 `#00000066` alpha 40%) 와 alpha 17% (다크) / 10% (라이트) 차이. 흡수 가능 §3.2.2.
>
> **3자리 hex 별도**: 6 파일 모두 3자리 hex (`#fff` 등) 등장 0건 직접 grep 확인 — task 05 의 RecordScreen `#fff` 와 같은 패턴 없음.

### 2.2 hex 전수 인용 (L번호 + hex + 의도 — engineer 가 1행씩 적용 가이드)

**JustArrivedMasterCard.tsx (7)** — L47~68 StyleSheet
- L47 `'#1E2540'` (card backgroundColor) — **`surface #1A1D30` 와 채널차 +4/+8/+16 = 9dp avg. 4dp 룰 초과 → 흡수 분기 §3.2.2**
- L52 `'#5A7AA8'` (card borderColor) — `accentPrimary` 1:1
- L58 `'#EEF0F8'` (label color) — `textPrimary` 1:1
- L59 `'#7B80A0'` (sub color) — `textSecondary` 1:1
- L62 `'#5A7AA8'` (playBtn backgroundColor) — `accentPrimary` 1:1
- L67 `'#0D0F1A'` (playBtnText color) — `bgPrimary` 1:1 (accent 위 짙은 텍스트)
- L68 `'#7B80A0'` (dismissText color) — `textSecondary` 1:1

**DeleteTracksSheet.tsx (9 + rgba 1)** — L209~270 StyleSheet
- L209 `'rgba(0, 0, 0, 0.5)'` (backdrop backgroundColor) — `colors.overlay` 흡수 §3.2.2
- L212 `'#1A1D2E'` (sheet backgroundColor) — **`surface #1A1D30` 와 채널차 0/0/-2 = 1dp avg. 4dp 룰 내 → `surface` 흡수 §3.2.2**
- L223 `'#3A3D58'` (handle backgroundColor) — **`border #2A2E48` 와 채널차 +16/+15/+16 = 16dp avg. 4dp 룰 초과. `surface #1A1D30` 와 +32/+32/+40 = 35dp avg → 모두 부적합. 신규 토큰 후보 또는 hex 흡수 검토 §3.2.2 → 결정 = `border` 흡수 (시각 의도 = handle 약한 회색 바, 16dp 차이지만 등장 1회 + handle 시각 약함 + 시각 식별 보존 시 alpha 변형 가능). §10.3 위험 등재 LOW**
- L228 `'#EEF0F8'` (title color) — `textPrimary` 1:1
- L244 `'#2A2E48'` (row borderBottomColor) — `border` 1:1
- L248 `'#EEF0F8'` (trackName color) — `textPrimary` 1:1
- L252 `'#5A8A6A'` (deleteBtn color) — **muted success 톤. task 05/06 누적 보류 hex. 본 task 신규 토큰 `successMuted` 정의 + 일괄 교체 §3.3**
- L256 `'#7B80A0'` (emptyText color) — `textSecondary` 1:1
- L265 `'#21253E'` (deleteAllBtn backgroundColor) — `surfaceHigh` 1:1
- L270 `'#FF6B6B'` (deleteAllText color) — **에러/위험 톤. task 06 누적 보류 hex. 본 task 신규 토큰 `errorText` 정의 + 일괄 교체 §3.3**

**GeneratingFailureView.tsx (5)** — L37~67 StyleSheet
- L46 `'#EEF0F8'` (title color) — `textPrimary` 1:1
- L52 `'#7B80A0'` (errorText color) — `textSecondary` 1:1 (note — *컴포넌트의 errorText 변수명* 이지만 시각 의도 = textSecondary)
- L59 `'#5A7AA8'` (retryBtn backgroundColor) — `accentPrimary` 1:1
- L66 `'#0D0F1A'` (retryBtnText color) — `bgPrimary` 1:1
- L67 `'#C49A8A'` (homeLink color) — `accentSecondary` 1:1

**GeneratingTimeoutNotice.tsx (4)** — L32~62 StyleSheet
- L41 `'#EEF0F8'` (title color) — `textPrimary` 1:1
- L48 `'#7B80A0'` (subtitle color) — `textSecondary` 1:1
- L56 `'#5A7AA8'` (homeBtn backgroundColor) — `accentPrimary` 1:1
- L62 `'#0D0F1A'` (homeBtnText color) — `bgPrimary` 1:1

**VolumeSlider.tsx (3)** — L97~129 StyleSheet
- L112 `'#2A2E48'` (trackBackground backgroundColor) — `border` 1:1
- L119 `'#5A7AA8'` (trackFill backgroundColor) — `accentPrimary` 1:1
- L126 `'#5A7AA8'` (thumb backgroundColor) — `accentPrimary` 1:1

**AlbumArtRotating.tsx (1)** — L61~64 StyleSheet
- L63 `'#1A1D30'` (base backgroundColor — URI 로드 전 placeholder) — `surface` 1:1

## 3. 결정 근거 (선택 + 버린 대안)

### 3.1 createStyles factory 채택 (5 파일) + 그대로 유지 (1 파일)

system-design §3.1 기준 — 스타일 속성 수:
- JustArrivedMasterCard 9 속성 → factory 채택
- DeleteTracksSheet 11 속성 → factory 채택
- GeneratingFailureView 6 속성 → factory 채택 (4 이상)
- GeneratingTimeoutNotice 5 속성 → factory 채택 (4 이상)
- VolumeSlider 5 속성 → factory 채택 (4 이상)
- AlbumArtRotating 1 속성 (`base.backgroundColor` 만) → **factory 채택 + useTheme + 1 토큰 참조** (3.1.1)

#### 3.1.1 AlbumArtRotating 처리 — useTheme 채택 vs static 유지 vs inline

옵션 A (inline): `style={{ backgroundColor: colors.surface, ... }}` — 호출 시점에 useTheme 호출. 1 속성 → inline 적합.
옵션 B (factory): `makeStyles(colors)` → 5 파일과 일관. 1 속성 = factory 오버킬.
옵션 C (정적 import `darkColors`): WaveformVisualizer 패턴 차용 (task 07 §3.4) — dark hex 정적 참조. **단 라이트 모드 적용 X** — 부적합.

→ **옵션 A 채택 (inline + useTheme)**. 1 속성 → factory 오버킬, 라이트 모드 적용 필요 → 정적 import 부적합. 본 task 패턴 일관성보다 컴포넌트 단순성 우선. (task 01~07 도 단순 컴포넌트 inline 허용 — system-design §3.2 정합)

### 3.2 hex → token 매핑 분석 (본 task 한정 — 24 토큰 + 본 task 신규 3 = 27 토큰 기준)

#### 3.2.1 기존 15 토큰 1:1 매핑되는 hex (회귀 0) — 본 task 6 파일 합계 21/29

| 발견 hex | 매핑 토큰 | 등장 위치 (출현 횟수) |
|---|---|---|
| `#0D0F1A` | `colors.bgPrimary` | JustArrivedMasterCard L67 + GenFailure L66 + GenTimeout L62 (3회) |
| `#1A1D30` | `colors.surface` | AlbumArtRotating L63 (1회) |
| `#2A2E48` | `colors.border` | DeleteTracksSheet L244 + VolumeSlider L112 (2회) |
| `#5A7AA8` | `colors.accentPrimary` | JustArrivedMasterCard L52/L62 + GenFailure L59 + GenTimeout L56 + VolumeSlider L119/L126 (6회) |
| `#7B80A0` | `colors.textSecondary` | JustArrivedMasterCard L59/L68 + DeleteTracksSheet L256 + GenFailure L52 + GenTimeout L48 (5회) |
| `#C49A8A` | `colors.accentSecondary` | GenFailure L67 (1회) |
| `#21253E` | `colors.surfaceHigh` | DeleteTracksSheet L265 (1회) |
| `#EEF0F8` | `colors.textPrimary` | JustArrivedMasterCard L58 + DeleteTracksSheet L228/L248 + GenFailure L46 + GenTimeout L41 (5회) |
| **합계** | — | **24 / 29 hex (82.7%)** — 8 토큰 매핑 |

> **매핑 회귀 검증**: 본 task 머지 후 다크 모드에서 위 8 hex 가 *그대로* 렌더링되는지 = `darkColors[<token>] === <발견 hex>` 정확 일치 (tokens.ts L23~31 인용 직접 확인). 본 task §4.5 회귀 테스트의 positive grep 으로 보장.

#### 3.2.2 4dp 이내 흡수 분기 결정 (PRD §3.2 + system-design §6 흐름)

| 발견 hex | 매핑 토큰 후보 | 다크 토큰 hex | 채널 차이 (R/G/B dp) | 결정 |
|---|---|---|---|---|
| `#1A1D2E` | `colors.surface` | `#1A1D30` (surface) | 0/0/-2 = 1dp avg | **흡수 (`colors.surface`)** — B 채널 -2 차이는 4dp 룰 내. 시각 식별 0. DeleteTracksSheet L212 sheet 배경 = surface 의도 정합. §10.3 위험 등재 0. |
| `#1E2540` | `colors.surface` | `#1A1D30` (surface) | +4/+8/+16 = 9dp avg | **흡수 (`colors.surface`)** — B 채널 16dp 차이는 4dp 룰 초과 (16/3=5.3dp). 시각 식별 가능 (살짝 더 밝은 보라톤). 그러나 (a) JustArrivedMasterCard = *S06 홈에서만 등장하는 알림 카드* (pending 복원 후 completed 시 노출 — 진입 빈도 낮음), (b) 카드 의도 = surface 위에 *떠 있는 카드 — borderColor accentPrimary 로 강조* (L52 `#5A7AA8`). 강조는 *border* 가 담당, 배경은 surface 와 비슷. 대안 비교: `surfaceHigh #21253E` 와 채널차 -3/+4/-1 = ~3dp avg (4dp 룰 내, 적합). **결정 = `surfaceHigh` (3dp 적합)** ← 1차 surface 후보 reject. 시각 의도 = "JustArrivedMasterCard 가 surface 카드 위에 떠 있는 *밝은* 강조 카드" 정합. §10.3 위험 등재 LOW. |
| `#3A3D58` | `colors.border` | `#2A2E48` (border) | +16/+15/+16 = 16dp avg | **흡수 (`colors.border`) + opacity 가능성 검토** — 채널차 16dp 평균은 4dp 룰 *명백 초과*. 시각 식별 가능 (살짝 더 밝은 회색). 그러나 (a) DeleteTracksSheet handle 바 = *bottom sheet 손잡이 1개 4×40 pixel* 미세 영역, (b) 시각 의도 = "약한 회색 indicator — 흐릿한 손잡이". 대안 비교: 신규 토큰 정의 (예: `surfaceMid #3A3D58`) → 본 task 신규 토큰 증가 → tokens.ts 변경 라인 ↑. **결정 = `border` 흡수** (16dp 차이는 1 곳만 등장 + handle 시각 약함 → 흡수 안전). §10.3 위험 등재 LOW. 시각 검수 시 어색 시 별도 PR 로 신규 토큰 `handleIndicator` 분리 가능. |
| `'rgba(0, 0, 0, 0.5)'` | `colors.overlay` | `#000000AA` (= alpha 67% / 라이트 `#00000066` = alpha 40%) | alpha 17% (다크) / 10% (라이트) 차이 | **흡수 (`colors.overlay`)** — task 06 §3.2.2 + task 07 §3.2.2 (RecordGuide L316 + useBackNav L125 동일 패턴) 와 정합. 다크 alpha 17% 차이 = backdrop 살짝 더 투명 (0.5 vs 0.67) → 시각 식별 약함. 라이트 alpha 10% 차이 = 0.5 vs 0.4 (~10% 더 어두움) → 가독성 LOW 위험. §10.3 위험 등재 LOW. 대안 = 신규 `overlayLight` 토큰 → system-design §1 룰 위배. 흡수 결정. |

→ 4dp 흡수 4건 = 29 hex 중 4 (13.8%). 누적 매핑 = §3.2.1 24 + §3.2.2 4 = 28 / 29 (96.6%).

#### 3.2.3 본 task 신규 3 토큰 정의로 해소되는 hex (누적 보류 hex 흡수)

본 task 가 architect 자율 판단 (mode prompt §"누적 보류 hex 처리") — task 04 패턴 (시 정의 + 일괄 적용) 차용하여 본 task 안에 신규 토큰 정의 섹션 흡수. 누적 보류 hex 7 고유 종 중 3 종 정의 + 5 등장 위치 일괄 교체:

| 발견 hex | 본 task 신규 토큰 | 본 task 내 등장 | 누적 보류 등장 (다른 task) |
|---|---|---|---|
| `#5A8A6A` | `successMuted` | DeleteTracksSheet L252 deleteBtn (1회) | task 05 §3.3 RecordScreen L457 silenceWarning (1회) + task 06 §3.2.3 S11PreviewScreen L357 exhaustedText (1회) |
| `#FF6B6B` | `errorText` | DeleteTracksSheet L270 deleteAllText (1회) | task 06 §3.2.3 S11PreviewScreen L338 errorText (1회) |
| `#E0B070` | `warning` | (본 task 등장 0) | task 05 §3.3 RecordScreen L437 bgmFailToast color (1회) |

> **본 task 가 단순 정의만이 아니라 *task 05/06 의 보류 hex 도 일괄 교체*** — 단 본 task PR 진입 시점에서는 task 05/06 가 이미 *머지 완료* 상태여야 함 (Option α 흐름 = 04→05→06→07→08). 본 task engineer 가 *S11/Record 의 보류 hex 도* 신규 토큰으로 교체. branch_prefix `chore/epic12-task08-shared-components` 의 base = task 07 머지 후 main 최신.
>
> 만약 task 05/06 가 보류 hex 를 *주석 + 임시 hex* 로 박아둔 상태면 — engineer 가 본 task PR 에서 그 주석 (`TODO(task 09 token-define): #5A8A6A` 등) 도 *모두 제거*. 본 task §10.7 명시.

#### 3.2.4 흡수 불가 hex 본 task 보류 = 2 종 (task 09 위임)

본 task 안에 정의하지 X (= task 09 책임):

| 발견 hex | 보류 사유 | 등장 위치 | task 09 권장 처리 |
|---|---|---|---|
| `#82B090` | task 05 §3.3 — HeadphoneChip border + text (RecordGuide L302/L310, 2회). 본 task 신규 `successMuted #5A8A6A` 와 채널차 +40/0/+38 = 26dp avg → 흡수 부적합. 신규 토큰 `success` ↑↑ 변형 필요. 단 *등장 1 파일 2회 한정* → 본 task 안에 추가 신규 토큰 정의 ROI LOW. task 09 hex-lint 진입 시 일괄 결정 (예: 예외 등재 vs 신규 토큰 `successHigh` 정의). | RecordGuide L302/L310 | hex-lint 예외 등재 또는 신규 토큰 `successHigh` 정의 |
| `#FF4444` | task 05 §3.3 — Record stopRing/stopBtn (RecordScreen L497/L505, 2회). `destructive #E85A5A` 와 채널차 R+27/G-6/B-6 = 13dp avg → 흡수 부적합. 본 task 신규 `errorText #FF6B6B` 와 채널차 R+0/G-39/B-39 = 26dp avg → 흡수 부적합. *위험 액션 버튼 강조 톤*. 본 task 안에 신규 토큰 (`destructiveAction` 등) 정의 ROI LOW (등장 1 파일 2회 한정 + 다른 task 에 보류 누적 X). | RecordScreen L497/L505 | hex-lint 예외 등재 또는 신규 토큰 `destructiveAction` 정의 |

→ 본 task 보류 hex = **2 고유종 / 4 매치**. 본 task PR 머지 후 `apps/mobile/src/` 전체 grep `#[0-9A-Fa-f]{6}` 잔여 = 4 매치 (`#82B090` ×2 + `#FF4444` ×2). AC-1 (0 건) 최종 충족 = task 09 책임.

### 3.3 본 task 신규 3 토큰 정의 — architect 1차 결정

본 task 가 task 04 패턴 차용 + 미니 task 04 역할 일부:

| 토큰 | dark hex (= 발견 hex) | light hex (architect 1차 결정) | 시각 의도 |
|---|---|---|---|
| `successMuted` | `#5A8A6A` | `#3E6749` (라이트 success `#2E8B44` 보다 채도 ↓ + 살짝 밝음 = 베이지 위 부드러운 녹색 / muted) | "삭제 버튼 텍스트 / silenceWarning 알림 / exhaustedText" — 본격 success 보다 *약하게* 보여야 함 |
| `errorText` | `#FF6B6B` | `#C0392B` (= destructive 그대로 — 라이트에서 errorText = destructive 와 동일 시각, 흡수 안전. 라이트 베이지 위 짙은 빨강 = 위험 텍스트 가독성 보존) | "에러 메시지 / 삭제 액션 텍스트" — destructive 보다 *약간 부드러운* 빨강 (다크 한정). 라이트는 destructive 와 동일 처리 안전 |
| `warning` | `#E0B070` | `#A07840` (라이트 베이지 위 진한 황금색 — 베이지 톤과 동계열이라 묻히지 않게 채도 ↑) | "BGM 로드 실패 토스트" — 경고/주의 의미. 다크의 노란계 의도 보존 |

#### 3.3.1 라이트 hex 결정 근거 (팔레트 정합)

라이트 팔레트 베이스 (tokens.ts L42~58 직접 read): `bgPrimary #FBF7F0` (베이지) / `textPrimary #1C1A18` (짙은 갈색) / `accentPrimary #3A5A88` (진한 남색) / `accentSecondary #9A6858` (브라운) / `destructive #C0392B` (짙은 빨강) / `success #2E8B44` (진녹색) / `border #C8BEB0` (옅은 베이지) — 따뜻한 베이지 + 짙은 갈색 + 진한 남색 무드.

- **`successMuted` light = `#3E6749`** — success `#2E8B44` 보다 채도 ↓ + 살짝 밝은 녹색. 라이트 베이지 위 *너무 진하지 않은 부드러운 녹색*. 삭제 버튼 텍스트 (`'삭제'`) / silenceWarning 같은 *알림 톤* 의도 보존. 다크의 `#5A8A6A` (muted success 톤) 의도 정합. 대안: success 와 흡수 (`#2E8B44`) → 다크에서 `#2E8B44` vs `#5A8A6A` 채널차 R+44/G-15/B+34 = 31dp avg, 흡수 부적합. **별도 토큰 유지**.
- **`errorText` light = `#C0392B`** — destructive 그대로 흡수. *라이트에서 errorText = destructive 와 동일 시각*. 다크의 `#FF6B6B` (옅은 빨강, 어두운 배경 위 가독성 ↑ 의도) → 라이트의 `#C0392B` (짙은 빨강, 베이지 위 가독성 ↑ 의도). 라이트 베이지 위 옅은 빨강 (#FF6B6B 가까운 hex) = 묻혀 보일 위험 → destructive 흡수 안전. 다크에서만 별도 토큰 유지 (밝은 빨강 의도 보존). 대안: 다크/라이트 모두 destructive 흡수 → 다크에서 `#FF6B6B` vs `#E85A5A` 채널차 R-23/G+17/B+17 = 19dp avg, 흡수 부적합. **별도 토큰 유지** + light 만 destructive 와 동일값.
- **`warning` light = `#A07840`** — 짙은 황금/올리브 갈색. 라이트 베이지 위 *눈에 띄는* 노란 계열 (베이지 톤과 동계열이라 묻히지 않게 채도 ↑). BGM 로드 실패 토스트 = 짧은 알림 → 가독성 ↑ 필요. 다크의 `#E0B070` (밝은 노랑) 의도 보존 (라이트는 짙게).

#### 3.3.2 토큰명 흡수 검토 — `errorText` 와 `destructive` 흡수?

대안 검토: `errorText` 와 `destructive` 흡수 가능?
- 다크: `#FF6B6B` vs `#E85A5A` 채널차 R-23/G+17/B+17 = 19dp avg. 시각 식별 가능 (살짝 더 *옅고 밝은* 빨강 = `#FF6B6B`). 흡수 시 다크 모드에서 errorText 가 *살짝 더 진한* 빨강 (`#E85A5A`) 으로 변경 → 회귀. task 06 의 작업자가 *의도적으로* `#FF6B6B` (옅은) 박았음. 흡수 = 의도 손실.
- 라이트: 흡수 안전 (위 §3.3.1 결정).
- **결정**: 다크 별도 + 라이트 흡수 (= `lightColors.errorText === lightColors.destructive`). 별도 토큰 유지하면서도 라이트값만 destructive 와 동일. 토큰 정의 비용 = 1 라인.

`successMuted` 와 `success` 흡수? §3.3.1 채널차 31dp → 흡수 부적합. 별도 유지.

`warning` 과 `accentSecondary` 흡수? 다크 `#E0B070` vs `#C49A8A` 채널차 R+28/G+22/B-26 = 25dp avg → 흡수 부적합. 별도 유지.

→ 3 토큰 모두 별도 유지가 안전한 결정. 단 `errorText` 라이트값만 destructive 흡수 (코드상 동일 hex 명시).

### 3.4 토큰 명명 컨벤션 — 의미 기반 (semantic) 유지

기존 ColorTokens (`bgPrimary`, `textPrimary`, `accentPrimary`, `destructive`, `success`, `overlay` …) + task 04 신규 9 (`textHighlight`, `textBody`, `textOnAccent`, `interactive`, `destructiveBg`, `toastBg` 등) = 의미 기반. 본 task 신규 3 토큰도 동일 컨벤션:
- `successMuted` = success 의 변형 (muted) — 의미 + 강도 명시
- `errorText` = error 의 *텍스트 한정* 의도 (errorBg 별도 가능성 X — 본 task 는 텍스트만)
- `warning` = 새로운 시각 카테고리 (warning ≠ destructive ≠ success)

### 3.5 다크 회귀 0 — 핵심 전략

`darkColors[<신규 3>]` = 본 task 발견 hex *그대로* (`#5A8A6A` / `#FF6B6B` / `#E0B070`). 시각 변화 0 보장. 본 task 가 darkColors 의 기존 24 토큰 (15 + task 04 신규 9) 을 *변경 X*. tokens.test.ts 의 기존 darkColors hex assertion (기존 18 + task 04 신규 9 = 27 it) 모두 그대로 유지 + 본 task 신규 3 dark hex assertion 3 it 추가.

### 3.6 라이트 모드 색 결정 — 디자이너 부재 컨텍스트 처리

epic-12 PRD §3.2 = "라이트 색은 디자이너 합의 필요 — 미정 시 architect 추정". 본 task 도 task 04 와 동일하게 디자이너 부재 컨텍스트 → architect 가 §3.3.1 의 "팔레트 의도 + 코드 SSOT 기반 추정" 으로 1차 결정. 추후 디자인 검수 시 별도 PR 로 조정 가능. 변경 비용 LOW: tokens.ts 의 lightColors 객체 1줄 수정 → 다수 파일 자동 반영. roll-back 비용 0.

### 3.7 PR 단위 — Phase 1 (tokens.ts) + Phase 2 (6 컴포넌트 + task05/06 보류 적용) = 1 PR

**옵션 A (권장): Phase 1 + Phase 2 = 1 PR**
- 정의 (tokens.ts) + 적용 (6 컴포넌트 + task05/06 보류 후처리) 일체화
- task 05/06 의 "보류 hex" 가 *본 task 머지 시점에 5 위치 해소*
- 본 task PR 머지 시점에서 `apps/mobile/src/` 잔여 hex = 4 매치 (`#82B090` ×2 + `#FF4444` ×2) — task 09 책임 한정
- PR 변경 라인 수 ~120~150 라인 (tokens.ts 20 + 6 컴포넌트 70 + task 05/06 보류 5 위치 + 회귀 테스트 30) — 1 PR 적정 (task 04 와 비슷한 규모)

**옵션 B: Phase 1 (tokens.ts) + Phase 2 (6 컴포넌트) 분할 = 2 PR**
- Phase 1 머지 시점에서 신규 토큰 정의 *되었지만 사용처 0* → dead code 잠시 발생
- Phase 2 머지까지 보류 hex 잔존 → 라이트 모드 부분 깨짐 잔존 시간 ↑
- 분할 이점 = 리뷰 부담 감소 *그러나* 본 task 변경량 자체가 크지 않음

**결정 = 옵션 A**. 단 engineer 가 PR 변경 라인 수 폭증 시 분할 가능. branch_prefix 그대로 유지.

### 3.8 외부 SDK / API / DB 영향 0

- **외부 SDK**: revenue-cat / accountApi / dataManagementApi / AudioEngine / AsyncStorage / expo-file-system / react-navigation / react-native-purchases / rewardedAdService / AdMob — 변경 0.
- **DB**: 영향 0 (`docs/db-schema.md` 참조 — 색상 토큰은 DB 와 무관).
- **API**: 변경 0.
- **navigation**: 변경 0.
- **테스트 환경**: jest 설정 변경 0. tokens.test.ts 갱신 + shared-components-processed-hex-map.test.ts 신규.

## 4. 인터페이스 (TypeScript)

### 4.1 ColorTokens 타입 확장 (tokens.ts)

```ts
export type ColorTokens = {
  // ─── 기존 15 (변경 X) ───
  accentPrimary:    string;
  accentSecondary:  string;
  bgPrimary:        string;
  bgDeep:           string;
  surface:          string;
  surfaceHigh:      string;
  textPrimary:      string;
  textSecondary:    string;
  border:           string;
  destructive:      string;
  success:          string;
  overlay:          string;
  accentPrimary14:  string;
  accentPrimary20:  string;
  accentPrimary33:  string;
  // ─── task 04 신규 9 (변경 X) ───
  textHighlight:    string;
  textBody:         string;
  textBodyHigh:     string;
  textBodyMuted:    string;
  textOnAccent:     string;
  textMuted:        string;
  interactive:      string;
  destructiveBg:    string;
  toastBg:          string;
  // ─── task 08 신규 3 ───
  successMuted:     string;  // 삭제 버튼 / silenceWarning / exhaustedText (muted success 톤)
  errorText:        string;  // 에러 메시지 / 삭제 액션 텍스트 (다크 옅은 빨강 / 라이트 destructive 흡수)
  warning:          string;  // BGM 실패 토스트 (warning 카테고리)
};
```

### 4.2 darkColors / lightColors 3 토큰 추가

```ts
export const darkColors: ColorTokens = {
  // ─── 기존 24 (변경 X) ───
  // ... (생략)
  // ─── 신규 3 (다크 = task 05/06/본 task 발견 hex 그대로) ───
  successMuted:    '#5A8A6A',
  errorText:       '#FF6B6B',
  warning:         '#E0B070',
};

export const lightColors: ColorTokens = {
  // ─── 기존 24 (변경 X) ───
  // ... (생략)
  // ─── 신규 3 (라이트 = architect 1차 결정 — §3.3.1 근거) ───
  successMuted:    '#3E6749',
  errorText:       '#C0392B',  // = lightColors.destructive (의도적 흡수)
  warning:         '#A07840',
};
```

### 4.3 6 파일 + task 05/06 보류 위치 교체 매핑 (engineer 의 검색·치환 가이드)

**hex → token 매핑 표** (본 task 처리 분):

| 발견 hex | 신규 토큰 참조 | 처리 위치 |
|---|---|---|
| `'#0D0F1A'` | `colors.bgPrimary` | JustArrivedMasterCard L67 / GenFailure L66 / GenTimeout L62 |
| `'#1A1D30'` | `colors.surface` | AlbumArtRotating L63 |
| `'#1A1D2E'` | `colors.surface` (1dp 흡수) | DeleteTracksSheet L212 |
| `'#1E2540'` | `colors.surfaceHigh` (3dp 흡수) | JustArrivedMasterCard L47 |
| `'#21253E'` | `colors.surfaceHigh` | DeleteTracksSheet L265 |
| `'#2A2E48'` | `colors.border` | DeleteTracksSheet L244 / VolumeSlider L112 |
| `'#3A3D58'` | `colors.border` (16dp 흡수, 위험 LOW) | DeleteTracksSheet L223 |
| `'#5A7AA8'` | `colors.accentPrimary` | JustArrivedMasterCard L52/L62 / GenFailure L59 / GenTimeout L56 / VolumeSlider L119/L126 |
| `'#7B80A0'` | `colors.textSecondary` | JustArrivedMasterCard L59/L68 / DeleteTracksSheet L256 / GenFailure L52 / GenTimeout L48 |
| `'#C49A8A'` | `colors.accentSecondary` | GenFailure L67 |
| `'#EEF0F8'` | `colors.textPrimary` | JustArrivedMasterCard L58 / DeleteTracksSheet L228/L248 / GenFailure L46 / GenTimeout L41 |
| `'#5A8A6A'` | `colors.successMuted` (신규) | DeleteTracksSheet L252 + **task 05 RecordScreen L457** + **task 06 S11PreviewScreen L357** |
| `'#FF6B6B'` | `colors.errorText` (신규) | DeleteTracksSheet L270 + **task 06 S11PreviewScreen L338** |
| `'#E0B070'` | `colors.warning` (신규) | **task 05 RecordScreen L437** |
| `'rgba(0, 0, 0, 0.5)'` | `colors.overlay` (alpha 17% 흡수, 위험 LOW) | DeleteTracksSheet L209 |

> **주의 — task 05/06 머지 후 상태 가정**: 본 task PR 진입 시점에서 task 05/06 plan 의 "보류 hex" 군 (`#5A8A6A` 2회 / `#FF6B6B` 1회 / `#E0B070` 1회) 가 task 05/06 의 머지 후 코드에 *임시 hex 또는 TODO 주석* 으로 남아 있어야 함. 본 task engineer 가 그 위치 4 hex 도 일괄 교체.
>
> 만약 task 05/06 가 보류 hex 를 *주석 + 임시 hex* 로 처리한 경우 — engineer 가 본 task PR 에서 *해당 임시 hex 와 TODO 주석 모두 제거*.

### 4.4 tokens.test.ts 갱신

```ts
const REQUIRED_KEYS: (keyof ColorTokens)[] = [
  // ─── 기존 15 (변경 X) ───
  'accentPrimary', 'accentSecondary', 'bgPrimary', 'bgDeep',
  'surface', 'surfaceHigh', 'textPrimary', 'textSecondary',
  'border', 'destructive', 'success', 'overlay',
  'accentPrimary14', 'accentPrimary20', 'accentPrimary33',
  // ─── task 04 신규 9 (변경 X) ───
  'textHighlight', 'textBody', 'textBodyHigh', 'textBodyMuted',
  'textOnAccent', 'textMuted', 'interactive', 'destructiveBg',
  'toastBg',
  // ─── task 08 신규 3 ───
  'successMuted', 'errorText', 'warning',
];

// 키셋 카운트 변경: 24 → 27
it('ColorTokens 필수 키 27개를 모두 포함한다', () => {
  for (const key of REQUIRED_KEYS) {
    expect(darkColors).toHaveProperty(key);
    expect(lightColors).toHaveProperty(key);
  }
});

// darkColors 신규 3 토큰 정확 hex assertion
describe('darkColors — 신규 토큰 hex 값 (task 08 shared-components)', () => {
  it('successMuted: #5A8A6A', () => expect(darkColors.successMuted).toBe('#5A8A6A'));
  it('errorText: #FF6B6B', () => expect(darkColors.errorText).toBe('#FF6B6B'));
  it('warning: #E0B070', () => expect(darkColors.warning).toBe('#E0B070'));
});

// lightColors 신규 3 토큰 정확 hex assertion (architect 1차 결정값)
describe('lightColors — 신규 토큰 hex 값 (task 08 shared-components)', () => {
  it('successMuted: #3E6749', () => expect(lightColors.successMuted).toBe('#3E6749'));
  it('errorText: #C0392B (= destructive 흡수)', () => {
    expect(lightColors.errorText).toBe('#C0392B');
    expect(lightColors.errorText).toBe(lightColors.destructive);
  });
  it('warning: #A07840', () => expect(lightColors.warning).toBe('#A07840'));
});
```

> 기존 darkColors 27 hex it + lightColors 27 hex it 그대로 유지 (변경 X).

### 4.5 shared-components-processed-hex-map.test.ts (신규 회귀 테스트)

```ts
/**
 * task 08 shared-components
 *
 * 6 대상 파일 (JustArrivedMasterCard / DeleteTracksSheet / GeneratingFailureView /
 * GeneratingTimeoutNotice / VolumeSlider / AlbumArtRotating) 에서:
 * (1) 본 task 가 토큰화한 hex 11종 + rgba 1종 이 *문자열 리터럴* 위치에 0건
 * (2) 신규 3 토큰 (`colors.successMuted` / `colors.errorText` / `colors.warning`)
 *     중 ≥1 회 참조 (DeleteTracksSheet — successMuted + errorText)
 *
 * task 09 (hex-lint) 도입 전까지의 회귀 방지선.
 */
import * as fs from 'fs';
import * as path from 'path';

const TARGET_FILES = [
  'src/components/JustArrivedMasterCard.tsx',
  'src/components/DeleteTracksSheet.tsx',
  'src/components/GeneratingFailureView.tsx',
  'src/components/GeneratingTimeoutNotice.tsx',
  'src/components/VolumeSlider.tsx',
  'src/components/AlbumArtRotating.tsx',
];

const REPLACED_HEX_LITERALS = [
  '#0D0F1A', '#1A1D30', '#1A1D2E', '#1E2540',
  '#21253E', '#2A2E48', '#3A3D58',
  '#5A7AA8', '#7B80A0', '#C49A8A', '#EEF0F8',
  '#5A8A6A', '#FF6B6B', '#E0B070',
];
const REPLACED_RGBA = 'rgba(0, 0, 0, 0.5)';

describe('task 08 shared-components — 6 대상 파일 hex 잔존 0', () => {
  for (const rel of TARGET_FILES) {
    it(`${rel}: 처리 hex 14종 + rgba 0건 (문자열 리터럴)`, () => {
      const abs = path.resolve(__dirname, '../../', rel);
      const src = fs.readFileSync(abs, 'utf-8');
      for (const hex of REPLACED_HEX_LITERALS) {
        const re = new RegExp(`['"]${hex}['"]`, 'gi');
        const matches = src.match(re);
        if (matches !== null) {
          throw new Error(`${rel}: ${hex} 잔존 ${matches.length}건 — engineer 가 교체 누락`);
        }
        expect(matches).toBeNull();
      }
      expect(src.includes(`'${REPLACED_RGBA}'`)).toBe(false);
      expect(src.includes(`"${REPLACED_RGBA}"`)).toBe(false);
    });
  }
});

describe('task 08 shared-components — DeleteTracksSheet 신규 토큰 참조 검증', () => {
  it('DeleteTracksSheet — successMuted + errorText 참조', () => {
    const abs = path.resolve(
      __dirname, '../..', 'src/components/DeleteTracksSheet.tsx',
    );
    const src = fs.readFileSync(abs, 'utf-8');
    expect(src.includes('colors.successMuted')).toBe(true);
    expect(src.includes('colors.errorText')).toBe(true);
  });
});

// PRD 명시 11 컴포넌트 중 이미 hex 0 인 10 파일 회귀 방지
describe('task 08 shared-components — PRD 명시 useTheme 채택 10 파일 hex 0 유지', () => {
  const UNCHANGED_FILES = [
    'src/components/CompletedTrackCard.tsx',
    'src/components/MasterAudioCard.tsx',
    'src/components/EmptyMastersState.tsx',
    'src/components/SongListItem.tsx',
    'src/components/TrackCard.tsx',
    'src/components/MiniPlayer.tsx',
    'src/components/TimerBottomSheet.tsx',
    'src/components/TrialBadge.tsx',
    'src/components/TrialExpiryBanner.tsx',
    'src/components/EmptyTrackState.tsx',
  ];
  for (const rel of UNCHANGED_FILES) {
    it(`${rel}: 6자리 hex 잔존 0`, () => {
      const abs = path.resolve(__dirname, '../..', rel);
      const src = fs.readFileSync(abs, 'utf-8');
      const matches = src.match(/['"]#[0-9A-Fa-f]{6}['"]/g);
      expect(matches).toBeNull();
    });
  }
});
```

## 5. 핵심 로직 (의사코드)

### 5.1 Phase 1 — tokens.ts 갱신 (단일 파일)

```
1. ColorTokens 타입에 신규 3 토큰 (successMuted/errorText/warning) 추가 (4.1)
2. darkColors 객체에 신규 3 hex 추가 (4.2 darkColors)
   ── 발견 hex 그대로 (다크 회귀 0)
3. lightColors 객체에 신규 3 hex 추가 (4.2 lightColors)
   ── architect 1차 결정값 (§3.3.1)
4. tokens.test.ts 갱신:
   ── REQUIRED_KEYS 3 추가 (총 27)
   ── '24개' 문자열 → '27개' 갱신
   ── darkColors 신규 3 hex assertion 3 it 추가
   ── lightColors 신규 3 hex assertion 3 it 추가 (errorText = destructive 흡수 명시)
5. jest 실행 → tokens.test.ts GREEN 확인
```

### 5.2 Phase 2 — 대표 1 파일 의사코드 (JustArrivedMasterCard.tsx)

```tsx
// Before
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

interface Props { songKey: string; onPlay: () => void; onDismiss: () => void; }

export default function JustArrivedMasterCard({ songKey: _songKey, onPlay, onDismiss }: Props) {
  return <View style={styles.card}>...</View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#1E2540', borderColor: '#5A7AA8', ... },
  label: { color: '#EEF0F8', ... },
  // ...
});

// After
import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@hooks/useTheme';
import type { ColorTokens } from '@theme/tokens';

interface Props { songKey: string; onPlay: () => void; onDismiss: () => void; }

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: colors.surfaceHigh,  // 1E2540 → surfaceHigh (3dp 흡수)
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.accentPrimary,    // 5A7AA8 → accentPrimary
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  textArea: { flex: 1 },
  label: { color: colors.textPrimary, fontSize: 15, fontWeight: '600', marginBottom: 2 },
  sub: { color: colors.textSecondary, fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  playBtn: {
    backgroundColor: colors.accentPrimary,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  playBtnText: { color: colors.bgPrimary, fontSize: 14, fontWeight: '600' },
  dismissText: { color: colors.textSecondary, fontSize: 13 },
});

export default function JustArrivedMasterCard({ songKey: _songKey, onPlay, onDismiss }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.card}>
      <View style={styles.textArea}>
        <Text style={styles.label}>방금 도착했어요!</Text>
        <Text style={styles.sub}>자장가가 완성됐어요</Text>
      </View>
      <View style={styles.actions}>
        <Pressable style={styles.playBtn} onPress={onPlay} accessibilityLabel="자장가 재생">
          <Text style={styles.playBtnText}>재생</Text>
        </Pressable>
        <Pressable onPress={onDismiss} accessibilityLabel="닫기" hitSlop={8}>
          <Text style={styles.dismissText}>닫기</Text>
        </Pressable>
      </View>
    </View>
  );
}
```

### 5.3 Phase 2 — 나머지 5 파일 동일 패턴

```
for each file in [DeleteTracksSheet, GeneratingFailureView, GeneratingTimeoutNotice, VolumeSlider, AlbumArtRotating]:
  1. import { useTheme } from '@hooks/useTheme'  +  import type { ColorTokens } from '@theme/tokens'  추가
  2. const styles = StyleSheet.create({...}) → const makeStyles = (colors: ColorTokens) => StyleSheet.create({...})
     (AlbumArtRotating 만 — factory 채택하지 않고 inline 옵션 A — 1 속성 한정 §3.1.1)
  3. 함수 본문 최상단에 useTheme + useMemo(makeStyles) 추가
     (AlbumArtRotating 만 useTheme + inline style)
  4. 4.3 매핑 표대로 hex 1행씩 치환
  5. file-by-file grep 검증 (위 9 hex + 신규 3 hex + rgba = 14 패턴 / hex 0건)
```

### 5.4 Phase 2 (b) — task 05/06 보류 hex 후처리 (4 위치)

```
1. RecordScreen.tsx L437  '#E0B070' → colors.warning   (TODO 주석 제거)
2. RecordScreen.tsx L457  '#5A8A6A' → colors.successMuted   (TODO 주석 제거)
3. S11PreviewScreen.tsx L338  '#FF6B6B' → colors.errorText   (TODO 주석 제거)
4. S11PreviewScreen.tsx L357  '#5A8A6A' → colors.successMuted   (TODO 주석 제거)
```

> 본 task PR 진입 시점에서 task 05/06 plan 의 "보류 hex" 처리 방식 확인. 본 task §10.7 참조.

### 5.5 검증 절차

```
1. jest run:
   - tokens.test.ts (기존 + 신규 it 모두 GREEN — 24 → 27 키)
   - shared-components-processed-hex-map.test.ts (신규 — 6 파일 hex 0 + DeleteTracksSheet 신규 토큰 참조 + 10 파일 hex 0 유지)
   - 기존 모든 테스트 (auth-onboarding / paywall / settings-deletion / useTheme / typography) GREEN 회귀 0
2. 시각 검증 (manual — REQ-009~012):
   - 다크 모드: 6 파일 컴포넌트 진입 + task 05/06 화면 (Record / S11) 진입 → Epic 12 작업 전 캡처와 동일 (회귀 0)
   - 라이트 모드: 6 파일 + task 05/06 화면 진입 → §3.3.1 라이트 결정값이 베이지 팔레트 위 가독성 OK
3. 잔여 hex grep:
   - apps/mobile/src/ 전체 `grep -rE '#[0-9A-Fa-f]{6}' --include='*.ts' --include='*.tsx'` (테스트/tokens.ts 제외)
   - 본 task PR 머지 후 잔여 = 4 매치 (`#82B090` RecordGuide L302/L310 + `#FF4444` RecordScreen L497/L505)
   - 잔여 = task 09 (hex-lint) 책임 — 본 task 종결 X
```

## 6. 다른 모듈과의 경계

- **상위 의존**: `@theme/tokens` (변경 = 본 task Phase 1), `@hooks/useTheme` (변경 0).
- **하위 의존 (Phase 2 적용 대상)**: 6 컴포넌트 파일 + 2 화면 파일 (task 05/06 보류 hex 후처리). 본 task 가 *교체만* — Props/렌더 동작 변경 0.
- **호출부 영향**: JustArrivedMasterCard (S06HomeScreen 호출) / DeleteTracksSheet (S16SettingsScreen 호출) / GeneratingFailureView / GeneratingTimeoutNotice (S12GeneratingScreen 호출) / VolumeSlider (S13PlayScreen 호출) / AlbumArtRotating (S13PlayScreen 호출) — 호출부 변경 0 (Props 시그니처 유지).
- **graceful 동작**: 본 task 의 신규 토큰 3종은 ColorTokens 타입 *필수* (옵셔널 X) → useTheme 호출자 모두 자동 노출. 부재 graceful 불필요.
- **Breaking Change 검토**:
  - ColorTokens 타입 확장 → 기존 useTheme 호출자 영향 0 (TypeScript = 추가 키 접근 시점에만 검사). 호출 변경 0.
  - tokens.ts 의 기존 24 토큰 hex 변경 0 → task 01~07 처리 분 시각 회귀 0.
  - 6 컴포넌트 + 2 화면 파일 props 시그니처 / export / navigation 변경 0.
  - **Breaking Change = 없음**.
- **역방향 cascade 필요 시 DIP interface**: 불필요 (단방향 — 컴포넌트가 tokens.ts 를 import).
- **의존 부재 graceful**: useTheme 부재 시 ColorTokens 반환 보장 (`useTheme.ts` 기존 동작) — 영향 0.

## 7. 테스트 환경 영향

- 기존 jest 테스트 영향 0 (tokens.test.ts 만 갱신, 다른 테스트는 ColorTokens 의 *추가* 키만 인지).
- 신규 테스트 1개 (`shared-components-processed-hex-map.test.ts`) — 회귀 방지선. fs.readFileSync 기반 source 파싱 (jest 표준 패턴 — task 01 의 `auth-onboarding-no-raw-hex.test.ts` + task 04 의 `missing-tokens-applied.test.ts` 차용).
- task 09 (hex-lint) 도입 후 본 테스트가 부분 중복 → task 09 head 에서 통합 결정 (architect MODULE_PLAN task 09 책임).

## 8. 모듈 = 테스트 단위 정합 (self-check)

1. **테스트 단위 정합**:
   - tokens.ts 갱신 → tokens.test.ts 의 키셋 27 + hex assertion (기존 24×2 + 신규 3×2 = 54 hex it) 으로 명확 PASS/FAIL.
   - 6 컴포넌트 교체 → shared-components-processed-hex-map.test.ts 의 hex grep + 토큰 참조 grep 으로 명확 PASS/FAIL.
   - PRD 명시 10 미변경 파일 → 동 test 의 hex 0 유지 it 10 으로 회귀 명확 PASS/FAIL.
   - task 05/06 보류 hex 후처리 → 본 task §4.3 매핑 표대로 4 위치 교체 (이는 본 task 의 회귀 테스트가 직접 검증하지 X — task 05/06 의 회귀 테스트 (`m1a-core-flow-screens-processed-hex-map.test.ts` 가정) + 본 task 의 신규 토큰 참조 검증으로 보장).
   - 변경 이유 단일 ("공유 컴포넌트 일괄 + 누적 보류 흡수") — SRP 충족.
2. **의존성 묶음 정합**:
   - 의존 = `@theme/tokens` + `@hooks/useTheme` (단일 단방향).
   - 단독 lifecycle = tokens.ts 만 갱신 시 → ColorTokens 신규 키 3개 unused 잠시 존재. dead code 잠시 발생. Phase 2 1 PR 통합 시 dead code 0 (옵션 A 결정).
3. **테스트 가능성 ✓** — 모듈 분할/통합 권유 0.

## 9. 수용 기준

| ID | 내용 | 검증 방법 | 통과 조건 |
|---|---|---|---|
| REQ-001 | ColorTokens 타입에 신규 3 토큰 (`successMuted`, `errorText`, `warning`) 추가 | (TEST) | `pnpm --filter mobile test src/__tests__/theme/tokens.test.ts -t "ColorTokens 필수 키 27개"` PASS |
| REQ-002 | darkColors 신규 3 토큰 hex = task 05/06/본 task 발견 hex 그대로 (회귀 0) | (TEST) | `pnpm --filter mobile test src/__tests__/theme/tokens.test.ts -t "darkColors — 신규 토큰 hex 값 \(task 08"` → 3/3 PASS (`darkColors.successMuted === '#5A8A6A'` / `darkColors.errorText === '#FF6B6B'` / `darkColors.warning === '#E0B070'`) |
| REQ-003 | lightColors 신규 3 토큰 hex = §3.3.1 architect 결정값 (errorText = destructive 흡수) | (TEST) | `pnpm --filter mobile test src/__tests__/theme/tokens.test.ts -t "lightColors — 신규 토큰 hex 값 \(task 08"` → 3/3 PASS (`lightColors.successMuted === '#3E6749'` / `lightColors.errorText === '#C0392B' === lightColors.destructive` / `lightColors.warning === '#A07840'`) |
| REQ-004 | tokens.ts 의 기존 24 토큰 (15 + task 04 신규 9) dark/light hex 변경 X (회귀 0) | (TEST) | `pnpm --filter mobile test src/__tests__/theme/tokens.test.ts` 전체 GREEN — 기존 it 블록 (darkColors 24 hex it + lightColors 24 hex it = 48) 모두 GREEN. 신규 추가 6 it 포함 총 54 it PASS |
| REQ-005 | 본 task 6 대상 파일 (JustArrivedMasterCard / DeleteTracksSheet / GeneratingFailureView / GeneratingTimeoutNotice / VolumeSlider / AlbumArtRotating) 에 처리 hex 14종 + rgba 가 *문자열 리터럴* 위치에 0건 | (TEST) | `pnpm --filter mobile test src/__tests__/theme/shared-components-processed-hex-map.test.ts -t "6 대상 파일 hex 잔존 0"` → 6/6 파일 PASS (각 파일 14 hex regex match 0 + rgba 0) |
| REQ-006 | DeleteTracksSheet 에 신규 토큰 참조 `colors.successMuted` + `colors.errorText` ≥1 회 | (TEST) | `pnpm --filter mobile test src/__tests__/theme/shared-components-processed-hex-map.test.ts -t "DeleteTracksSheet 신규 토큰 참조"` PASS |
| REQ-007 | PRD 명시 useTheme 채택 10 컴포넌트 (CompletedTrackCard / MasterAudioCard / EmptyMastersState / SongListItem / TrackCard / MiniPlayer / TimerBottomSheet / TrialBadge / TrialExpiryBanner / EmptyTrackState) 의 hex 0 유지 (본 task 회귀 방지) | (TEST) | `pnpm --filter mobile test src/__tests__/theme/shared-components-processed-hex-map.test.ts -t "PRD 명시 useTheme 채택 10 파일 hex 0 유지"` → 10/10 파일 PASS (6자리 hex 문자열 리터럴 match 0) |
| REQ-008 | task 05/06 보류 hex 4 위치 (`RecordScreen.tsx` L437 `#E0B070` / L457 `#5A8A6A` + `S11PreviewScreen.tsx` L338 `#FF6B6B` / L357 `#5A8A6A`) 가 신규 토큰 참조로 교체 + TODO 주석 제거 | (MANUAL) | `grep -En "'#E0B070'\|'#5A8A6A'\|'#FF6B6B'" apps/mobile/src/screens/RecordScreen.tsx apps/mobile/src/screens/S11PreviewScreen.tsx` → 매치 0 + `grep -En "TODO.*task 0[59]\|TODO.*token-define" apps/mobile/src/screens/RecordScreen.tsx apps/mobile/src/screens/S11PreviewScreen.tsx` → 매치 0 + `grep -En "colors\.successMuted\|colors\.errorText\|colors\.warning" apps/mobile/src/screens/RecordScreen.tsx apps/mobile/src/screens/S11PreviewScreen.tsx` → 3+ 매치 |
| REQ-009 | 다크 모드 6 컴포넌트 + 2 화면 시각 회귀 0 — Epic 12 작업 전 캡처와 동일 | (MANUAL) | iOS 시뮬레이터 다크 → S06 (JustArrivedMasterCard pending 복원 mock) / S16 → DeleteTracksSheet (음원 관리) / S12 (생성 실패 mock + timeout mock — GeneratingFailureView + GeneratingTimeoutNotice) / S13 (재생 — VolumeSlider + AlbumArtRotating) / Record + S11 (task 05/06 보류 hex 후처리 검증) 진입 + Epic 12 이전 캡처 비교 → 색상 변화 0 확인 |
| REQ-010 | 라이트 모드 6 컴포넌트 + 2 화면 시각 검증 — 베이지 팔레트 위 가독성 OK | (MANUAL) | 라이트 모드 진입 → S06 JustArrivedMasterCard 카드 surfaceHigh 베이지 + accentPrimary 진남 border + textPrimary 짙은 갈색 텍스트 / S16 → DeleteTracksSheet sheet surface 베이지 + handle border 옅은 베이지 + 삭제 버튼 successMuted 부드러운 녹색 (`#3E6749`) + 전체삭제 errorText 짙은 빨강 (`#C0392B`) / S12 GeneratingFailureView accentPrimary 진남 + accentSecondary 브라운 / S13 VolumeSlider trackBackground 옅은 베이지 + trackFill 진남 + AlbumArtRotating placeholder surface 베이지 / Record warning 황금색 토스트 (`#A07840`) + silenceWarning successMuted (`#3E6749`) / S11 errorText 짙은 빨강 + exhaustedText successMuted → 5/5 가독성 OK |
| REQ-011 | 라이트 모드 *결제 sheet / 삭제 sheet / 재생 컨트롤* 흐름 변경 0 — REQ-009/010 캡처 도중 흐름 검증 | (MANUAL) | 라이트 모드 → S16 → DeleteTracksSheet → 항목 삭제 → 토스트 확인 → 모두 삭제 → 모두 삭제 확인 / S13 → VolumeSlider 드래그 → 볼륨 변경 정상 / S12 → 생성 실패 mock → 재시도 / 홈 이동 클릭 → 정상 흐름 |
| REQ-012 | `apps/mobile/src/` 전체 6자리 hex 잔여 = 4 매치 (`#82B090` RecordGuide L302/L310 + `#FF4444` RecordScreen L497/L505) — task 09 위임 명시 | (MANUAL) | `grep -rEn "#[0-9A-Fa-f]{6}" apps/mobile/src/ --include="*.ts" --include="*.tsx" \| grep -v "__tests__\|__mocks__\|theme/tokens.ts"` → 정확 4 매치 (구체 hex: `#82B090` 2회 + `#FF4444` 2회) — 본 task 가 처리 X, task 09 책임으로 위임 명시 |
| REQ-013 | 직접 색·폰트·간격 리터럴 사용 금지 (본 task 6 대상 파일 한정 — 디자인 토큰 의존성 가드레일) | (TEST) | REQ-005 와 동일 (`shared-components-processed-hex-map.test.ts`) — 6 파일 6자리 hex 0 + rgba 0 + (보조) `grep -rEn "[0-9]+px\|[0-9]+rem" apps/mobile/src/components/JustArrivedMasterCard.tsx ...` 매치 0 |
| REQ-014 | 본 task 의 6 컴포넌트 모두 useTheme 채택 — useTheme import + `useTheme()` 호출 ≥1 회 | (TEST) | `pnpm --filter mobile test src/__tests__/theme/shared-components-processed-hex-map.test.ts` 내 `useTheme` import 검증 추가 또는 `grep -lE "import.*useTheme" apps/mobile/src/components/{JustArrivedMasterCard,DeleteTracksSheet,GeneratingFailureView,GeneratingTimeoutNotice,VolumeSlider,AlbumArtRotating}.tsx` = 6/6 파일 |

## 10. 주의사항

### 10.1 DB 영향도

**없음** — 색상 토큰만 변경. DDL/마이그레이션 0. `docs/db-schema.md` 참조 변경 0.

### 10.2 외부 SDK 영향도

- **react-native-purchases (RevenueCat)**: 변경 0.
- **AdMob (rewardedAdService)**: 변경 0.
- **AudioEngine**: 변경 0.
- **AsyncStorage**: 변경 0 (DeleteTracksSheet 가 AsyncStorage 사용하지만 본 task 가 색상만 변경).
- **expo-file-system**: 변경 0.
- **react-navigation**: 변경 0.
- **accountApi / dataManagementApi**: 변경 0 (DeleteTracksSheet 가 사용하지만 본 task 가 색상만 변경).

### 10.3 회귀 위험 + 완화

- **위험 1 (HIGH — 라이트 hex 결정 1차 추정)**: §3.3.1 라이트 hex 3개가 architect 1차 추정 (디자이너 부재 컨텍스트). 시각 검수 시 어색 가능.
  - **완화**: REQ-010 라이트 캡처에서 디자이너 합의 항목 표시. 합의 결과 다른 hex 결정 시 tokens.ts lightColors 1줄 수정 → 자동 반영. roll-back 비용 LOW. 별도 PR 가능.
- **위험 2 (MEDIUM — `successMuted` 라이트값 가독성)**: `#3E6749` (베이지 위 부드러운 녹색) 가 *삭제 액션 텍스트* 로 인식 가능? success 와 헷갈리지 X?
  - **완화**: REQ-010 DeleteTracksSheet 진입 시각 검증. 어색 시 채도 ↑ (`#2A6038` 등) 또는 destructive 와 흡수 검토.
- **위험 3 (MEDIUM — `errorText` 라이트=destructive 흡수)**: 라이트 모드에서 `errorText` 와 `destructive` 가 *동일 시각* 의도. 이는 디자인 결정 — 코드상 별도 토큰 존재하지만 *시각상 동일*. 다크에서만 별도 톤.
  - **완화**: REQ-010 캡처 + 디자이너 합의. 합의 결과 분리 필요 시 lightColors.errorText hex 변경.
- **위험 4 (MEDIUM — `warning` 라이트값 베이지 충돌)**: `#A07840` (짙은 황금) 이 라이트 베이지 (`#FBF7F0`) 와 *너무 비슷*? 토스트 (BGM 실패 알림) 가능시 가독성 LOW.
  - **완화**: REQ-010 Record 화면 BGM 실패 mock 토스트 진입 검증. 어색 시 채도 ↑ 또는 다른 hex 검토.
- **위험 5 (LOW — `#3A3D58` border 흡수 16dp 차이)**: §3.2.2 결정 — DeleteTracksSheet handle 바 `#3A3D58` → `border` 흡수. 16dp 시각 식별 가능.
  - **완화**: REQ-009 다크 모드 DeleteTracksSheet 진입 시각 검수. 어색 시 별도 PR 로 신규 토큰 `handleIndicator` 분리 (본 task 막지 X).
- **위험 6 (LOW — `#1E2540` surfaceHigh 흡수 3dp 차이)**: §3.2.2 결정 — JustArrivedMasterCard card `#1E2540` → `surfaceHigh` 흡수. 3dp 시각 식별 거의 X.
  - **완화**: REQ-009 S06 진입 시각 검수. 어색 시 별도 PR 로 분리 가능.
- **위험 7 (LOW — `rgba(0,0,0,0.5)` overlay 흡수 alpha 17%)**: §3.2.2 결정 — DeleteTracksSheet backdrop `rgba(0,0,0,0.5)` → `overlay` 흡수. 다크 alpha 17% 차이 시각 약함, 라이트 alpha 10% 차이.
  - **완화**: REQ-010 라이트 모드 DeleteTracksSheet 진입 시각 검수. 라이트 베이지 위 backdrop 가독성 OK 인지 확인. 어색 시 별도 PR 로 `overlayLight` 토큰 분리.
- **위험 8 (MEDIUM — task 05/06 보류 hex 후처리 누락)**: 본 task engineer 가 §5.4 의 4 위치 (RecordScreen L437/L457 + S11PreviewScreen L338/L357) 후처리 누락 시 — 본 task 회귀 테스트가 직접 검증하지 X (대상 파일 외).
  - **완화**: REQ-008 manual grep 으로 강제 검증. + REQ-012 `apps/mobile/src/` 전체 잔여 hex 4 매치 정합 (만약 누락 시 잔여 hex ≥ 4 + 누락 위치 식별).
- **위험 9 (LOW — DeleteTracksSheet `successMuted` 의미 정합)**: 다크의 `#5A8A6A` 가 *deleteBtn 텍스트* 로 사용 중 — task 06 의 *exhaustedText* (S11 무료 한도 소진) / task 05 의 *silenceWarning* (녹음 무음 경고) 와 의미 그룹 정합? 셋 다 "*muted success-like 톤*" 으로 묶기 적절한지.
  - **분석**: 셋 모두 "*경고/안내성 텍스트 — 너무 강하지 않은 톤*" 의도. 시각 의도 정합. 단 의미상 `successMuted` 토큰명이 *삭제* 액션과 약간 어색 — 대안 `mutedAccent` / `infoText` 검토. 토큰명 결정은 시각 의도가 우선 (코드 SSOT) → `successMuted` 유지. 디자이너 검수 시 토큰명 별도 PR 변경 가능.

### 10.4 PR 후 시각 회귀 발견 시 rollback 절차

- `git revert <머지 커밋>` 단일 커밋. tokens.ts 3 토큰 + 6 컴포넌트 + 2 화면 후처리 통째 원복. tokens.test.ts 갱신 + shared-components-processed-hex-map.test.ts 신규도 동시 원복.
- 영향 범위 = tokens.ts + 6 컴포넌트 + 2 화면. task 01~07/09 영향 0.
- 단 *일부 라이트 hex 만* 조정 시 = revert 불필요. tokens.ts lightColors 1줄 수정 → 자동 반영.

### 10.5 PR 단위 권장

- **1 PR (Phase 1 + Phase 2 + 2 화면 후처리)** — §3.7 옵션 A.
- 커밋 분할:
  1. tokens.ts 3 토큰 정의 (Phase 1)
  2. tokens.test.ts 27 키 + 신규 hex assertion 6 it 추가
  3. JustArrivedMasterCard useTheme + factory + 7 hex 교체
  4. DeleteTracksSheet useTheme + factory + 9 hex + rgba 교체
  5. GeneratingFailureView useTheme + factory + 5 hex 교체
  6. GeneratingTimeoutNotice useTheme + factory + 4 hex 교체
  7. VolumeSlider useTheme + factory + 3 hex 교체
  8. AlbumArtRotating useTheme + inline + 1 hex 교체
  9. RecordScreen L437/L457 task 05 보류 hex 후처리 + TODO 주석 제거
  10. S11PreviewScreen L338/L357 task 06 보류 hex 후처리 + TODO 주석 제거
  11. shared-components-processed-hex-map.test.ts 신규
  = 총 11 커밋 권장.

### 10.6 task 09 (hex-lint) 와의 관계

본 task 의 `shared-components-processed-hex-map.test.ts` = **6 대상 파일 + 10 미변경 파일 한정** 회귀 방지선. task 09 (`09-regression-test-jest-hex-lint.md`) = **앱 전체 hex-lint** 도입 책임. 본 task PR 머지 시점에서 잔여 hex = 4 매치 (`#82B090` RecordGuide L302/L310 + `#FF4444` RecordScreen L497/L505). task 09 머지 시점에 그 4 매치 처리 + 통합 회귀 방지선 완성.

> task 09 architect 가 본 task 의 `shared-components-processed-hex-map.test.ts` 를 제거 또는 흡수 결정. 본 task 는 그 결정을 *제약하지 X*.

### 10.7 task 05/06 의 TODO 주석 모두 제거

본 task 의 Phase 2 (b) 작업자 (engineer) 는 4 위치 (`RecordScreen.tsx` L437/L457 + `S11PreviewScreen.tsx` L338/L357) 의 `// TODO(task 09 token-define)` 또는 `// TODO(task 0[59])` 주석 *모두 제거*. 보류가 해소되었으므로 주석이 의미 잃음. REQ-008 grep `TODO\(task 09\|TODO\(task 0[59]` = 0 건 확인 (해당 4 위치 한정).

> 만약 task 05/06 가 보류 hex 를 *주석 + 임시 hex* 로 박지 않고 *원본 hex 그대로* 두었다면 (예: factory 내 `silenceWarning: '#5A8A6A'`) — engineer 가 그 hex 그대로 발견 후 토큰 참조로 교체 + 주석 없으면 생성하지 X.

### 10.8 AlbumArtRotating 의 useTheme 부재 시 fallback

본 task §3.1.1 옵션 A 채택 — AlbumArtRotating 의 단일 hex (`#1A1D30` placeholder) 를 inline `colors.surface` 로 변경. *URI 로드 전 placeholder 색상* 의도 → `colors.surface` 가 다크/라이트 양쪽 화면 surface 와 동일 = 자연스럽게 묻혀 보임 (placeholder 의도 정합). 단 다크/라이트 차이로 placeholder 색이 *변동* — 의도 보존? 검토: 다크 surface `#1A1D30` (현재 hex 그대로) / 라이트 surface `#E8E0D4` (베이지) → 라이트 모드에서 앨범 아트 placeholder 가 *옅은 베이지* 로 변경 = 라이트 S13PlayScreen 배경과 자연 정합. 의도 보존.

### 10.9 6 컴포넌트 모두 useTheme 채택 — 호출부 영향

- JustArrivedMasterCard: S06HomeScreen 의 `<JustArrivedMasterCard songKey=... onPlay=... onDismiss=... />` 호출 변경 0 (Props 시그니처 유지)
- DeleteTracksSheet: S16SettingsScreen 의 `<DeleteTracksSheet tracks=... onClose=... />` 호출 변경 0
- GeneratingFailureView / GeneratingTimeoutNotice: S12GeneratingScreen 호출 변경 0
- VolumeSlider: S13PlayScreen 의 `<VolumeSlider value=... disabled=... onChange=... />` 호출 변경 0
- AlbumArtRotating: S13PlayScreen 호출 변경 0

→ 호출부 6 곳 모두 변경 0 = Breaking Change 0.

## 11. 의존성

- **선행 task**: task 07 (`07-m1c-back-nav-hook.md`) — task 05/06/07 머지 후 본 task 진입. 본 task 의 §5.4 (task 05/06 보류 hex 후처리) 가 task 05/06 머지 후 코드 상태 가정. 본 task base = task 07 머지 후 main 최신.
- **선행 task 04**: `04-missing-tokens-define-and-apply.md` — task 04 정의 9 토큰 (textHighlight 등) 위에 본 task 신규 3 토큰 추가. 본 task 가 task 04 의 신규 토큰 *변경 X*.
- **후행 task 09**: hex-lint 회귀 테스트 + 잔여 hex 4 매치 (`#82B090` ×2 + `#FF4444` ×2) 최종 처리. 본 task 의 `shared-components-processed-hex-map.test.ts` 통합 또는 별도 유지 결정.
- **외부**: 없음.

## 12. 게이트 self-check (architect/module-plan SOP 12 항목)

| # | 항목 | 충족 | 비고 |
|---|---|---|---|
| 1 | 생성/수정 파일 목록 확정 | ✓ | §2 — tokens.ts + tokens.test.ts + 6 컴포넌트 + 2 화면 후처리 + shared-components-processed-hex-map.test.ts (신규) |
| 2 | 인터페이스 TypeScript 타입 명시 | ✓ | §4.1 ColorTokens 신규 3 토큰 + §4.2 darkColors/lightColors hex |
| 3 | 의존 모듈 실제 인터페이스 직접 확인 | ✓ | tokens.ts (15+9=24 토큰) / useTheme.ts / 6 컴포넌트 hex 전수 grep (29 매치) / PRD 명시 10 파일 useTheme 채택 + hex 0 직접 검증 / task 04 plan 신규 9 토큰 직접 read / task 05/06 plan 의 보류 hex 4 위치 인용 |
| 4 | 에러 처리 명시 | ✓ | useTheme 항상 valid ColorTokens (변경 0). tokens.test.ts 갱신 시 카운트 mismatch 발견 시 즉시 RED |
| 5 | 페이지 전환·상태 초기화 순서 | N/A | 본 task = 색상 토큰 + 교체. 화면 동작 변경 0 |
| 6 | DB 영향도 분석 | ✓ | 없음 (§10.1) |
| 7 | Breaking Change 검토 | ✓ | 없음 (§6 + §10.9) — ColorTokens 타입 *추가* 만, 기존 24 키 변경 0. Props 시그니처 6 컴포넌트 모두 보존 |
| 8 | 핵심 로직 의사코드 | ✓ | §5 (Phase 1 5단계 + Phase 2 대표 1 파일 의사코드 + Phase 2(b) 보류 hex 후처리 4 위치 + 검증 3단계) |
| 9 | TypeScript 타입 정합 | ✓ | ColorTokens 3 신규 키 모두 string (옵셔널 X). useTheme 자동 노출 |
| 10 | import 완전성 | ✓ | tokens.ts 변경, 6 컴포넌트 모두 `useTheme` + `ColorTokens` import 신규 추가 (§5.2 의사코드 명시). 2 화면 (task 05/06 보류 후처리) 는 이미 task 05/06 에서 useTheme import 됨 — import 추가 X. shared-components-processed-hex-map.test.ts 의 fs/path import 명시 |
| 11 | 수용 기준 + 메타데이터 | ✓ | §9 표 14 행 (REQ-001 ~ REQ-014) + frontmatter |
| 12 | 모듈 = 테스트 단위 정합 | ✓ | §8 self-check 3 항목 모두 ✓ |

추가 게이트 (epic-12 한정):
- **system-design §8 Option α 정합**: ✓ NN=08, 슬러그 = `shared-components` (system-design impl 목차 표 행과 정확 일치). 의존 = task 05+06+07.
- **누적 보류 hex 흡수 결정 명시**: ✓ §3.2.4 (보류 2 / task 09 위임) + §3.3 (신규 3 토큰 정의 + 5 위치 흡수). mode prompt §"누적 보류 hex 처리" 자율 판단 결과 명시.
- **다크 회귀 0**: ✓ §3.5 + REQ-002 (다크 hex = 발견 hex 그대로) + REQ-009 (시각 검증).
- **라이트 1차 결정값 근거**: ✓ §3.3.1 (팔레트 정합 + 의도 보존 3 항목 인용 + errorText 흡수 명시).
- **PRD 명시 10 컴포넌트 미변경 회귀 방지**: ✓ §2.0 + REQ-007 + `shared-components-processed-hex-map.test.ts` describe 블록 3.
- **AC-1 (`apps/mobile/src/` hex 0건)**: 본 task 머지 후 잔여 = 4 매치 (`#82B090` ×2 + `#FF4444` ×2). 0 건 충족은 task 09 책임 — 본 task §1 + REQ-012 명시.
- **디자인 토큰 의존성 가드레일** (mode prompt §): 본 task = tokens.ts 정의 task → tokens.ts 본문은 직접 hex 사용 정당. 6 컴포넌트 적용에서는 hex 0건 강제 (REQ-005/013). 폰트·간격 리터럴도 자유 변경 0 (본 task = 색상 변경 한정).

---

## 13. 결론 + 권장 다음 단계

본 module-plan 은 system-design §8 Option α 재정렬에 따라 task 08 (`shared-components`) 의 본문을 채운 산출물이다. **Phase 1 = `tokens.ts` 에 ColorTokens 신규 3 토큰 (`successMuted` / `errorText` / `warning`) 추가 + darkColors / lightColors 양쪽 hex 정의** + tokens.test.ts 갱신 (24 → 27 키). **Phase 2 = 6 공유 컴포넌트 파일 (JustArrivedMasterCard 7 + DeleteTracksSheet 9 + GeneratingFailureView 5 + GeneratingTimeoutNotice 4 + VolumeSlider 3 + AlbumArtRotating 1 = 29 hex + rgba 1) 의 hex 일괄 교체** + **Phase 2(b) = task 05/06 보류 hex 4 위치 후처리** (RecordScreen L437/L457 + S11PreviewScreen L338/L357) + 회귀 방지 `shared-components-processed-hex-map.test.ts` 신규.

본 task = "미니 task 04 역할 일부 + 공유 컴포넌트 일괄 정리" — architect 자율 판단 결과 (mode prompt §"누적 보류 hex 처리"). 누적 보류 hex 7 고유종 중 3 종 (`#5A8A6A` / `#FF6B6B` / `#E0B070`) 5 위치 흡수, 잔여 2 종 4 매치 (`#82B090` HeadphoneChip ×2 + `#FF4444` Record stop ×2) 만 task 09 위임. 본 task 머지 후 `apps/mobile/src/` 잔여 hex = 정확 4 매치 — AC-1 (0 건) 최종 충족은 task 09 책임.

PRD 명시 11 컴포넌트 중 10 (CompletedTrackCard / MasterAudioCard / EmptyMastersState / SongListItem / TrackCard / MiniPlayer / TimerBottomSheet / TrialBadge / TrialExpiryBanner / EmptyTrackState) 은 이미 useTheme 채택 + hex 0 직접 검증 완료 — 본 task 변경 없음 (REQ-007 회귀 방지). 본 task 가 실제 변경하는 컴포넌트 = JustArrivedMasterCard + 미명시 5 = **6 파일 / 29 hex 교체** + tokens.ts 3 토큰 추가 + 2 화면 4 위치 후처리.

신규 3 토큰 다크 hex = task 05/06/본 task 발견 hex 그대로 (회귀 0). 라이트 hex = architect 1차 추정 (§3.3.1 팔레트 정합 + 의도 보존 근거 — `errorText` 라이트는 destructive 흡수 명시). PR 단위 = Phase 1 + Phase 2 + Phase 2(b) = 1 PR (옵션 A) 권장. 변경 라인 수 ~120~150. 11 커밋 분할.

DB / API / 외부 SDK / navigation / Breaking Change 영향 0. ColorTokens 타입 추가 키 3개만 → 기존 useTheme 호출자 영향 0. 6 컴포넌트 Props 시그니처 모두 보존. 14 게이트 + epic-12 추가 7 게이트 모두 통과. **상태 = READY_FOR_IMPL**.

권장 다음 단계 — system-design §8 impl 목차의 마지막 행 = task 09 (`09-regression-test-jest-hex-lint.md`) MODULE_PLAN 호출. task 09 가 (a) `apps/mobile/src/` 전체 hex-lint 도입 + (b) 본 task 잔여 4 매치 (`#82B090` ×2 + `#FF4444` ×2) 최종 처리 결정 (예외 등재 vs 신규 토큰 정의 vs 일괄 흡수) 책임. 본 task 의 `shared-components-processed-hex-map.test.ts` 와 task 04 의 `missing-tokens-applied.test.ts` 와 task 01 의 `auth-onboarding-no-raw-hex.test.ts` 를 task 09 hex-lint 가 통합 또는 별도 유지 결정. impl-task-loop 진입 시점 — task 09 가 마지막 task.
