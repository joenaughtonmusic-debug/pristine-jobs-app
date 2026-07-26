#!/usr/bin/env bash
# Apply migration 064 (pm_reports table + private pm-reports bucket) to STAGING.
#   export STAGING_DB_URL='postgresql://postgres.yrpkfxmthregprsfkxaf:<PW>@<host>:5432/postgres'
#   scripts/apply-pm-reports-staging.sh
# Staging project yrpkfxmthregprsfkxaf. Idempotent. Does NOT touch prod.
set -euo pipefail
PSQL="/opt/homebrew/opt/libpq/bin/psql"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${STAGING_DB_URL:-}" ]]; then echo "ERROR: set STAGING_DB_URL first." >&2; exit 1; fi
run() { "$PSQL" "$STAGING_DB_URL" -v ON_ERROR_STOP=1 "$@"; }
echo "== APPLY 064 =="
run -f "$DIR/064_pm_reports.sql"
echo "== AFTER: bucket + policies =="
run -c "select id, public from storage.buckets where id='pm-reports';"
run -c "select policyname, cmd from pg_policies where schemaname='public' and tablename='pm_reports' order by cmd;"
run -c "notify pgrst, 'reload schema';"
echo "OK: 064 applied to staging."
