---
depth: simple
---
# #90 — hex literal sage swap

**유형**: LIGHT_PLAN (depth: simple, 순수 hex 문자열 치환)
**관련 이슈**: #90 (#87 마무리)

## 결정 근거

- `apps/mobile/src/theme/tokens.ts`의 `accentPrimary`는 이미 `#82B090`. 하지만 32개 파일에 옛 hex(`#F5C97A`)가 리터럴로 박혀있어 실제 화면이 옛 색으로 나옴.
- **토큰 import 마이그레이션은 본 이슈 범위 외**. import 추가/제거 없이 순수 문자열 치환만 한다. 토큰 일관성 정리는 별도 epic으로 분리 (위험·검증 범위 분리).
- E8A94A는 토큰에 미정의이지만 그 또한 본 이슈 스코프 외 — `#5A8A6A`로 hex literal 치환만 한다.

## 작업

`apps/mobile/src/**/*.{ts,tsx}` 내 hex 문자열 치환:

| from | to |
|---|---|
| `#F5C97A` | `#82B090` |
| `#f5c97a` | `#82b090` |
| `#F5C97A22` | `#82B09024` |
| `#F5C97A33` | `#82B09033` |
| `#F5C97A44` | `#82B09044` |
| `#F5C97A55` | `#82B09055` |
| `#F5C97A15` | `#82B09015` |
| `#E8A94A` | `#5A8A6A` |
| `#e8a94a` | `#5a8a6a` |

권장 sed 레시피:

```bash
cd apps/mobile/src
# 8자리부터 먼저 (긴 패턴 우선)
grep -rl '#F5C97A22' . | xargs sed -i '' 's/#F5C97A22/#82B09024/g'
grep -rl '#F5C97A33' . | xargs sed -i '' 's/#F5C97A33/#82B09033/g'
grep -rl '#F5C97A44' . | xargs sed -i '' 's/#F5C97A44/#82B09044/g'
grep -rl '#F5C97A55' . | xargs sed -i '' 's/#F5C97A55/#82B09055/g'
grep -rl '#F5C97A15' . | xargs sed -i '' 's/#F5C97A15/#82B09015/g'
# 6자리 (대소문자)
grep -rli '#F5C97A' . | xargs sed -i '' 's/#F5C97A/#82B090/g; s/#f5c97a/#82b090/g'
# 보조 sage
grep -rli '#E8A94A' . | xargs sed -i '' 's/#E8A94A/#5A8A6A/g; s/#e8a94a/#5a8a6a/g'
```

`rgba(245, 201, 122, …)` 형태가 있을 수 있음 — `rgba(130, 176, 144, …)`로 동일 alpha 유지하며 치환:

```bash
grep -rli 'rgba(245' apps/mobile/src | xargs sed -i '' 's/rgba(245, *201, *122,/rgba(130, 176, 144,/g'
```

## 수정 파일

`grep -rl` 기반 동적 탐색이므로 sed 레시피가 자동으로 모든 매칭 파일에 적용된다. 사전 검증 시점 기준으로는 약 33개 파일에 hex 리터럴 분포 (components/, screens/, hooks/, navigation/, __tests__/ 디렉터리 전반).

## 검증

```bash
grep -ri 'F5C97A\|f5c97a\|E8A94A\|e8a94a' apps/mobile/src/ | wc -l   # 0
grep -ri 'rgba(245' apps/mobile/src/ | wc -l                          # 0
```

## 제약 (반드시 준수)

- **새 파일 생성 금지** (theme/, hooks/, utils/ 등 어떤 새 파일도 안 됨)
- **새 import 추가 금지** (`Colors` 토큰 import도 추가 X — 별도 에픽)
- **함수/컴포넌트/JSX 구조 변경 금지**
- **로직 변경 금지** — 순수 string literal 치환만
- 테스트 파일(`__tests__/S08RecordModeScreen.test.tsx`) 내 색상 assertion도 동일하게 hex 교체

## 커밋 메시지

```
fix(mobile): swap accent hex F5C97A → 82B090 across src/

[왜] Issue #90 — 디자이너 색상 변경(#F5C97A → #82B090, Sage Mist) 후 32개 파일에 옛 hex가 리터럴로 박혀있어 실제 화면이 옛 색으로 표시. tokens.ts는 이미 새 값.
[변경]
- apps/mobile/src/**: hex 리터럴 일괄 sed 치환 (F5C97A→82B090 외 8쌍)

Closes #90
```
