#!/usr/bin/env bash
# Apply migration 078 (recurring maintenance calendar guard column) to STAGING.
#   export STAGING_DB_URL='postgresql://...'
#   scripts/apply-onramp-staging.sh
set -euo pipefail
PSQL="/opt/homebrew/opt/libpq/bin/psql"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${STAGING_DB_URL:-}" ]]; then echo "ERROR: set STAGING_DB_URL first." >&2; exit 1; fi
run() { "$PSQL" "$STAGING_DB_URL" -v ON_ERROR_STOP=1 "$@"; }
echo "== APPLY 078 =="
run -f "$DIR/078_property_gcal_recurring_event.sql"
echo "== AFTER: column present =="
run -c "select column_name from information_schema.columns where table_schema='public' and table_name='properties' and column_name='gcal_recurring_event_created_at';"
run -c "notify pgrst, 'reload schema';"
echo "OK: 078 applied to staging (schema reload notified)."
