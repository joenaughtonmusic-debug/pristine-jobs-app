#!/usr/bin/env bash
# Rehearse the /capture migrations (050 + 051) on STAGING with before/after probes.
#
# Usage:
#   export STAGING_DB_URL='postgresql://postgres.yrpkfxmthregprsfkxaf:<PW>@aws-1-...pooler.supabase.com:5432/postgres'
#   scripts/apply-captures-staging.sh
#
# Staging project: yrpkfxmthregprsfkxaf (snapshot of prod, Make webhooks blank).
# Idempotent scripts — safe to re-run. Does NOT touch prod.
set -euo pipefail

PSQL="/opt/homebrew/opt/libpq/bin/psql"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "${STAGING_DB_URL:-}" ]]; then
  echo "ERROR: set STAGING_DB_URL first (the staging session-pooler connection string)." >&2
  exit 1
fi

run() { "$PSQL" "$STAGING_DB_URL" -v ON_ERROR_STOP=1 "$@"; }

echo "== BEFORE: does captures already exist? =="
run -c "select to_regclass('public.captures') as captures_table, to_regclass('public.captures') is not null as exists;"

echo "== APPLY 050 (table) =="
run -f "$DIR/050_create_captures.sql"

echo "== APPLY 051 (storage bucket) =="
run -f "$DIR/051_captures_storage_bucket.sql"

echo "== APPLY 052 (authenticated grants) =="
run -f "$DIR/052_captures_grants.sql"

echo "== APPLY 054 (service_role grants + default privileges) =="
run -f "$DIR/054_captures_service_role_grants.sql"

echo "== APPLY 055 (billing-view service_role grants) =="
run -f "$DIR/055_billing_views_service_role_grants.sql"

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

echo "== AFTER: captures grants (authenticated + service_role) =="
run -c "select grantee, privilege_type from information_schema.role_table_grants
        where table_name = 'captures' and grantee in ('authenticated', 'service_role')
        order by grantee, privilege_type;"

echo "== AFTER: billing-view service_role grants =="
run -c "select table_name, grantee, privilege_type from information_schema.role_table_grants
        where table_name in ('v_invoice_queue', 'v_invoice_ready_grouped')
          and grantee = 'service_role'
        order by table_name;"

echo "== SMOKE: insert defaults + bad-type reject =="
run -c "insert into public.captures (transcript) values ('__smoke__ staging rehearsal')
        returning id, type, status, triage_confidence;"
run -c "do \$\$ begin
          begin
            insert into public.captures (type) values ('nonsense');
            raise exception 'CHECK on type did NOT reject bad value';
          exception when check_violation then
            raise notice 'OK: type CHECK rejects bad value';
          end;
        end \$\$;"
run -c "delete from public.captures where transcript = '__smoke__ staging rehearsal';"

echo "== DONE (staging) =="
