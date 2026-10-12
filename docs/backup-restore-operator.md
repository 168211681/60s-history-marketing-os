# PR #41 backup/restore operator guide — PREPARE ONLY

Phase A prepares local tooling. **Production backup and real-data restore remain
BLOCKED** until the owner separately approves a trusted execution host, encrypted
working storage, encrypted off-host retention, secure credentials, and a compatible
disposable restore environment. No real backup or recovery is claimed here.
Do not use Codex cloud, Colab, GitHub, CI artifacts, or plaintext temporary storage
for Production dumps. Stop if any of these prerequisites is missing.

Phase A starts from main `41feaba633b01d885faf7c9e30a3c7aaff468bf0`. PR #41 was
unmerged at `81d5655ea32b0028776cd6634dda6efd04ac838e`; its audit migration was
inspected only. No migration, schema policy, provider setting, hosted data, or PR
status is changed by this work. The PR was already out of Draft when inspected.

## Connection and storage contract

Use PostgreSQL 17+ server/client tools of the same major version for the rehearsal,
Python 3.11+, and Bash on a trusted POSIX host. No new application dependency is
needed. The scripts accept **no database URLs or password environment variables**.
Unset `DATABASE_URL`, `RESTORE_TARGET_DATABASE_URL`, and `PGPASSWORD` without
printing their values. Ambient `PGHOST`, `PGDATABASE`, `PGOPTIONS`, and other libpq
settings are not inherited by database subprocesses.
Validated non-secret service values are pinned into each child environment;
later service-file edits cannot redirect the checked destination. The only
`--dbname` argument is a validated bare disposable database name, never a URI.

Before handling real credentials, disable shell tracing/history/session recording.
Use the owner's approved secret manager or local secure editor to provision:

- `PGSERVICEFILE`: an absolute, non-symlink, owner-owned 0600 service file in a
  0700 directory outside the checkout. Only host/port/dbname/user/sslmode and
  optional sslrootcert are supported. Password/options/hostaddr/service indirection
  and multiple hosts are rejected.
- `PGPASSFILE`: the corresponding absolute, owner-owned 0600 libpq password file
  in a 0700 directory outside the checkout. Use narrowly matching connection
  entries. Escape `:` and `\` as documented by libpq. Never put passwords into
  service files, commands, shell history, notebook cells or diagnostic output.
- `BACKUP_DIR`: an existing owner-owned 0700 directory on **independently verified
  encrypted storage**, outside the checkout. Its children will be 0700 with 0600
  files. No automatic/default plaintext backup destination exists.

For Production, independently confirm the project reference
`rscwajzsjvguezyisvja` and direct connection values from the **official Supabase
Connect screen**. The expected non-secret service shape is:

```ini
[clipforge_production_backup]
host=db.rscwajzsjvguezyisvja.supabase.co
port=5432
dbname=postgres
user=postgres
sslmode=verify-full
sslrootcert=/absolute/operator-managed/official-root.crt
```

The root certificate must come from an independently trusted official source.
Verify the actual database name and server IP in a separately approved read-only
identity session. Do not derive expected values from the script's own response.
`postgres` plus an IP address alone does not prove a Supabase project's identity.
Direct-host project matching, trusted TLS hostname validation, and the operator's
independent checks supplement, rather than replace, the server identity checks.
Session/transaction poolers are deliberately unsupported by this preparation;
stop if direct connectivity is unavailable. No role creation/grants are authorized.

`BACKUP_STORAGE_VERIFIED_ENCRYPTED=YES` is an **operator attestation**, not a
cryptographic or mount inspection performed by the script. Verify the filesystem,
mount, encryption, key recovery and available space independently. The files
inside the bundle remain logical plaintext bytes protected by that encrypted
filesystem. Copying them to an ordinary filesystem does not preserve encryption.
There is no automatic off-host copy, encryption key management, or proof of key
availability. Never set this flag to bypass missing encrypted storage.

## Supported scope and blocked dependencies

The custom-format dump selects exactly `public`, `private`, and
`supabase_migrations`. It preserves the remote migration records **as data**;
there is no comparison with source filenames and no repair, reset, or replay.
Production's 19 and Staging's 23 recorded versions in the handoff are historical
observations, not current counts established by Phase A. Their intentional
version divergence must remain intact.

Included: selected application tables and data, sequences, functions, constraints,
indexes, triggers, and applicable RLS definitions. The manifest inventories table
counts, columns/defaults, constraints, indexes, triggers, RLS flags and policies.
Counts and pg_dump use the **same exported read-only repeatable-read snapshot**.
A concurrent fixture insert verifies snapshot consistency. No `--enable-row-security`
subset export is used; insufficient privileges fail instead of silently omitting
owners' rows. No application write, AI inference, or publishing operation is run.

Excluded/not recovered:

- `auth`, `storage`, `vault`, and other managed schemas and their rows; large objects.
- `supabase_vault`, `pg_stat_statements`; their definitions/data are not recovered.
- Global roles, memberships, role passwords, object owners and ACL grants/revokes.
  `--no-owner --no-privileges` is deliberate; this is not a permission-equivalent
  Production clone and must not serve application traffic.
- Publications/subscriptions, tablespaces, external R2/Storage bytes, OAuth/JWT
  material outside selected tables, provider configuration, Auth flows and jobs.

**Plain PostgreSQL is supported only for a self-contained application schema**, as
proven by the synthetic fixture. The current real application references managed
`auth.users`, `auth.uid()`, hosted roles and potentially extension objects. A dump
of selected schemas does not automatically include those dependencies. A fresh
plain PostgreSQL instance is therefore **not yet a supported real ClipForge
recovery target**. Missing dependencies abort the single-transaction restore; do
not filter out failed application objects, disable constraints/RLS, or fabricate
users/functions/roles to obtain a pass.

Before Phase B/C, the owner/DBA must approve a compatible local Supabase baseline
and a separately protected Auth/role/dependency export/restore scope. Adding that
scope is separate reviewed work; setting `LOCAL_SUPABASE_DEPENDENCIES_VERIFIED`
does not supply it. Do not run the repository's test-only Supabase bootstrap or
replay migration files to simulate a real hosted recovery. Inspect required
extensions and their version compatibility. The 2026-09-25 Supabase upgrade note
also identifies ltree/btree_gist, pgcrypto and custom-operator compatibility issues;
no upgrade, reindex or provider change is part of Phase A.

The PR #41 audit migration adds `clipforge_bulk_reviewer` and a forced-RLS audit
table. The handoff says neither exists in Production yet. These scripts do not
create them or apply that migration. A later post-release recovery would also
need its real role/membership/grant prerequisites preserved separately.

## Operator commands — only after separate authorization

The environment variable names below refer to values configured privately on the
owner-approved host. The commands contain no password or connection URI. Do not
paste variable values or raw command output into chat/PRs. No Phase B/C command
was executed during Phase A.

After independently verifying host, storage, project identity and the agreed
**partial** scope, run the backup on that trusted host:

```sh
set +x
set -euo pipefail
umask 077
unset DATABASE_URL RESTORE_TARGET_DATABASE_URL PGPASSWORD
: "${PGSERVICEFILE:?private service file required}"
: "${PGPASSFILE:?private passfile required}"
: "${BACKUP_DIR:?verified encrypted working directory required}"
: "${EXPECTED_PRODUCTION_SERVER_ADDRESS:?independently verified server IP required}"
export PGSERVICEFILE PGPASSFILE BACKUP_DIR EXPECTED_PRODUCTION_SERVER_ADDRESS
export BACKUP_PGSERVICE=clipforge_production_backup
export BACKUP_SOURCE_KIND=production
export EXPECTED_PRODUCTION_PROJECT_REF=rscwajzsjvguezyisvja
export EXPECTED_PRODUCTION_DATABASE_NAME=postgres
ALLOW_PRODUCTION_BACKUP=YES TRUSTED_BACKUP_HOST=YES \
BACKUP_STORAGE_VERIFIED_ENCRYPTED=YES BACKUP_SCOPE_APPROVED=YES \
PRODUCTION_IDENTITY_VERIFIED=YES scripts/db/backup-production.sh
```

A completed bundle contains `application.dump`, `archive.list`, `inventory.json`,
and `complete.json` SHA-256 checksums. Completion is published only after successful
CLI exit, nonzero size, TOC parsing, and hashing. Files/catalog definitions can
contain sensitive material: **none of these raw files belongs in a public report**.
These checks establish an artifact, not recoverability. Handled dump failures
remove only this invocation's incomplete directory. SIGKILL/power loss can leave
`.incomplete-*` files; they cannot be restored by this tool. Inspect and clean
those privately on encrypted storage; unlinking is not guaranteed secure erasure.

Use the owner's reviewed encryption/transport procedure to retain the completed
bundle off-host on encrypted, access-controlled storage. Independently verify the
retained ciphertext size/checksum, decryption/key availability, and decrypted
bundle checksums on trusted encrypted storage. This script intentionally does
not choose a destination or claim this verification occurred. **Stop here if
there is no verified retained encrypted copy.**

For a later separately authorized restore, provision a fresh disposable local
instance with no external egress, workers or application traffic. Prefer a private
Unix socket in a 0700 directory; literal `127.0.0.1` or `::1` is also permitted.
`localhost`, remote names, multiple hosts and remote server addresses are refused.
A loopback tunnel to a remote database still fails the server-address check.
Use a database named `clipforge_restore_<unique_suffix>`. Before restoring, its
`public`, `private`, and `supabase_migrations` schemas must be absent. An operator
may remove the empty default `public` schema **without CASCADE only immediately
on creating this disposable database**; the restore script itself never drops or
cleans schemas. Do not prepare an existing database this way.

Configure a separate `clipforge_disposable_restore` service in the private service
file with that local host/database, port/user and `sslmode=disable`. Set the
expected database/server identity independently (`local` for a Unix socket),
then execute only after all real dependency and retention gates are resolved:

```sh
set +x
set -euo pipefail
unset DATABASE_URL RESTORE_TARGET_DATABASE_URL PGPASSWORD
: "${BACKUP_BUNDLE:?verified bundle inside BACKUP_DIR required}"
: "${EXPECTED_RESTORE_DATABASE_NAME:?fresh disposable DB required}"
: "${EXPECTED_RESTORE_SERVER_ADDRESS:?verified local address required}"
export BACKUP_BUNDLE EXPECTED_RESTORE_DATABASE_NAME EXPECTED_RESTORE_SERVER_ADDRESS
export RESTORE_PGSERVICE=clipforge_disposable_restore
ALLOW_DISPOSABLE_RESTORE=YES RESTORE_TARGET_LABEL=disposable \
TRUSTED_BACKUP_HOST=YES BACKUP_STORAGE_VERIFIED_ENCRYPTED=YES \
BACKUP_SCOPE_APPROVED=YES RESTORE_ARTIFACT_TRUSTED=YES \
RETAINED_ENCRYPTED_COPY_VERIFIED=YES LOCAL_SUPABASE_DEPENDENCIES_VERIFIED=YES \
scripts/db/restore-verify.sh
```

The archive and checksum metadata must come from the trusted retained copy;
checksums detect accidental corruption, not an attacker replacing both. Dumps
contain executable SQL. Use only a reviewed artifact in an isolated environment.
All pg_restore errors/diagnostics cause failure; child stderr is suppressed to
avoid leaking SQL/rows/credentials. No required-object error is ignored.
Post-restore inventory mismatches also fail. Such a mismatch may leave the
successfully imported disposable database for private diagnosis, but never a
reported PASS. Counts/catalog checks are not a per-row content comparison or
proof of provider/Auth behavior: additionally verify critical records and local
security behavior within the separately approved recovery scope.

Keep logs private and share only the redacted template below. Do not automatically
delete the recoverable retained copy or disposable plaintext; the owner must first
confirm off-host/key recovery. Never restore over Production or merge PR #41 as a
side effect of this workflow.

## Phase A tests and evidence

```sh
npm run test:backup-restore
bash -n scripts/db/backup-production.sh scripts/db/restore-verify.sh
# When installed:
shellcheck scripts/db/backup-production.sh scripts/db/restore-verify.sh
```

The test command starts and removes its own PostgreSQL cluster with a private
Unix socket and no TCP listener. It ignores inherited database connection settings
and creates SQL fixtures directly; it does not execute repository migrations.
Storage-attestation flags in tests are simulations on **synthetic data only**,
not evidence that this cloud workspace is an approved encrypted backup host.
See [`backup-restore-evidence-template.md`](backup-restore-evidence-template.md).

References reviewed for Phase A:

- [libpq service files](https://www.postgresql.org/docs/17/libpq-pgservice.html)
- [libpq passfiles](https://www.postgresql.org/docs/17/libpq-pgpass.html)
- [pg_dump and exported snapshots](https://www.postgresql.org/docs/17/app-pgdump.html)
- [pg_restore transactions and caveats](https://www.postgresql.org/docs/17/app-pgrestore.html)
- [Supabase platform-to-self-hosted restore limits](https://supabase.com/docs/guides/self-hosting/restore-from-platform)
- [Supabase PostgreSQL 15.19/17.11 changes](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)
