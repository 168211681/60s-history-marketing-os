# Owner-authenticated production smoke test

This is a reusable checklist, not evidence that every item has passed. The Phase 7
Production migration has already been applied. A partial owner-authenticated UI
smoke was reported: a research project, source, and claim were created; an invalid
supported transition was rejected; a supported transition with a supporting source
and reviewer note succeeded; the research project was deleted through the UI; and
Scripts and Insights loaded without visible errors. This is owner-reported browser
evidence, not an independently reproduced run or database-level deletion proof.
See [`Phase 7 final verification`](architecture/reviews/PHASE-7-FINAL-VERIFICATION.md)
for scope and remaining gaps.

Use the deployed Production URL in a private browser session. Do not record cookies,
access tokens, refresh tokens, or private analytics in screenshots. A single owner
session does not prove cross-owner isolation.

## Authentication and ownership

- Sign in with the intended Google account.
- Confirm the UI identifies the authenticated owner.
- Confirm a second account cannot view the owner's channel, videos, metrics,
  insights, drafts, or archived workflow records.
- Confirm signing out removes access and direct private requests are rejected.

## Analytics

- Open `/analytics` and confirm stored metrics load for the connected channel.
- Trigger one owner-authorized YouTube sync from Settings.
- Confirm the sync reports success or a truthful provider error.
- Confirm missing metrics remain unavailable, not fabricated as zero.
- Confirm the sync does not create a production workflow or provider job.

## Scripts and intelligence

- Open `/insights` and confirm observations, comparisons, hypotheses, and
  experiments remain clearly separated.
- Open `/scripts` and create or save one draft.
- Confirm the draft remains human-reviewable and is not automatically rendered,
  uploaded, or published.
- Confirm MCP analytics/read tools work only with the owner-scoped bearer token.

## Production retirement

Using an authenticated browser or API client, verify these return HTTP `410` and
`PRODUCTION_RETIRED`:

- `POST /api/workflows/run`
- `POST /api/workflows/<id>/retry`
- `POST /api/workflows/<id>/publish`
- `POST /api/scripts/<id>/video`
- `POST /api/scripts/<id>/workflow`
- `GET /api/cron/production-workflow`

Finally run the read-only pending-job query and confirm no new job was created
during the test. Existing historical rows must remain intact.

Record only timestamps, HTTP status codes, sanitized error codes, deployment ID,
and migration/backup references.
