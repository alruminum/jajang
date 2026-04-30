# Epic 10 — Batch List

`/impl-loop` 입력용 batch 분해 결과. 각 batch 는 `impl/NN-*.md` 파일 1개에 대응. 각 batch 의 완료 enum = `LGTM` (`/impl-batch-loop` 의 advance).

---

## Batch 표

| ID | impl 파일 | 포함 stories | 주요 파일 | 예상 fails | branch_prefix | 의존성 |
|---|---|---|---|---|---|---|
| **01** | `01-s04-s05-component-mock.md` | #167 (Story 1a) | `__tests__/screens/S04SignupScreen.test.tsx`, `S05LoginScreen.test.tsx` | 27 (A 14+13) | `feat/` | none |
| **02** | `02-s06-home-screen-mixed-fix.md` | #167 (Story 1b) | `__tests__/screens/S06HomeScreen.test.tsx` | 11 (A6 + B1 + C3 + I1) | `feat/` | none |
| **03** | `03-expo-audio-mock-pr149-unblocker.md` | #168 (Story 2) | `__tests__/_setup.ts`, `__tests__/screens/S09RecordGuideScreen.test.tsx`, `S07.test.tsx`, `S10*.test.tsx` (PR 브랜치) | 20 (F 6 main + 14 PR) | `fix/` | none (PR 브랜치) |
| **04** | `04-completed-track-card-async-text.md` | #169 (Story 3) | `__tests__/components/CompletedTrackCard.test.tsx` | 15 (C 6 + B 9) | `feat/` | none |
| **05** | `05-google-signin-a11y-infra.md` | #170 (Story 4a) | `__tests__/__mocks__/@react-native-google-signin/google-signin.ts`, `_setup.ts`, `package.json` | 10 (G 7 + H 3) | `chore/` | none |
| **06** | `06-distributed-logic-fixes.md` | #170 (Story 4b) | `screens/RecordScreen.tsx`, `__tests__/screens/S08*.test.tsx`, `S16*.test.tsx`, `AccountDeletionScreen.test.tsx`, `S09*.test.tsx`, `__tests__/data/bgmTracks.test.ts`, `LegalScreen.test.tsx` | ~22 (D 분산 + E 7 + I 잔여) | `fix/` | 05 (matcher 우선) |
| **07** | `07-pr149-earphone-modal-unskip.md` | #171 (Story 5) | `__tests__/screens/S09RecordGuideScreen.test.tsx` (PR 브랜치) | 14 (skip → unskip) | `fix/` | 03 |
| **08** | `08-pr149-rebase-merge.md` | #172 (Story 6) | (git/GH 조작 only) | 0 (verification) | `chore/` | 01~07 모두 |

**총 예상 fails 처리**: 119 (94 main + ~25 PR-only). 회귀 보호 ≥ 502 PASS.

---

## 실행 순서 (의존성 그래프)

```
[01] S04+S05 ──┐
[02] S06 ──────┤
[03] expo-audio (PR) ─┼─ 병렬 가능 (서로 다른 파일)
[04] CompletedTrackCard ─┤
[05] google-signin + A11Y infra ──┘
                                  │
                                  ▼
                              [06] 분산 D/E/I (← 05)
                                  │
[03] ──────────────────────────────► [07] earphone modal unskip
                                  │
                                  ▼
                              [08] rebase + merge (← 01~07)
```

병렬 가능 그룹:
- **그룹 A (1~5)**: 01 / 02 / 03 / 04 / 05 — 서로 다른 파일군. 동시 PR 가능.
- **그룹 B (6, 7)**: 06 (← 05), 07 (← 03)
- **그룹 C (8)**: 8 (← 1~7)

---

## 분할 결정 근거

### Story 1 → 01 (S04+S05) / 02 (S06) 분할

- mock 시스템이 다름: S04/S05 는 `@testing-library/react-native`, S06 는 `react-native` 수동 최소 mock + `react-test-renderer`
- 같은 batch 통합 시 mock 패턴 충돌 위험 (공통 추출 시 S06 격리 깨짐)
- review surface 분리 — S04/S05 27 fails 는 균질 (카테고리 A 단일), S06 11 fails 는 4 카테고리 mixed (A+B+C+I)

### Story 4 → 05 (인프라) / 06 (분산) 분할

- 05 = 공통 인프라 (google-signin manual mock + A11Y matcher 도입) — 영향 범위 *측정 가능 + 다수 suite 자동 흡수*
- 06 = 분산 fails (S08/S10/S16/Account/S09/bgmTracks/Legal 7 suite)
- 분산 batch 만으로는 SocialAuthButtons (7) + A11Y (3) 자동 흡수분 측정 불가 → 인프라 선행
- F1 IMPL_PARTIAL 안전망: 06 가 ~22 fails / 7 suite — engineer context 압박 시 06b 분리 가능

### Story 2, 3, 5, 6 → 1 batch each

- Story 2: PR 브랜치 단독 + expo-audio 인프라 도입 (단일 mock 파일) — 분할 불필요
- Story 3: CompletedTrackCard 단일 파일 — 분할 불필요
- Story 5: PR 브랜치 단독 + 단일 파일 14 it unskip — 분할 불필요
- Story 6: git 조작 only — light depth

---

## F1 IMPL_PARTIAL 평가

| Batch | 파일 수 | 예상 fails | engineer budget 위험도 |
|---|---|---|---|
| 01 | 2 | 27 | **낮음** (균질 mock 패턴) |
| 02 | 1 | 11 | 중간 (4 카테고리 mixed) |
| 03 | 4 | 20 | 중간 (PR 브랜치 + 다수 suite) |
| 04 | 1 | 15 | **낮음** (단일 파일) |
| 05 | 3 | 10 | **낮음** (인프라 single concern) |
| **06** | **8** | **~22** | **높음** ⚠️ — IMPL_PARTIAL 가능. 06b 분리 대비 |
| 07 | 1 | 14 | **낮음** (단일 파일 unskip) |
| 08 | 0 | 0 | **낮음** (git only) |

**06 IMPL_PARTIAL 발화 시 분할안:**
- 06a: D-3 (RecordScreen handleCancel) + D-7 (bgmTracks 데이터) + D-9 (LegalScreen) — 코드/데이터 변경 위주
- 06b: D-2 (S08 skip) + D-4 (S16) + D-5 (Account) + D-6 (S09 잔여) — 테스트 정정 위주

---

## 제출 후

- `/impl-loop` 또는 batch 별 `/impl <batch-id>` 진행
- 각 batch 완료 시 `LGTM` advance → 다음 batch
- batch 08 완료 = Epic 10 close
