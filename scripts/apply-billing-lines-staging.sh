#!/usr/bin/env bash
# Apply migration 077 (job-type standardise + spray CHECK) to STAGING.
#   export STAGING_DB_URL='postgresql://postgres.yrpkfxmthregprsfkxaf:<PW>@<host>:5432/postgres'
#   scripts/apply-billing-lines-staging.sh
# Staging project yrpkfxmthregprsfkxaf. Idempotent. Does NOT touch prod.
set -euo pipefail
PSQL="/opt/homebrew/opt/libpq/bin/psql"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${STAGING_DB_URL:-}" ]]; then echo "ERROR: set STAGING_DB_URL first." >&2; exit 1; fi
run() { "$PSQL" "$STAGING_DB_URL" -v ON_ERROR_STOP=1 "$@"; }
echo "== BEFORE: non-canonical billing-line job_types =="
run -c "select job_type, count(*) from public.property_billing_lines group by 1 order by 1;"
echo "== APPLY 077 =="
run -f "$DIR/077_standardise_billing_line_job_types.sql"
echo "== AFTER: billing-line job_types =="
run -c "select job_type, billing_mode, count(*) from public.property_billing_lines group by 1,2 order by 1,2;"
echo "== AFTER: scheduled_jobs job_type CHECK =="
run -c "select pg_get_constraintdef((select oid from pg_constraint where conname='scheduled_jobs_job_type_check' and conrelid='public.scheduled_jobs'::regclass));"
run -c "notify pgrst, 'reload schema';"
echo "OK: 077 applied to staging (schema reload notified)."
