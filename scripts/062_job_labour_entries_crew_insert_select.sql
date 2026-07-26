-- 062: job_labour_entries — let the completing crew member record and see the
-- WHOLE crew's cost rows, fixing the complete-visit RLS bug, WITHOUT granting
-- edit/delete rights over teammates' hours.
--
-- Why: 041 made job_labour_entries a single FOR ALL own-rows-or-admin policy.
-- The Complete Visit dialog inserts a row per crew member (primary + each
-- helper) from the COMPLETER's session, so any row for someone else was
-- rejected 42501 and the flow aborted partway. Fired live once: visit
-- 5fc4a1f9 / 17 Jul (Alex+Graham) — Graham's cost row missing until the 21 Jul
-- recon backfill; the job sat "scheduled" 2.7 days.
--
-- Also fixes a silent read bug: jobs/[id] reads a job's labour by
-- scheduled_job_id, so under own-only SELECT a crew member saw only THEIR OWN
-- hours on a shared job. Widening SELECT to job members shows the full crew.
--
-- Shape: replace the one FOR ALL policy with FOUR per-command policies (the
-- pattern 041 already uses for staff_daily_timesheets):
--   SELECT  own OR job member OR admin   (widened — read the whole job's hours)
--   INSERT  own OR job member OR admin   (widened — completer records the crew)
--   UPDATE  own OR admin                 (UNCHANGED — never edit a teammate's hours)
--   DELETE  own OR admin                 (UNCHANGED — never delete a teammate's hours;
--                                          still lets crew delete their own misc rows)
-- "Job member" = scheduled_job_id IN current_staff_job_ids() (the 041 helper).
-- Misc entries (scheduled_job_id NULL) stay own-or-admin via the own branch.
--
-- Return-mode note (see docs/HANDOFF_for_VS_Code_Claude.md): the live app
-- inserts job_labour with Prefer: return=minimal (supabase-js .insert with no
-- .select), so a widened WITH CHECK alone would satisfy the app. SELECT is
-- widened too so INSERT...RETURNING (Prefer: return=representation) also works
-- and the jobs/[id] read is fixed — the widened SELECT is load-bearing, not
-- cosmetic.

BEGIN;

-- Pre-checks: 041 must be in place.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'current_staff_job_ids' AND n.nspname = 'public'
  ) THEN
    RAISE EXCEPTION '062 pre-check: current_staff_job_ids() missing - apply 041 first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'job_labour_entries'
  ) THEN
    RAISE EXCEPTION '062 pre-check: no policy on job_labour_entries - apply 041 first';
  END IF;
END $$;

-- Drop the single FOR ALL policy (and any earlier 062 attempts, for re-run safety).
DROP POLICY IF EXISTS job_labour_entries_all_own_or_admin ON job_labour_entries;
DROP POLICY IF EXISTS job_labour_entries_insert_job_member ON job_labour_entries;
DROP POLICY IF EXISTS job_labour_entries_select_own_member_or_admin ON job_labour_entries;
DROP POLICY IF EXISTS job_labour_entries_insert_own_member_or_admin ON job_labour_entries;
DROP POLICY IF EXISTS job_labour_entries_update_own_or_admin ON job_labour_entries;
DROP POLICY IF EXISTS job_labour_entries_delete_own_or_admin ON job_labour_entries;

CREATE POLICY job_labour_entries_select_own_member_or_admin ON job_labour_entries
  FOR SELECT TO authenticated USING (
    staff_member_id IN (SELECT id FROM staff_members WHERE auth_user_id = auth.uid())
    OR scheduled_job_id IN (SELECT current_staff_job_ids())
    OR is_admin()
  );

CREATE POLICY job_labour_entries_insert_own_member_or_admin ON job_labour_entries
  FOR INSERT TO authenticated WITH CHECK (
    staff_member_id IN (SELECT id FROM staff_members WHERE auth_user_id = auth.uid())
    OR scheduled_job_id IN (SELECT current_staff_job_ids())
    OR is_admin()
  );

CREATE POLICY job_labour_entries_update_own_or_admin ON job_labour_entries
  FOR UPDATE TO authenticated
  USING (
    staff_member_id IN (SELECT id FROM staff_members WHERE auth_user_id = auth.uid())
    OR is_admin()
  )
  WITH CHECK (
    staff_member_id IN (SELECT id FROM staff_members WHERE auth_user_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY job_labour_entries_delete_own_or_admin ON job_labour_entries
  FOR DELETE TO authenticated USING (
    staff_member_id IN (SELECT id FROM staff_members WHERE auth_user_id = auth.uid())
    OR is_admin()
  );

-- Post-checks: exactly 4 policies; SELECT+INSERT reference job membership;
-- UPDATE+DELETE do NOT (stay own-or-admin).
DO $$
DECLARE n int; sel text; ins text; upd text; del text;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
  WHERE schemaname='public' AND tablename='job_labour_entries';
  IF n <> 4 THEN
    RAISE EXCEPTION '062 post-check: expected 4 policies on job_labour_entries, found %', n;
  END IF;

  SELECT qual INTO sel FROM pg_policies WHERE tablename='job_labour_entries' AND cmd='SELECT';
  IF sel IS NULL OR position('current_staff_job_ids' in sel) = 0 THEN
    RAISE EXCEPTION '062 post-check: SELECT policy not widened to job members';
  END IF;

  SELECT with_check INTO ins FROM pg_policies WHERE tablename='job_labour_entries' AND cmd='INSERT';
  IF ins IS NULL OR position('current_staff_job_ids' in ins) = 0 THEN
    RAISE EXCEPTION '062 post-check: INSERT policy not widened to job members';
  END IF;

  SELECT coalesce(qual,'') || coalesce(with_check,'') INTO upd FROM pg_policies WHERE tablename='job_labour_entries' AND cmd='UPDATE';
  IF position('current_staff_job_ids' in upd) > 0 THEN
    RAISE EXCEPTION '062 post-check: UPDATE policy must stay own-or-admin (found job-member clause)';
  END IF;

  SELECT coalesce(qual,'') INTO del FROM pg_policies WHERE tablename='job_labour_entries' AND cmd='DELETE';
  IF position('current_staff_job_ids' in del) > 0 THEN
    RAISE EXCEPTION '062 post-check: DELETE policy must stay own-or-admin (found job-member clause)';
  END IF;
END $$;

COMMIT;
