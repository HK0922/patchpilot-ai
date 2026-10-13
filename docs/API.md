# API reference

Base URL: `http://127.0.0.1:8000`. Interactive schema: `/docs`.

When `PATCHPILOT_API_TOKEN` is configured, send `Authorization: Bearer <token>` for every API request except health/config. Model keys are configured only in the server environment.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/health` | Service status/version |
| GET | `/api/config` | Available execution modes and prerequisite booleans; no secrets |
| GET | `/api/projects` | Bundled and registered project metadata; no solution recipes |
| POST | `/api/projects/import` | Register a portable repair request; returns 201; no execution |
| GET | `/api/runs` | Recent runs, newest first |
| POST | `/api/runs` | Queue a validated run; returns 202 |
| GET | `/api/runs/{id}` | Complete run, test evidence, and events |
| POST | `/api/runs/{id}/cancel` | Request cancellation of a queued/running job |
| POST | `/api/runs/{id}/decision` | Save a human approve/reject decision on a verified run |
| GET | `/api/runs/{id}/events?after=N` | SSE events after the supplied monotonic cursor |
| GET | `/api/runs/{id}/patch` | Download a verified unified patch |
| GET | `/api/runs/{id}/export` | Download complete run evidence as a ZIP |

## Start a run

```json
{
  "project_id": "pagination",
  "mode": "demo",
  "issue": null,
  "max_attempts": 3,
  "token_budget": 30000
}
```

`mode` is `demo` or `openai`. Custom issue text requires live mode. Unknown fields are rejected. Attempt limit is 1-4. Token ceiling is 8,000-100,000. Issue length is capped at 4,000 characters. Demo mode is available only for bundled trusted cases.

## Review a patch

```json
{
  "decision": "approve",
  "note": "Read both files, verified the new regression, and checked page-size-one behavior."
}
```

The allowed decisions are `approve` and `reject`. Only `awaiting_review` runs accept a decision. A second decision returns 409. Neither decision applies or merges code.

## Event stream

Events use `event: update`, an integer `id`, and JSON `data`. The stream ends with `event: done` for terminal engine statuses, including `awaiting_review`. Resume with `after=<last-id>`. The React client uses authenticated polling instead, because native EventSource does not support a bearer header.

## Error behavior

| Status | Meaning |
| --- | --- |
| 400 | Unsupported demo/custom-issue combination |
| 401 | Missing or incorrect local bearer token |
| 403 | Cross-origin browser mutation blocked |
| 404 | Unknown project or run |
| 409 | Invalid decision, cancellation, or patch-download state |
| 422 | Request fails typed validation |
| 429 | Local worker queue full |
| 503 | Live provider/sandbox prerequisites missing |

Model or tool failure after a job starts is recorded in the run as `needs_attention`. Provider response bodies and model keys are not included in client errors.

## Import a repair request

POST the JSON exported by the Your repository page to `/api/projects/import`. The exact schema is `RepairRequest` in `patchpilot/models.py`: kind `patchpilot-repair-request`, schema_version 1, project_id, title, issue, acceptance_criteria, files (path-to-source map), editable_files, priority, max_attempts, and token_budget. Unknown fields are rejected.

The service checks a 600 KB payload limit, validates source syntax/policy and the complete edit scope before registration, and reserves existing project IDs. A duplicate returns 409, invalid scope/source/schema returns 422, and an oversized payload returns 413. The route uses the same token and origin controls as other mutations. It never executes uploaded source. The registered repository is available for a subsequent live run without restarting.
