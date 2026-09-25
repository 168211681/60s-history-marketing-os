# Staging database validation CI

`.github/workflows/validate-staging-db.yml` is a read-only validation workflow.
It runs only for same-repository pull requests or an explicit `workflow_dispatch`
and uses the protected `history-ci` self-hosted runner.

The workflow never runs `db push`, migration repair, reset, seed, or schema-write
commands. It compares the repository migrations with the isolated Staging
project and runs the existing local database tests plus the read-only retirement
verification query. The workflow proves PostgreSQL connectivity first, then
reads `supabase_migrations.schema_migrations` with a SELECT-only query and
compares the returned migration versions with local filenames. The currently
verified repository and Staging project each contain 16 migration versions. This
avoids relying on the failing `supabase migration list` connection path.

If the CLI cannot connect, only sanitized diagnostics are surfaced. The database
URL, password and access token are never printed.

## Required GitHub secrets

Configure these in the repository settings before enabling the workflow:

- `SUPABASE_STAGING_ACCESS_TOKEN`: a Supabase access token scoped for the Staging
  project only. Do not use a Production token.
- `SUPABASE_STAGING_DATABASE_URL`: the Staging PostgreSQL connection string for
  database `postgres`, port `5432`. The workflow accepts either the direct host
  `db.haqpqifxlqpihkmhkwdu.supabase.co` with user `postgres`, or the official
  Supabase Session Pooler host with user
  `postgres.haqpqifxlqpihkmhkwdu`. Session Pooler is preferred when the runner
  has no usable IPv6 route. Store the value as a secret and never print the
  connection string in logs.

The workflow rejects the Production project reference
`rscwajzsjvguezyisvja`, verifies the expected Staging ref
`haqpqifxlqpihkmhkwdu`, and refuses a different database, port, username or
host. A shared pooler hostname is not trusted by itself; the project identity
comes from the exact `postgres.<PROJECT_REF>` username. Never log the URL.

The workflow does not provide credentials to fork pull requests. The self-hosted
runner is therefore never used for untrusted fork code.

## Completed Phase 7 Staging rehearsal

`.github/workflows/apply-staging-phase7-research.yml` is a separate manual,
`workflow_dispatch`-only workflow. It targets only Staging, uses the serialized
`staging-db-mutation` concurrency group, and pins the research migration source
to the immutable reviewed Phase 7 commit `0694991c82e150e4a4ea47fdf7eb9ab1aba61ed8`
and a pinned SHA-256. The trusted workflow and helper scripts remain in the
workflow checkout; only the migration payload is checked out into the separate
`phase7-source` directory. The temporary CLI workspace is built from the 15
migrations on `main` plus that one pinned payload, with a minimal temporary
Supabase config; the repository migration directory is never changed.

The bootstrap workflow infrastructure was reviewed and merged separately from
the Phase 7 application/schema PR. The workflow completed successfully in run
`36001809750`; the rehearsal did not merge the Phase 7 application.

Before applying, it requires exactly 15 remote versions and 16 isolated local
versions, with the sole local-minus-remote version
`20260924041349`. It independently verifies the Staging database URL and
Supabase API project identity, rejects the Production ref, checks that the
research tables do not already exist, and requires a successful dry-run that
does not report the database as up to date. Only then does it run the pinned
Supabase CLI `db push` against the verified Staging URL. It does not use
`apply_migration`, migration repair, reset, replay, seed, or Production
credentials. Post-apply checks verify the exact 16-version history, table
presence, RLS, policies, foreign keys, indexes, triggers, and the disposable
database regression suite.

This migration is already present in Staging. Do not dispatch the manual apply
workflow again against the current project; use the read-only validation workflow
for ongoing checks.

The rehearsal completed successfully in run `36001809750`. Read-only migration
history confirms Staging version `20260924041349` is present and matches the local
16-version set. Hosted catalog inspection confirmed the four research tables,
RLS/FORCE RLS, expected read policies, indexes, foreign keys, and timestamp triggers.
This workflow does not test a two-owner authenticated UI/API session. Local database
tests are not equivalent to hosted Auth/Data API testing.

The Staging six-file export has **not** been verified at runtime. Unit tests verify
the six filenames and that captions contain no fabricated timestamps. The current
export route only selects script-draft fields and the package builder does not load
the linked research project's claims and sources; research metadata inclusion is
therefore also unverified by code inspection. Do not present the six-file contract
test as proof of a Staging export or research-aware export.

## Manual reconciliation apply

`.github/workflows/apply-staging-reconciliation.yml` is a separate,
`workflow_dispatch`-only historical operation for migration
`20260923231944_reconcile_content_experiments_schema.sql`. At the time it ran, it
verified 14 pre-apply versions, applied that single migration, then verified 15
versions, new columns, RLS, and unchanged row count. Current Staging has 16
migrations. The workflow is serialized under `staging-db-mutation`, uses only the
Staging secrets, and has no Production or pull-request trigger. Do not dispatch
this historical apply workflow again against the already-reconciled Staging
project; its preconditions should fail closed.

The workflow is bootstrapped from `main`, then checks out the immutable reviewed
source commit `98dacc62137d17470cadd512556558432c603c87` and verifies the pinned
reconciliation migration filename and SHA-256 before any database command. This
keeps the manual apply path available without making the open application PR the
workflow definition or trusting a mutable branch name.
