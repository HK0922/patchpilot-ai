# Evaluation

## What was measured

The initial experiment checks orchestration using four bundled Python bug fixtures and known demo repair recipes. The recipes are visible in `examples/catalog.json` and `DemoProvider`; they are not trained or inferred solutions.

Every case is executed once with a one-attempt limit and once with a three-attempt limit. Each execution runs original tests, an added regression on the original source, and the candidate suite. The invoice's first known recipe is deliberately insufficient to exercise the failure-feedback path.

| Case | One attempt | Repair loop | Final tests | What it checks |
| --- | --- | --- | --- | --- |
| Pagination | Verified | Verified, 1 attempt | 7 pass | Exclusive slice endpoint and page-size-one regression |
| Invoice | Stops on failed tests | Verified, 2 attempts | 7 pass | Half-up decimal rounding, including negative credits |
| Appointments | Verified | Verified, 1 attempt | 7 pass | UTC conversion preserving the instant; reject naive input |
| Slug | Verified | Verified, 1 attempt | 7 pass | Unicode normalization and collapsed separators |

Final repaired suites: 28 passing tests. Single-attempt handoff rate: 3/4. Retry-loop handoff rate: 4/4. These rates describe the supplied recipes and fixtures only.

A fifth, separate policy probe deliberately proposes a prohibited dynamic system operation. It is blocked before patch application and has no candidate diff. It is excluded from the repair denominator.

Initial evaluation uses the trusted-fixture subprocess runner. Model calls: zero. API charges: zero. Recorded duration is actual local orchestration and subprocess time, not inference latency. The tiny single-run sample prevents broad timing conclusions.

## Reproduce

```bash
python scripts/benchmark.py
```

The script writes complete evidence to `benchmarks/results.json` and the replay dataset to `web/public/demo-data.json`. Rebuild the frontend after refreshing the dataset. IDs, timestamps, and timings vary by execution.

## Automated verification

Backend tests cover workflow evidence gates, retries, cancellation, decisions, persistence, exact edits, file escapes, prohibited operations, immutable tests, bounded snapshots, provider contracts/usage, API authentication, and runner limits. Dashboard tests cover diff lines, review gates, replay disclosure, logs, filtering, and replay without API mutations. TypeScript and Vite validate the frontend build.

Initial environment: 62 backend tests and 9 dashboard tests passed; one real Docker integration test was skipped because Docker was unavailable. Provider tests use HTTPX mocks. UI tests use jsdom; browser layout verification was unavailable. The configured GitHub CI job builds Docker and enables the optional integration test, but no remote CI job has run here.

## Live experiment to run next

Use at least 20 held-out issues from small standard-library Python repositories. Keep issue IDs, source snapshots, and acceptance tests fixed. Never include demo golden solutions in model context.

Compare the same model, contracts, source context, and sampling configuration under two conditions: one implementation attempt and up to three attempts with test/review feedback. Repeat each issue/condition at least three times. Keep independent acceptance tests that the implementer cannot modify; visible tests alone can be overfit.

| Metric | Definition |
| --- | --- |
| Resolved issue rate | Held-out acceptance and unchanged original suites both pass |
| First-attempt success | Resolved without a second implementation attempt |
| Recovery rate | Initially failing issues resolved by a later bounded attempt |
| Time to verified handoff | Wall time including role calls and tests |
| Token usage | Provider-reported input, output, total, and cached tokens |
| Estimated cost / resolved issue | Configured-price estimate divided by resolved issues |
| Policy block rate | Prohibited requests stopped before unsafe execution |
| Human override rate | Reviewer-approved patches rejected by the supervisor |
| Scope of change | Files and source lines changed |

Report per-case outcomes and uncertainty. Do not turn scripted results into a resume claim about LLM accuracy. A SWE-bench claim requires the actual benchmark, its prescribed harness, and split.
