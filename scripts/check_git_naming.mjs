#!/usr/bin/env node
/**
 * git-naming-spec 형식 검증 게이트
 * 규칙 정의: docs/plugin/git-naming-spec.md (SSOT)
 *
 * 사용:
 *   node scripts/check_git_naming.mjs --branch <branch-name>
 *   node scripts/check_git_naming.mjs --title <commit-or-pr-title>
 *
 * exit 0: 통과
 * exit 1: 위반
 */

const BRANCH_RE = /^(feature\/epic\d+_story\d+_.+|fix\/issue\d+_.+|docs\/.+)$/;
const TITLE_RE  = /^(\[epic\d+\]\[story\d+\]|\[issue-\d+\]|\[docs\]) .+/;

const args = process.argv.slice(2);
const mode = args[0];
const value = args.slice(1).join(' ');

if (!mode || !value) {
  console.error('[git-naming] 사용법: --branch <name> | --title <title>');
  process.exit(1);
}

if (mode === '--branch') {
  if (!BRANCH_RE.test(value)) {
    console.error(`[git-naming] FAIL — 브랜치명 형식 위반: "${value}"`);
    console.error('  허용 패턴:');
    console.error('    feature/epic{N}_story{N}_{desc}');
    console.error('    fix/issue{N}_{desc}');
    console.error('    docs/{desc}');
    process.exit(1);
  }
  console.log(`[git-naming] PASS — branch: ${value}`);

} else if (mode === '--title') {
  if (!TITLE_RE.test(value)) {
    console.error(`[git-naming] FAIL — 커밋/PR 제목 형식 위반: "${value}"`);
    console.error('  허용 패턴:');
    console.error('    [epic{N}][story{N}] {설명}');
    console.error('    [issue-{N}] {설명}');
    console.error('    [docs] {설명}');
    process.exit(1);
  }
  console.log(`[git-naming] PASS — title: ${value}`);

} else {
  console.error(`[git-naming] 알 수 없는 모드: ${mode}`);
  process.exit(1);
}
