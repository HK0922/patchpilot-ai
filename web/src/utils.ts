import type { Run } from './types';

export const TERMINAL = new Set(['awaiting_review', 'approved', 'rejected', 'needs_attention', 'cancelled', 'interrupted']);
export const VERIFIED = new Set(['awaiting_review', 'approved', 'rejected']);
export const STATUS: Record<string, string> = {
  awaiting_review: 'Ready for review', approved: 'Approved', rejected: 'Rejected', needs_attention: 'Needs attention',
  running: 'Running', queued: 'Queued', cancelled: 'Cancelled', interrupted: 'Interrupted',
};
export function duration(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}
export function diffLines(diff: string) {
  let oldLine = 0, newLine = 0;
  return diff.split('\n').map((text) => {
    if (text.startsWith('@@')) {
      const match = text.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) { oldLine = +match[1] - 1; newLine = +match[2] - 1; }
      return { text, kind: 'hunk', old: '', next: '' };
    }
    if (text.startsWith('---') || text.startsWith('+++')) return { text, kind: 'file', old: '', next: '' };
    if (text.startsWith('+')) return { text, kind: 'add', old: '', next: String(++newLine) };
    if (text.startsWith('-')) return { text, kind: 'remove', old: String(++oldLine), next: '' };
    if (text.startsWith(' ')) return { text, kind: 'context', old: String(++oldLine), next: String(++newLine) };
    return { text, kind: 'other', old: '', next: '' };
  });
}
export function gate(run: Run) {
  const last = run.tests.filter(test => test.phase.startsWith('Patched suite')).at(-1);
  return {
    tests: !!last?.passed,
    regression: run.regression_verified,
    reviewer: run.review?.verdict === 'approve',
    human: run.decision?.decision === 'approve',
  };
}
export function download(name: string, content: BlobPart, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
