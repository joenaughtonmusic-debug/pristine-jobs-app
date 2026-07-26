#!/usr/bin/env bash
# Apply migration 062 (job_labour_entries per-command policies) to STAGING,
# with before/after policy probes.
#
# Usage:
#   export STAGING_DB_URL='postgresql://postgres.yrpkfxmthregprsfkxaf:<PW>@<host>:5432/postgres'
#   scripts/apply-labour-rls-staging.sh
#
# Staging project: yrpkfxmthregprsfkxaf. 062 is idempotent (DROP IF EXISTS +
# CREATE); safe to re-run. Does NOT touch prod. PostgREST caches per-connection
# plans — the script sends NOTIFY pgrst 'reload schema' at the end; if the app
# still sees the old policy, recycle authenticator backends.
set -euo pipefail

PSQL="/opt/homebrew/opt/libpq/bin/psql"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "${STAGING_DB_URL:-}" ]]; then
  echo "ERROR: set STAGING_DB_URL first (the staging session-pooler connection string)." >&2
  exit 1
fi

run() { "$PSQL" "$STAGING_DB_URL" -v ON_ERROR_STOP=1 "$@"; }

echo "== BEFORE: policies on job_labour_entries =="
run -c "select policyname, cmd from pg_policies where schemaname='public' and tablename='job_labour_entries' order by cmd;"

echo "== APPLY 062 =="
run -f "$DIR/062_job_labour_entries_crew_insert_select.sql"

echo "== AFTER: policies on job_labour_entries =="
run -c "select policyname, cmd, (position('current_staff_job_ids' in coalesce(qual,''))>0) as select_using_widened, (position('current_staff_job_ids' in coalesce(with_check,''))>0) as insert_check_widened from pg_policies where schemaname='public' and tablename='job_labour_entries' order by cmd;"

run -c "notify pgrst, 'reload schema';"
echo "OK: 062 applied to staging (schema reload notified)."
