#!/usr/bin/env bash
# Apply the admin-actions cleanup migration (056) to STAGING with before/after
# probes. Separate from the captures apply scripts on purpose — this is an
# unrelated feature and a data mutation, not captures schema setup.
#
# Usage:
#   export STAGING_DB_URL='postgresql://postgres.yrpkfxmthregprsfkxaf:<PW>@<host>:5432/postgres'
#   scripts/apply-admin-actions-staging.sh
#
# Staging project: yrpkfxmthregprsfkxaf. 056 is idempotent (COALESCE-guarded);
# safe to re-run. Does NOT touch prod.
set -euo pipefail

PSQL="/opt/homebrew/opt/libpq/bin/psql"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "${STAGING_DB_URL:-}" ]]; then
  echo "ERROR: set STAGING_DB_URL first (the staging session-pooler connection string)." >&2
  exit 1
fi

run() { "$PSQL" "$STAGING_DB_URL" -v ON_ERROR_STOP=1 "$@"; }

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

echo "== DONE (staging) =="
