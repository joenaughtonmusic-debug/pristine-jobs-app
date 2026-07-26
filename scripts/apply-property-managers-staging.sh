#!/usr/bin/env bash
# Apply migration 063 (property_managers table + properties.property_manager_id)
# to STAGING, with before/after probes.
#
# Usage:
#   export STAGING_DB_URL='postgresql://postgres.yrpkfxmthregprsfkxaf:<PW>@<host>:5432/postgres'
#   scripts/apply-property-managers-staging.sh
#
# Staging project: yrpkfxmthregprsfkxaf. 063 is idempotent; safe to re-run.
# Does NOT touch prod.
set -euo pipefail

PSQL="/opt/homebrew/opt/libpq/bin/psql"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "${STAGING_DB_URL:-}" ]]; then
  echo "ERROR: set STAGING_DB_URL first (the staging session-pooler connection string)." >&2
  exit 1
fi

run() { "$PSQL" "$STAGING_DB_URL" -v ON_ERROR_STOP=1 "$@"; }

echo "== BEFORE: property_managers exists? =="
run -c "select count(*) as property_managers_tables from information_schema.tables where table_schema='public' and table_name='property_managers';"

echo "== APPLY 063 =="
run -f "$DIR/063_create_property_managers.sql"

echo "== AFTER: table + policies + FK =="
run -c "select policyname, cmd from pg_policies where schemaname='public' and tablename='property_managers' order by cmd;"
run -c "select column_name from information_schema.columns where table_schema='public' and table_name='properties' and column_name='property_manager_id';"

run -c "notify pgrst, 'reload schema';"
echo "OK: 063 applied to staging (schema reload notified)."
