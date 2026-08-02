#!/usr/bin/env bash
# Apply migration 076 (customer photo email columns) to STAGING.
#   export STAGING_DB_URL='postgresql://postgres.yrpkfxmthregprsfkxaf:<PW>@<host>:5432/postgres'
#   scripts/apply-photo-email-staging.sh
# Staging project yrpkfxmthregprsfkxaf. Idempotent. Does NOT touch prod.
set -euo pipefail
PSQL="/opt/homebrew/opt/libpq/bin/psql"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${STAGING_DB_URL:-}" ]]; then echo "ERROR: set STAGING_DB_URL first." >&2; exit 1; fi
run() { "$PSQL" "$STAGING_DB_URL" -v ON_ERROR_STOP=1 "$@"; }
echo "== APPLY 076 =="
run -f "$DIR/076_photo_email_to_customer.sql"
echo "== AFTER: columns =="
run -c "select table_name, column_name from information_schema.columns where table_schema='public' and column_name in ('send_photos','photo_email_sent_at','photo_email_skip_reason','hidden_from_customer_at') order by 1,2;"
run -c "notify pgrst, 'reload schema';"
echo "OK: 076 applied to staging (schema reload notified)."
