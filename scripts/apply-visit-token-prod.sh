#!/usr/bin/env bash
# Apply migration 075 (visits.public_token) to PROD — only after staging
# rehearsal + Joe's OK.
#   export PROD_DB_URL='postgresql://postgres.tblvlffqanqpqhcagcrk:<PW>@<host>:5432/postgres'
#   scripts/apply-visit-token-prod.sh
# Prod project tblvlffqanqpqhcagcrk. Idempotent.
set -euo pipefail
PSQL="/opt/homebrew/opt/libpq/bin/psql"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${PROD_DB_URL:-}" ]]; then echo "ERROR: set PROD_DB_URL first." >&2; exit 1; fi
run() { "$PSQL" "$PROD_DB_URL" -v ON_ERROR_STOP=1 "$@"; }
echo "== APPLY 075 (PROD) =="
run -f "$DIR/075_visit_public_token.sql"
echo "== AFTER: token coverage =="
run -c "select count(*) as visits, count(public_token) as with_token, count(distinct public_token) as distinct_tokens from visits;"
run -c "notify pgrst, 'reload schema';"
echo "OK: 075 applied to prod (schema reload notified)."
