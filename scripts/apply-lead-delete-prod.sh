#!/usr/bin/env bash
# Apply migration 072 (sales_leads soft delete) to PROD — only after staging
# rehearsal + Joe's OK.
#   export PROD_DB_URL='postgresql://postgres.tblvlffqanqpqhcagcrk:<PW>@<host>:5432/postgres'
#   scripts/apply-lead-delete-prod.sh
# Prod project tblvlffqanqpqhcagcrk. Idempotent.
set -euo pipefail
PSQL="/opt/homebrew/opt/libpq/bin/psql"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${PROD_DB_URL:-}" ]]; then echo "ERROR: set PROD_DB_URL first." >&2; exit 1; fi
run() { "$PSQL" "$PROD_DB_URL" -v ON_ERROR_STOP=1 "$@"; }
echo "== APPLY 072 (PROD) =="
run -f "$DIR/072_sales_leads_soft_delete.sql"
echo "== AFTER: columns =="
run -c "select column_name, data_type from information_schema.columns where table_schema='public' and table_name='sales_leads' and column_name in ('deleted_at','deleted_by');"
run -c "notify pgrst, 'reload schema';"
echo "OK: 072 applied to prod (schema reload notified)."
