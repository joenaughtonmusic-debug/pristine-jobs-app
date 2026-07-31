#!/usr/bin/env bash
# Apply migration 075 (visits.public_token for the public photo page) to STAGING.
#   export STAGING_DB_URL='postgresql://postgres.yrpkfxmthregprsfkxaf:<PW>@<host>:5432/postgres'
#   scripts/apply-visit-token-staging.sh
# Staging project yrpkfxmthregprsfkxaf. Idempotent. Does NOT touch prod.
set -euo pipefail
PSQL="/opt/homebrew/opt/libpq/bin/psql"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${STAGING_DB_URL:-}" ]]; then echo "ERROR: set STAGING_DB_URL first." >&2; exit 1; fi
run() { "$PSQL" "$STAGING_DB_URL" -v ON_ERROR_STOP=1 "$@"; }
echo "== APPLY 075 =="
run -f "$DIR/075_visit_public_token.sql"
echo "== AFTER: token coverage =="
run -c "select count(*) as visits, count(public_token) as with_token, count(distinct public_token) as distinct_tokens from visits;"
run -c "notify pgrst, 'reload schema';"
echo "OK: 075 applied to staging (schema reload notified)."
