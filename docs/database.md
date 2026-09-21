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
| `public.videos` | Video identity, title, topic, duration and channel FK | Read owned channel videos |
| `public.video_metrics` | Daily metrics keyed by `(video_id, metric_date)` | Read owned channel metrics |
| `public.channel_metrics` | Daily metrics keyed by `(channel_id, metric_date)` | Read owned channel metrics |
| `private.analytics_sync_jobs` | Manual reporting-window status, attempts and sanitized error code; unique `(channel_id, idempotency_key)` | No access |
| `private.youtube_connections` | Encrypted refresh token and owner/channel binding | No access |
| `private.production_workflow_events` | Sanitized archived production workflow transition telemetry and error codes | No access |
| `public.marketing_insights` | Observation/comparison/hypothesis/experiment with explicit provenance and evidence | Read owned channel insights |
| `public.content_ideas` | Title, angle and draft/shortlisted/archived status | Read/create/edit/delete own ideas |

Every table has `created_at`, `updated_at`, primary/unique keys, FKs and forced RLS.
`updated_at` is maintained by a security-invoker trigger in `private`; no
security-definer function or public RPC is added. Column grants prevent clients
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
write revokes on archived production tables in the retirement migration. Future
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

## Applying to Supabase later

This change has not been applied to any cloud project. Only apply it after choosing
an authorized development/staging project and reviewing existing schemas. The
migration intentionally fails on conflicting existing tables rather than silently
replacing them. There is no destructive automatic down migration.

The migration filename was generated with Supabase CLI 2.117.0. When cloud access
is available, use a trusted local terminal (not chat) to authenticate and initialize
or link the intended project. Review CLI help before running commands:

```sh
npx --yes supabase@2.117.0 init --help
npx --yes supabase@2.117.0 login --help
npx --yes supabase@2.117.0 link --help
npx --yes supabase@2.117.0 db push --help
```

Use `db push --dry-run --skip-vault` on the explicitly linked project first. Applying `db push --skip-vault`
requires separate authorization for that database; neither command has been run
against a cloud database by this task. Do not put credentials in command history
or tracked files. The app still needs no environment variables in sample mode.

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
