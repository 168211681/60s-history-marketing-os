# Production database transition runbook

This runbook records the analysis-first retirement migration and retains the
operator procedures used during the transition. The retirement and Phase 7
migrations have already been applied as documented below. Codex must not apply
these historical migrations to a Production Supabase project.

## Current verified transition state

This runbook contains historical procedures as well as the current state; follow
the evidence record rather than treating old pre-apply checklists as pending work.

- Phase 7 Staging migration `20260924041349_research_fact_checking` was applied by
  workflow run `36001809750`. Current Staging migration history matches all 16
  repository migrations.
- Production records Phase 7 as
  `20260924151134_research_fact_checking`. The local source remains
  `supabase/migrations/20260924041349_research_fact_checking.sql`. This history
  difference is intentional; do not repair, replay, reset, or normalize it.
- Read-only catalog inspection confirmed the four research tables, RLS and FORCE
  RLS, policies, indexes, foreign keys, and the `set_updated_at` triggers on
  projects and claims in Staging and Production.
- The owner reported a partial authenticated Production UI smoke test. Its exact
  scope and gaps are recorded in
  [`Phase 7 final verification`](architecture/reviews/PHASE-7-FINAL-VERIFICATION.md).
- No encrypted off-host Production backup has been verified. Do not infer one from
  the presence of a local backup or restore rehearsal.

The owner reported that the Production deployment was READY on
`5f1719112aea550f724f20f2791b8924a0b7db0b`; this runbook update did not independently
verify the Vercel deployment state.

## Historical retirement migration source

`supabase/migrations/20260921130000_retire_internal_production.sql` revokes
`INSERT`, `UPDATE`, and `DELETE` from `service_role` on
`public.production_workflows` and `public.video_generation_jobs`. It only adds
comments; it does not delete rows, storage objects, functions, or policies.

The application routes are already retired and return `410`. The database
change is a second safety boundary against an old privileged worker creating or
mutating production jobs.

## Production state after application

The local migration source remains:

`supabase/migrations/20260921130000_retire_internal_production.sql`

The verified Production deployment recorded the equivalent retirement SQL under
the remote migration version `20260923205655` with name
`retire_internal_production`. The differing timestamp is deployment history,
not a schema difference: the SQL effect is already applied. Do not rename the
local file, create a duplicate migration, insert a synthetic history row, or
run `supabase migration repair`, reset, or replay merely to make timestamps
match.

Production verification therefore checks effective privileges, readable
archived tables, preserved row counts, and the observed remote retirement
record. It does not require the Production timestamp to equal the local source
timestamp. Any future Production migration remains an explicit human-approved
operation.

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

## Staging migration procedure for a new disposable project

This retained operator procedure is for a newly provisioned, isolated
disposable project. The current hosted Staging project has already received the
Phase 7 migration and contains 16 versions; do not rerun this generic procedure
against it. Use the read-only validation workflow for current Staging checks.

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

## Historical pending workflow disposition

At the time of the original retirement transition, a read-only Production inventory
reported one queued `production_workflows` row and no queued
`video_generation_jobs`. That is a historical observation, not a current-status
claim. Preserve the row and audit history; do not retry, delete, update, or execute
it without a separately approved disposition. The retirement migration was not a
cleanup operation.

## Historical Production retirement procedure

The retirement SQL has already been applied. The following operator checklist is
retained as historical verification guidance; it is not an instruction to apply or
reapply the retirement migration:

1. Confirm the production worker remains disabled and there are no active runs.
2. Run the read-only inventory in `scripts/db/pending-production-jobs.sql` and
   save the result in the change record.
3. Confirm the backup checksum and restore rehearsal evidence.
4. No migration apply is required for the already verified retirement state.
   If a future Production migration is separately approved, review
   `db push --dry-run` against the explicitly linked project first.
5. Run `scripts/db/verify-retirement.sql` and the pending-job inventory in
   read-only mode. Confirm the recorded remote retirement version and the
   effective privilege checks; do not repair history to match the local name.
6. Run the owner smoke-test checklist in `docs/owner-smoke-test.md`.

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

## Retirement and schema reconciliation status

The disposable PostgreSQL migration audit passed in this repository. The
retirement SQL is verified as applied in Production under remote version
`20260923205655`; the legacy `production_workflows` row remains preserved and
`video_generation_jobs` remains empty in the recorded inventory. Phase 6 content
experiment reconciliation was applied and verified on Production as remote
`20260924040511_reconcile_content_experiments_schema`; local source remains
`20260923231944_reconcile_content_experiments_schema.sql`. Phase 7 research
schema was applied on Production as remote `20260924151134_research_fact_checking`,
while its local source remains
`20260924041349_research_fact_checking.sql`. The two timestamp differences are
intentional and must not be normalized. See the Phase 7 final verification record
for the distinction between live catalog evidence and owner-reported UI evidence.

## Migration-history policy

**Staging CI** discovers every local migration filename and requires that complete
set to match Staging remote history exactly. At this verification, both contain 16
versions, including `20260924041349_research_fact_checking`. The workflow count is
not hardcoded; any future migration changes the expected set and must be reviewed.
A mismatch blocks the staging validation workflow.

**Production** has historical divergence and is validated by the known remote
retirement record plus effective schema, privilege, RLS, and preserved-row
checks. Production history must not be repaired, reset, replayed, or cosmetically
normalized. No automated workflow may apply a Production migration; every future
Production change requires a separate human-approved gate.

## Content experiments schema reconciliation

Production already contained a legacy `public.content_experiments` table before
Phase 6. The original Phase 6 create-table migration is therefore not a valid
Production operation. The follow-up reconciliation migration adds `title` and
`reporting_window_days` without dropping the table or deleting rows. It backfills
`title` only from an existing non-empty `topic`; when no defensible reporting
window exists, `reporting_window_days` remains `NULL` and the application reports
insufficient evidence. Legacy observed fields, keys, timestamps, RLS and audit
rows remain preserved.

The reconciliation migration was rehearsed on Staging and applied and verified on
Production under remote migration version
`20260924040511_reconcile_content_experiments_schema`. The repository source
remains `20260923231944_reconcile_content_experiments_schema.sql`. This history
divergence is intentional: do not repair, reset, replay or cosmetically normalize
Production. Effective columns, grants, RLS and preserved rows are the verification
criteria. The migration has no automatic down migration; recovery needs a reviewed
forward SQL change or restoration in a disposable environment.

Phase 7 is applied on Staging and Production under the distinct versions recorded
above. Production history must remain untouched. No encrypted off-host backup is
claimed by this runbook.
