#!/usr/bin/env bash
set +x
set -euo pipefail
exec python3 -I "$(dirname -- "${BASH_SOURCE[0]}")/backup_restore.py" restore
