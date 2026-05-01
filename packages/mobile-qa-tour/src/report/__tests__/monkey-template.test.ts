import { describe, it, expect } from 'vitest';
import { renderMonkeyReport } from '../monkey-template';
import type { MonkeyReportData } from '../monkey-template';

// REQ-004, REQ-005 검증
describe('REQ-004~005 renderMonkeyReport', () => {
  const baseData: MonkeyReportData = {
    appPackage: 'com.example.app',
    events: 500,
    durationMs: 12345,
    crashes: [],
    screenshotPath: '/tmp/last-screen.png',
    generatedAt: '2026-05-01T00:00:00.000Z',
    seed: 42,
  };

  it('crashes 0건 → "No crashes detected. ✅" 포함 (REQ-004)', () => {
    const md = renderMonkeyReport({ ...baseData, crashes: [] });
    expect(md).toContain('No crashes detected. ✅');
  });

  it('crashes 2건 → ### FATAL 와 ### ANR 헤더 모두 출현', () => {
    const data: MonkeyReportData = {
      ...baseData,
      crashes: [
        { type: 'FATAL', excerpt: 'FATAL EXCEPTION: main\nat Foo.bar', lineIndex: 5 },
        { type: 'ANR', excerpt: 'ANR in com.example.app\nTrace', lineIndex: 20 },
      ],
    };
    const md = renderMonkeyReport(data);
    expect(md).toContain('### FATAL');
    expect(md).toContain('### ANR');
  });

  it('screenshotPath null → "_screenshot capture failed_" 포함', () => {
    const md = renderMonkeyReport({ ...baseData, screenshotPath: null });
    expect(md).toContain('_screenshot capture failed_');
  });

  it('seed undefined → "Seed: random" 포함', () => {
    const md = renderMonkeyReport({ ...baseData, seed: undefined });
    expect(md).toContain('Seed: random');
  });

  it('seed 값 지정 시 → "Seed: 42" 포함', () => {
    const md = renderMonkeyReport({ ...baseData, seed: 42 });
    expect(md).toContain('Seed: 42');
  });

  it('appPackage 가 헤더에 포함됨', () => {
    const md = renderMonkeyReport(baseData);
    expect(md).toContain('# Monkey Report — com.example.app');
  });

  it('events / durationMs / generatedAt 값이 출력에 포함됨', () => {
    const md = renderMonkeyReport(baseData);
    expect(md).toContain('Events: 500');
    expect(md).toContain('Duration: 12345 ms');
    expect(md).toContain('Generated: 2026-05-01T00:00:00.000Z');
  });

  it('screenshotPath 존재 시 ![last-screen] 이미지 태그 포함', () => {
    const md = renderMonkeyReport({ ...baseData, screenshotPath: '/tmp/last-screen.png' });
    expect(md).toContain('![last-screen](/tmp/last-screen.png)');
  });

  it('전체 markdown 형식 snapshot 회귀 가드 (REQ-005)', () => {
    const md = renderMonkeyReport({
      appPackage: 'com.snapshot.test',
      events: 100,
      durationMs: 5000,
      crashes: [
        { type: 'CRASH', excerpt: 'CRASH: NullPointerException', lineIndex: 3 },
      ],
      screenshotPath: null,
      generatedAt: '2026-01-01T00:00:00.000Z',
      seed: 99,
    });
    expect(md).toMatchSnapshot();
  });
});
