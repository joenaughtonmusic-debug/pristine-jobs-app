-- 052: grant the authenticated role table access on captures.
--
-- WHY: 050 created captures via psql and enabled RLS with a permissive policy,
-- but the table got NO privilege grants for the `authenticated` role (the
-- Supabase default-privilege grants that the dashboard/SQL-editor path gives you
-- did not land on the psql-created table). Result in prod: the /capture page's
-- client-side reads and the dismiss UPDATE — which run as `authenticated` —
-- fail with 42501 "permission denied for table captures". The API route now
-- inserts as service-role (unaffected), but the page still needs these grants.
--
-- RLS is still the row gate: the captures_authenticated_all policy from 050
-- decides which rows are visible/writable. GRANT only says the role may attempt
-- the command at all — both are required.
--
-- Idempotent: GRANT is a no-op if already present. Safe to re-run.

BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.captures TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Post-check (expect rows for authenticated with the four privilege types):
-- select grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_name = 'captures' and grantee = 'authenticated'
-- order by privilege_type;
