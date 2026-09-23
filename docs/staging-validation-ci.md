# Staging database validation CI

`.github/workflows/validate-staging-db.yml` is a read-only validation workflow.
It runs only for same-repository pull requests or an explicit `workflow_dispatch`
and uses the protected `history-ci` self-hosted runner.

The workflow never runs `db push`, migration repair, reset, seed, or schema-write
commands. It compares the repository migrations with the isolated Staging
project and runs the existing local database tests plus the read-only retirement
verification query.

## Required GitHub secrets

Configure these in the repository settings before enabling the workflow:

- `SUPABASE_STAGING_ACCESS_TOKEN`: a Supabase access token scoped for the Staging
  project only. Do not use a Production token.
- `SUPABASE_STAGING_DATABASE_URL`: the Staging PostgreSQL connection string for
  `db.haqpqifxlqpihkmhkwdu.supabase.co`, database `postgres`. Store it as a
  secret and never print it in logs.

The workflow rejects the Production project reference
`rscwajzsjvguezyisvja`, verifies the expected Staging ref
`haqpqifxlqpihkmhkwdu`, and refuses a different database host.

The workflow does not provide credentials to fork pull requests. The self-hosted
runner is therefore never used for untrusted fork code.
