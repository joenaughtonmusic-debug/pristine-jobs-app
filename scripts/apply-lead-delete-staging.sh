#!/usr/bin/env bash
# Apply migration 072 (sales_leads soft delete) to STAGING.
#   export STAGING_DB_URL='postgresql://postgres.yrpkfxmthregprsfkxaf:<PW>@<host>:5432/postgres'
#   scripts/apply-lead-delete-staging.sh
# Staging project yrpkfxmthregprsfkxaf. Idempotent. Does NOT touch prod.
set -euo pipefail
PSQL="/opt/homebrew/opt/libpq/bin/psql"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${STAGING_DB_URL:-}" ]]; then echo "ERROR: set STAGING_DB_URL first." >&2; exit 1; fi
run() { "$PSQL" "$STAGING_DB_URL" -v ON_ERROR_STOP=1 "$@"; }
echo "== APPLY 072 =="
run -f "$DIR/072_sales_leads_soft_delete.sql"
echo "== AFTER: columns =="
run -c "select column_name, data_type from information_schema.columns where table_schema='public' and table_name='sales_leads' and column_name in ('deleted_at','deleted_by');"
run -c "notify pgrst, 'reload schema';"
echo "OK: 072 applied to staging (schema reload notified)."
