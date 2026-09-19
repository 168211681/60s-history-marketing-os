# Production worker

`Start production` creates an owner-scoped row in `production_workflows`. A worker
must call `/api/cron/production-workflow` to process that row and upload the
finished artifact to YouTube as Private.

Vercel Hobby only supports one scheduled cron invocation per day. The repository
therefore includes `.github/workflows/production-worker.yml` with a five-minute
schedule and a manual `workflow_dispatch` option.

Configure these GitHub repository secrets:

- `PRODUCTION_WORKER_URL`: `https://60s-history-marketing-os.vercel.app`
- `CRON_SECRET`: the same server-only value configured in Vercel

The workflow sends the secret only in the `Authorization` header. If GitHub
Actions is unavailable because the account is locked or quota-limited, queued work
is retained and another scheduler can call the protected endpoint. Never remove
the `CRON_SECRET` check or make the endpoint public.
