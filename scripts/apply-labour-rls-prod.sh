#!/usr/bin/env bash
# Apply migration 062 (job_labour_entries per-command policies) to PROD, with
# before/after policy probes. Run ONLY after the staging apply + three-shape
# acceptance suite passed and Joe has OK'd prod.
#
# Usage:
#   export PROD_DB_URL='postgresql://postgres.tblvlffqanqpqhcagcrk:<PW>@<host>:5432/postgres'
#   scripts/apply-labour-rls-prod.sh
#
# Prod project: tblvlffqanqpqhcagcrk. 062 is idempotent; safe to re-run.
# PostgREST caches per-connection plans — if the app still sees the old policy
# after apply, recycle the authenticator backends (or wait for connection churn).
set -euo pipefail

PSQL="/opt/homebrew/opt/libpq/bin/psql"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "${PROD_DB_URL:-}" ]]; then
  echo "ERROR: set PROD_DB_URL first (the prod session-pooler connection string)." >&2
  exit 1
fi

run() { "$PSQL" "$PROD_DB_URL" -v ON_ERROR_STOP=1 "$@"; }

echo "== BEFORE: policies on job_labour_entries =="
run -c "select policyname, cmd from pg_policies where schemaname='public' and tablename='job_labour_entries' order by cmd;"

echo "== APPLY 062 =="
run -f "$DIR/062_job_labour_entries_crew_insert_select.sql"

echo "== AFTER: policies on job_labour_entries =="
run -c "select policyname, cmd, (position('current_staff_job_ids' in coalesce(qual,''))>0) as select_using_widened, (position('current_staff_job_ids' in coalesce(with_check,''))>0) as insert_check_widened from pg_policies where schemaname='public' and tablename='job_labour_entries' order by cmd;"

run -c "notify pgrst, 'reload schema';"
echo "OK: 062 applied to prod (schema reload notified)."
