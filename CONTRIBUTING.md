# Contributing to PatchPilot

Changes should improve the bounded repair workflow, its evidence, or the developer's ability to supervise it. Start with a reproducible bug or a scoped proposal. Larger changes should state which user task they improve and how they will be validated.

## Local setup

Follow [SETUP.md](docs/SETUP.md). Create a branch for the change. Keep dependencies pinned through the existing Python and npm lock files. Do not commit `.env`, access tokens, model keys, runtime snapshots, databases, or generated downloads.

## Checks

From the project root:

```bash
python -m pytest
python scripts/benchmark.py
cd web
npm ci
npm test
npm run build
```

For backend execution changes, build the sandbox image and run pytest with `PATCHPILOT_DOCKER_INTEGRATION=1` on a Docker-capable machine. Run the checks relevant to the change; report skipped or unavailable checks plainly.

## Expectations

- Preserve strict role/request contracts and the distinction between model proposals and tool authority.
- Keep existing tests outside the agent's editable scope. A regression must fail on original source and pass after repair.
- Preserve attempt, time, token, output, and snapshot limits. No silent unsandboxed fallback for live code.
- Cover meaningful success, failure, and recovery behavior for functional changes.
- Keep the browser, scripted demo, imported evidence, and live execution modes clearly labeled.
- Use project-local UX/UI guidance for interface work, as routed in `AGENTS.md`.
- Keep code and documentation consistent with the behavior actually implemented.

## Pull requests

Describe the problem and the resulting behavior, the validation performed, and any material limitations. Include screenshots only when they show the actual rendered interface. Do not fabricate metrics, test outcomes, or model performance.

AI-assisted contributions are welcome. The contributor remains responsible for understanding the change, checking generated output, and accurately describing its validation. Summarize material AI assistance when it helps a reviewer assess the work.

## License

Contributions are provided under the project's MIT license. Preserve applicable third-party notices.
