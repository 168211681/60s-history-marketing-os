#!/usr/bin/env python3
"""Operator-only scoped logical backup / local restore. No third-party modules.

Connection passwords belong only in an owner-only libpq passfile. No URL,
child stderr, SQL data, or exception detail is ever printed by this tool.
"""
import configparser
import contextlib
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import select
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

PRODUCTION_REF = "rscwajzsjvguezyisvja"
SCHEMAS = ["public", "private", "supabase_migrations"]
REQUIRED = {"public.projects", "public.content_items", "public.platform_posts",
            "public.videos", "public.content_classification_suggestions"}
INVENTORY = Path(__file__).with_name("backup-inventory.sql").read_text()


class Refused(Exception):
    pass


def require(condition, message):
    if not condition:
        raise Refused(message)


def env(name):
    value = os.environ.get(name, "")
    require(bool(value), f"Required setting missing: {name}.")
    return value


def yes(name):
    require(os.environ.get(name) == "YES", f"Approval required: {name}=YES.")


def private_path(value, directory=False):
    p = Path(value)
    require(p.is_absolute() and p.resolve() == p, "Use an absolute path without symlinks.")
    require(not p.is_relative_to(Path(__file__).resolve().parents[2]), "Keep credentials and backup artifacts outside the checkout.")
    s = p.lstat()
    require(s.st_uid == os.getuid(), "Private paths must belong to the current operator.")
    require(stat.S_ISDIR(s.st_mode) if directory else stat.S_ISREG(s.st_mode), "Invalid private path type.")
    require(stat.S_IMODE(s.st_mode) == (0o700 if directory else 0o600), "Private directory/file permissions must be 0700/0600.")
    if not directory:
        private_path(str(p.parent), True)
    return p


def local_host(host):
    if host.startswith("/"):
        private_path(host, True)
        return True
    return host in ("127.0.0.1", "::1")


def connection(kind, synthetic=False):
    # Reject old URL inputs rather than parsing/echoing them, including malformed
    # URLs and conninfo injection. Never inherit ambient PGHOST/PGOPTIONS/etc.
    require(not any(os.environ.get(k) for k in ("DATABASE_URL", "RESTORE_TARGET_DATABASE_URL", "PGPASSWORD")),
            "URL/password environment inputs are unsupported; use private service/passfiles.")
    service_file = private_path(env("PGSERVICEFILE"))
    pass_file = private_path(env("PGPASSFILE"))
    service = env("BACKUP_PGSERVICE" if kind == "backup" else "RESTORE_PGSERVICE")
    require(re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_-]{0,63}", service), "Invalid service name.")
    config = configparser.ConfigParser(interpolation=None, delimiters=("=",))
    config.read_string(service_file.read_text())
    require(not config.defaults() and service in config, "Missing or ambiguous service configuration.")
    settings = dict(config[service])
    require(set(settings) <= {"host", "port", "dbname", "user", "sslmode", "sslrootcert"},
            "Unsupported service option; passwords belong only in the passfile.")
    require(all(settings.get(k) for k in ("host", "port", "dbname", "user", "sslmode")), "Incomplete service configuration.")
    require(re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]{0,62}", settings["dbname"]), "Invalid database name.")
    require(re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_.-]{0,100}", settings["user"]), "Invalid database user.")
    require(settings["port"].isdigit() and 1 <= int(settings["port"]) <= 65535, "Invalid service port.")
    if kind == "restore" or synthetic:
        require(local_host(settings["host"]), "Only a literal loopback address or private local socket is permitted.")
        require(settings["dbname"].startswith("clipforge_restore_" if kind == "restore" else "clipforge_fixture_"), "Use a dedicated disposable database name.")
        require(settings["sslmode"] == "disable", "Local disposable service must use sslmode=disable.")
    else:
        yes("PRODUCTION_IDENTITY_VERIFIED")
        require(env("EXPECTED_PRODUCTION_PROJECT_REF") == PRODUCTION_REF, "Wrong Production project reference.")
        # Deliberately direct-only: shared pooler IP/dbname are not project proof.
        require(settings["host"] == f"db.{PRODUCTION_REF}.supabase.co" and
                settings["port"] == "5432" and settings["dbname"] == "postgres" and
                settings["user"] == "postgres", "Production service must match the independently verified direct project endpoint.")
        require(settings["sslmode"] == "verify-full", "Production TLS must verify the certificate and hostname.")
        require(Path(settings.get("sslrootcert", "")).is_file(), "Official TLS root certificate is required.")
    child = {k: os.environ[k] for k in ("PATH", "LD_LIBRARY_PATH", "SYSTEMROOT") if k in os.environ}
    # Pin validated non-secret values into the child environment. Re-reading a
    # mutable service file between identity checks and restore must not redirect
    # a later connection. Passwords still come only from the private passfile.
    child.update(PGHOST=settings["host"], PGPORT=settings["port"],
                 PGDATABASE=settings["dbname"], PGUSER=settings["user"],
                 PGSSLMODE=settings["sslmode"], PGPASSFILE=str(pass_file),
                 PGCONNECT_TIMEOUT="10", PGAPPNAME="clipforge-backup-restore", LC_ALL="C",
                 PGOPTIONS="-c statement_timeout=120000 -c lock_timeout=5000 -c search_path=pg_catalog")
    if "sslrootcert" in settings:
        child["PGSSLROOTCERT"] = settings["sslrootcert"]
    if kind == "backup":
        child["PGOPTIONS"] += " -c default_transaction_read_only=on -c row_security=off"
    return child, settings


def run(args, child, stage, *, output=None):
    # No verbose/raw stderr output: server/CLI errors can contain connection
    # material, SQL statements, private rows, and personal filesystem paths.
    result = subprocess.run(args, env=child, stdin=subprocess.DEVNULL,
                            stdout=output if output is not None else subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=600, check=False)
    require(result.returncode == 0 and not result.stderr.strip(), f"{stage} failed or emitted diagnostics; no success claimed.")
    return result.stdout


class Session:
    def __init__(self, child):
        self.p = subprocess.Popen(["psql", "-X", "-qAt", "-w", "-v", "ON_ERROR_STOP=1"],
                                  env=child, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.DEVNULL, text=True)

    def query(self, sql):
        self.p.stdin.write(sql.rstrip(";\n") + ";\n")
        self.p.stdin.flush()
        require(bool(select.select([self.p.stdout], [], [], 130)[0]), "Database query timed out.")
        line = self.p.stdout.readline()
        require(bool(line), "Database query failed; diagnostics suppressed.")
        return line.strip()

    def close(self):
        if self.p.poll() is None:
            self.p.terminate()  # Any open read-only snapshot rolls back.
        self.p.wait(timeout=10)
        self.p.stdin.close()
        self.p.stdout.close()


@contextlib.contextmanager
def session(child):
    s = Session(child)
    try:
        yield s
    finally:
        s.close()


def identity(s, settings, prefix, local):
    expected_db = env(f"EXPECTED_{prefix}_DATABASE_NAME")
    expected_addr = env(f"EXPECTED_{prefix}_SERVER_ADDRESS")
    actual = json.loads(s.query("select json_build_array(current_database(), coalesce(inet_server_addr()::text,'local'), current_setting('server_version_num'))"))
    require(actual[:2] == [expected_db, expected_addr] and expected_db == settings["dbname"], "Database/server identity mismatch.")
    if local:
        require(actual[1] == "local" if settings["host"].startswith("/") else
                actual[1] == settings["host"] and ipaddress.ip_address(actual[1]).is_loopback,
                "Server is not the selected local disposable endpoint.")
    else:
        require(ipaddress.ip_address(actual[1]).is_global, "Production server address must be independently verified.")
    return int(actual[2]) // 10000


def inventory(s):
    tables = json.loads(s.query(INVENTORY))
    for table in tables:
        schema, name = table["schema"], table["name"]
        # Catalog values are identifiers, never executable SQL or psql commands.
        require(re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]*", name), "Unsupported table identifier; manual scope review required.")
        table["rows"] = int(s.query(f'SELECT count(*) FROM "{schema}"."{name}"'))
    return tables


def digest(path):
    with path.open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def storage():
    yes("TRUSTED_BACKUP_HOST")
    yes("BACKUP_STORAGE_VERIFIED_ENCRYPTED")
    yes("BACKUP_SCOPE_APPROVED")
    # This is an operator attestation, not automatic encryption discovery. The
    # runbook requires independent mount/encryption/key verification beforehand.
    return private_path(env("BACKUP_DIR"), True)


def backup():
    synthetic = os.environ.get("BACKUP_SOURCE_KIND", "production") == "synthetic-local"
    require(os.environ.get("BACKUP_SOURCE_KIND", "production") in ("production", "synthetic-local"), "Invalid backup source kind.")
    yes("ALLOW_SYNTHETIC_BACKUP" if synthetic else "ALLOW_PRODUCTION_BACKUP")
    parent = storage()  # All approval/storage checks BEFORE any connection.
    child, settings = connection("backup", synthetic)
    bundle = None
    try:
        with session(child) as s:
            major = identity(s, settings, "PRODUCTION", synthetic)
            require(major >= 17, "This preparation supports PostgreSQL 17+ only; review other versions separately.")
            if synthetic:
                require(s.query("select marker from public.clipforge_fixture_marker") == "synthetic-only", "Synthetic fixture marker missing.")
            snapshot = s.query("begin isolation level repeatable read read only; select pg_export_snapshot()")
            require(re.fullmatch(r"[0-9A-Fa-f-]+", snapshot), "Invalid exported snapshot.")
            tables = inventory(s)
            require(REQUIRED <= {t["schema"] + "." + t["name"] for t in tables}, "Required application tables are missing.")
            bundle = Path(tempfile.mkdtemp(prefix=".incomplete-", dir=parent))
            archive = bundle / "application.dump"
            run(["pg_dump", "-w", "--format=custom", "--file=" + str(archive),
                 "--snapshot=" + snapshot, "--no-owner", "--no-privileges", "--no-large-objects",
                 "--no-publications", "--no-subscriptions", "--no-tablespaces",
                 "--exclude-extension=supabase_vault", "--exclude-extension=pg_stat_statements",
                 *["--schema=" + name for name in SCHEMAS]], child, "Dump")
            require(archive.stat().st_size > 0, "Dump is empty.")
            with (bundle / "archive.list").open("wb") as manifest:
                run(["pg_restore", "--list", str(archive)], child, "Archive listing", output=manifest)
            metadata = {"format": 1, "scope": SCHEMAS, "kind": "synthetic-local" if synthetic else "production",
                        "created_utc": datetime.now(timezone.utc).isoformat(), "server_major": major,
                        "dump_version": run(["pg_dump", "--version"], child, "CLI version").decode().strip(),
                        "dump_sha256": digest(archive), "dump_bytes": archive.stat().st_size, "tables": tables,
                        "limits": "Application scope only; no Auth/Vault/Storage, roles/passwords/grants, large objects or external files. Not full recovery evidence."}
            (bundle / "inventory.json").write_text(json.dumps(metadata, indent=2) + "\n")
            # Completion marker is published only after all previous checks succeed.
            (bundle / "complete.json").write_text(json.dumps({p.name: digest(p) for p in bundle.iterdir()}) + "\n")
            for p in bundle.iterdir():
                p.chmod(0o600)
            final = parent / ("clipforge-" + bundle.name.removeprefix(".incomplete-"))
            bundle.rename(final)
            bundle = None
        print("PREPARED: scoped logical artifact completed in approved storage. Off-host encryption and real restore remain UNVERIFIED.")
    finally:
        if bundle is not None:
            shutil.rmtree(bundle)


def restore():
    yes("ALLOW_DISPOSABLE_RESTORE")
    require(env("RESTORE_TARGET_LABEL") == "disposable", "Restore must be explicitly disposable.")
    approved_storage = storage()
    yes("RESTORE_ARTIFACT_TRUSTED")
    bundle = private_path(env("BACKUP_BUNDLE"), True)
    require(bundle.parent == approved_storage, "Artifact must be inside the approved encrypted storage directory.")
    require(not bundle.name.startswith(".incomplete-"), "Incomplete artifact refused.")
    checks = json.loads(private_path(str(bundle / "complete.json")).read_text())
    require(set(checks) == {"application.dump", "archive.list", "inventory.json"}, "Invalid completion manifest.")
    for name, expected in checks.items():
        require(digest(private_path(str(bundle / name))) == expected, "Artifact checksum mismatch.")
    meta = json.loads((bundle / "inventory.json").read_text())
    require(meta["format"] == 1 and meta["scope"] == SCHEMAS and bool(meta["tables"]), "Unsupported artifact scope.")
    require(REQUIRED <= {t["schema"] + "." + t["name"] for t in meta["tables"]}, "Required application tables missing from artifact.")
    require(digest(bundle / "application.dump") == meta["dump_sha256"], "Dump checksum mismatch.")
    if meta["kind"] == "production":
        yes("RETAINED_ENCRYPTED_COPY_VERIFIED")
        yes("LOCAL_SUPABASE_DEPENDENCIES_VERIFIED")
    else:
        require(meta["kind"] == "synthetic-local", "Unknown artifact source.")
    child, settings = connection("restore")
    with session(child) as s:
        major = identity(s, settings, "RESTORE", True)
        require(major == meta["server_major"], "Restore server major must match the source for this rehearsal.")
        # No --clean and no DROP: prepare a fresh database with its empty default
        # public schema removed beforehand. pg_restore then creates the scoped
        # schemas atomically. Existing application/history schemas always block.
        count = s.query("select count(*) from pg_namespace where nspname in ('public','private','supabase_migrations')")
        require(count == "0", "Restore target application schemas must be absent; prepare a fresh disposable database.")
    run(["pg_restore", "--list", str(bundle / "application.dump")], child, "Archive preflight")
    # Only the validated bare database name is in argv; connection/password
    # settings remain in the pinned environment/passfile. -d is required to
    # restore rather than emitting SQL to stdout.
    run(["pg_restore", "--dbname=" + settings["dbname"], "-w", "--exit-on-error",
         "--single-transaction", "--no-owner", "--no-privileges", str(bundle / "application.dump")], child, "Restore")
    with session(child) as s:
        identity(s, settings, "RESTORE", True)
        s.query("begin isolation level repeatable read read only; select 1")
        require(inventory(s) == meta["tables"], "Restored counts/schema/RLS differ; rehearsal FAILED, retain target for private diagnosis.")
    print("VERIFIED: scoped local restore counts, columns, constraints, indexes, triggers and RLS definitions match. Full Supabase recovery remains UNVERIFIED.")


def main():
    os.umask(0o077)
    def interrupted(_signal, _frame):
        raise Refused("Interrupted; no completed artifact or successful rehearsal claimed.")
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        require(len(sys.argv) == 2 and sys.argv[1] in ("backup", "restore"), "Expected backup or restore action.")
        (backup if sys.argv[1] == "backup" else restore)()
        return 0
    except Refused as error:
        print("BLOCKED: " + str(error), file=sys.stderr)
    except Exception:
        # Deliberately no traceback/exception str: could contain credentials or data.
        print("BLOCKED: local configuration, filesystem, or PostgreSQL operation failed; sensitive diagnostics suppressed.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
