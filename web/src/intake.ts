import type { Run } from './types';

export interface SourceFile { path: string; source: string; }
export interface RepairDraft {
  id: string; projectId: string; title: string; issue: string; criteria: string;
  priority: 'high' | 'normal' | 'low'; files: SourceFile[]; editable: string[];
  attempts: number; tokens: number; updatedAt: string; state: 'draft' | 'exported' | 'registered';
}
export interface RepairBundle {
  schema_version: 1; kind: 'patchpilot-repair-request'; project_id: string;
  title: string; issue: string; acceptance_criteria: string[]; priority: RepairDraft['priority'];
  editable_files: string[]; files: Record<string, string>; max_attempts: number; token_budget: number;
}
export const QUEUE_KEY = 'patchpilot.issue-queue.v2';
export const FORM_KEY = 'patchpilot.current-request.v2';
export const blankDraft = (): RepairDraft => ({
  id: crypto.randomUUID(), projectId: '', title: '', issue: '', criteria: '', priority: 'normal',
  files: [], editable: [], attempts: 3, tokens: 30000, updatedAt: new Date().toISOString(), state: 'draft',
});
export function slug(title: string) { return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 49); }
export function safePath(path: string) {
  return /^(src|tests)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.py$/.test(path)
    && !path.split('/').some(part => part.startsWith('.'));
}
export function sourcePath(file: File): string | null {
  const relative = file.webkitRelativePath;
  const path = relative ? relative.split('/').slice(1).join('/')
    : `${file.name.startsWith('test') ? 'tests' : 'src'}/${file.name}`;
  if (!path.endsWith('.py') || !path.startsWith('src/') && !path.startsWith('tests/')) return null;
  if (!safePath(path)) throw new Error(`Unsupported file path: ${path}`);
  return path;
}
export function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => {
      try { resolve(new TextDecoder('utf-8', { fatal: true }).decode(reader.result as ArrayBuffer)); }
      catch { reject(new Error(`${file.name} must be UTF-8 text.`)); }
    };
    reader.readAsArrayBuffer(file);
  });
}
export async function readSources(input: FileList | File[]): Promise<{ files: SourceFile[]; skipped: number }> {
  const selected = Array.from(input);
  const candidates = selected.map(file => ({ file, path: sourcePath(file) })).filter(item => item.path !== null);
  if (candidates.length > 60) throw new Error('Select at most 60 Python files.');
  let bytes = 0;
  const paths = new Set<string>();
  const files: SourceFile[] = [];
  for (const { file, path } of candidates) {
    if (file.size > 65536) throw new Error(`${file.name} exceeds the 64 KiB file limit.`);
    bytes += file.size;
    if (bytes > 512000) throw new Error('The snapshot exceeds 500 KiB.');
    if (paths.has(path!)) throw new Error(`Duplicate file path: ${path}`);
    paths.add(path!);
    files.push({ path: path!, source: await readText(file) });
  }
  if (!files.length) throw new Error('No Python files found under src/ or tests/.');
  return { files: files.sort((a, b) => a.path.localeCompare(b.path)), skipped: selected.length - files.length };
}
export function criteria(draft: RepairDraft) { return draft.criteria.split('\n').map(x => x.trim()).filter(Boolean); }
export function combinedIssue(draft: RepairDraft) { return `${draft.issue.trim()}\n\nAcceptance criteria:\n${criteria(draft).map(x => `- ${x}`).join('\n')}`; }
export function validateDraft(draft: RepairDraft): string[] {
  const errors: string[] = [];
  if (!/^[a-z][a-z0-9-]{1,48}$/.test(draft.projectId)) errors.push('Use a project ID of 2–49 lowercase letters, digits, and hyphens, starting with a letter.');
  if (draft.title.trim().length < 3 || draft.title.trim().length > 120) errors.push('Add a title of 3–120 characters.');
  if (draft.issue.trim().length < 10) errors.push('Describe the bug and how to reproduce it.');
  if (combinedIssue(draft).length > 4000) errors.push('Keep the issue and acceptance criteria together under 4,000 characters.');
  if (criteria(draft).length < 1 || criteria(draft).length > 12 || criteria(draft).some(x => x.length > 240)) errors.push('Add 1–12 acceptance criteria, one per line, with at most 240 characters each.');
  if (!draft.files.length || draft.files.length > 60 || draft.files.some(x => !safePath(x.path))) errors.push('Import up to 60 Python files under src/ and tests/.');
  if (new Set(draft.files.map(x => x.path)).size !== draft.files.length) errors.push('Remove duplicate file paths.');
  if (!draft.files.some(x => /^tests\/(?:.*\/)?test[^/]*\.py$/.test(x.path))) errors.push('Include at least one unittest test file under tests/.');
  if (draft.files.some(x => x.path === 'tests/test_patchpilot_regression.py')) errors.push('Rename tests/test_patchpilot_regression.py; that name is reserved for the agent.');
  if (!draft.editable.length || new Set(draft.editable).size !== draft.editable.length || draft.editable.some(x => !x.startsWith('src/') || x.endsWith('__init__.py') || !draft.files.some(f => f.path === x))) errors.push('Select at least one existing source module as the edit scope.');
  if (draft.files.some(x => new TextEncoder().encode(x.source).length > 65536)) errors.push('Each file must be smaller than 64 KiB.');
  // Approximate Python's ASCII JSON context encoding, including its separator spaces.
  const context = Object.fromEntries(draft.files.filter(x => x.path.startsWith('tests/') || draft.editable.includes(x.path)).map(x => [x.path, x.source]));
  const ascii = JSON.stringify(context).replace(/[\u007f-\uffff]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
  if (ascii.length + Object.keys(context).length * 2 > 50000) errors.push('The selected source and tests exceed the 50 KiB model-context limit.');
  if (![1, 2, 3, 4].includes(draft.attempts) || draft.tokens < 8000 || draft.tokens > 100000) errors.push('Use 1–4 attempts and an 8k–100k token budget.');
  return errors;
}
export function bundle(draft: RepairDraft): RepairBundle {
  const errors = validateDraft(draft);
  if (errors.length) throw new Error(errors[0]);
  return { schema_version: 1, kind: 'patchpilot-repair-request', project_id: draft.projectId,
    title: draft.title.trim(), issue: draft.issue.trim(), acceptance_criteria: criteria(draft),
    editable_files: draft.editable, files: Object.fromEntries(draft.files.map(x => [x.path, x.source])),
    priority: draft.priority, max_attempts: draft.attempts, token_budget: draft.tokens };
}
export function exampleDraft(): RepairDraft {
  return { ...blankDraft(), projectId: 'shop-discount-rounding', title: 'Discount totals round inconsistently',
    issue: 'Our checkout uses round() on floating-point totals. discounted_total(2.675, 0) returns 2.67. Currency ties should round half up to 2.68, including negative refund amounts.',
    criteria: '2.675 with zero discount returns 2.68\nNegative refund ties round away from zero\nExisting discount behavior stays intact',
    files: [{ path: 'src/discounts.py', source: 'def discounted_total(subtotal, percent):\n    return round(subtotal * (1 - percent / 100), 2)\n' },
      { path: 'tests/test_discounts.py', source: 'import unittest\nfrom src.discounts import discounted_total\n\nclass DiscountTests(unittest.TestCase):\n    def test_regular_discount(self):\n        self.assertEqual(discounted_total(100, 10), 90)\n\n    def test_currency_tie(self):\n        self.assertEqual(discounted_total(2.675, 0), 2.68)\n' }],
    editable: ['src/discounts.py'] };
}
export function parseEvidence(text: string): Run {
  if (new TextEncoder().encode(text).length > 1_000_000) throw new Error('Evidence exceeds the 1 MB import limit.');
  let data: Run;
  try { data = JSON.parse(text); } catch { throw new Error('Choose a PatchPilot run.json evidence export.'); }
  const states = ['queued', 'running', 'awaiting_review', 'approved', 'rejected', 'needs_attention', 'cancelled', 'interrupted'];
  if (!data || typeof data !== 'object' || !states.includes(data.status) || !['demo', 'openai'].includes(data.mode)
    || !['id', 'project_id', 'project_title', 'issue', 'diff', 'stage', 'created_at'].every(key => typeof data[key as keyof Run] === 'string')
    || !Array.isArray(data.files_changed) || data.files_changed.some(x => typeof x !== 'string')
    || !Array.isArray(data.tests) || data.tests.some(x => !x || typeof x.output !== 'string' || typeof x.passed !== 'boolean' || typeof x.phase !== 'string' || ![x.tests_run, x.failures, x.errors, x.duration_ms].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0))
    || !Array.isArray(data.events) || data.events.some(x => !x || !['role', 'stage', 'message', 'created_at'].every(key => typeof x[key as keyof typeof x] === 'string'))
    || !data.metrics || ![data.metrics.total_tokens, data.metrics.duration_ms, data.attempt, data.max_attempts].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)
    || typeof data.regression_verified !== 'boolean'
    || !(data.metrics.estimated_cost_usd === null || typeof data.metrics.estimated_cost_usd === 'number' && Number.isFinite(data.metrics.estimated_cost_usd) && data.metrics.estimated_cost_usd >= 0)
    || ![data.pr_title, data.pr_body].every(x => x === undefined || typeof x === 'string')
    || !(data.error === null || typeof data.error === 'string')
    || ![null, 'object'].includes(data.plan === null ? null : typeof data.plan)
    || data.plan && (!['summary'].every(key => typeof data.plan![key as keyof typeof data.plan] === 'string') || !['steps', 'target_files', 'acceptance_criteria', 'risks'].every(key => Array.isArray(data.plan![key as keyof typeof data.plan]) && (data.plan![key as keyof typeof data.plan] as unknown[]).every(x => typeof x === 'string')))
    || data.review && (typeof data.review.summary !== 'string' || !Array.isArray(data.review.concerns) || data.review.concerns.some(x => typeof x !== 'string')))
    throw new Error('The file is not a complete PatchPilot run export.');
  return { ...data, id: `imported-${crypto.randomUUID()}`, experiment: 'imported-evidence', evidence_origin: 'imported', original_run_id: data.id };
}
