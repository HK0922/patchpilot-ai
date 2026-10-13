// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { bundle, exampleDraft, parseEvidence, readSources, sourcePath, validateDraft } from './intake';

const run = {
  id: 'external-run-123', project_id: 'shop', project_title: 'Rounding repair',
  issue: 'Fix rounding ties.', mode: 'openai', status: 'awaiting_review', stage: 'complete',
  created_at: '2026-10-13T14:00:00Z', diff: '+return fixed_total\n', files_changed: ['src/discounts.py'],
  tests: [], events: [], metrics: { duration_ms: 2000, total_tokens: 1000, estimated_cost_usd: null },
  attempt: 1, max_attempts: 3, regression_verified: true, plan: null, review: null, error: null,
};
describe('portable repair intake', () => {
  it('exports the exact user scope and criteria without an execution result', () => {
    const draft = exampleDraft();
    expect(validateDraft(draft)).toEqual([]);
    const request = bundle(draft);
    expect(request.files['src/discounts.py']).toContain('round(');
    expect(request.editable_files).toEqual(['src/discounts.py']);
    expect(request.acceptance_criteria).toHaveLength(3);
    expect('status' in request).toBe(false);
  });
  it('reads selected Python files while skipping unrelated secret files', async () => {
    const result = await readSources([new File(['VALUE = 1\n'], 'logic.py'), new File(['import unittest\n'], 'test_logic.py'), new File(['secret-token'], '.env')]);
    expect(result.files.map(x => x.path)).toEqual(['src/logic.py', 'tests/test_logic.py']);
    expect(result.skipped).toBe(1);
    expect(JSON.stringify(result)).not.toContain('secret-token');
  });
  it('rejects duplicate paths and traversal before assembling a snapshot', async () => {
    await expect(readSources([new File(['x=1'], 'logic.py'), new File(['x=2'], 'logic.py')])).rejects.toThrow('Duplicate');
    const file = new File(['x=1'], 'logic.py');
    Object.defineProperty(file, 'webkitRelativePath', { value: 'repo/src/../logic.py' });
    expect(() => sourcePath(file)).toThrow('Unsupported');
  });
  it('blocks test edits, oversized context, and empty acceptance criteria', () => {
    const draft = exampleDraft();
    expect(validateDraft({ ...draft, editable: ['tests/test_discounts.py'] })).toContain('Select at least one existing source module as the edit scope.');
    expect(validateDraft({ ...draft, criteria: '' }).some(x => x.includes('acceptance criteria'))).toBe(true);
    const tooLarge = { ...draft, files: [{ path: 'src/discounts.py', source: '# ' + 'a'.repeat(51000) }, draft.files[1]] };
    expect(() => bundle(tooLarge)).toThrow('model-context');
  });
  it('labels imported run claims without treating them as local execution', () => {
    const imported = parseEvidence(JSON.stringify(run));
    expect(imported.original_run_id).toBe(run.id);
    expect(imported.id).not.toBe(run.id);
    expect(imported.evidence_origin).toBe('imported');
    expect(imported.experiment).toBe('imported-evidence');
  });
  it('rejects incomplete or malformed evidence before it can reach the renderer', () => {
    expect(() => parseEvidence('not json')).toThrow('run.json');
    expect(() => parseEvidence(JSON.stringify({ id: 'fake', status: 'approved' }))).toThrow('complete');
    expect(() => parseEvidence(JSON.stringify({ ...run, metrics: { ...run.metrics, estimated_cost_usd: 'free' } }))).toThrow('complete');
    expect(() => parseEvidence(JSON.stringify({ ...run, pr_body: {} }))).toThrow('complete');
  });
});
