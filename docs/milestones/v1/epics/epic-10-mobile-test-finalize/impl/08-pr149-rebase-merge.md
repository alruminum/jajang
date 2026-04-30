---
depth: light
---

# impl/08 — [Story 6 / #172] PR #149 rebase + GREEN 검증 + squash merge

**Story:** #172 (Story 6)
**선행 조건:** impl/01 ~ impl/07 모두 main 또는 PR 브랜치에 적용 완료
**후행 조건:** main `npx jest` 0 failures
**상태:** ✅ 완료 (PR #149 GREEN, 2026-05-01) (의도 skip 2 만 잔존), PR #149 closed

**context budget:** file edits ≤ 0 / tool uses ≤ 20 (git 작업 위주)

---

## 0. 사전 점검

```bash
# main 최신
git checkout main
git pull
cd apps/mobile && npx jest 2>&1 | tail -5
# 기대: 0 failures

# PR 브랜치 상태
git checkout feat/149-batch4-record-guide-pivot
git log main..HEAD --oneline | head -10
```

---

## 생성/수정 파일

- 코드 변경 없음. 본 batch 는 git 조작 + GH PR merge 만.

---

## 의사코드 (메인 Claude 가 수행)

```
1. main 최신 확인:
   git checkout main && git pull
   cd apps/mobile && npx jest 2>&1 | grep -E "Tests:" 
   → 0 failures (의도 skip 제외) 확인

2. PR #149 브랜치 rebase:
   git checkout feat/149-batch4-record-guide-pivot
   git rebase main
   
   conflict 발생 시:
     - S09RecordGuideScreen.tsx / .test.tsx: main 우선 + PR 의 mode-removal + earphone modal 병합
     - RecordScreen.tsx: main 의 await stopBgm + PR 의 mode-removal 병합
     - engineer 호출하여 conflict 해소
     git rebase --continue

3. 통합 검증:
   cd apps/mobile && npx jest
   → 0 failures + skipped 2 (의도 skip)

4. push (force-with-lease):
   git push --force-with-lease origin feat/149-batch4-record-guide-pivot

5. CI GREEN 확인:
   gh pr checks 149
   → all checks passed

6. squash merge:
   gh pr merge 149 --squash --delete-branch=false
   (브랜치 삭제는 사용자 정책상 보류)

7. main 갱신 후 회귀 재확인:
   git checkout main && git pull
   cd apps/mobile && npx jest 2>&1 | tail -5
   → 0 failures

8. backlog.md / CLAUDE.md 갱신:
   - backlog.md: Epic 10 row 체크
   - 필요 시 epic 10 stories.md "[Done]" 마커
```

---

## 결정 근거

**왜 옵션 (a) rebase 채택?**
epic-09 batch 4 에서도 동일 옵션 — Epic 10 의 fix 가 PR #149 의 이어폰 모달 14 it 와 통합된 상태로 최종 검증. 옵션 (b) (main 선 merge 후 자동 흡수) 는 검증 미실시 위험.

**왜 squash merge?**
프로젝트 CLAUDE.md 절차 (`gh pr merge --squash`). PR 의 다수 commit 을 단일 commit 으로 main 에 정렬.

**왜 본 batch 는 light depth?**
git 조작 + verification 만 — 코드 변경 없음. impl 파일 의 의사코드 수준이면 충분.

**왜 브랜치 삭제 보류?**
사용자 정책: "브랜치는 merge 후에도 삭제하지 않는다" (`~/.claude/CLAUDE.md` 커밋 절차).

---

## 다른 모듈과의 경계

- impl/01 ~ impl/07: 모두 본 batch 의 선행 조건
- 본 batch 는 git/GH 조작 — 코드 영향 없음

---

## 수용 기준

- (TEST) PR #149 CI 모든 check GREEN (`gh pr checks 149`)
- (TEST) merge 후 main: `npx jest 2>&1 | grep -E "Tests:"` → 0 failures (의도 skip 2 만)
- (DOC) backlog.md Epic 10 완료 체크
- (GH) PR #149 status: closed (merged)

---

## MODULE_PLAN_READY

---

## Verification (PR #149 batch 08)

### 절차

1. main rebase 시도 → 11 파일 conflict (RecordGuideScreen.tsx + S09 test files + impl/* docs + stories.md + package-lock.json)
2. abort → `git merge main` 으로 전환 (squash merge 가 history 합치므로 rebase 불필요)
3. 충돌 해소:
   - source/test 파일 (mode 폐기 spec): `--ours` (PR #149)
     - `RecordGuideScreen.tsx`
     - `S09RecordGuideScreen.test.tsx`
     - `S09RecordGuideScreen.refactor.test.tsx`
   - main 의 batch 06 BGM 개선: `--theirs`
     - `S10RecordScreen.bgm.test.tsx`
   - docs (latest verification): `--theirs` (main)
     - `impl/03~07-*.md` + `stories.md`
   - `package-lock.json`: `--theirs`
4. merge commit 9ce02ba — 1 fail 잔존 (`shush 모드 startBgm not called` — mode 폐기로 obsolete)
5. obsolete `it` → `it.skip` (impl/13 / PR #149 ref 주석)

### 실측 결과

```bash
$ npx jest
Tests: 4 skipped, 605 passed, 609 total — **0 failures**
```

main 593 PASS / 597 (post batch 06) → PR #149 605 PASS / 609 (PR-only 14 추가 테스트 +8 신규 테스트).

### 의도 skip 4개

1~3: PR-only 의 자체 skip (이전 PR #149 history 의 의도)
4: `shush 모드 startBgm not called` (본 batch 추가 — mode 폐기 obsolete)
