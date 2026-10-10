# Sprint 004.4B — Human-controlled bulk metadata review

Baseline: `41feaba633b01d885faf7c9e30a3c7aaff468bf0` on `main`, verified against
GitHub before implementation. Branch: `feat/clipforge-bulk-review-0044b`.
All development and verification use an isolated checkout and disposable local
PostgreSQL. Hosted Staging and Production have not been modified.

## Workflow

1. On `/review`, select individual pending, non-stale clips from the displayed
   page. Selection is limited to ten; there is no library-wide selection.
2. Choose **Preview accept** or **Preview reject**. The server loads current
   owner-scoped records in a read-only, repeatable-read transaction. No audit
   row, metadata update, inference request, or other write occurs.
3. Inspect each clip's title, project, current and suggested metadata,
   confidence, and explanation. Null confidence is unavailable, not zero.
   Long explanations have an expandable full-text view.
4. For Accept, explicitly select Topic, Content pillar, and/or Production type
   separately for each clip. No field is preselected. Missing or disallowed
   fields cannot be chosen. Reject lists the suggestions that will be rejected
   and makes clear that canonical metadata stays unchanged.
5. **Review batch** requests a second server-validated preview with the selected
   fields and the original suggestion/revision identities. A changed selection
   fails rather than silently substituting new values. The confirmation view
   freezes the fields and shows the exact affected count.
6. **Confirm accept/reject** is the separate mutation step. All selected decisions
   commit together or none do. Refresh the queue after success to load its new
   state. Individual **Review clip** links remain available.

Page, filter, or data-snapshot changes reset selection and discard confirmation.
Page hiding and component unmount abort pending requests and ignore late results.
Returning through the browser's page cache reloads the read-only queue. Once a
confirmation has reached the server, leaving the page cannot undo a committed
transaction; inspect the refreshed queue if the page was closed during a request.

## API and trust boundary

Both endpoints are same-origin POSTs:

- `/api/content-items/bulk-review/preview`
- `/api/content-items/bulk-review/confirm`

Both require the existing `appOrigin()` exact Origin check and `currentOwner()`
server-side Supabase `getUser()` verification against the configured owner.
Authentication precedes payload parsing and database access. Responses are
`Cache-Control: no-store`. Neither endpoint accepts an owner identity, AI values,
status, or canonical metadata from the browser.

Strict schemas reject unknown properties, malformed or duplicate UUIDs,
duplicate/invalid fields, empty batches, more than ten clips, fields on Reject,
and Accept confirmations with no fields for a clip. UUIDs and field order are
normalized before duplicate and retry checks. The store revalidates the schema
as well as the HTTP handler. Missing and cross-owner IDs produce the same generic
conflict and never a partial preview.

The preview revision is a SHA-256 optimistic-concurrency value, not a credential
or authorization token. It includes the existing classification fingerprint,
current canonical fields (including pillar), project identity/name, and the
stored suggestion. Confirmation reloads the server values and compares this
revision, suggestion identity, pending status, current prompt version, and
staleness before any decision is applied. It never accepts browser AI values.

Bulk Reject deliberately refuses stale suggestions too. The existing individual
review behavior, which allows rejecting a stale pending suggestion, is unchanged.

## Shared rules, locking, and atomicity

`classification-review.ts` contains the existing context loader, source lock
helper, and `reviewLockedSuggestion()` implementation extracted unchanged from
`classification-store.ts`. The original store imports/re-exports that helper;
single-item Accept/Reject and generation still use it. Bulk confirmation also
uses it, including `reviewClassification()` and project-specific `pillarAllowed()`
validation. No parallel metadata update implementation was added.

Confirmation runs in one existing `transaction()` callback:

1. Set a transaction-local RLS role and the verified owner claim; set a five-second
   statement timeout and three-second lock timeout.
2. Reserve `(owner_id, request_id)` by inserting the audit receipt with
   `ON CONFLICT DO NOTHING`. This unique-key operation serializes identical
   concurrent requests. The row is invisible to other transactions until commit.
3. If a receipt already exists, return its outcome only when the normalized
   request digest matches. Reusing an ID for a different action, item set, fields,
   or revisions is a conflict.
4. Lock all selected content rows in UUID order. Reuse the existing context lock
   order: content, project, YouTube platform relationship, channel, video. Channel
   precedes video, matching sync's existing locking order. Lock selected
   suggestions in content/UUID order.
5. Reload the current suggestions using the queue's shared deterministic
   `currentSuggestionsSql` selection and existing fingerprint function. Validate
   the entire batch, including per-field availability and project pillar rules.
6. Call `reviewLockedSuggestion()` for each clip in UUID order and require the
   expected reviewed outcome. Throw on any failure, including a mid-batch error.
   The surrounding transaction rolls back earlier decisions and the audit row.
7. Commit all decisions and the receipt together. No partial-success response is
   possible. A lost response can be recovered with the same request ID and body.

There are no automatic confirmation retries. The client immediately blocks
repeated clicks. A network/503 outcome retains the exact confirmation and offers
**Retry same confirmation**; it does not create a new request ID or retry on its
own. A 409 clears the actionable preview. Transient lock/statement failures are
rolled back; they do not relax eligibility or return partial results.

## Additive migration and RLS

New migration, generated using `supabase migration new`:

`supabase/migrations/20261009180957_clipforge_bulk_review_audit.sql`

The migration adds:

- `public.content_bulk_review_batches`: owner/request composite primary key,
  action, normalized request hash, a bounded JSON array of content and suggestion
  IDs, accepted fields and revisions, completed outcome, and timestamp. The
  timestamp records receipt creation inside the successful transaction; success
  becomes visible only at commit. Failed transactions leave no success receipt.
- Forced RLS on that audit table. Authenticated users may read only their own
  receipts and cannot insert, update, or delete them. The application bulk role
  has SELECT/INSERT only, with owner policies; there is no UPDATE/DELETE grant.
- A `clipforge_bulk_reviewer` role with NOLOGIN, NOSUPERUSER, NOINHERIT and
  NOBYPASSRLS, granted to the server roles `postgres` and `service_role`. It is
  not granted to `authenticated`, `anon`, or `authenticator`.
- Minimal source SELECT grants and owner policies; updates are restricted to
  the canonical metadata fields and suggestion review columns required by the
  shared helper. The connection explicitly `SET LOCAL ROLE`s into this role for
  both previews and confirmations, so a privileged connection's BYPASSRLS does
  not bypass bulk-operation policies. Claims and role reset at transaction end.
- Lock-only UPDATE privileges on source relation IDs. PostgreSQL `FOR SHARE`
  needs both a column privilege and row visibility through UPDATE policies.
  Those source policies have owner-scoped `USING` and `WITH CHECK (false)`:
  row locks work, but every actual source update is rejected. Local concurrent
  tests verify this for projects, platform posts, channels, and videos.

No existing RLS policy or grant to browser roles is broadened. No SECURITY
DEFINER function, new login, credential, trigger, background job, publishing
integration, or provider change is introduced. The audit IDs intentionally have
no cascading content/suggestion foreign keys, so deleting a clip cannot erase
its review receipt. Administrators remain responsible for audit retention.

All 22 historical migrations remain byte-for-byte unchanged. Intentional
remote/local version divergence remains intact. Repository inventory tests now
pin the new 23rd migration; hosted migration equality checks were not weakened.

### Application and migration rollback

This task **does not apply the migration to hosted Staging or Production**.
Before isolated hosted acceptance, review the migration, confirm the server
connection can assume `clipforge_bulk_reviewer`, and apply it through the normal
explicitly authorized Staging migration process. Missing role/table/permission
fails closed with an unavailable response. The new app must not be released
against an unmigrated database.

Preferred rollback after any use is to redeploy the preceding 004.4A application
and retain the additive table, policies, and receipts. That restores the previous
UI without erasing audit history or rewriting reviewed metadata. There is no
automatic undo of human decisions. Existing single-item review does not use the
new role or table.

If removing unused migration objects is later approved, first stop all bulk
traffic and verify the audit table is empty (or retain/export receipts under an
approved retention plan). In a separately reviewed reverse migration, remove
only the `bulk_review_*` policies introduced on the six existing relations,
remove the audit table, revoke this role's table/function/schema privileges and
membership from `postgres`/`service_role`, then drop `clipforge_bulk_reviewer`.
Do not use `DROP ... CASCADE`, alter historical migration files, reset hosted
schemas, normalize migration versions, or delete used receipts as a routine
rollback. No reverse migration was applied in this task.

## Verification

Local environment: Node 22.23.2, locked npm dependencies, PostgreSQL 17.11, Linux.
The existing database harness loads bootstrap plus all migrations into a fresh
Unix-socket cluster, rejects TCP, ignores hosted `DATABASE_URL`/`PG*` variables,
and removes the cluster after testing. No hosted database credentials are used.

Final verification completed on 2026-10-09:

| Check | Result |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | 147 passed |
| `npm run test:db` | 59 passed; no skips |
| `npm run build -- --webpack` | PASS |
| Playwright: bulk review, review queue, batch classification, workspace | 121 passed; 2 existing mobile skips |
| `git diff --check` | PASS |

The two skips are the existing desktop-only skip-to-content test on the mobile
Chromium and WebKit projects; the new bulk keyboard-checkbox checks ran on all
three projects. The final combined browser run uses the repository's unconfigured
origin profile. An earlier configured-local-origin run also verified real
unauthenticated bulk responses return 401, after the origin check passes. Existing
workspace tests require the unconfigured profile (403), so the initial combined
run's three status-expectation failures were resolved by using that profile,
without changing application authentication or existing assertions.

Database coverage includes actual per-field writes, a full ten-clip batch, Reject
preserving canonical values, every ineligible review state, missing/stale
suggestions, source/project/pillar/status/identity changes between preview and
confirmation, invalid H60 pillars, wrong-owner IDs, audit access and immutability,
RLS role isolation, lock blocking, concurrent identical/overlapping requests,
retry receipts, and rollback after an injected second-item failure. Existing
single-item stale-Reject behavior is also exercised through the real helper.

Browser tests exercise the actual React components with fictional intercepted
preview/confirmation responses, plus real unauthenticated Next.js endpoints.
They cover selection caps/resets, unselected default fields, separate confirmation,
double clicks, manual retry with an unchanged request, stale/conflict/failure
states, pagehide/unmount cleanup, null confidence, keyboard controls, touch
targets, layout overflow, and axe accessibility checks. Real authenticated
Supabase browser sessions are not fabricated; owner testing remains a hosted gate.

WebKit initially failed before launch because its preflight uses the global
`ldconfig` cache. The cached local `libGLESv2` package was extracted outside the
repository and its runtime load verified. WebKit runs use the local library path
and `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` only to skip that global-cache
preflight. The actual WebKit browser and all application assertions still run.
No repository dependency, Playwright configuration, or browser assertion was
disabled to accommodate the local environment.

## Recommendation and remaining gates

**PASS for local implementation and security verification.** Ready for review and
**isolated Staging acceptance** after the migration is approved and applied there.
This is not approval for immediate Production release.

Remaining gates:

1. Review and explicitly authorize applying the additive migration to isolated
   Staging; verify the configured server principal can assume the RLS role.
2. Required latest-head GitHub/Vercel checks. The existing exact Staging migration
   equality gate will remain blocked until Staging has the approved migration;
   this task must not bypass that protection.
3. Owner acceptance on physical iPhone Safari: field choices, preview/confirmation,
   ten-clip limits, conflict/refresh behavior, successful audit receipts, and
   continued single-item/batch-classification operation.
4. Confirm hosted transaction latency and contention with the actual deployment
   and connection pool. Local synthetic tests do not establish hosted performance.

There is no audit browser UI or audit of failed attempts in this sprint. Aborted
previews are intentionally unwritten. A confirmation interrupted by page closure
must be checked through a refreshed queue; the in-memory retry control does not
survive navigation. Server idempotency and reviewed-state validation continue to
prevent duplicate application. No AI, YouTube metadata, R2, publishing, hosted
data, merge, or Production deployment is part of this delivery.

## Exact changed files

- `docs/bulk-review-0044b.md`
- `package.json`
- `src/app/api/content-items/bulk-review/confirm/route.ts`
- `src/app/api/content-items/bulk-review/preview/route.ts`
- `src/app/globals.css`
- `src/components/bulk-review.tsx`
- `src/components/review-queue.tsx`
- `src/lib/clipforge/bulk-review-http.ts`
- `src/lib/clipforge/bulk-review-store.ts`
- `src/lib/clipforge/bulk-review.ts`
- `src/lib/clipforge/classification-review.ts`
- `src/lib/clipforge/classification-store.ts`
- `supabase/migrations/20261009180957_clipforge_bulk_review_audit.sql`
- `tests/clipforge-batch-classification.test.ts`
- `tests/clipforge-bulk-review.test.ts`
- `tests/clipforge-classification.test.ts`
- `tests/database/bulk-review.mjs`
- `tests/database.test.mjs`
- `tests/e2e/bulk-review.spec.ts`
- `tests/e2e/review-queue.spec.ts`
- `tests/fixtures/review-queue.tsx`
- `tests/staging-pending-migration.test.ts`
- `tests/staging-phase7-workflow.test.ts`
