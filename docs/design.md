---
version: alpha
name: 자장 (Jajang)
description: |
  부모가 자신의 목소리로 부른 자장가를 0~3세 아기에게 들려주는 RN + FastAPI 앱.
  핵심 가치 "AI clone 이 아닌 진짜 부모가 직접 부른" — 1 loop 녹음 + 서버 DSP 후처리.
  사용 맥락: 야간 침실 / 한 손 조작 / 아기 잠드는 동안 (Premium·트라이얼 시 백그라운드).
  톤: 미드나이트 다크 퍼스트, 낮은 채도/명도 대비, Anti-AI-Smell (보라·인디고·무지개 금지),
  부드러운 동사형 구어체 voice. 라이트 모드는 보조 — 따뜻한 베이지/오프화이트 + 다크 슬레이트 텍스트.

theme-modes:
  default: dark
  policy: |
    다크 퍼스트. 시스템 prefer light 일 때만 라이트 적용. 유저 강제 override (settings) 가능.
    토큰 SSOT: `apps/mobile/src/theme/tokens.ts` (darkColors / lightColors)
    런타임 분기: `apps/mobile/src/hooks/useTheme.ts`

colors:
  dark:
    bg-primary:        "#0D0F1A"
    bg-deep:           "#12152B"
    surface:           "#1A1D30"
    surface-high:      "#21253E"
    accent-primary:    "#5A7AA8"
    accent-secondary:  "#C49A8A"
    text-primary:      "#EEF0F8"
    text-secondary:    "#7B80A0"
    border:            "#2A2E48"
    destructive:       "#E85A5A"
    success:           "#6BCB77"
    overlay:           "#000000AA"
    accent-primary-14: "#5A7AA824"
    accent-primary-20: "#5A7AA833"
    accent-primary-33: "#5A7AA855"
  light:
    bg-primary:        "#FBF7F0"
    bg-deep:           "#F0EAE0"
    surface:           "#E8E0D4"
    surface-high:      "#DDD4C6"
    accent-primary:    "#3A5A88"
    accent-secondary:  "#9A6858"
    text-primary:      "#1C1A18"
    text-secondary:    "#6B6055"
    border:            "#C8BEB0"
    destructive:       "#C0392B"
    success:           "#2E8B44"
    overlay:           "#00000066"
    accent-primary-14: "#3A5A8824"
    accent-primary-20: "#3A5A8833"
    accent-primary-33: "#3A5A8855"

typography:
  display-bold:
    fontFamily: "DMSans_700Bold"
    fontSize:   36
    lineHeight: 1.2
  h1:
    fontFamily: "DMSans_700Bold"
    fontSize:   28
    lineHeight: 1.25
  h2:
    fontFamily: "DMSans_500Medium"
    fontSize:   22
    lineHeight: 1.3
  h3:
    fontFamily: "DMSans_500Medium"
    fontSize:   18
    lineHeight: 1.35
  body:
    fontFamily:    "NotoSansKR_400Regular"
    fontSize:      16
    lineHeight:    1.6
    letterSpacing: 0.2
  caption:
    fontFamily:    "NotoSansKR_400Regular"
    fontSize:      14
    lineHeight:    1.5
    letterSpacing: 0.2
  button-label:
    fontFamily:    "DMSans_500Medium"
    fontSize:      16
    lineHeight:    1.2
    letterSpacing: 0.3
  timer-mono:
    fontFamily:  "DMMono_400Regular"
    fontSize:    22
    lineHeight:  1.2
    fontVariant: ["tabular-nums"]

spacing:
  xs:   4
  sm:   8
  md:  16
  lg:  24
  xl:  32
  xxl: 48

radius:
  sm:    4
  md:    8
  lg:   16
  pill: 28
---

## Overview

자장(Jajang)은 부모가 자신의 목소리로 부른 자장가를 0~3세 아기에게 들려주는 React Native + FastAPI 앱. 핵심 가치는 **"AI clone 이 아닌 진짜 부모가 직접 부른"** 자장가 — 1 loop 따라부르기 녹음 → 서버 DSP 후처리(ffmpeg afftdn/EQ/aecho/acrossfade)로 잡음·EQ·crossfade 정제 → mp3 반환, 클라이언트에서 seamless loop 최대 10시간 재생 (Premium/Trial 한정 백그라운드).

사용 맥락은 **야간 침실 / 부모가 한 손으로 조용히 조작 / 아기 잠드는 동안**. UI 톤은 그 맥락에서 도출:

- **다크 미드나이트 퍼스트** — 어두운 방에서 화면 켰을 때 눈 피로 없는 깊은 남색. 순수 black `#000` 금지.
- **Anti-AI-Smell** — 보라/인디고 (`#6366f1`) + 흰 카드 그리드, 무지개 그라디언트, Claude 오렌지 (`#F5C97A`/`#E8A94A`) 일체 금지. "AI 가 만들었다"는 인상이 가치 명제와 정면 충돌.
- **낮은 명도 대비, 낮은 채도** — accent 도 vivid 가 아닌 dusty/muted (slate blue + dusty rose).
- **밀도 낮음** — 큰 터치 타겟 (버튼 56dp), 패딩 넉넉, 한 화면 정보 과부하 금지. 부모가 한 손으로 조작 가능해야 함.
- **부드러운 voice** — "들어볼게요" / "다시 녹음" / "부모님 목소리를 다듬고 있어요 ·· 30초쯤 걸려요". "제출" / "오류 발생" 같은 시스템 톤 금지.

## Theme Modes

| 영역 | Dark (default) | Light |
|---|---|---|
| 진입 조건 | 시스템 default + dark-first 정책 | 시스템 prefer light + 유저 override |
| 무드 | 미드나이트 다크 — 깊은 남색, slate blue accent, 야간용 | 따뜻한 베이지/오프화이트 — 진한 슬레이트 블루, 부드러운 dusty rose |
| 분기 코드 | `useTheme()` → `isDark === true` | `useTheme()` → `isDark === false` |

> Light 모드는 야간 사용 가치 명제와는 보조적 — 낮 시간대 / 시각 보조 / 시스템 prefer light 유저 대응. 다크의 "조용함" 톤은 light 에서도 유지: vivid 채도 금지, 흰 종이 + 푸른 버튼 조합 금지, 유사 채도/명도의 따뜻한 베이지 베이스.

## Colors

12 토큰 × 2 모드 + 파생 투명도 3종 (`apps/mobile/src/theme/tokens.ts` SSOT).

### Dark (default)

- **bg-primary** (`#0D0F1A`): 화면 기본 배경 (다크 미드나이트)
- **bg-deep** (`#12152B`): 더 깊은 배경 (그라디언트 끝점, 모달 underlay)
- **surface** (`#1A1D30`): 카드 / 시트 / 칩 배경
- **surface-high** (`#21253E`): elevated 카드 / 토스트 배경
- **accent-primary** (`#5A7AA8`): 주 강조 — 버튼 / 미리듣기 / 파형 액티브 / 페이지 인디케이터 (slate blue)
- **accent-secondary** (`#C49A8A`): 보조 강조 — dusty rose, 따뜻한 보조 액션
- **text-primary** (`#EEF0F8`): 본문·제목 (오프화이트)
- **text-secondary** (`#7B80A0`): 보조 정보 / 캡션
- **border** (`#2A2E48`): subtle 구분선
- **destructive** (`#E85A5A`): 삭제 / 정지 / 경고
- **success** (`#6BCB77`): 완료 토스트 / 체크
- **overlay** (`#000000AA`): 모달 dim 배경

### Light

- **bg-primary** (`#FBF7F0`): 화면 기본 배경 (따뜻한 오프화이트, 순수 white 금지)
- **bg-deep** (`#F0EAE0`): 더 깊은 배경 (그라디언트 끝점, 모달 underlay)
- **surface** (`#E8E0D4`): 카드 / 시트 / 칩 배경 (베이지)
- **surface-high** (`#DDD4C6`): elevated 카드 / 토스트 배경
- **accent-primary** (`#3A5A88`): 주 강조 — 진한 슬레이트 블루
- **accent-secondary** (`#9A6858`): 보조 강조 — 진한 dusty rose
- **text-primary** (`#1C1A18`): 본문·제목 (다크 슬레이트)
- **text-secondary** (`#6B6055`): 보조 정보 / 캡션
- **border** (`#C8BEB0`): subtle 구분선
- **destructive** (`#C0392B`)
- **success** (`#2E8B44`)
- **overlay** (`#00000066`)

### 파생 투명도 (모드별)

`accent-primary-14` / `-20` / `-33` — 각 14% / 20% / 33% alpha. glow / hover / 비활성 표면용. dark `#5A7AA8XX` / light `#3A5A88XX`.

> **금지 컬러 (양 모드 공통)**: `#F5C97A` / `#E8A94A` (Claude 오렌지/앰버) · `#6366f1` 인디고/바이올렛 · 순수 black `#000` 배경 · 순수 white `#FFF` 배경 + vivid 파란 버튼 조합 · 무지개 그라디언트.

## Typography

3 패밀리 — **DM Sans** (제목·버튼·영문/숫자) · **DM Mono** (타이머·tabular) · **Noto Sans KR** (한글 본문). 시스템 Inter / `-apple-system` 단독 사용 금지. 명조·손글씨·굵은 고딕 금지.

8 프리셋 (`apps/mobile/src/theme/typography.ts` SSOT). 모든 색상은 mode-aware (`useTheme().colors.textPrimary` 등).

- **display-bold** — 36px / DM Sans Bold / lh 1.2 — 카운트다운 대형 숫자, 히어로
- **h1** — 28px / DM Sans Bold / lh 1.25 — 화면 제목
- **h2** — 22px / DM Sans Medium / lh 1.3 — 섹션 헤더
- **h3** — 18px / DM Sans Medium / lh 1.35 — 카드 제목
- **body** — 16px / Noto Sans KR Regular / lh 1.6 / 자간 +0.2 — 한글 본문 (피로한 눈 위한 여유)
- **caption** — 14px / Noto Sans KR Regular / lh 1.5 / `text-secondary` 색 — 보조 정보
- **button-label** — 16px / DM Sans Medium / lh 1.2 / 자간 +0.3 / **on-accent 대비 텍스트** (dark mode: `bg-primary` 다크 / light mode: `bg-primary` 오프화이트) — Primary 버튼 라벨
- **timer-mono** — 22px / DM Mono / `tabular-nums` — 녹음·재생 타이머 (자릿수 흔들림 방지)

## Components

### Button — Primary

- 채움 `accent-primary` + 대비 텍스트 (`bg-primary`)
- 높이 56dp, 라운드 `radius.pill` (28 — pill 형태)
- 라벨: button-label 프리셋
- 비활성: opacity 0.4

### Button — Secondary

- 테두리 없음, 배경 `surface`, 텍스트 `text-primary`
- 동일 56dp / pill — 시각 위계는 채움 색으로만 구분

### Card

- 배경 `surface`, 라운드 `radius.lg` (16), 테두리 없음
- elevation **낮음** — 그림자 사용 금지, 배경 대비 약간 밝은 톤(dark) / 약간 진한 톤(light) 으로만 구분
- 패딩 `spacing.md`~`spacing.lg` (16~24)
- 금지: 흰 배경 + drop-shadow + 그리드 반복 (AI-Smell)

### List Item

- 좌측 아이콘(36~40dp) + 제목(h3) + 서브텍스트(caption) + 우측 화살표/토글
- 높이 64dp 이상, 양쪽 패딩 `spacing.lg` (24)
- 구분선: `border` 1dp, 살짝만

### Chip

- 배경 `surface`, 라운드 12, padding 6/10
- 라벨: caption (DM Sans 13~14)
- accent chip 변형: outline `accent-primary` (헤드폰 권장 등)

### Modal / Bottom Sheet

- 진입 slide-up 350ms ease-out, dim `overlay` fade-in 200ms
- 시트 배경 `surface-high`, 상단 라운드 `radius.lg` (16)
- "✕" 닫기 우상단 / Primary CTA 하단 / 텍스트 링크는 보조 액션 ("지금은 괜찮아요")

### Toast

- 배경 `surface-high`, 라운드 12, padding 12/16
- 자동 dismiss 3초, 화면 상단 (헤더 바로 아래) 또는 하단

## Voice & Tone

- **버튼 라벨**: 동사형 구어체 — "들어볼게요" / "시작할게요" / "다시 녹음" / "구독하기"
- **빈 상태**: "아직 자장가가 없어요. 목소리를 담아볼까요?"
- **에러**: "조금 더 크게 녹음해주세요" / "조용한 곳에서 다시 해봐요"
- **로딩**: "부모님 목소리를 다듬고 있어요 ·· 30초쯤 걸려요"
- **금지**: "제출", "확인", "오류가 발생했습니다", "데이터가 없습니다", "~해 보세요", "~를 경험하세요"

## Animation

- **fade-in / slide-up** 위주, 급격한 등장 금지
- **카운트다운 숫자**: scale(1)→scale(0.8) + opacity 1→0, 0.6s ease-in
- **BGM volume ramp**: 시작 0→30% over 300ms / 종료 30%→0 over 200ms (Web Audio `linearRampToValueAtTime`)
- **타이머 만료 fade-out**: 10초 volume fade — 아기 수면 방해 없는 자연 종료
- **앨범 아트 회전**: 120s/loop — 매우 느린 생동감
- **금지**: bounce / pulse 과사용 / 화면 가로지르는 큰 모션 / 라이트 모드에서도 유사 — vivid flash 금지

## Sources of Truth

| 영역 | SSOT 파일 |
|---|---|
| 컬러 (dark/light) / 폰트 / spacing / radius 토큰 값 | `apps/mobile/src/theme/tokens.ts` |
| 텍스트 스타일 프리셋 | `apps/mobile/src/theme/typography.ts` |
| 모드 분기 hook | `apps/mobile/src/hooks/useTheme.ts` |
| 화면 인벤토리 / 와이어프레임 / 인터랙션 / 카피 | `docs/ux-flow.md` |
| 화면별 컴포넌트 스펙 | `docs/ui-spec.md` |
| Pencil 디자인 파일 | `design/jajang.pen` |

> **Drift 메모 (2026-05-06)**: `docs/ux-flow.md` §0 와 `docs/design-handoff.md` 는 dark accent-primary 를 sage `#82B090` 으로 표기하지만, 실제 `apps/mobile/src/theme/tokens.ts` 는 slate blue `#5A7AA8`. 본 design.md 는 코드 값을 SSOT 로 채택. ux-flow.md / design-handoff.md 는 후속 동기화 필요 (별도 chore 이슈).

## 사용 규칙

- screens / components 구현 시 hex 값 직접 입력 금지 — `useTheme().colors.accentPrimary` 등 mode-aware 토큰 사용.
- 새 컬러 / 폰트 추가는 본 문서 + `tokens.ts` 동시 수정. 한 쪽만 수정 금지. **dark 와 light 양쪽 값 동시 정의 의무** (한쪽만 추가 금지).
- ux-flow / ui-spec 와 본 문서 충돌 시 — 토큰 값은 본 문서 / 화면 흐름 카피는 ux-flow 우선.
- 라이트 모드 검증: 새 화면 추가 시 dark/light 양 모드 스크린샷 첨부 권장 (Pencil variants 또는 device preview).
