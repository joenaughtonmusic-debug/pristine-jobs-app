#!/usr/bin/env bash
set -euo pipefail
PSQL="/opt/homebrew/opt/libpq/bin/psql"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${PROD_DB_URL:-}" ]]; then echo "ERROR: set PROD_DB_URL first." >&2; exit 1; fi
run() { "$PSQL" "$PROD_DB_URL" -v ON_ERROR_STOP=1 "$@"; }
run -f "$DIR/080_quote_logo_variant.sql"
run -c "select column_name from information_schema.columns where table_schema='public' and table_name='quote_drafts' and column_name='logo_variant';"
run -c "notify pgrst, 'reload schema';"
echo "OK: 080 applied to prod."
