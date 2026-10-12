# PR #42 backup/restore operator guide — PREPARE ONLY

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

## Phase A.2 supplemental synthetic CI

`.github/workflows/validate-backup-safety.yml` is **supplemental**, not a replacement
for `.github/workflows/validate-staging-db.yml` or its exact migration equality
check. PR #42's supplied baseline is `212af8201c8341e3dae1dead2663e1ee2cf3787d`.
The unchanged equality gate may remain red because Staging already contains
PR #41's authorized migration while main/PR #42 do not. Do not copy that migration,
repair history, mark the failed check successful, or waive it to release this work.

The new workflow checks out the exact trusted PR head with a pinned checkout
action and `persist-credentials: false`. It runs only on GitHub-hosted Ubuntu 24.04
with read-only contents permission. No hosted secrets, environments, deployments,
artifact uploads or application dependency installation are used. The documented
runner image supplies Python 3.12, Node 22/npm and ShellCheck but defaults to PG16.
The workflow therefore installs PG17 from the official HTTPS PGDG APT repository,
with its full primary signing-key fingerprint pinned and APT package verification
enabled. It verifies the entire executable set and `pg_config --bindir`; a missing
tool, wrong major, key change, failed package verification or missing isolation
fails the job, with no fallback to the secret-bearing self-hosted runner.

Package cluster auto-creation is disabled. Tests execute as the non-root runner
inside a new network namespace with no external interface and a minimal clean
environment. The real fixture PostgreSQL cluster has only a private Unix socket;
the harness also asserts `listen_addresses` is empty. Existing PostgreSQL safety
cases 01–22 are retained, with 23 adding real local SCRAM password success/refusal
and secret-redaction checks, and 24 proving that storage flags are attestations,
not encryption detection. No migrations are run, and the operator scripts are
unchanged. All credentials and records generated by these tests are synthetic.

`npm run test:backup-restore` runs the suite without `npm install`. CI sets
`BACKUP_SAFETY_CI=1` to require at least 24 executed cases, zero failures/errors
and zero skips. Case names and aggregate counts remain visible; failure tracebacks
are suppressed because assertion diagnostics could echo a deliberately hostile
subprocess output or generated passfile. Nonzero test status propagates to the
job. No database files, credentials, raw diagnostics or dump archives are uploaded.
ShellCheck and syntax checks are required on this runner. A green result must be
verified on the final pushed commit; local results do not establish hosted CI success.

Runner/tool provenance reviewed for this design:

- [Ubuntu 24.04 image 20261004.327.1](https://github.com/actions/runner-images/blob/bdac7c6000c3501174076ad6d6a06ce46871fa71/images/ubuntu/Ubuntu2404-Readme.md).
  Runner images evolve, so the job records actual image and PostgreSQL versions.
- [Official PostgreSQL APT repository](https://www.postgresql.org/download/linux/ubuntu/)
  and primary signing key `B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8`.
- [Checkout v4.2.2](https://github.com/actions/checkout/tree/11bd71901bbe5b1630ceea73d27597364c9af683), pinned by commit.

## iPhone-first full recovery dependency plan — design only

The owner no longer has a Mac. An iPhone can control approvals and transport
non-secret source patches; it is not an assumed execution host for these scripts.
Do not put Production credentials or data into ChatGPT/Codex cloud, Colab, GitHub,
GitHub Actions or a source patch. This section uses **owner-supplied read-only
observations dated 2026-10-12**, not fresh queries by Phase A.2. Counts may change;
none of these observations proves retained bytes or a successful restore.

| Dependency | Supplied observation | Additional recovery work / acceptance gate |
| --- | --- | --- |
| Application and history | 43 content items, 1 classification suggestion, 172 platform posts; 23 public and 3 private base tables; 19 migration-history rows | Preserve actual public/private/history contents, functions, policies, constraints, triggers and sequences. Verify critical row values and security behavior beyond current counts/catalog checks. Preserve intentional remote/local history differences. PR #41's new bulk audit table/migration is absent from this observed Production snapshot and must not be added here. |
| Auth | 1 `auth.users` row; one public-schema FK references Auth | Preserve actual user UUIDs, identities and required dependent records with genuine compatible Auth definitions. A plain application-only restore cannot satisfy this FK. Match Supabase/Postgres/Auth versions; no fake users, `auth.uid()` stubs or skipped required objects. Define provider configuration and signing-key/secret recovery separately; explicitly decide token invalidation/reauthentication. |
| Storage metadata and bytes | 2 buckets, 11 object metadata rows | Inventory bucket visibility, policies, ownership, object keys/versions, size and digest. Establish whether all 11 metadata rows have recoverable bytes. Database backup metadata alone cannot recover a deleted/missing object. Use an approved Storage/S3 API procedure, preserving access controls; do not copy raw downloaded files into self-hosted Storage's internal directory. Verify bytes and metadata/ownership together without making private buckets public. |
| PostgreSQL/Supabase roles | Managed role, membership and grant inventory not supplied | Obtain a separately authorized inventory and a reviewed source-to-target mapping. Preserve ownership, ACLs/default privileges, function execution rights, role memberships and forced RLS. Current `--no-owner --no-privileges` omits these. Recover/reset custom role passwords through approved secret custody; do not assume managed daily backups include them. Test owner/cross-owner/anonymous behavior without bypass roles. |
| `plpgsql` | 1.0 | Provide the genuine compatible PostgreSQL procedural-language dependency and verify functions/triggers execute correctly in the isolated target. |
| `pgcrypto` | 1.3 | Match supported PG/extension behavior; inventory cryptographic/encrypted-data dependencies and recover necessary keys separately. Check applicable PG17.11 cipher compatibility before a real rehearsal. No hosted re-encryption or extension update is authorized. |
| `uuid-ossp` | 1.1 | Preserve compatible extension functions/schema and dependent UUID defaults. Verify the target build/architecture supports the actual version. |
| `supabase_vault` | 0.3.1 | Current tool excludes this extension/schema. Define how required secret ciphertext and managed encryption material can be recovered under supported Supabase procedures. Prove decryptability privately on an approved target; a database dump or replacement key alone is insufficient. Do not publish secret values. |
| `pg_stat_statements` | 1.11 | Current tool excludes this observability extension. Explicitly document any approved statistics exclusion and compatible target configuration; verify that no required application dependency is lost. Never call excluded statistics recovered. |
| External services | Inventory not supplied | Identify R2 master-video/thumbnail bytes, YouTube/provider OAuth settings, deployment secrets, external assets, Edge Functions and jobs/schedules requiring separate playbooks. Declare exclusions. Prevent email, sync, AI, scheduled work and publishing during every rehearsal. |
| Encrypted off-host retention | Host, storage, retained copy and keys unverified | Specify actual execution host, encrypted working storage and PGDATA/WAL/temp/logs, off-host destination, authenticated encryption, independent key custody, integrity checks, retention, recovery objectives and cleanup. Test recovery without the original host/keychain. The script's YES flags do not establish these facts. |

A compatible target design is still required: the helper requires application
schemas to be absent, whereas a stock local Supabase baseline may already contain
public extension objects. Resolve this with reviewed dependency/export ordering
and a synthetic compatibility rehearsal, not `DROP ... CASCADE`, discarded SQL,
disabled constraints/RLS, or migration replay. Coordinate app/Auth/Storage database
exports through a consistent snapshot or another reviewed consistency procedure;
coordinate external object bytes through a documented manifest/cutoff.

### Actual host decision and separate owner gates

Before Phase B, choose and approve **one actual** execution/recovery arrangement:

- A temporarily borrowed, personally controlled trusted machine, after native
  tool, access-control, encryption and recovery checks; no Mac is assumed available.
- An explicitly approved dedicated host with restricted administration/egress,
  encrypted volumes and independent key custody. Existing Codex/CI/Colab machines
  do not qualify, and this task provisions no host or paid service.
- An owner-approved managed backup plan whose actual retention, recovery limits
  and recovery objectives are verified. Supabase's public documentation describes
  daily database backups for Pro/Team/Enterprise and separate PITR options; the
  current project's plan, usable recovery points and key handling are unverified.
  Managed database backups do not include Storage object bytes, and newer physical
  backups are not necessarily downloadable. Provider-held recovery is not proof
  of an independent encrypted off-host copy. Resolve these gaps explicitly.

**Phase B owner approval — not granted:** identify the host/operator, exact tool
commit, source identity verification, scope/exclusions, encrypted working volume,
off-host encrypted destination, independent key custody, consistent export method,
time window and retention. First demonstrate synthetic retained-copy/key recovery.
Only a separately approved read-only identity/inventory and extraction/retention
run may follow. Do not request credentials in chat or pass them through Colab.
If only partial application backup is approved, label it partial; it cannot satisfy
full recovery acceptance. No hosted writes, migrations, restore, merge or deployment
are authorized by Phase B.

**Phase C owner approval — separate and not granted:** name the verified retained
artifact/digest and a new compatible disposable target with encrypted data/WAL/temp,
genuine Auth/role/extension dependencies, no external egress or provider credentials,
and predefined data/security/object-byte acceptance checks. Authorize only that
target's preparation and rehearsal; preserve failing diagnostics privately and
never report partial restoration as PASS. Specify retention/cleanup after key and
off-host recovery are proven. Phase B approval never implies Phase C approval.
Neither approval authorizes restoring over Production or bypassing required CI.

For the iPhone/Colab workflow, transfer **source patches only**. Apply a patch to
the exact expected branch baseline in a clean source checkout, review its file
list, and use a normal push; stop on a moved branch or permission failure. Keep
database credentials, dumps, fixture directories and recovery keys out of the
notebook and transport bundle. No real backup command belongs in that handoff.

Public recovery references reviewed for Phase A.2:

- [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups).
- [Restore a Platform Project to Self-Hosted](https://supabase.com/docs/guides/self-hosting/restore-from-platform).
- [Copy Storage Objects through S3](https://supabase.com/docs/guides/self-hosting/copy-from-platform-s3).

These references establish product limits, not authorization to run their example
commands. Do not adopt examples that expose credentials in argv, filter restore
errors or disable integrity checks. **PREPARED / RELEASE BLOCKED** remains the
status until exact-head supplemental CI, the unchanged required release gates,
compatible full recovery and encrypted retention all have acceptance evidence.

References reviewed for Phase A:

- [libpq service files](https://www.postgresql.org/docs/17/libpq-pgservice.html)
- [libpq passfiles](https://www.postgresql.org/docs/17/libpq-pgpass.html)
- [pg_dump and exported snapshots](https://www.postgresql.org/docs/17/app-pgdump.html)
- [pg_restore transactions and caveats](https://www.postgresql.org/docs/17/app-pgrestore.html)
- [Supabase platform-to-self-hosted restore limits](https://supabase.com/docs/guides/self-hosting/restore-from-platform)
- [Supabase PostgreSQL 15.19/17.11 changes](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)
