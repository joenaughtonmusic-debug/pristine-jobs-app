-- ⚠️ SUPERSEDED — this draft's intent was implemented (with fixes) by
-- scripts/041_rls_role_separation.sql on 2026-07-17, after admin profiles
-- existed. Kept for the record; do not run.
--
-- =============================================================================
-- FUTURE TEMPLATE — DO NOT RUN
-- =============================================================================
-- This is NOT an executable migration. It is intentionally kept OUT of the
-- scripts/ migration sequence. Do not apply it as part of the anon-containment
-- release (038). It requires its own separate review and release, and all of
-- the following must be true first:
--
--   1. At least one VERIFIED ADMIN PROFILE exists. Today all 9 users are
--      role='staff'. Every is_admin() check below is false for everyone, so
--      running this now would LOCK THE WHOLE TEAM OUT of admin / timesheet /
--      payroll screens. Designate an admin first, e.g.:
--        UPDATE public.profiles SET role='admin'
--        WHERE email IN ('admin@example.com');   -- adjust list
--
--   2. CONFIRMED is_admin() BEHAVIOUR. It is an ad-hoc live function (not in
--      the repo). Verify it resolves the current user's role:
--        SELECT pg_get_functiondef('public.is_admin'::regproc);
--      Expected shape:
--        SELECT EXISTS(SELECT 1 FROM public.profiles
--                      WHERE id=auth.uid() AND role='admin');
--      Adjust the USING clauses if its shape differs.
--
--   3. MATCHING UI GATING. Screens for admin_actions / admin_enquiries /
--      timesheets / pay rates currently render for all staff (isAdmin is
--      hardcoded true in code). Gate the UI to admins in the SAME change, or
--      staff will see empty screens.
--
--   4. A SEPARATE REVIEW AND RELEASE, after 038 is applied and verified in
--      production, with its own smoke test.
--
-- Purpose: tighten the broad "authenticated" access granted by 038 down to
-- least-privilege for payroll / admin data. Each block DROPs the 038 broad
-- policy and REPLACEs it. Comment out any block you are not ready to enforce.
-- =============================================================================

-- --- staff_daily_timesheets: owner staff can see/edit their own; admin sees all
DO $$
BEGIN
  IF to_regclass('public.staff_daily_timesheets') IS NOT NULL THEN
    ALTER TABLE public.staff_daily_timesheets ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS staff_daily_timesheets_authenticated_all
      ON public.staff_daily_timesheets;

    DROP POLICY IF EXISTS staff_daily_timesheets_owner_or_admin
      ON public.staff_daily_timesheets;
    CREATE POLICY staff_daily_timesheets_owner_or_admin
      ON public.staff_daily_timesheets FOR ALL TO authenticated
      USING (
        public.is_admin()
        OR EXISTS (
          SELECT 1 FROM public.staff_members sm
          WHERE sm.id = staff_daily_timesheets.staff_member_id
            AND sm.auth_user_id = auth.uid()
        )
      )
      WITH CHECK (
        public.is_admin()
        OR EXISTS (
          SELECT 1 FROM public.staff_members sm
          WHERE sm.id = staff_daily_timesheets.staff_member_id
            AND sm.auth_user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- --- staff_cost_rates: replace the 038 broad policy with admin-only -----------
DO $$
BEGIN
  IF to_regclass('public.staff_cost_rates') IS NOT NULL THEN
    DROP POLICY IF EXISTS staff_cost_rates_authenticated_all ON public.staff_cost_rates;
    DROP POLICY IF EXISTS staff_cost_rates_admin_only ON public.staff_cost_rates;
    CREATE POLICY staff_cost_rates_admin_only
      ON public.staff_cost_rates FOR ALL TO authenticated
      USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;

-- --- admin_actions: admin-only (contains customer PII) ------------------------
-- CAUTION: gate the UI first (see prerequisite 3).
DO $$
BEGIN
  IF to_regclass('public.admin_actions') IS NOT NULL THEN
    DROP POLICY IF EXISTS admin_actions_authenticated_all ON public.admin_actions;
    DROP POLICY IF EXISTS admin_actions_admin_only ON public.admin_actions;
    CREATE POLICY admin_actions_admin_only
      ON public.admin_actions FOR ALL TO authenticated
      USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;

-- --- admin_enquiries: admin-only (contains customer PII) ----------------------
-- CAUTION: gate the UI first (see prerequisite 3).
DO $$
BEGIN
  IF to_regclass('public.admin_enquiries') IS NOT NULL THEN
    DROP POLICY IF EXISTS admin_enquiries_authenticated_all ON public.admin_enquiries;
    DROP POLICY IF EXISTS admin_enquiries_admin_only ON public.admin_enquiries;
    CREATE POLICY admin_enquiries_admin_only
      ON public.admin_enquiries FOR ALL TO authenticated
      USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;

-- Operational tables (properties, visits, scheduled_jobs, quotes, labour, etc.)
-- stay authenticated-broad — that matches the shared-team model and no per-user
-- ownership exists. Revisit only if the business wants per-role visibility.
