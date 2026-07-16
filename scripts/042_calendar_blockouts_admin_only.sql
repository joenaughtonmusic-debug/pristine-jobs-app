-- Brief 01 Part 2d resolved: calendar_blockouts comes off the public
-- internet. Its old SELECT policy allowed the 'anon' role, so the title,
-- location, and notes of Joe's synced Google Calendar events were
-- world-readable.
--
-- Verified before writing (2026-07-17): the only code reading this table is
-- app/(app)/admin/estimates-calendar/page.tsx (behind the is_admin gate);
-- /api/public/working-today does not touch it; the Google Calendar sync
-- writes via the service role, which bypasses RLS regardless. So admin-only
-- for everything loses nothing.
--
-- Same drop-all-then-recreate pattern as 041 (policy names can't be trusted).

BEGIN;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'calendar_blockouts'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.calendar_blockouts', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE calendar_blockouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY calendar_blockouts_admin_only ON calendar_blockouts
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

COMMIT;
