# PatchPilot AI v0.2: repository intake and evidence review

Version 2 adds a practical module-repair workflow around the existing agent engine. The earlier interface is retained at `/v1/`, with its first workflow action fixed. The main app now opens on Your repository.

## What works on the hosted page

- Select a repository folder or individual Python files. Only source and tests under `src/` and `tests/` enter the request. Unrelated files are skipped without reading their contents.
- Inspect each file. Choose exactly which source modules the agent may edit.
- Define a reproducible issue, acceptance criteria, priority, attempt limit, and token ceiling.
- Save up to eight requests in a browser-local queue. Reopen, edit, remove, and undo removal. Priority sorts the draft queue; it does not change server scheduling.
- Export a portable `.patchpilot.json` request containing the selected snapshot and constraints.
- Import a complete `run.json` evidence export and inspect its diff, tests, activity, plan, and review. Imported results are labeled as supplied by the file; the hosted page does not independently verify or re-execute them.
- Start the recorded workflow using the first Explore action or the replay control. Neither creates a live repair job.

Draft source snapshots persist in browser local storage. Imported run evidence remains in page memory until reload. The hosted static app does not execute Python or call a model. Files transfer to the local API only when Register with local service is explicitly selected while using that local app.

## Execute a real repair locally

Install/build as described in `SETUP.md`, configure the server-side model/API key, and build the Docker sandbox. Then choose either path:

1. In the local browser app, open Your repository, import files, and click Register with local service. Registration creates a snapshot and makes it available immediately. Inspect the issue and budgets, then click Run PatchPilot when live mode is ready.
2. Export the request from the hosted page, move it to your local project directory, and run:

```bash
patchpilot import shop-discount-rounding.patchpilot.json
patchpilot run shop-discount-rounding --mode openai
patchpilot inspect YOUR_RUN_ID > run.json
```

Replace the filename and project ID with the ones in your request. CLI runs inherit imported attempt/token budgets unless you explicitly override them. Importing a request does not start a repair. The model and Docker must be configured before live execution can proceed.

Review the result locally to approve/reject it, or bring `run.json` back to the hosted page through Repair runs → Import evidence. Approval records a decision and does not apply, push, or merge source changes. Download and review the patch before applying it manually.

## Supported repository boundary

Dependency-free Python source under `src/`, unittest tests under `tests/`, at most 60 Python files including package initializers, at most 64 KiB per file, 500 KiB snapshot, and 50 KiB selected model context. The intake rejects normalized-path violations, reserved regression filenames, missing tests, invalid Python, and prohibited system/network/dynamic/file operations. Existing initializers are preserved; missing package initializers are added to the copied snapshot for test discovery.

Registered user repositories are always untrusted. They cannot use the fixture subprocess runner or scripted demo provider; live repairs require Docker. Existing tests remain outside the editable allowlist. Registration never executes uploaded Python.

This is a local engineering prototype for bounded modules. Dependency installation, arbitrary framework repositories, GitHub issue ingestion, automatic PR creation, and multi-user cloud execution remain future work.

## Validation

Backend registration tests cover persistence across restart, exact source scope, snapshots without execution, duplicate protection, path escapes, prohibited operations, missing/reserved tests, payload and context limits, token/origin checks, nested packages, and portable CLI import. Frontend tests cover the first Explore action, draft persistence, delete/undo, scope-based export blocking, storage failure, file filtering, malformed evidence, and registration without automatic execution.

The Work Mode container has no `/proc`, causing Node's RSS memory call to fail inside Vitest workers. A temporary test-only preload uses V8 heap statistics and an unavailable-RSS sentinel so the runner can finish; application code and assertions are unchanged. This adapter is not shipped in the application. Normal `npm test` remains the command for development and CI environments with standard process interfaces.

No real model call or Docker execution was available in the build environment. Browser layout/keyboard QA remains unavailable. Fixture benchmark data remains the historical scripted evaluation, not a benchmark of this new real-repository capability.
