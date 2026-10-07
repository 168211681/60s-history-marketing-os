# Staging database validation CI

`.github/workflows/validate-staging-db.yml` is a read-only validation workflow.
It runs only for same-repository pull requests or an explicit `workflow_dispatch`
and uses the protected `history-ci` self-hosted runner.

The workflow never runs `db push`, migration repair, reset, seed, or schema-write
commands. It compares the repository migrations with the isolated Staging
project and runs the existing local database tests plus the read-only retirement
verification query. Staging identity is two independent checks: the database
URL must target `haqpqifxlqpihkmhkwdu`, and one GET
`https://api.supabase.com/v1/projects/haqpqifxlqpihkmhkwdu` must return that
same project. The token is project-scoped, so the workflow does not call
`supabase projects list`. The workflow proves PostgreSQL connectivity first, then
reads `supabase_migrations.schema_migrations` with a SELECT-only query and
compares the returned versions with local filenames. The comparison is exact
equality of the ordered version lists, not a count and not a pending allowance.
Do not treat the older 18-migration snapshot as today's hosted inventory.
Sprint 004 is Production-complete. This branch has one pending local file,
`20261007200200_clipforge_youtube_source_metadata`, which has not been applied
to Staging or Production. A pull request opened before a separate reviewed apply
will fail this exact-equality gate. That failure is intentional until the
migration is reviewed.
`20261006175601_clipforge_projects_and_content_items` was applied separately to
Staging after review. The pending-migration helper remains in the repository for
a future reviewed difference and is not this pull-request gate. This avoids relying
on the failing `supabase migration list` connection path.

If the CLI cannot connect, only sanitized diagnostics are surfaced. The database
URL, password and access token are never printed.

## Required GitHub secrets

Configure these in the repository settings before enabling the workflow:

- `SUPABASE_STAGING_ACCESS_TOKEN`: a Supabase access token scoped to the
  `60s-history-staging` project only, with Project Settings read and no other
  permissions. The workflow uses it for one GET of that project. Do not use a
  Production token, a legacy account-wide token, or `supabase projects list`.
  Never print the token or Authorization header.
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

This migration is already present in Staging. The Phase 7 workflow is historical
infrastructure. Do not rewrite it into a ClipForge apply workflow, and do not
weaken its fail-closed 15/16 checks. Do not dispatch it again against the
current project. ClipForge recognition belongs only to the read-only validator
in `validate-staging-db.yml`.

The rehearsal completed successfully in run `36001809750`. That record showed
Staging version `20260924041349` in a 16-version history. Staging later received
`20260928140124` and, after a separate reviewed apply,
`20261006175601_clipforge_projects_and_content_items`. Staging and `main` now have 18
versions. This branch has one additional pending migration,
`20261006210730_clipforge_distribution_assets`, which this workflow must not apply.
The validation workflow must not apply SQL.
Hosted catalog inspection at the Phase 7
rehearsal confirmed the four research tables, RLS/FORCE RLS, expected read
policies, indexes, foreign keys, and timestamp triggers. This workflow does not
test a two-owner authenticated UI/API session. Local database tests are not
equivalent to hosted Auth/Data API testing.

The Staging six-file export has **not** been verified at runtime. Code inspection
confirms that the owner-scoped export route calls `researchForScript` and that the
package builder composes evidence status, source references, supported claims and
known uncertainties into the existing files. Tests assert the six filenames, linked
project ID and source-reference count; separate research tests cover evidence
classification, and export tests cover missing-evidence behavior. They do not test
the route's database lookup or establish a successful hosted Staging export.

## Manual reconciliation apply

`.github/workflows/apply-staging-reconciliation.yml` is a separate,
`workflow_dispatch`-only historical operation for migration
`20260923231944_reconcile_content_experiments_schema.sql`. At the time it ran, it
verified 14 pre-apply versions, applied that single migration, then verified 15
versions, new columns, RLS, and unchanged row count. Current Staging has 18
migrations, including `20260928140124_password_setup_authorizations` and
`20261006175601_clipforge_projects_and_content_items`. The workflow is serialized under `staging-db-mutation`, uses only the
Staging secrets, and has no Production or pull-request trigger. Do not dispatch
this historical apply workflow again against the already-reconciled Staging
project; its preconditions should fail closed.

The workflow is bootstrapped from `main`, then checks out the immutable reviewed
source commit `98dacc62137d17470cadd512556558432c603c87` and verifies the pinned
reconciliation migration filename and SHA-256 before any database command. This
keeps the manual apply path available without making the open application PR the
workflow definition or trusting a mutable branch name.
