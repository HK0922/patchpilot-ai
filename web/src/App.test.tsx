// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { Report } from './types';

const report: Report = {
  generated_at: '2026-10-10T17:00:00Z', mode: 'scripted-fixture-evaluation', disclosure: 'Known demo recipes, real tests, not an LLM benchmark.', python_version: '3.12',
  projects: [{ id: 'pagination', title: 'Pagination drops the last item', issue: 'Fix an off-by-one error.', tag: 'API', category: 'repair', editable_files: ['src/pagination.py'], demo_available: true, language: 'Python' }],
  summary: { repair_cases: 1, one_shot_successes: 1, loop_successes: 1, loop_median_ms: 100, policy_probes: 1, policy_blocks: 1, final_passing_tests: 7 },
  comparisons: [{ project_id: 'pagination', title: 'Pagination drops the last item', one_shot_success: true, loop_success: true, loop_attempts: 1, one_shot_ms: 100, loop_ms: 100, final_tests: 7 }],
  runs: [{ id: 'test-run-id', project_id: 'pagination', project_title: 'Pagination drops the last item', issue: 'Fix an off-by-one error.', mode: 'demo', status: 'awaiting_review', stage: 'complete', attempt: 1, max_attempts: 3, token_budget: 30000, created_at: '2026-10-10T17:00:00Z',
    metrics: { duration_ms: 100, total_tokens: 0, input_tokens: 0, output_tokens: 0, model_calls: 0, estimated_cost_usd: 0, cached_input_tokens: 0 },
    events: [{ sequence: 1, created_at: '2026-10-10T17:00:00Z', role: 'system', stage: 'complete', message: 'Verified patch is ready.', level: 'success', data: {} }],
    tests: [{ phase: 'Patched suite / attempt 1', passed: true, returncode: 0, duration_ms: 30, tests_run: 7, failures: 0, errors: 0, output: 'Ran 7 tests\nOK', timed_out: false, runner: 'trusted-fixture-subprocess' }],
    diff: '--- a/src/pagination.py\n+++ b/src/pagination.py\n@@ -1 +1 @@\n-return items[start:end-1]\n+return items[start:end]\n', files_changed: ['src/pagination.py'],
    plan: { summary: 'Fix the exclusive slice endpoint.', steps: ['Fix the return'], target_files: ['src/pagination.py'], acceptance_criteria: ['Seven tests pass'], risks: ['Known fixture'] },
    review: { verdict: 'approve', summary: 'Scoped fix, tests pass.', concerns: [] }, decision: null, regression_verified: true, error: null, patch_summary: 'Fix the slice.', experiment: 'repair-loop', pr_title: 'Fix pagination', pr_body: 'Tests pass; human review required.' }],
};

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (input: string) => input.includes('demo-data')
    ? new Response(JSON.stringify(report), { status: 200, headers: { 'Content-Type': 'application/json' } })
    : new Response('{}', { status: 404 })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('recorded dashboard', () => {
  it('starts a recorded replay from the first workflow action without creating a job', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^Repair runs/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Explore an executed workflow' }));
    expect(screen.getByText('Recorded agent activity')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Verified patch is ready.')).toBeTruthy());
    expect(vi.mocked(fetch).mock.calls.some(call => (call[1] as RequestInit | undefined)?.method === 'POST')).toBe(false);
  });
  it('clearly labels replay and prevents editing a scripted issue', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^Repair runs/ }));
    await screen.findByRole('heading', { name: 'The repair desk.' });
    expect(screen.getByText('RECORDED DEMO')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Issue to resolve' }).getAttribute('readonly')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Replay this workflow' })).toBeTruthy();
  });
  it('shows executed test counts and logs on the Tests tab', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^Repair runs/ }));
    await screen.findByRole('tab', { name: /Tests/ });
    fireEvent.click(screen.getByRole('tab', { name: /Tests/ }));
    expect(screen.getByText('Executed test evidence')).toBeTruthy();
    expect(screen.getByText('Patched suite / attempt 1')).toBeTruthy();
    expect(screen.getByText(/Ran 7 tests/)).toBeTruthy();
  });
  it('opens a review checklist without offering a fabricated saved approval', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^Repair runs/ }));
    await screen.findByRole('tab', { name: 'Review' });
    fireEvent.click(screen.getByRole('tab', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open review checklist' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/Review decisions are saved only/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve patch' })).toBeNull();
  });
  it('filters run history without hiding the full evidence of a selected run', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^Repair runs/ }));
    await screen.findByRole('textbox', { name: 'Search runs' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Search runs' }), { target: { value: 'unmatched' } });
    expect(screen.getByText('No matching runs.')).toBeTruthy();
    expect(screen.getByText('1 files changed')).toBeTruthy();
  });
  it('exposes the benchmark disclosure and measured comparison', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^Repair runs/ }));
    await screen.findByRole('button', { name: 'Evaluation' });
    fireEvent.click(screen.getByRole('button', { name: 'Evaluation' }));
    expect(screen.getByRole('heading', { name: 'Measure the workflow.' })).toBeTruthy();
    expect(screen.getByText(report.disclosure)).toBeTruthy();
  });
  it('replays events without making a run mutation request', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^Repair runs/ }));
    await screen.findByRole('button', { name: 'Replay this workflow' });
    fireEvent.click(screen.getByRole('button', { name: 'Replay this workflow' }));
    expect(screen.getByText('Recorded agent activity')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Verified patch is ready.')).toBeTruthy());
    expect(vi.mocked(fetch).mock.calls.some(call => (call[1] as RequestInit | undefined)?.method === 'POST')).toBe(false);
  });
});

it('launches the first Explore action from the new repository home', async () => {
  render(<App />);
  await screen.findByRole('heading', { name: 'A real issue. Your code.' });
  fireEvent.click(screen.getByRole('button', { name: 'Explore an executed workflow' }));
  expect(screen.getByText('Recorded agent activity')).toBeTruthy();
  await waitFor(() => expect(screen.getByText('Verified patch is ready.')).toBeTruthy());
  expect(vi.mocked(fetch).mock.calls.some(call => (call[1] as RequestInit | undefined)?.method === 'POST')).toBe(false);
});

it('imports run evidence with visible provenance and no mutation request', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /^Repair runs/ }));
  const input = await screen.findByLabelText('Import run evidence file');
  fireEvent.change(input, { target: { files: [new File([JSON.stringify(report.runs[0])], 'run.json', { type: 'application/json' })] } });
  expect(await screen.findByText('Imported evidence · not re-executed here')).toBeTruthy();
  expect(screen.getByText('test-run-id')).toBeTruthy();
  expect(vi.mocked(fetch).mock.calls.some(call => (call[1] as RequestInit | undefined)?.method === 'POST')).toBe(false);
});

it('registers a user request with the local service but does not launch it automatically', async () => {
  vi.mocked(fetch).mockImplementation(async (input, options) => {
    const path = String(input);
    const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
    if (path.includes('demo-data')) return json(report);
    if (path === '/api/config') return json({ kind: 'local-service', live_ready: false, auth_required: false, repository_intake: true, live_blocker: 'Configure a model and Docker.' });
    if (path === '/api/projects/import') {
      const body = JSON.parse(String(options?.body));
      return json({ id: body.project_id, title: body.title, issue: body.issue, tag: 'Your repository', category: 'registered', editable_files: body.editable_files, demo_available: false, language: 'Python' });
    }
    if (path === '/api/projects') return json(report.projects);
    if (path === '/api/runs') return json([]);
    return new Response('{}', { status: 404 });
  });
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /Load a checkout example/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Register with local service' }));
  await screen.findByRole('heading', { name: 'The repair desk.' });
  const mutation = vi.mocked(fetch).mock.calls.find(call => String(call[0]) === '/api/projects/import');
  expect(JSON.parse(String(mutation?.[1]?.body)).editable_files).toEqual(['src/discounts.py']);
  expect(screen.getByRole('button', { name: 'Run PatchPilot' }).hasAttribute('disabled')).toBe(true);
  expect(vi.mocked(fetch).mock.calls.some(call => String(call[0]) === '/api/runs' && call[1]?.method === 'POST')).toBe(false);
});
