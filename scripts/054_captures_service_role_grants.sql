-- Migration 054: service_role grants for captures + default privileges
-- (renumbered from 053 to avoid collision with parallel billing work)
--
-- ALREADY APPLIED MANUALLY to staging and prod on 2026-07-21 via the SQL editor
-- and verified (captures grants + default privileges confirmed present in both
-- environments). This file is the CODIFIED RECORD so an environment rebuild
-- reproduces it — it is an idempotent no-op against the current state. Do not
-- treat it as pending work.
--
-- Root cause of the capture save failure: prod's `captures` table had no
-- grants for service_role, so every service-role INSERT failed with
-- 42501 "permission denied for table captures". service_role bypasses RLS,
-- NOT table grants — it needs explicit privileges like any other role.
--
-- Pairs with commit 2d0f905: that change makes the route send the
-- service_role bearer; this migration lets service_role touch the table.
-- Both are required for the save to succeed.
--
-- The billing-view drift (v_invoice_queue, v_invoice_ready_grouped) is split
-- into 055 — those objects are outside the captures feature, so they get their
-- own record-keeping migration.
--
-- All statements are idempotent: re-granting is a no-op; safe to re-run.

BEGIN;

------------------------------------------------------------------------
-- 1. The captures table (the actual fix)
------------------------------------------------------------------------
grant all on table public.captures to service_role;

-- No sequence grants needed: captures uses a uuid primary key.

------------------------------------------------------------------------
-- 2. Default privileges (recurrence prevention)
--
-- Ensures every FUTURE table/sequence/function created in public
-- automatically grants service_role, so this drift can't come back on
-- new tables or an environment rebuild.
--
-- Scoped `for role postgres` deliberately: default privileges only apply
-- to objects created by the role they're scoped to, and Supabase
-- migrations / dashboard DDL run as postgres. A bare ALTER DEFAULT
-- PRIVILEGES would only cover whichever role executes this file.
------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  grant all on tables to service_role;

alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;

alter default privileges for role postgres in schema public
  grant execute on functions to service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Post-check (expect service_role rows with privileges):
-- select grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_name = 'captures' and grantee = 'service_role'
-- order by privilege_type;
