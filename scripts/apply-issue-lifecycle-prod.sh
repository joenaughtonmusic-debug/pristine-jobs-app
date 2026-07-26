#!/usr/bin/env bash
# Apply migration 065 (job_photos issue lifecycle columns) to PROD
# (project tblvlffqanqpqhcagcrk, Mumbai). Staging first, Joe's OK, then this.
#   export PROD_DB_URL='postgresql://postgres.tblvlffqanqpqhcagcrk:<PW>@<host>:5432/postgres'
#   scripts/apply-issue-lifecycle-prod.sh
# Idempotent.
set -euo pipefail
PSQL="/opt/homebrew/opt/libpq/bin/psql"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${PROD_DB_URL:-}" ]]; then echo "ERROR: set PROD_DB_URL first." >&2; exit 1; fi
run() { "$PSQL" "$PROD_DB_URL" -v ON_ERROR_STOP=1 "$@"; }
echo "== APPLY 065 (PROD) =="
run -f "$DIR/065_job_photos_issue_lifecycle.sql"
echo "== AFTER: columns =="
run -c "select column_name, data_type, column_default from information_schema.columns where table_schema='public' and table_name='job_photos' and column_name like 'issue_%' or (table_name='job_photos' and column_name='reported_to_pm_at') order by column_name;"
run -c "notify pgrst, 'reload schema';"
echo "OK: 065 applied to prod."
