#!/usr/bin/env bash
# Apply migration 073 (invoice view excludes non_billable) to STAGING.
#   export STAGING_DB_URL='postgresql://postgres.yrpkfxmthregprsfkxaf:<PW>@<host>:5432/postgres'
#   scripts/apply-nonbillable-guard-staging.sh
# Staging project yrpkfxmthregprsfkxaf. Idempotent. Does NOT touch prod.
set -euo pipefail
PSQL="/opt/homebrew/opt/libpq/bin/psql"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${STAGING_DB_URL:-}" ]]; then echo "ERROR: set STAGING_DB_URL first." >&2; exit 1; fi
run() { "$PSQL" "$STAGING_DB_URL" -v ON_ERROR_STOP=1 "$@"; }
echo "== BEFORE: non_billable occurrences in viewdef (expect 0) =="
run -c "select (length(pg_get_viewdef('invoice_line_items_for_make'::regclass)) - length(replace(pg_get_viewdef('invoice_line_items_for_make'::regclass),'non_billable',''))) / length('non_billable') as occurrences;"
echo "== APPLY 073 =="
run -f "$DIR/073_invoice_view_excludes_non_billable.sql"
echo "== AFTER: occurrences (expect 3) =="
run -c "select (length(pg_get_viewdef('invoice_line_items_for_make'::regclass)) - length(replace(pg_get_viewdef('invoice_line_items_for_make'::regclass),'non_billable',''))) / length('non_billable') as occurrences;"
run -c "notify pgrst, 'reload schema';"
echo "OK: 073 applied to staging (schema reload notified)."
