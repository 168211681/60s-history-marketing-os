# Staging database validation CI

`.github/workflows/validate-staging-db.yml` is a read-only validation workflow.
It runs only for same-repository pull requests or an explicit `workflow_dispatch`
and uses the protected `history-ci` self-hosted runner.

The workflow never runs `db push`, migration repair, reset, seed, or schema-write
commands. It compares the repository migrations with the isolated Staging
project and runs the existing local database tests plus the read-only retirement
verification query. The workflow proves PostgreSQL connectivity first, then
reads `supabase_migrations.schema_migrations` with a SELECT-only query and
compares the returned 13 versions with local filenames. This avoids relying on
the failing `supabase migration list` connection path.

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
