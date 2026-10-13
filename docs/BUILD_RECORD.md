# Initial build record

October 10, 2026. Brief: build PatchPilot AI for Harikrishna's AI portfolio, with the human supervising and the assistant implementing.

Implemented: Python service and CLI; typed planner/implementer/reviewer contracts; deterministic verifier; structured OpenAI provider and explicit scripted provider; bounded snapshots, edits, budgets, and retries; protected tests and before/after regression gate; SQLite events, cancellation, restart recovery, human decisions, patch exports; Docker invocation path; React dashboard and hosted replay; four repair fixtures and a policy probe; evaluation script, guides, and CI configuration.

Verified: 62 backend tests and 9 UI tests passed; production build passed; fixture evaluation reached handoff in 3/4 single-attempt and 4/4 retry-loop cases, with 28 passing final-suite tests; prohibited edit stopped before application. Provider behavior used mocked HTTP responses. Docker command configuration and fail-closed behavior were checked without a real Docker daemon.

Limits: no supplied model key, so no real model calls; Docker unavailable, so its real integration test skipped; no supported browser-control surface, so no browser layout QA; remote GitHub CI configured but not executed.

The assistant authored the initial implementation and documentation. The human defined the direction and retains responsibility for understanding, supervising, and accurately presenting the work. Add human review notes during real supervision sessions; do not fabricate them afterward.

## Version 2, October 13, 2026

Fixed the first Explore action and retained the earlier interface at `/v1/`. Added browser repository intake, file inspection, editable scope, acceptance criteria, budget controls, a persistent draft queue, request export, validated API/CLI registration, and imported run evidence with explicit provenance. Registration does not execute source or auto-start a repair. User snapshots remain untrusted and require Docker for live execution.

The previous Vitest hang was traced to Node's unavailable RSS memory interface in this container. A temporary test-only adapter allows the suite to complete without modifying application code or assertions. Live model/Docker and rendered browser checks remain unavailable.

Verified v0.2: 79 backend tests passed, one real-Docker integration check skipped; 23 frontend tests passed with a clean exit using the documented environment adapter; TypeScript and production build passed.
