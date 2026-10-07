# Database foundation

The migrations prepare storage for authenticated YouTube analytics and encrypted
refresh tokens. The application includes an owner-only manual sync, but it does not
provision cloud resources or add real data without explicit configuration. Anonymous
analytics pages remain sample-only; verified owner sessions can read synced data.

The [analytics contract](../src/lib/data/analytics-contract.ts) describes the
read-only server boundary implemented by `postgres-reader.ts`. Counts
are `bigint` and decimal values are exact strings so future adapters do not
silently lose precision; missing metrics remain `null`. The importer writes this
shape. `workspace.ts` performs a checked conversion for UI calculations and rejects
values outside JavaScript's safe numeric range instead of silently losing precision.

## Schema and ownership

| Table | Purpose and identity | Authenticated client access |
| --- | --- | --- |
| `public.users` | Minimal identity referencing `auth.users`; no duplicated email/profile data | Read own row |
| `public.channels` | Verified channel identity and `owner_id` | Read owned channels |
| `public.videos` | Video identity, title, topic, duration, channel FK, and YouTube source facts (description, HTTPS thumbnail URL, exact tags within YouTube's 500-character list budget, category id, languages, privacy, `metadata_synced_at`). Source columns come from Sprint 004.1, applied and verified on Staging and Production. Production's remote version is `20261007190850`; the repository file remains `20261007200200_clipforge_youtube_source_metadata.sql`. They are not an R2 asset | Read owned channel videos |
| `public.video_metrics` | Daily metrics keyed by `(video_id, metric_date)` | Read owned channel metrics |
| `public.channel_metrics` | Daily metrics keyed by `(channel_id, metric_date)` | Read owned channel metrics |
| `private.analytics_sync_jobs` | Manual reporting-window status, attempts and sanitized error code; unique `(channel_id, idempotency_key)` | No access |
| `private.youtube_connections` | Encrypted refresh token and owner/channel binding | No access |
| `private.password_setup_authorizations` | Hashed one-time recovery or invite grant bound to an owner, session, and flow. No client or `service_role` grant | No access |
| `private.production_workflow_events` | Sanitized archived production workflow transition telemetry and error codes | No access |
| `public.marketing_insights` | Observation/comparison/hypothesis/experiment with explicit provenance and evidence | Read owned channel insights |
| `public.content_ideas` | Title, angle and draft/shortlisted/archived status | Read/create/edit/delete own ideas |
| `public.projects` | ClipForge workspace name, optional code, description, and active/archived status. Owned directly by `owner_id`; not a YouTube channel | Read/create/edit/delete own projects |
| `public.content_items` | ClipForge content metadata owned through `projects` via `(project_id, owner_id)`. Includes owner-controlled `content_pillar` (empty until a person sets it; at most 80 characters; not a global pillar enum) | Read/create/edit/delete own items; cannot retarget `owner_id` |
| `public.content_classification_suggestions` | One AI suggestion for topic, content pillar, and production type. Not a source fact. No `updated_at`; review time is `reviewed_at` | Read own rows only. No authenticated insert, update, or delete |
| `public.content_assets` | Pointer to one private master video or thumbnail in Cloudflare R2 bucket `clipforge-assets`. Bytes are not in Postgres or Supabase Storage | Read/create/delete own pointers; cannot update filename, type, size, owner, path, kind, provider, bucket, or timestamps |
| `public.platform_posts` | Manual YouTube, Facebook, TikTok, and Instagram copy and status | Read/create/edit/delete own rows; cannot retarget owner or platform |

The ClipForge project and content tables are added by `supabase/migrations/20261006175601_clipforge_projects_and_content_items.sql`.
That migration was applied separately to Staging after review. Do not reapply it.
`supabase/migrations/20261006210730_clipforge_distribution_assets.sql` adds the
asset and platform tables and the `(project_id, owner_id)` covering index.
File bytes stay in the private Cloudflare R2 bucket `clipforge-assets`.
That file is on `main` and is used by the Production Sprint 004 import. Do not reapply it.
`supabase/migrations/20261007143000_clipforge_legacy_youtube_import.sql` is the
Production-complete Sprint 004 import. Do not rewrite it.
`supabase/migrations/20261007200200_clipforge_youtube_source_metadata.sql` stores
YouTube source facts on `public.videos` and does not change R2. It is applied
and verified on Staging and Production. Production's remote version is
`20261007190850` `clipforge_youtube_source_metadata`. Do not normalize that
version onto the repository filename, and do not reapply the file.
`supabase/migrations/20261008020000_clipforge_metadata_intelligence.sql` is
Sprint 004.2 and is branch/local only. It is not applied to Staging or
Production. Do not apply it from this branch, and do not claim hosted
verification for it.

`private.password_setup_authorizations` is the original file
`supabase/migrations/20260928140124_password_setup_authorizations.sql`.
Its SHA-256 is `9e79a69c7e5f000adb21b2db26e38a87af128c8d7453f187e2145eaffebd49f8`.
Staging project `haqpqifxlqpihkmhkwdu` already has this version. Sprint 002.5
restored the source; it did not apply the migration again. Production does not
contain it. The table has forced RLS, no allow policy, and no grant for `anon`,
`authenticated`, or `service_role`. It stores a hash, not a reusable browser
token, and it has no `updated_at` trigger.

Do not treat the older 18-migration snapshot as the current hosted inventory.
Sprint 004 is Production-complete: one ClipForge project, 41 stored YouTube
videos imported, 41 content items, 164 platform posts, re-import idempotency
verified, and duplicate external YouTube IDs = 0.
`20261007200200_clipforge_youtube_source_metadata` is applied and verified on
Staging and Production. Production has 43 YouTube videos, 43 metadata synced,
43 ClipForge content items, 172 platform posts, duplicate external IDs = 0, and
a successful v2 sync. Its remote version is `20261007190850`. Do not normalize
that history. Do not reapply the repository file.
Production migration history for Phase 6 and Phase 7 stays intentionally
divergent and must not be normalized. Do not apply
`20261008020000_clipforge_metadata_intelligence` to Staging or Production from
this branch.

Every table has `created_at`, primary/unique keys, FKs and forced RLS.
`content_classification_suggestions` is the exception to `updated_at`: it records
`created_at` and a nullable `reviewed_at` because a suggestion is not edited in
place. `updated_at` elsewhere is maintained by a security-invoker trigger in
`private`; no security-definer function or public RPC is added. Column grants prevent clients
from changing idea IDs, channel IDs or timestamps. Every update policy has both
`USING` and `WITH CHECK`.

All channel rows ultimately belong to `channels.owner_id`. A composite FK on
`video_metrics(video_id, channel_id)` prevents attaching one channel's video to
another channel's metrics, even from a privileged writer. Owner/channel lookup
columns and date/order queries have indexes. Daily metric primary keys and job
unique keys support idempotent writes. The manual server sync claims, retries and
completes these jobs without exposing them to clients.

`anon` has no table privileges. `authenticated` has only the operations in the
table above; all backend-owned rows are read-only. Grants are explicitly reset so
the migration does not depend on old or new Supabase default privileges. See the
[Supabase grant change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
and [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

`service_role` can perform server-side CRUD and bypasses RLS, except the explicit
write revokes on archived production tables in the retirement migration and the
complete revoke on `private.password_setup_authorizations`. Future
backend code must derive ownership from a verified session and verified Google authorization;
never accept a caller-supplied owner ID as authorization. Do not expose this key
to browser code. Keep `private` out of the Data API exposed-schema list. A worker
would need a secure server database connection to access private jobs.

## Metric semantics and safety

- Missing/unsupported metrics are `NULL`, never synthesized as zero. Negative
  counts and non-finite numeric durations/watch times are rejected.
- `metric_date` preserves the API-provided daily reporting date. The importer validates
  that each row falls inside the requested report window.
- Channel totals need not equal a locally stored subset of videos.
- An AI-origin insight must be a hypothesis or experiment with a model identifier.
  It cannot be labeled an observation/comparison. Content and evidence are untrusted
  plain text; the schema does not prove factual correctness or causality.
- No retention curve, CTR or revenue column is invented. API coverage must be
  checked before adding new metrics.
- Jobs store only constrained error codes, not provider response bodies. Refresh
  tokens are encrypted by the application before entering `private.youtube_connections`;
  the encryption key remains outside PostgreSQL.

Deleting an `auth.users` record cascades through its application identity,
channels and dependent rows. Backend account deletion must revoke sessions/tokens
first and require deliberate authorization; this migration exposes no delete API.
Deleting `public.users` alone does not delete the Supabase Auth identity.

## Run the database tests

On Ubuntu, install `postgresql` and `postgresql-contrib`. Ensure `pg_config` is
available and points at PostgreSQL 15+ (override `PATH` for a specific installation).
Then, from the repository as a non-root user:

```sh
npm run test:db
```

The runner starts a new PostgreSQL cluster in a user-only temporary directory,
disables TCP, applies all migrations in filename order, and runs real SQL under
`anon`, `authenticated` and `service_role`. It removes only its own temporary
cluster after stopping the server. It ignores `DATABASE_URL` and inherited `PG*`
variables, so it cannot reset an existing project. A restricted sandbox may need
permission to create the local socket and database process.

The test-only bootstrap supplies minimal `auth.users` and `auth.uid()` contracts.
**Never apply `tests/database/bootstrap.sql` or `fixtures.sql` to Supabase.** These
files simulate the role/identity boundary for database tests, not JWT verification
or the Supabase Auth service. SQL tests do not certify PostgREST/GraphQL behavior.

Coverage includes fresh migration application, thirteen RLS-protected tables,
legacy-grant removal, two-owner isolation, missing identity, anonymous denial,
read-only analytics, owner idea CRUD, cross-owner mutation denial, private jobs,
cross-channel FK integrity, sync job acquisition/transactional upserts, nullable metrics, invalid values,
insight provenance, workflow telemetry grants and account deletion isolation.

## Historical initial-migration instructions

The statement in this section that the initial schema had not been applied to a
cloud project was true when this foundation document was written; it is not the
current cloud state. Current migration identities and verification are recorded in
the [database transition runbook](database-transition.md). Do not treat the older
18-migration snapshot as today's hosted inventory. Sprint 004 is
Production-complete. `20261007200200_clipforge_youtube_source_metadata` is
applied and verified on Staging and Production. Production's remote version is
`20261007190850`. Do not normalize it or reapply the repository file.
`20261008020000_clipforge_metadata_intelligence` is branch/local only and is
not applied to Staging or Production.
The ClipForge projects migration
was applied separately to Staging after review. Production intentionally
uses different historical versions for Phase 6 and Phase 7, and it does not
contain the password-setup migration. Do not normalize Production history.

The initial migration intentionally fails on conflicting existing tables rather
than silently replacing them. There is no destructive automatic down migration.

The migration filename was generated with Supabase CLI 2.117.0. When cloud access
is available, use a trusted local terminal (not chat) to authenticate and initialize
or link the intended project. Review CLI help before running commands:

```sh
npx --yes supabase@2.117.0 init --help
npx --yes supabase@2.117.0 login --help
npx --yes supabase@2.117.0 link --help
npx --yes supabase@2.117.0 db push --help
```

The following CLI guidance is retained for a future, separately authorized
database change; it is not evidence of current migration state. Any future cloud
apply requires explicit human approval and a verified non-Production target. Do not
put credentials in command history or tracked files. The app still needs no
environment variables in sample mode.

Before real analytics go live, verify the migration with Supabase Auth and Data
API owner/foreign-owner/anonymous sessions, run the Supabase database advisors,
generate database types from the deployed schema, and implement a session-scoped
server data adapter. Auth provisioning must create `public.users` server-side;
there is no auth trigger that could silently interfere with sign-up.

## Verification limits

Local native PostgreSQL validates SQL and RLS semantics. It does not verify a
hosted Supabase project, its advisors, JWT issuance, exposed-schema configuration,
Google ownership, token encryption, or cloud networking. Those remain explicit
integration tasks; database availability is not claimed in the UI.
