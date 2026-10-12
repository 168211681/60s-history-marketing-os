#!/usr/bin/env bash
# Disable inherited tracing before reading any operator configuration.
set +x
set -euo pipefail
exec python3 -I "$(dirname -- "${BASH_SOURCE[0]}")/backup_restore.py" backup
