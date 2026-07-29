#!/usr/bin/env bash
# Apply migration 074 (job types + speed tag + default visit hours) to STAGING.
#   export STAGING_DB_URL='postgresql://postgres.yrpkfxmthregprsfkxaf:<PW>@<host>:5432/postgres'
#   scripts/apply-job-speed-staging.sh
# Staging project yrpkfxmthregprsfkxaf. Idempotent. Does NOT touch prod.
set -euo pipefail
PSQL="/opt/homebrew/opt/libpq/bin/psql"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${STAGING_DB_URL:-}" ]]; then echo "ERROR: set STAGING_DB_URL first." >&2; exit 1; fi
run() { "$PSQL" "$STAGING_DB_URL" -v ON_ERROR_STOP=1 "$@"; }
echo "== APPLY 074 =="
run -f "$DIR/074_job_type_speed_default_hours.sql"
echo "== AFTER: columns (speed, speed_override) + speed spread =="
run -c "select column_name from information_schema.columns where table_schema='public' and ((table_name='properties' and column_name = 'speed') or (table_name='scheduled_jobs' and column_name='speed_override'));"
run -c "select speed, count(*) from properties group by 1;"
run -c "notify pgrst, 'reload schema';"
echo "OK: 074 applied to staging (schema reload notified)."
