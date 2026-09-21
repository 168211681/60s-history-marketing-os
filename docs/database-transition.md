# Production database transition runbook

This runbook applies the analysis-first retirement migration without deleting
historical production records. It is intentionally manual: Codex must not apply
the migration to a production Supabase project.

## Migration under review

`supabase/migrations/20260921130000_retire_internal_production.sql` revokes
`INSERT`, `UPDATE`, and `DELETE` from `service_role` on
`public.production_workflows` and `public.video_generation_jobs`. It only adds
comments; it does not delete rows, storage objects, functions, or policies.

The application routes are already retired and return `410`. The database
change is a second safety boundary against an old privileged worker creating or
mutating production jobs.

## Required access and credentials

The operator needs a Supabase project owner/database connection with permission
to create a backup and inspect grants. Use a trusted terminal and environment
variables only. Never put a URL, password, service-role key, or token in this
repository, shell history, logs, or chat.

Required values are supplied only at execution time:

- `DATABASE_URL`: production connection used only by `backup-production.sh`.
- `EXPECTED_PRODUCTION_DATABASE_NAME` and `EXPECTED_PRODUCTION_SERVER_ADDRESS`:
  values independently verified in the Supabase dashboard/DB session.
- `STAGING_DATABASE_URL`: disposable/staging connection used only by
  `apply-staging-migration.sh`.
- `EXPECTED_STAGING_DATABASE_NAME` and `EXPECTED_STAGING_SERVER_ADDRESS`:
  independently verified staging identity values.
- `RESTORE_TARGET_DATABASE_URL`: local disposable restore target.
- `EXPECTED_RESTORE_DATABASE_NAME` and `EXPECTED_RESTORE_SERVER_ADDRESS`:
  identity values for that disposable target; `RESTORE_TARGET_LABEL` must be
  exactly `disposable`.

## Backup and restore rehearsal

1. Confirm the project and branch in the Supabase dashboard.
2. Confirm no production worker is enabled and record the current deployment
   identifier.
3. In a trusted terminal, run:

   ```sh
   ALLOW_PRODUCTION_BACKUP=YES \
     EXPECTED_PRODUCTION_DATABASE_NAME='(verified name)' \
     EXPECTED_PRODUCTION_SERVER_ADDRESS='(verified address)' \
     BACKUP_DIR=/secure/path \
     DATABASE_URL='(provided out of band)' scripts/db/backup-production.sh
   ```

4. Verify the dump manifest exists, has mode `600`, and copy it to encrypted,
   access-controlled storage. Record its checksum with `sha256sum`.
5. Restore the dump into a disposable local PostgreSQL database only:

   ```sh
   ALLOW_DISPOSABLE_RESTORE=YES \
     RESTORE_TARGET_LABEL=disposable \
     EXPECTED_RESTORE_DATABASE_NAME='(local database name)' \
     EXPECTED_RESTORE_SERVER_ADDRESS=local \
     BACKUP_FILE=/secure/path/60s-history-production-<stamp>.dump \
     RESTORE_TARGET_DATABASE_URL='postgresql://...local...' \
     scripts/db/restore-verify.sh
   ```

6. Run `scripts/db/pending-production-jobs.sql` and
   `scripts/db/verify-retirement.sql` against the restored copy. Confirm row
   counts and representative owner data match the pre-backup inventory.

The restore rehearsal is evidence that the backup is usable. It is not a
production restore and must not target a Supabase or Vercel hostname.

### Local restore limitations

The local PostgreSQL rehearsal cannot provide Supabase-managed components. The
rehearsal therefore excludes the `vault` schema, the `supabase_vault`
extension, its `vault.secrets` data, and the `pg_stat_statements` extension.
It creates disposable placeholders for hosted roles such as `anon`,
`authenticated`, and `service_role`. This verifies application tables and
historical rows, but it does not verify Vault contents, hosted extension
behavior, Supabase-managed roles, or JWT/Data API behavior. A genuinely
isolated Supabase staging project is required for those checks.

## Staging migration

1. Use a disposable Supabase staging project or local PostgreSQL clone, never
   the production URL.
2. Apply the complete migration history, then run:

   ```sh
   ALLOW_STAGING_MIGRATION=YES \
     EXPECTED_STAGING_DATABASE_NAME='(verified staging name)' \
     EXPECTED_STAGING_SERVER_ADDRESS='(verified address)' \
     STAGING_DATABASE_URL='(staging only)' \
     scripts/db/apply-staging-migration.sh
   psql "$STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
     -f scripts/db/verify-retirement.sql
   ```

3. Verify owner and foreign-owner reads with real Supabase Auth sessions. The
   local database test proves SQL/RLS semantics but cannot prove hosted JWT or
   Data API behavior.
4. Verify that script drafts and analytics sync writes still work. Verify that
   inserts/updates/deletes to the two archived job tables fail for
   `service_role`.
5. Record the migration output, verification output, and staging project ID.

The scripts verify `current_database()` and `inet_server_addr()` against the
operator-supplied expected identity. They do not rely on URL string matching to
decide whether a target is staging or production, and they reject missing or
ambiguous identity values.

## Pending workflow disposition

The read-only Production inventory currently reports one queued
`production_workflows` row and no queued `video_generation_jobs`. Preserve that
row and its audit history. Do not retry, delete, update, or execute it while the
retired worker is disabled. Record its identifier and timestamps in the change
record, then have the owner or DBA approve an explicit archival disposition
before the Production migration. The retirement migration must not be used as a
cleanup operation.

## Production application

Only a human database operator should perform this step after the backup and
staging gates pass:

1. Confirm the production worker remains disabled and there are no active runs.
2. Run the read-only inventory in `scripts/db/pending-production-jobs.sql` and
   save the result in the change record.
3. Confirm the backup checksum and restore rehearsal evidence.
4. Use the Supabase migration mechanism against the explicitly linked
   production project. Review `db push --dry-run` output first.
5. Apply only the reviewed migration. Do not run test bootstrap SQL in Supabase.
6. Re-run `scripts/db/verify-retirement.sql` and the pending-job inventory.
7. Run the owner smoke-test checklist in `docs/owner-smoke-test.md`.

No cleanup or deletion is part of this migration. Existing rows remain read-only
for their owner and are retained for audit.

## Rollback and incident response

The migration has no destructive down migration. If verification fails:

1. Stop before any further writes and keep the deployment on the retired-route
   version.
2. Do not restore over production automatically.
3. Capture the migration output, grant/RLS output, timestamp, and deployment ID.
4. Ask the DBA to review whether the grant change can be reversed in a reviewed,
   time-bounded SQL change. Reversal would re-enable privileged writes and must
   not happen while an old worker is reachable.
5. If data recovery is required, restore the verified backup into a disposable
   environment first, compare owner-scoped counts, and obtain separate approval
   for any production recovery.
6. Keep the GitHub workflow disabled until the incident is closed.

## Current status

The disposable PostgreSQL migration audit passed in this repository. Production
backup, production migration, live pending-job inventory, and authenticated
owner smoke tests still require a human with Supabase production access. The
verification SQL regression test covers the `pg_policies.tablename` catalog
column; hosted grant and RLS checks remain pending until isolated Supabase
staging is available.
