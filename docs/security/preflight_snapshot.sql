-- =============================================================================
-- PREFLIGHT SNAPSHOT — READ-ONLY. Run BEFORE applying 038 and SAVE all output.
-- This capture is the ONLY sanctioned source for rollback grants. Do not
-- reconstruct anon/PUBLIC grants from memory or assumption.
-- =============================================================================

-- S1. Full grants audit for visibility: anon, PUBLIC, authenticated, service_role.
-- Confirms gate G1 (any PUBLIC grants) and records what authenticated/service_role
-- hold. NOTE: this is for review only — the sanctioned rollback source is S6,
-- which restores ONLY anon + PUBLIC.
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public'
  AND grantee IN ('anon','PUBLIC','authenticated','service_role')
ORDER BY table_name, grantee, privilege_type;

-- S2. RLS enabled state for every base table (records what to revert).
SELECT c.relname, c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
ORDER BY 1;

-- S3. ALL policies incl. permissive flag (gate G2).
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public'
ORDER BY tablename, policyname;

-- S4. View/matview owner + security_invoker + whether owner bypasses RLS.
SELECT c.relname AS view, r.rolname AS owner,
       (r.rolsuper OR r.rolbypassrls) AS owner_bypasses_rls,
       coalesce(c.reloptions::text,'') LIKE '%security_invoker=on%' AS is_invoker
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_roles r ON r.oid=c.relowner
WHERE n.nspname='public' AND c.relkind IN ('v','m')
ORDER BY 1;

-- S5. is_admin() definition (for the future hardening draft).
SELECT p.proname, p.prosecdef AS security_definer, pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='is_admin';

-- S6. GRANT-restore GENERATOR — run before 038; save output verbatim. These are
-- the ONLY statements permitted to re-grant anon/PUBLIC on rollback.
SELECT format(
  'GRANT %s ON public.%I TO %s;',
  privilege_type,
  table_name,
  CASE
    WHEN grantee = 'PUBLIC' THEN 'PUBLIC'
    ELSE quote_ident(grantee)
  END
)
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'PUBLIC')
ORDER BY table_name, grantee, privilege_type;
