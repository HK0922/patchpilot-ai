# Security policy

PatchPilot is a local prototype for bounded, dependency-free Python modules. It is not a public service for arbitrary hostile repositories. Run the API on loopback and configure `PATCHPILOT_API_TOKEN` when enabling live use.

## Reporting a concern

Report sensitive findings privately to the repository maintainer. Use GitHub's private vulnerability reporting feature if it is enabled. If no private reporting channel is available, open a minimal issue requesting one without exploit details or sensitive data.

Include the affected version, a minimal reproduction, the expected boundary, and the observed behavior. Use synthetic data. Never include model keys, access tokens, private source, personal data, or real runtime snapshots.

No response-time commitment or third-party security audit is claimed.

## Implemented boundaries

- Strict typed requests and role output; normalized relative paths and source allowlists.
- Protected existing tests, atomic candidate-file replacement, and before/after regression checks.
- Bounded snapshots, context, attempt counts, deadlines, output, and model token reservation.
- Docker required for live candidate execution; no model credentials or Docker socket inside the container.
- No arbitrary shell tool for model roles, automatic patch application, push, or merge.
- Token-protected API operations when configured and blocked cross-origin browser mutations.
- Uploaded user repositories never use the trusted fixture subprocess runner.

AST filtering is a conservative policy layer, not complete Python isolation. The configured Docker path requires validation on a Docker-capable machine. A production hostile-code service would need a separate threat model, stronger isolation, monitoring, identity, and operational controls.

Do not weaken a boundary to make a demo appear successful. Report rejected input or an unavailable environment as an actionable failure.
