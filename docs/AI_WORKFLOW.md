# Demonstrating efficient AI use

The strongest story is an inspectable, reproducible outcome supported by decisions you can explain. PatchPilot's initial implementation was AI-assisted under a human-defined brief. Do not imply that you manually wrote every line or personally checked steps you have not reviewed.

| Supervisor decision | Evidence to keep |
| --- | --- |
| What the product should do | Scope and acceptance criteria |
| Where autonomy ends | Allowed files, sandbox, budgets, human gate |
| What counts as success | Preserved original suite and failing-before/passing-after regression |
| Whether a patch is useful | Review note with edge cases and remaining concerns |
| Whether AI use is efficient | Measured tasks, tokens, latency, and cost against a comparable baseline |

Supported now: an implemented local prototype; a typed agent workflow, dashboard, API, traces, tests, and review gate; real fixture execution; and 62 backend plus 9 UI tests passing. This is an AI-assisted build with explicit verification limits.

Claims that require more evidence include percentage time savings, general autonomous bug-resolution accuracy, production sandbox readiness, superiority of multiple roles over a single-call baseline, and real-user adoption. None is established by this fixture demo.

## Record a real supervision session

```text
Issue / run ID:
Mode and model:
Acceptance criteria and allowed files:
Before-and-after test evidence:
Patch lines I inspected:
Edge cases I checked:
Tokens, duration, and estimated cost:
Human decision and reason:
Remaining limitation / next experiment:
```

To strengthen the internship story, run live evaluation, inspect patches yourself, and retain decisions you can explain. Record productivity against a baseline before claiming an efficiency percentage.
