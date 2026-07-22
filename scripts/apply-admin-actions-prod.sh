#!/usr/bin/env bash
# Apply the admin-actions cleanup migration (056) to PRODUCTION with before/after
# probes. Separate from the captures apply scripts on purpose — unrelated feature,
# and a data mutation (UPDATE ... SET status) rather than schema setup.
#
# Run this ONLY after the staging rehearsal (apply-admin-actions-staging.sh)
# looked clean and Joe approved.
#
# Usage:
#   export PROD_DB_URL='postgresql://postgres.tblvlffqanqpqhcagcrk:<PW>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres'
#   scripts/apply-admin-actions-prod.sh
#
# Prod project: tblvlffqanqpqhcagcrk. 056 is idempotent (COALESCE-guarded).
set -euo pipefail

PSQL="/opt/homebrew/opt/libpq/bin/psql"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "${PROD_DB_URL:-}" ]]; then
  echo "ERROR: set PROD_DB_URL first (the prod session-pooler connection string)." >&2
  exit 1
fi

# Guard: PROD_DB_URL must point at the prod project, not staging.
if [[ "$PROD_DB_URL" == *"yrpkfxmthregprsfkxaf"* ]]; then
  echo "ERROR: PROD_DB_URL points at the STAGING project (yrpkfxmthregprsfkxaf)." >&2
  echo "       Use scripts/apply-admin-actions-staging.sh for staging." >&2
  exit 1
fi

# This is production and a data mutation — require an explicit typed confirmation.
read -r -p "About to apply 056 (dismiss labour_reconciliation actions) to PRODUCTION (tblvlffqanqpqhcagcrk). Type APPLY to continue: " CONFIRM
if [[ "$CONFIRM" != "APPLY" ]]; then
  echo "Aborted — nothing applied." >&2
  exit 1
fi

run() { "$PSQL" "$PROD_DB_URL" -v ON_ERROR_STOP=1 "$@"; }

echo "== BEFORE: labour_reconciliation vs job_labour_entry action counts by status =="
run -c "select source_record_type, coalesce(status,'open') as status, count(*)
        from admin_actions
        where source_record_type in ('labour_reconciliation','job_labour_entry')
        group by 1,2 order by 1,2;"

echo "== APPLY 056 (dismiss labour_reconciliation actions) =="
run -f "$DIR/056_dismiss_labour_recon_actions.sql"

echo "== AFTER: expect 0 open labour_reconciliation rows; job_labour_entry unchanged =="
run -c "select source_record_type, coalesce(status,'open') as status, count(*)
        from admin_actions
        where source_record_type in ('labour_reconciliation','job_labour_entry')
        group by 1,2 order by 1,2;"

echo "== DONE (prod) =="
