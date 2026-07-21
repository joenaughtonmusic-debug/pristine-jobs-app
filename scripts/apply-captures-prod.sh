#!/usr/bin/env bash
# Apply the /capture migrations (050 + 051) to PRODUCTION with before/after probes.
#
# Run this ONLY after the staging rehearsal (scripts/apply-captures-staging.sh)
# looked clean and Joe approved.
#
# Usage:
#   export PROD_DB_URL='postgresql://postgres.tblvlffqanqpqhcagcrk:<PW>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres'
#   scripts/apply-captures-prod.sh
#
# Prod project: tblvlffqanqpqhcagcrk. Idempotent scripts — safe to re-run.
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
  echo "       Use scripts/apply-captures-staging.sh for staging." >&2
  exit 1
fi

# This is production — require an explicit typed confirmation before writing.
read -r -p "About to apply 050 + 051 to PRODUCTION (tblvlffqanqpqhcagcrk). Type APPLY to continue: " CONFIRM
if [[ "$CONFIRM" != "APPLY" ]]; then
  echo "Aborted — nothing applied." >&2
  exit 1
fi

run() { "$PSQL" "$PROD_DB_URL" -v ON_ERROR_STOP=1 "$@"; }

echo "== BEFORE: does captures already exist? =="
run -c "select to_regclass('public.captures') as captures_table, to_regclass('public.captures') is not null as exists;"

echo "== APPLY 050 (table) =="
run -f "$DIR/050_create_captures.sql"

echo "== APPLY 051 (storage bucket) =="
run -f "$DIR/051_captures_storage_bucket.sql"

echo "== AFTER: columns + constraints =="
run -c "select column_name, data_type, is_nullable, column_default
        from information_schema.columns
        where table_name = 'captures' order by ordinal_position;"
run -c "select conname, pg_get_constraintdef(oid) from pg_constraint
        where conrelid = 'public.captures'::regclass and contype = 'c';"

echo "== AFTER: bucket + object policies =="
run -c "select id, name, public from storage.buckets where id = 'captures';"
run -c "select policyname from pg_policies
        where schemaname = 'storage' and tablename = 'objects'
          and policyname like 'captures_bucket_%';"

echo "== SMOKE: insert defaults + bad-type reject =="
run -c "insert into public.captures (transcript) values ('__smoke__ prod apply check')
        returning id, type, status, triage_confidence;"
run -c "do \$\$ begin
          begin
            insert into public.captures (type) values ('nonsense');
            raise exception 'CHECK on type did NOT reject bad value';
          exception when check_violation then
            raise notice 'OK: type CHECK rejects bad value';
          end;
        end \$\$;"
run -c "delete from public.captures where transcript = '__smoke__ prod apply check';"

echo "== DONE (prod) =="
