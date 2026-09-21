#!/usr/bin/env bash
set -euo pipefail

if [[ "${ALLOW_STAGING_MIGRATION:-}" != "YES" ]]; then
  echo "Refusing to run: set ALLOW_STAGING_MIGRATION=YES after confirming this is staging." >&2
  exit 64
fi
if [[ -z "${STAGING_DATABASE_URL:-}" ]]; then
  echo "Refusing to run: STAGING_DATABASE_URL is not set." >&2
  exit 64
fi
if [[ -z "${EXPECTED_STAGING_DATABASE_NAME:-}" || -z "${EXPECTED_STAGING_SERVER_ADDRESS:-}" ]]; then
  echo "Refusing to run: set the expected staging database name and server address." >&2
  exit 64
fi
identity="$(psql --dbname="$STAGING_DATABASE_URL" --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --command="select current_database() || E'\\t' || coalesce(inet_server_addr()::text, 'local')")"
expected="${EXPECTED_STAGING_DATABASE_NAME}"$'\t'"${EXPECTED_STAGING_SERVER_ADDRESS}"
if [[ "$identity" != "$expected" ]]; then
  echo "Refusing to run: staging target identity does not match the expected values." >&2
  exit 65
fi

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(CDPATH= cd -- "$script_dir/../.." && pwd)"
psql --dbname="$STAGING_DATABASE_URL" --set=ON_ERROR_STOP=1 \
  --file="$repo_root/supabase/migrations/20260921130000_retire_internal_production.sql"
echo "Staging migration applied. Run scripts/db/verify-retirement.sql with the staging connection."
