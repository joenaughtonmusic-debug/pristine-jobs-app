#!/usr/bin/env bash
# Apply migration 076 (customer photo email columns) to PROD — only after
# staging rehearsal + Joe's OK.
#   export PROD_DB_URL='postgresql://postgres.tblvlffqanqpqhcagcrk:<PW>@<host>:5432/postgres'
#   scripts/apply-photo-email-prod.sh
# Prod project tblvlffqanqpqhcagcrk. Idempotent.
set -euo pipefail
PSQL="/opt/homebrew/opt/libpq/bin/psql"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${PROD_DB_URL:-}" ]]; then echo "ERROR: set PROD_DB_URL first." >&2; exit 1; fi
run() { "$PSQL" "$PROD_DB_URL" -v ON_ERROR_STOP=1 "$@"; }
echo "== APPLY 076 (PROD) =="
run -f "$DIR/076_photo_email_to_customer.sql"
echo "== AFTER: columns =="
run -c "select table_name, column_name from information_schema.columns where table_schema='public' and column_name in ('send_photos','photo_email_sent_at','photo_email_skip_reason','hidden_from_customer_at') order by 1,2;"
run -c "notify pgrst, 'reload schema';"
echo "OK: 076 applied to prod (schema reload notified)."
