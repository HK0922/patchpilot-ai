# Roadmap

The v0.2 local workflow, repository intake, saved draft queue, portable requests, evidence review, API, CLI, persistence, and fixture evaluation are implemented. Additional milestones:

| Milestone | Definition of done |
| --- | --- |
| Live validation | Run the Docker image and real model calls on a fixture; inspect patch and usage. |
| Held-out evaluation | At least 20 held-out issues, repeated one-attempt/retry comparisons, independent acceptance tests, complete failures and successes. |
| GitHub workflow | Authenticated issue ingestion and an explicit draft-PR action after review; no automatic merge. |
| Larger projects | Explicit manifests, prebuilt dependency images, broader file types, context selection, repository checks. |
| Stronger verification | Held-out suites, property or mutation tests, adversarial gate probes. |
| Operational hosting | Identity, user isolation, durable workers, abuse limits, secrets management, stronger hostile-code isolation. |

Validate the small live milestone before adding frameworks or claiming production readiness.
