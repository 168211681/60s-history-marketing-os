#!/usr/bin/env bash
set -euo pipefail

# Safety gate: this script only prepares a backup. It never runs migrations.
if [[ "${ALLOW_PRODUCTION_BACKUP:-}" != "YES" ]]; then
  echo "Refusing to run: set ALLOW_PRODUCTION_BACKUP=YES in a trusted terminal after review." >&2
  exit 64
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Refusing to run: DATABASE_URL is not set." >&2
  exit 64
fi
if [[ -z "${EXPECTED_PRODUCTION_DATABASE_NAME:-}" || -z "${EXPECTED_PRODUCTION_SERVER_ADDRESS:-}" ]]; then
  echo "Refusing to run: set the expected production database name and server address." >&2
  exit 64
fi
identity="$(psql --dbname="$DATABASE_URL" --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --command="select current_database() || E'\\t' || coalesce(inet_server_addr()::text, 'local')")"
expected="${EXPECTED_PRODUCTION_DATABASE_NAME}"$'\t'"${EXPECTED_PRODUCTION_SERVER_ADDRESS}"
if [[ "$identity" != "$expected" ]]; then
  echo "Refusing to run: production target identity does not match the expected values." >&2
  exit 65
fi

output_dir="${BACKUP_DIR:-./.private-db-backups}"
mkdir -p -- "$output_dir"
chmod 700 -- "$output_dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$output_dir/60s-history-production-$stamp.dump"
manifest_file="$backup_file.manifest"

echo "Creating custom-format backup at $backup_file after verified target identity"
umask 077
pg_dump --dbname="$DATABASE_URL" --format=custom --file="$backup_file" --no-owner --no-privileges
pg_restore --list "$backup_file" > "$manifest_file"
chmod 600 -- "$backup_file" "$manifest_file"
echo "Backup and manifest created. Store both in an encrypted, access-controlled location."
