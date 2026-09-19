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

For a one-off run, an owner can open `/scripts` and select **Run worker now**.
This button uses the same protected worker endpoint and keeps the cron secret on
the server. It is a fallback for testing or when the scheduled worker is delayed.
The Scripts page also exposes a sanitized owner-only worker history for each
workflow; the browser never receives direct access to the private telemetry
table.

## Timeout and recovery

An in-progress provider job that has not changed state for 60 minutes is marked
`failed` with the constrained error code `PROVIDER_TIMEOUT`. The worker records
the transition in the backend-only workflow event table and returns HTTP 504.
The owner can use the retry control in `/scripts`; the existing ten-attempt cap
prevents an endless retry loop. A timeout does not expose provider payloads or
credentials.
