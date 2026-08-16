#!/usr/bin/env bash
set -euo pipefail
PSQL="/opt/homebrew/opt/libpq/bin/psql"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Fall back to PROD_DB_URL in .env.local (gitignored), same as the staging
# script. Prod still needs Joe's explicit OK before this is run at all.
if [[ -z "${PROD_DB_URL:-}" && -f "$DIR/../.env.local" ]]; then
  PROD_DB_URL="$(grep -E '^PROD_DB_URL=' "$DIR/../.env.local" | head -1 | cut -d= -f2- | tr -d '"'"'"'')"
fi
if [[ -z "${PROD_DB_URL:-}" ]]; then
  echo "ERROR: set PROD_DB_URL, or add a PROD_DB_URL=... line to .env.local" >&2
  exit 1
fi
run() { "$PSQL" "$PROD_DB_URL" -v ON_ERROR_STOP=1 "$@"; }
run -f "$DIR/084_quote_billing_entity.sql"
run -c "select column_name, data_type from information_schema.columns where table_schema='public' and table_name='quote_drafts' and column_name='billing_entity';"
run -c "notify pgrst, 'reload schema';"
echo "OK: 084 applied to prod."
