# Archived production worker

The internal production worker is retired. This document is kept as a migration note
for historical deployments only.

- `/api/cron/production-workflow` returns `410 Gone`.
- `/api/workflows/run` returns `410 Gone`.
- No GitHub Actions production-worker schedule is configured.
- Provider, artifact-storage, upload, retry, and publish calls are not made by the
  active application.
- Existing `production_workflows` and `production_workflow_events` rows remain
  read-only history.

Do not re-enable the old worker by adding secrets or schedules. The next production
milestone is an export package for external editing tools, governed by a new ADR.
