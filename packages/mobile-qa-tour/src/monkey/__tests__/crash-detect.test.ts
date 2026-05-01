import { describe, it, expect } from 'vitest';
import { extractCrashes } from '../crash-detect';

// REQ-001, REQ-002, REQ-003 검증
describe('REQ-001~003 extractCrashes', () => {
  it('빈 logcat 문자열 입력 시 빈 배열 반환', () => {
    const result = extractCrashes('');
    expect(result).toEqual([]);
  });

  it('FATAL EXCEPTION 1건 → type: FATAL + lineIndex + excerpt 반환', () => {
    const logcat = 'some line\nFATAL EXCEPTION: main\n  at Foo.bar(Foo.java:10)\nend';
    const result = extractCrashes(logcat);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('FATAL');
    expect(result[0].lineIndex).toBe(1);
    expect(result[0].excerpt).toContain('FATAL EXCEPTION');
  });

  it('ANR in 패턴 1건 → type: ANR 반환', () => {
    const logcat = 'I/am: ok\nANR in com.foo.app\ntrace...';
    const result = extractCrashes(logcat);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('ANR');
  });

  it('CRASH: 패턴 1건 → type: CRASH 반환', () => {
    const logcat = 'normal line\nCRASH: NullPointerException\nstack trace';
    const result = extractCrashes(logcat);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('CRASH');
  });

  it('ANR + CRASH 혼합 logcat → 2건 반환 + type 순서 정합 (REQ-002)', () => {
    const logcat = [
      'line0',
      'ANR in com.example.app',
      'details of anr',
      'line3',
      'line4',
      'line5',
      'line6',
      'line7',
      'line8',
      'line9',
      'line10',
      'CRASH: RuntimeException',
      'crash detail',
    ].join('\n');
    const result = extractCrashes(logcat);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('ANR');
    expect(result[1].type).toBe('CRASH');
  });

  it('같은 라인에 FATAL EXCEPTION 과 CRASH: 가 있어도 1건만 반환 (break 검증)', () => {
    // FATAL EXCEPTION 이 먼저 매치되면 break — CRASH: 도 포함된 가공 라인
    const logcat = 'FATAL EXCEPTION: CRASH: com.foo';
    const result = extractCrashes(logcat);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('FATAL');
  });

  it('excerpt = 매치 라인 + 후속 최대 9 라인 (총 10 라인) — REQ-003', () => {
    const lines = ['FATAL EXCEPTION: main'];
    for (let i = 1; i <= 15; i++) lines.push(`line${i}`);
    const logcat = lines.join('\n');
    const result = extractCrashes(logcat);
    expect(result).toHaveLength(1);
    expect(result[0].excerpt.split('\n').length).toBeLessThanOrEqual(10);
  });

  it('logcat 끝 근처 매치 시 excerpt 가 파일 끝까지만 (범위 초과 없음)', () => {
    const logcat = 'normal\nFATAL EXCEPTION: late';
    const result = extractCrashes(logcat);
    expect(result).toHaveLength(1);
    expect(result[0].excerpt.split('\n').length).toBeLessThanOrEqual(10);
  });
});
