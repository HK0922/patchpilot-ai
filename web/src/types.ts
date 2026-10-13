export interface Project {
  id: string; title: string; issue: string; tag: string;
  category: string; editable_files: string[]; demo_available: boolean; language: string;
}
export interface TestEvidence {
  phase: string; passed: boolean; returncode: number; duration_ms: number;
  tests_run: number; failures: number; errors: number; output: string;
  timed_out: boolean; runner: string;
}
export interface AgentEvent {
  sequence: number; created_at: string; role: string; stage: string;
  message: string; level: string; data: Record<string, unknown>;
}
export interface Run {
  id: string; project_id: string; project_title: string; issue: string;
  mode: 'demo' | 'openai'; status: string; stage: string; attempt: number;
  max_attempts: number; token_budget: number; created_at: string;
  metrics: { duration_ms: number; total_tokens: number; input_tokens: number;
    output_tokens: number; model_calls: number; estimated_cost_usd: number | null; cached_input_tokens: number };
  events: AgentEvent[]; tests: TestEvidence[]; diff: string; files_changed: string[];
  plan: { summary: string; steps: string[]; target_files: string[]; acceptance_criteria: string[]; risks: string[] } | null;
  review: { verdict: string; summary: string; concerns: string[] } | null;
  decision: { decision: string; note: string; created_at: string } | null;
  regression_verified: boolean; error: string | null; patch_summary: string;
  pr_title?: string; pr_body?: string; experiment?: string;
  evidence_origin?: 'imported'; original_run_id?: string;
}
export interface Comparison {
  project_id: string; title: string; one_shot_success: boolean; loop_success: boolean;
  loop_attempts: number; one_shot_ms: number; loop_ms: number; final_tests: number;
}
export interface Report {
  generated_at: string; mode: string; disclosure: string; python_version: string;
  projects: Project[]; runs: Run[]; comparisons: Comparison[];
  summary: { repair_cases: number; one_shot_successes: number; loop_successes: number;
    loop_median_ms: number; policy_probes: number; policy_blocks: number; final_passing_tests: number };
}
export interface Config {
  kind: string; live_ready: boolean; auth_required: boolean;
  model?: string | null; live_blocker?: string | null;
  source_archive_available?: boolean;
  repository_intake?: boolean;
}
