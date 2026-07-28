#!/usr/bin/env bash
# Apply migration 073 (invoice view excludes non_billable) to PROD — only
# after staging rehearsal + Joe's OK.
#   export PROD_DB_URL='postgresql://postgres.tblvlffqanqpqhcagcrk:<PW>@<host>:5432/postgres'
#   scripts/apply-nonbillable-guard-prod.sh
# Prod project tblvlffqanqpqhcagcrk. Idempotent.
set -euo pipefail
PSQL="/opt/homebrew/opt/libpq/bin/psql"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${PROD_DB_URL:-}" ]]; then echo "ERROR: set PROD_DB_URL first." >&2; exit 1; fi
run() { "$PSQL" "$PROD_DB_URL" -v ON_ERROR_STOP=1 "$@"; }
echo "== BEFORE: non_billable occurrences in viewdef (expect 0) =="
run -c "select (length(pg_get_viewdef('invoice_line_items_for_make'::regclass)) - length(replace(pg_get_viewdef('invoice_line_items_for_make'::regclass),'non_billable',''))) / length('non_billable') as occurrences;"
echo "== APPLY 073 (PROD) =="
run -f "$DIR/073_invoice_view_excludes_non_billable.sql"
echo "== AFTER: occurrences (expect 3) =="
run -c "select (length(pg_get_viewdef('invoice_line_items_for_make'::regclass)) - length(replace(pg_get_viewdef('invoice_line_items_for_make'::regclass),'non_billable',''))) / length('non_billable') as occurrences;"
run -c "notify pgrst, 'reload schema';"
echo "OK: 073 applied to prod (schema reload notified)."
