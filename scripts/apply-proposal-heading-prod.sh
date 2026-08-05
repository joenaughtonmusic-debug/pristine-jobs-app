#!/usr/bin/env bash
# Apply migration 079 (quote_drafts.proposal_heading) to PROD.
set -euo pipefail
PSQL="/opt/homebrew/opt/libpq/bin/psql"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${PROD_DB_URL:-}" ]]; then echo "ERROR: set PROD_DB_URL first." >&2; exit 1; fi
run() { "$PSQL" "$PROD_DB_URL" -v ON_ERROR_STOP=1 "$@"; }
echo "== APPLY 079 =="
run -f "$DIR/079_quote_proposal_heading.sql"
run -c "select column_name from information_schema.columns where table_schema='public' and table_name='quote_drafts' and column_name='proposal_heading';"
run -c "notify pgrst, 'reload schema';"
echo "OK: 079 applied to prod."
