# Changelog

## 0.2.0 — 2026-10-13

### Added

- Repository folder/file intake with source preview, editable scope, acceptance criteria, and budgets.
- Browser-local issue queue with priority, reopen, deletion, and undo.
- Portable repair requests and validated API/CLI registration without automatic execution.
- Run-evidence import with explicit supplied-data provenance.
- Project-local UX/UI skill pack and a revised paper/charcoal interface.
- Repository documentation, contribution/security guidance, issue forms, and separate CI jobs.

### Fixed

- The first Explore workflow action now starts recorded playback.
- Registered repositories select live mode and remain blocked until its prerequisites are ready.
- Nested unittest snapshots receive missing package initializers and preserve existing ones.
- The project account link points to HK0922.

### Preserved

- Earlier interface at `/v1/`.
- Existing source scope, protected tests, regression gate, retry budgets, review decisions, and fail-closed live execution.

## 0.1.0 — 2026-10-10

- Initial local agent engine, FastAPI service, CLI, structured provider, and deterministic verifier.
- SQLite run/events storage, cancellation, restart interruption handling, and human review.
- React evidence dashboard, four scripted repair fixtures, a prohibited-edit probe, and evaluation artifacts.
