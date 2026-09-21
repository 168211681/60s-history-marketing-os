# Production worker

`Start production` creates an owner-scoped row in `production_workflows`. A worker
must call `/api/cron/production-workflow` to process that row and upload the
finished artifact to YouTube as Private.

Provider-generated URLs are treated as untrusted, short-lived inputs. The worker
copies a completed provider artifact into the private Supabase Storage bucket
before persisting its signed URL or sending it to YouTube. A provider URL is
never stored as the workflow artifact.

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
Transient provider failures and timeouts are automatically re-queued while the
workflow is below the ten-attempt cap, so the scheduled worker can continue
without a manual click. The owner can use the retry control in `/scripts` for a
workflow that has reached a terminal failed state. A timeout does not expose
provider payloads or credentials.

## Uploaded images and narration

With `VIDEO_PROVIDER=public-domain`, the worker requires owner-uploaded images
from the Scripts page and repeats an image when fewer than three are available;
it does not substitute images from another source. To require narration, set `VIDEO_REQUIRE_VOICE=true`, keep `HF_TOKEN`
server-only, and set `HF_TTS_MODEL` to a supported Hugging Face text-to-speech
model. If voice settings are missing, the worker leaves narration disabled and
renders the image-only MVP rather than claiming that audio was generated.
