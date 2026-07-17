-- ⚠️ HISTORICAL RECORD — already applied live on 2026-07-15; do not re-run.
-- Preserved from the security/contain-anon-access branch (renumbered out of
-- scripts/ because "038" collided with 038_reconcile_sales_lead_board_stages).
-- Status today: its *_authenticated_all blanket POLICIES were dropped and
-- replaced by scripts/041_rls_role_separation.sql (and 042 for
-- calendar_blockouts); its anon GRANT REVOKES remain in force and are a
-- separate, still-active defence layer (verified 2026-07-17: anon gets 42501
-- on all internal tables and views).
--
-- 038_contain_anon_database_access.sql
-- =============================================================================
-- IMMEDIATE CONTAINMENT for the Supabase "rls_disabled_in_public" exposure.
-- Goal: remove ANON (public, unauthenticated) access to internal data while
-- PRESERVING current authenticated behaviour. Admin-only / payroll restrictions
-- are deferred to the future hardening draft (docs/security/).
--
-- Verified read-only on 2026-07-15 (REST reads only; no SQL/DDL run):
--   * The public anon key could read ~36 objects (staff pay, customer data,
--     financials, comms). Anon = anyone with the project URL + the public key.
--   * Public routes (public quote page, working-today, leads webhook) use the
--     SERVICE ROLE (lib/supabase/admin.ts) which bypasses RLS — unaffected.
--   * The admin app runs as the logged-in user (AUTHENTICATED). profiles has
--     9 users, ALL role='staff' — no admin exists yet, so role-based rules are
--     deferred (they would lock the team out today).
--   * The app is a shared team; newer tables already use auth.role()=
--     'authenticated'. This migration follows that real model.
--   * Every policy in the repo migrations is PERMISSIVE (no AS RESTRICTIVE).
--
-- =============================================================================
-- ⛔ PREFLIGHT GATES — run the snapshot SQL and REVIEW before executing.
--    STOP and reconcile if:
--
--    G1. Any affected table grants privileges to PUBLIC (not just anon).
--        REVOKE ... FROM anon does NOT remove access granted to PUBLIC. If
--        PUBLIC grants exist, reconcile first (revoke from PUBLIC only after
--        confirming authenticated + service_role hold their own explicit grants).
--
--    G2. Any affected table has a RESTRICTIVE policy (pg_policies.permissive =
--        'RESTRICTIVE' / 'f'). A restrictive policy would AND-combine with the
--        new authenticated_all policy and BLOCK non-owner staff. The repo has
--        none; confirm LIVE has none before enabling RLS.
-- =============================================================================

-- --- A. Shared-team internal base tables --------------------------------------
-- Enable RLS; add an authenticated-only full-access policy (preserves the app
-- for logged-in staff); revoke anon. Existing policies are left intact — the new
-- authenticated_all policies are PERMISSIVE and already preserve shared-team
-- access, so no existing policy is dropped (minimises change, simplifies rollback).
-- staff_cost_rates is included here for immediate containment (RLS + authenticated
-- policy + revoke anon); tightening it to admin-only is deferred to the draft.
DO $$
DECLARE
  t text;
  team_tables text[] := ARRAY[
    'admin_actions',            -- draft: candidate admin-only
    'admin_enquiries',          -- draft: candidate admin-only
    'client_contact_messages',
    'communications',
    'estimate_calendar_blocks',
    'estimates',
    'extra_charge_items',
    'internal_job_notes',
    'job_labour_entries',
    'landscaping_jobs',
    'properties',
    'property_service_templates',
    'quote_drafts',
    'quote_templates',
    'scheduled_job_staff',
    'scheduled_jobs',
    'staff_cost_rates',         -- draft: restrict to admin-only
    'staff_daily_timesheets',   -- draft: restrict to owner staff + admin
    'staff_members',
    'visit_extra_charges',
    'visit_labour_entries',
    'visits'
  ];
BEGIN
  FOREACH t IN ARRAY team_tables LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                     t || '_authenticated_all', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
        'USING (true) WITH CHECK (true)', t || '_authenticated_all', t);
      -- Defence in depth: strip anon's TABLE privileges (anon only; not PUBLIC).
      EXECUTE format(
        'REVOKE SELECT, INSERT, UPDATE, DELETE ON public.%I FROM anon', t);
    END IF;
  END LOOP;
END $$;

-- --- B. Internal reporting VIEWS — revoke ALL anon privileges ----------------
-- RLS cannot apply to a view. Preflight S1 showed anon holds SELECT/INSERT/
-- UPDATE/DELETE on internal objects, so revoke ALL (not just SELECT). This
-- closes the leak without changing behaviour for authenticated/service callers.
-- Do NOT touch PUBLIC grants (gate G1 passed — none exist).
DO $$
DECLARE
  v text;
  internal_views text[] := ARRAY[
    'v_property_overview',
    'v_recent_visits',
    'v_scheduled_jobs_admin',
    'profitability_summary',
    'property_profitability',
    'property_frequency_review',
    'property_latest_next_visit_note',
    'property_latest_visit_summary',
    'landscaping_job_totals',
    'missing_staff_hours_current_week',
    'staff_utilisation_current_week'
  ];
BEGIN
  FOREACH v IN ARRAY internal_views LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v AND c.relkind IN ('v','m')
    ) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON public.%I FROM anon', v);
    END IF;
  END LOOP;
END $$;

-- --- C. Make.com integration views — DELIBERATELY NOT TOUCHED ----------------
-- invoice_line_items_for_make, quote_line_items_for_make feed the Xero Make
-- scenarios. Do NOT revoke anon until the Make Supabase connection is confirmed
-- to use the service_role key. Once confirmed:
--   REVOKE SELECT ON public.invoice_line_items_for_make FROM anon;
--   REVOKE SELECT ON public.quote_line_items_for_make   FROM anon;

-- --- D. Intentionally PUBLIC objects — keep anon SELECT, revoke anon writes --
-- calendar_blockouts (deliberate anon-SELECT, migration 018) and
-- public_suburb_locations (intentional public map data, 030/031) may stay
-- publicly READABLE, but preflight S1 showed anon also holds write grants, which
-- anonymous users must not have. Revoke INSERT/UPDATE/DELETE only; keep SELECT.
DO $$
DECLARE
  o text;
  public_objects text[] := ARRAY[
    'calendar_blockouts',
    'public_suburb_locations'
  ];
BEGIN
  FOREACH o IN ARRAY public_objects LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = o AND c.relkind = 'r'
    ) THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon', o);
    END IF;
  END LOOP;
END $$;

-- Already protected (RLS on, anon already blocked): sales_leads, profiles,
-- job_photos, job_board_items, job_board_responses, scheduling_queue.
