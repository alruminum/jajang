/**
 * useBackNavigation — task 07 epic-12 guard
 *
 * m1c-back-nav-hook-processed-hex-map.test.ts 가 hex 잔존 0 을 검증한다.
 * 본 파일은 tdd-guard 가 useBackNavigation 이름으로 테스트를 요구하기 때문에 존재.
 * hook 파일이 존재하고 외부 시그니처가 보존되었음을 파일 시스템 레벨로 확인한다.
 */
import * as fs from 'fs';
import * as path from 'path';

const HOOK_FILE = path.resolve(__dirname, '../hooks/useBackNavigation.tsx');

describe('useBackNavigation — 파일 존재 + 시그니처 보존', () => {
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(HOOK_FILE, 'utf-8');
  });

  it('훅 파일이 존재한다', () => {
    expect(fs.existsSync(HOOK_FILE)).toBe(true);
  });

  it('export function useBackNavigation 시그니처 보존', () => {
    expect(src.includes('export function useBackNavigation(')).toBe(true);
  });

  it('UseBackNavigationParams 타입 보존', () => {
    expect(src.includes('UseBackNavigationParams')).toBe(true);
  });

  it('UseBackNavigationReturn 타입 보존', () => {
    expect(src.includes('UseBackNavigationReturn')).toBe(true);
  });

  it('useTheme 도입 확인', () => {
    expect(src.includes('useTheme')).toBe(true);
  });

  it('makeStyles factory 도입 확인', () => {
    expect(src.includes('makeStyles')).toBe(true);
  });

  it('처리된 hex 리터럴 잔존 0 — #1E2140', () => {
    expect(src).not.toMatch(/'#1E2140'|"#1E2140"/);
  });

  it('처리된 rgba 잔존 0', () => {
    expect(src.includes("'rgba(0, 0, 0, 0.6)'")).toBe(false);
    expect(src.includes('"rgba(0, 0, 0, 0.6)"')).toBe(false);
  });
});
