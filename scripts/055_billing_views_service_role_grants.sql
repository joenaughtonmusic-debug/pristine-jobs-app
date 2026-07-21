-- Migration 055: repair service_role grants on billing views (prod drift).
--
-- ALREADY APPLIED MANUALLY to staging and prod on 2026-07-21 via the SQL editor
-- and verified — both views now have service_role SELECT grants in both
-- environments. This file is the CODIFIED RECORD so an environment rebuild
-- reproduces it; idempotent no-op against the current state. Not pending work.
--
-- NOT part of the captures feature — split out of 054 so this billing drift has
-- its own record and can't entangle the captures fix. Kept here so the drift is
-- recorded rather than forgotten.
--
-- Background: confirmed 2026-07-21 via information_schema.role_table_grants that
-- both views had service_role grants in STAGING but not PROD (bypassrls does not
-- bypass view grants, so a service-role read in prod would have thrown the same
-- 42501 class of error). Both view names — including v_invoice_ready_grouped —
-- were verified by name against information_schema in BOTH environments.
--
-- Uses 041's relkind-checked pattern as belt-and-braces: a name that is missing
-- or not a view raises a WARNING and is skipped rather than aborting under
-- ON_ERROR_STOP. Both views are confirmed to exist, so this is purely defensive.
--
-- Idempotent: re-granting is a no-op; safe to re-run.

BEGIN;

DO $$
DECLARE
  name text;
  kind char;
BEGIN
  FOREACH name IN ARRAY ARRAY[
    'v_invoice_queue', 'v_invoice_ready_grouped'
  ]
  LOOP
    SELECT c.relkind INTO kind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = name;

    IF kind = 'v' THEN
      EXECUTE format('GRANT SELECT ON public.%I TO service_role', name);
      RAISE NOTICE '%: granted select to service_role', name;
    ELSIF kind IS NULL THEN
      RAISE WARNING '%: does not exist — skipped', name;
    ELSE
      RAISE WARNING '%: relkind % is not a view — skipped', name, kind;
    END IF;
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Post-check (expect a service_role SELECT row per view that exists):
-- select table_name, grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_name in ('v_invoice_queue', 'v_invoice_ready_grouped')
--   and grantee = 'service_role'
-- order by table_name;
