---
issue: 140
title: S10 녹음 카운트 가시성 부족 (00:32 / 01:00 표시 안 보임)
mode: LIGHT_PLAN
depth: simple
labels: [bug, v01]
suspected_files:
  - apps/mobile/src/screens/RecordScreen.tsx
---

# #140 — S10 녹음 카운트 가시성 (LIGHT_PLAN, simple)

## 1. 결론 (depth=simple 근거)

- 변경 본질: **기존 스타일 객체의 값(fontSize, color)만 교체**. 새 로직 구조 신설 없음.
- DOM 트리·테스트 ID·텍스트 리터럴·role 그대로 유지 (`<Text style={styles.timer}>`, 문자열 `"30초 채워주세요"` 등 불변).
- 영향 받는 테스트 파일 grep 결과: RecordScreen.tsx 의 timer/durationHint 스타일을 assertion 하는 테스트 **없음**.
  - `__tests__/theme/tokens.test.ts:86` 은 `darkColors.textSecondary === '#7B80A0'` 토큰 값만 검사 → 토큰 자체는 건드리지 않으므로 통과.
  - `AudioEngine-timer.test.ts` 는 store의 `timerEndsAt` 동작 테스트 (S10 UI 무관).
- 따라서 TDD 선행 불필요 → **simple** 확정.

## 2. 원인 정리 (이슈 본문 검증)

`apps/mobile/src/screens/RecordScreen.tsx` 실측 확인:

| 항목 | 위치 | 현재값 | 문제 |
|---|---|---|---|
| `styles.timer` | line 382-386 | `color: '#7B80A0'`, `fontSize: 15`, tabular-nums | 다크 BG `#0D0F1A` 대비 contrast 낮음 + 폰트 작음 |
| `styles.durationHint` | line 407-412 | `color: '#7B80A0'`, `fontSize: 14` | 30초 미만일 때 강조가 약함 |
| 위치 | topBar 우측 (300-303) | 우상단 | 사용자 시선(중앙 파형) 밖 → 폰트/색으로 보강 |

이슈 본문 라인 번호와 실제 파일 일치 확인 완료.

## 3. 기존 토큰 재사용 (Why: 단발 hex 추가 회피)

`apps/mobile/src/theme/typography.ts:55-61` 에 이미 정확히 이 용도의 preset 존재:

```ts
timerMono: {
  fontFamily: FontFamily.dmMono,
  fontSize:   FontSize.xl,        // 22
  lineHeight: FontSize.xl * 1.2,
  color:      Colors.textPrimary, // '#EEF0F8'
  fontVariant: ['tabular-nums'],
}
```

→ S10 timer 도 이 preset 을 쓰는 것이 토큰 디자인 의도와 일치.
`Typography.timerMono` 는 이미 `S08/S11/S12` 등 다른 화면에서 쓰이는 canonical 시계 폰트라 일관성도 확보.

이슈에서 언급한 신규 sage `#82B090` 는 코드베이스에 미존재 → 도입 시 designer 루프 필요. 본 LIGHT_PLAN 에서는 **상태별 색 분기를 도입하지 않고**, 단일 `textPrimary` 로 가독성만 회복한다 (최소 침습).

## 4. 변경 사양

### 4.1 `apps/mobile/src/screens/RecordScreen.tsx`

**A. import 추가** (파일 상단 import 블록에 합류):

```ts
import { Typography } from '../theme/typography';
```

> 현재 RecordScreen 은 hex 리터럴을 직접 쓰고 있어 typography import 가 없음. 추가만 하고 다른 스타일은 손대지 않는다 (스코프 한정).

**B. `styles.timer` 교체** (line 382-386):

```ts
// before
timer: {
  color: '#7B80A0',
  fontSize: 15,
  fontVariant: ['tabular-nums'],
},

// after
timer: {
  ...Typography.timerMono,
},
```

결과: fontSize 15→22, color #7B80A0→#EEF0F8, dmMono 폰트 + tabular-nums 유지.

**C. `styles.durationHint` 가독성 보강** (line 407-412):

```ts
// before
durationHint: {
  color: '#7B80A0',
  fontSize: 14,
  textAlign: 'center',
  marginBottom: 16,
},

// after
durationHint: {
  color: '#EEF0F8',
  fontSize: 16,
  fontWeight: '500',
  textAlign: 'center',
  marginBottom: 16,
},
```

근거:
- color: textPrimary (`#EEF0F8`) 로 contrast 회복.
- fontSize 14→16: caption→body 사이즈로 한 단계 강조 (FontSize.md=16 정렬).
- fontWeight 500: 본문 대비 약한 강조 — 폰트 미로드 시에도 시스템 폰트로 fallback.
- 위치·marginBottom·textAlign 유지 (레이아웃 변화 없음).

> 토큰 직접 참조(`darkColors.textPrimary`) 가 더 깔끔하지만, 이 파일은 전체적으로 hex 리터럴을 쓰고 있어 스타일 일관성을 깨지 않기 위해 hex 유지. 전면 토큰 마이그레이션은 별도 리팩 이슈로 분리.

### 4.2 변경 *없음* 항목 (의도적)

- `topBar` 레이아웃·padding (line 374-380)
- `cancelText` (`#7B80A0`, fontSize 15) — 취소 라벨은 의도적으로 약하게 유지
- 타이머 위치(우상단), `formatTime` 포맷, `MAX_DURATION_SEC`/`MIN_DURATION_SEC` 상수
- 카운트다운 화면(`countdownContainer` 이하)
- 그 외 모든 컴포넌트 / 핸들러 / store

## 5. 검증 절차

1. `npx vitest run` — 기존 통과 테스트 회귀 없음 확인 (스타일 hex assertion 없음 사전 확인 완료).
2. `npx expo run:ios` 또는 `run:android` 실측:
   - S10 진입 → 카운트다운 후 녹음 시작.
   - 우상단 `00:00 / 01:00` 표시가 카운트다운 폰트 톤과 통일된 흰색 모노로 또렷하게 보임.
   - 30초 미만일 때 `30초 채워주세요` 텍스트가 명확하게 읽힘.
   - 30초 도달 후 hint 가 사라지는 기존 조건부 렌더링 정상 동작.
3. 스크린샷 변화 발생 가능 — 본 LIGHT_PLAN 은 **폰트 크기/색만** 바꾸므로 디자이너 루프 트리거 기준 ("스크린샷이 달라지는가?") 에 닿는다.
   - 다만 issue body 마지막 문단이 "디자인: 폰트/색상만 바뀌고 레이아웃 유지 → designer 루프 불필요, LIGHT_PLAN 로 처리" 로 사전 합의됨 → designer 스킵.

## 6. 사이드이팩트 / 후속

- 없음. 단일 화면 단일 파일 스타일 변경.
- (선택) 이후 RecordScreen 전체를 token 기반으로 리팩하는 별도 이슈 제안 가능 — 본 PR 스코프 밖.

## 7. 커밋 메시지 (제안)

```
fix(mobile): S10 녹음 타이머 가시성 회복 (#140)

[왜] 다크 BG 위 #7B80A0/15px 타이머가 contrast 부족으로 사실상 안 보임
[변경]
- apps/mobile/src/screens/RecordScreen.tsx: styles.timer → Typography.timerMono 재사용 (22px, textPrimary, tabular-nums)
- apps/mobile/src/screens/RecordScreen.tsx: styles.durationHint color/fontSize/fontWeight 강조 (#EEF0F8, 16px, 500)

Closes #140
```

---

---MARKER:LIGHT_PLAN_DONE---
