#!/usr/bin/env bash
set -euo pipefail

# This is intentionally a restore rehearsal, never a production restore.
if [[ "${ALLOW_DISPOSABLE_RESTORE:-}" != "YES" ]]; then
  echo "Refusing to run: set ALLOW_DISPOSABLE_RESTORE=YES in a trusted terminal." >&2
  exit 64
fi
if [[ -z "${BACKUP_FILE:-}" || -z "${RESTORE_TARGET_DATABASE_URL:-}" ]]; then
  echo "Set BACKUP_FILE and RESTORE_TARGET_DATABASE_URL." >&2
  exit 64
fi
if [[ "${RESTORE_TARGET_LABEL:-}" != "disposable" || -z "${EXPECTED_RESTORE_DATABASE_NAME:-}" || -z "${EXPECTED_RESTORE_SERVER_ADDRESS:-}" ]]; then
  echo "Refusing to run: explicitly label the target disposable and provide its expected identity." >&2
  exit 64
fi
identity="$(psql --dbname="$RESTORE_TARGET_DATABASE_URL" --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --command="select current_database() || E'\\t' || coalesce(inet_server_addr()::text, 'local')")"
expected="${EXPECTED_RESTORE_DATABASE_NAME}"$'\t'"${EXPECTED_RESTORE_SERVER_ADDRESS}"
if [[ "$identity" != "$expected" ]]; then
  echo "Refusing to run: restore target identity does not match the expected values." >&2
  exit 65
fi

pg_restore --list "$BACKUP_FILE" > /dev/null
pg_restore --dbname="$RESTORE_TARGET_DATABASE_URL" --clean --if-exists --no-owner --no-privileges "$BACKUP_FILE"
echo "Restore completed against the explicitly supplied disposable target. Run the verification SQL next."
