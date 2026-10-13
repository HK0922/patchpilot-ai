import { describe, expect, it } from 'vitest';
import { diffLines, duration, gate } from './utils';
import type { Run } from './types';

describe('evidence utilities', () => {
  it('distinguishes file headers from added and removed source and tracks line numbers', () => {
    const lines = diffLines('--- a/src/a.py\n+++ b/src/a.py\n@@ -2,2 +2,2 @@\n-old\n+new\n kept\n');
    expect(lines[0].kind).toBe('file');
    expect(lines[1].kind).toBe('file');
    expect(lines[3]).toMatchObject({ kind: 'remove', old: '2', next: '' });
    expect(lines[4]).toMatchObject({ kind: 'add', old: '', next: '2' });
    expect(lines[5]).toMatchObject({ kind: 'context', old: '3', next: '3' });
  });
  it('does not confuse a passing regression-on-original run with a passing final suite', () => {
    const run = { tests: [{ phase: 'Regression on original / attempt 1', passed: true },
      { phase: 'Patched suite / attempt 1', passed: false }], regression_verified: false,
      review: { verdict: 'approve' }, decision: null } as unknown as Run;
    expect(gate(run)).toEqual({ tests: false, regression: false, reviewer: true, human: false });
  });
  it('displays actual measured durations without fabricated rounding to minutes', () => {
    expect(duration(251)).toBe('251 ms');
    expect(duration(2410)).toBe('2.41 s');
  });
});
