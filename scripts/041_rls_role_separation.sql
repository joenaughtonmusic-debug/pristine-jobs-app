-- Brief 01: RLS role separation. Staff-vs-admin is now enforced by the
-- database instead of every signed-in user being effectively an admin.
--
-- Relies on the LIVE is_admin() function (profiles.role = 'admin'), which
-- exists in no migration file — do not recreate it (see docs/Brief_01).
--
-- Because scripts/ has drifted from the live schema and blanket-policy names
-- can't be trusted, this migration DROPS EVERY POLICY on the tables in scope
-- and creates the complete correct set, rather than dropping known names.
-- The end state matches Brief 01, including:
--   * Part 2a bridge fix: assigned_staff_id is an FK to staff_members.id,
--     NOT auth.users.id — staff-own checks go through
--     staff_members.auth_user_id. visits.completed_by_staff_id references
--     profiles.id, so = auth.uid() is correct there.
--   * "My jobs" = crew membership (scheduled_job_staff — how /jobs scopes)
--     OR lead assignment (assigned_staff_id — estimate-calendar jobs have no
--     crew rows). Defined once in current_staff_job_ids() so five tables
--     can't drift apart — single-definition drift is how the 2a bug happened.
--   * Staff complete their own jobs from the app (complete-visit-dialog
--     updates scheduled_jobs), so staff get UPDATE on their own jobs.
--   * communications keeps own-row CRUD but gains is_admin() escapes —
--     /admin/communications reads and updates everyone's rows.
--   * scheduling_queue is a TABLE (not a view — the brief's list was wrong);
--     it gets policies with the admin-surface defaults.
--
-- NOT touched (deliberate):
--   * profiles — already correctly scoped and live.
--   * public_suburb_locations — intentionally public.
--   * calendar_blockouts — anon-readable ON PURPOSE(?) for the public map;
--     flagged to Joe separately, awaiting his call (Brief 01 Part 2d).
--
-- Service-role callers (Make scenarios, /api/public/*, /public/quote/[token])
-- bypass RLS by design and are unaffected.
--
-- Wrapped in a transaction: a partial run would leave tables with RLS on and
-- no policies (deny-all for the app) — this applies all-or-nothing.

BEGIN;

-- ─── 0. "My jobs" helper ──────────────────────────────────────────────────────
-- SECURITY DEFINER so policy evaluation doesn't recurse through
-- scheduled_jobs' own RLS. Returns only the caller's job ids; anon → empty.

CREATE OR REPLACE FUNCTION public.current_staff_job_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT sjs.scheduled_job_id
  FROM scheduled_job_staff sjs
  JOIN staff_members sm ON sm.id = sjs.staff_member_id
  WHERE sm.auth_user_id = auth.uid()
  UNION
  SELECT sj.id
  FROM scheduled_jobs sj
  JOIN staff_members sm ON sm.id = sj.assigned_staff_id
  WHERE sm.auth_user_id = auth.uid()
$$;

-- ─── 1. Drop every existing policy on the tables in scope ────────────────────

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'properties', 'scheduled_jobs', 'visits', 'communications',
        'staff_cost_rates', 'staff_daily_timesheets', 'staff_members',
        'admin_actions', 'admin_enquiries', 'client_contact_messages',
        'estimate_calendar_blocks', 'estimates', 'extra_charge_items',
        'internal_job_notes', 'job_labour_entries', 'landscaping_jobs',
        'property_frequency_review', 'property_service_templates',
        'quote_drafts', 'quote_templates', 'scheduled_job_staff',
        'scheduling_queue', 'visit_extra_charges', 'visit_labour_entries',
        'sales_leads', 'job_photos', 'job_board_items', 'job_board_responses'
      ])
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- ─── 2. Make sure RLS is on everywhere in scope ───────────────────────────────

ALTER TABLE properties               ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_jobs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE communications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_cost_rates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_daily_timesheets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_members            ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_actions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_enquiries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_contact_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_calendar_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimates                ENABLE ROW LEVEL SECURITY;
ALTER TABLE extra_charge_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_job_notes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_labour_entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE landscaping_jobs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_frequency_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_service_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_drafts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_templates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_job_staff      ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduling_queue         ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_extra_charges      ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_labour_entries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_leads              ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_photos               ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_board_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_board_responses      ENABLE ROW LEVEL SECURITY;

-- ─── 3. Core tables ───────────────────────────────────────────────────────────

-- properties: all staff need to see properties (deliberate); writes are admin.
CREATE POLICY properties_select_authenticated ON properties
  FOR SELECT TO authenticated USING (true);
CREATE POLICY properties_insert_admin ON properties
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY properties_update_admin ON properties
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY properties_delete_admin ON properties
  FOR DELETE TO authenticated USING (is_admin());

-- scheduled_jobs: staff see and update their own jobs; create/delete is admin.
CREATE POLICY scheduled_jobs_select_staff_or_admin ON scheduled_jobs
  FOR SELECT TO authenticated USING (
    id IN (SELECT current_staff_job_ids()) OR is_admin()
  );
CREATE POLICY scheduled_jobs_update_staff_or_admin ON scheduled_jobs
  FOR UPDATE TO authenticated
  USING (id IN (SELECT current_staff_job_ids()) OR is_admin())
  WITH CHECK (id IN (SELECT current_staff_job_ids()) OR is_admin());
CREATE POLICY scheduled_jobs_insert_admin ON scheduled_jobs
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY scheduled_jobs_delete_admin ON scheduled_jobs
  FOR DELETE TO authenticated USING (is_admin());

-- visits: staff manage visits on their own jobs; completed_by is a profiles
-- FK so = auth.uid() is correct (Brief 01 2a); delete is admin.
CREATE POLICY visits_select_staff_or_admin ON visits
  FOR SELECT TO authenticated USING (
    scheduled_job_id IN (SELECT current_staff_job_ids())
    OR completed_by_staff_id = auth.uid()
    OR is_admin()
  );
CREATE POLICY visits_insert_staff_or_admin ON visits
  FOR INSERT TO authenticated WITH CHECK (
    scheduled_job_id IN (SELECT current_staff_job_ids()) OR is_admin()
  );
CREATE POLICY visits_update_staff_or_admin ON visits
  FOR UPDATE TO authenticated
  USING (
    scheduled_job_id IN (SELECT current_staff_job_ids())
    OR completed_by_staff_id = auth.uid()
    OR is_admin()
  )
  WITH CHECK (
    scheduled_job_id IN (SELECT current_staff_job_ids())
    OR completed_by_staff_id = auth.uid()
    OR is_admin()
  );
CREATE POLICY visits_delete_admin ON visits
  FOR DELETE TO authenticated USING (is_admin());

-- communications: own-row CRUD plus is_admin() escapes — the admin
-- communications hub reads and triages everyone's rows.
CREATE POLICY communications_select_own_or_admin ON communications
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_admin());
CREATE POLICY communications_insert_own_or_admin ON communications
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR is_admin());
CREATE POLICY communications_update_own_or_admin ON communications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR is_admin())
  WITH CHECK (user_id = auth.uid() OR is_admin());
CREATE POLICY communications_delete_own_or_admin ON communications
  FOR DELETE TO authenticated USING (user_id = auth.uid() OR is_admin());

-- ─── 4. The point of the brief: wage data ─────────────────────────────────────

CREATE POLICY staff_cost_rates_admin_only ON staff_cost_rates
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- staff_daily_timesheets: staff read/write their own days; admin everything;
-- delete admin only.
CREATE POLICY staff_daily_timesheets_select_own_or_admin ON staff_daily_timesheets
  FOR SELECT TO authenticated USING (
    staff_member_id IN (SELECT id FROM staff_members WHERE auth_user_id = auth.uid())
    OR is_admin()
  );
CREATE POLICY staff_daily_timesheets_insert_own_or_admin ON staff_daily_timesheets
  FOR INSERT TO authenticated WITH CHECK (
    staff_member_id IN (SELECT id FROM staff_members WHERE auth_user_id = auth.uid())
    OR is_admin()
  );
CREATE POLICY staff_daily_timesheets_update_own_or_admin ON staff_daily_timesheets
  FOR UPDATE TO authenticated
  USING (
    staff_member_id IN (SELECT id FROM staff_members WHERE auth_user_id = auth.uid())
    OR is_admin()
  )
  WITH CHECK (
    staff_member_id IN (SELECT id FROM staff_members WHERE auth_user_id = auth.uid())
    OR is_admin()
  );
CREATE POLICY staff_daily_timesheets_delete_admin ON staff_daily_timesheets
  FOR DELETE TO authenticated USING (is_admin());

-- staff_members: everyone can look staff up (jobs page resolves the signed-in
-- crew member; cards show names); writes are admin.
CREATE POLICY staff_members_select_authenticated ON staff_members
  FOR SELECT TO authenticated USING (true);
CREATE POLICY staff_members_insert_admin ON staff_members
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY staff_members_update_admin ON staff_members
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY staff_members_delete_admin ON staff_members
  FOR DELETE TO authenticated USING (is_admin());

-- ─── 5. Staff-written job tables (verified against the app's staff flows) ────

-- job_labour_entries: /labour always writes the signed-in member's own rows.
CREATE POLICY job_labour_entries_all_own_or_admin ON job_labour_entries
  FOR ALL TO authenticated
  USING (
    staff_member_id IN (SELECT id FROM staff_members WHERE auth_user_id = auth.uid())
    OR is_admin()
  )
  WITH CHECK (
    staff_member_id IN (SELECT id FROM staff_members WHERE auth_user_id = auth.uid())
    OR is_admin()
  );

-- visit_labour_entries / visit_extra_charges: the completing staffer records
-- rows for the WHOLE crew, so these scope by job (member or lead), not own-row.
CREATE POLICY visit_labour_entries_all_member_or_admin ON visit_labour_entries
  FOR ALL TO authenticated
  USING (scheduled_job_id IN (SELECT current_staff_job_ids()) OR is_admin())
  WITH CHECK (scheduled_job_id IN (SELECT current_staff_job_ids()) OR is_admin());
CREATE POLICY visit_extra_charges_all_member_or_admin ON visit_extra_charges
  FOR ALL TO authenticated
  USING (scheduled_job_id IN (SELECT current_staff_job_ids()) OR is_admin())
  WITH CHECK (scheduled_job_id IN (SELECT current_staff_job_ids()) OR is_admin());

-- job_photos: everyone sees photos; crew on the job (or admin) manage them.
CREATE POLICY job_photos_select_authenticated ON job_photos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY job_photos_insert_member_or_admin ON job_photos
  FOR INSERT TO authenticated WITH CHECK (
    scheduled_job_id IN (SELECT current_staff_job_ids()) OR is_admin()
  );
CREATE POLICY job_photos_update_member_or_admin ON job_photos
  FOR UPDATE TO authenticated
  USING (scheduled_job_id IN (SELECT current_staff_job_ids()) OR is_admin())
  WITH CHECK (scheduled_job_id IN (SELECT current_staff_job_ids()) OR is_admin());
CREATE POLICY job_photos_delete_member_or_admin ON job_photos
  FOR DELETE TO authenticated USING (
    scheduled_job_id IN (SELECT current_staff_job_ids()) OR is_admin()
  );

-- internal_job_notes: staff raise notes from job detail; admin triages.
CREATE POLICY internal_job_notes_select_authenticated ON internal_job_notes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY internal_job_notes_insert_authenticated ON internal_job_notes
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY internal_job_notes_update_admin ON internal_job_notes
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY internal_job_notes_delete_admin ON internal_job_notes
  FOR DELETE TO authenticated USING (is_admin());

-- scheduled_job_staff: the job↔crew mapping — readable by all (job cards show
-- crew; staff surfaces only ever SELECT it), written by admin scheduling.
CREATE POLICY scheduled_job_staff_select_authenticated ON scheduled_job_staff
  FOR SELECT TO authenticated USING (true);
CREATE POLICY scheduled_job_staff_insert_admin ON scheduled_job_staff
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY scheduled_job_staff_update_admin ON scheduled_job_staff
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY scheduled_job_staff_delete_admin ON scheduled_job_staff
  FOR DELETE TO authenticated USING (is_admin());

-- job board: items are admin-authored; responses are claimed by the staffer
-- themselves (team job board upserts with their own staff_id).
CREATE POLICY job_board_items_select_authenticated ON job_board_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY job_board_items_insert_admin ON job_board_items
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY job_board_items_update_admin ON job_board_items
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY job_board_items_delete_admin ON job_board_items
  FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY job_board_responses_select_authenticated ON job_board_responses
  FOR SELECT TO authenticated USING (true);
CREATE POLICY job_board_responses_insert_own_or_admin ON job_board_responses
  FOR INSERT TO authenticated WITH CHECK (
    staff_id IN (SELECT id FROM staff_members WHERE auth_user_id = auth.uid())
    OR is_admin()
  );
CREATE POLICY job_board_responses_update_own_or_admin ON job_board_responses
  FOR UPDATE TO authenticated
  USING (
    staff_id IN (SELECT id FROM staff_members WHERE auth_user_id = auth.uid())
    OR is_admin()
  )
  WITH CHECK (
    staff_id IN (SELECT id FROM staff_members WHERE auth_user_id = auth.uid())
    OR is_admin()
  );
CREATE POLICY job_board_responses_delete_admin ON job_board_responses
  FOR DELETE TO authenticated USING (is_admin());

-- ─── 6. Admin-surface tables: everyone may read, only admins write ───────────
-- (Brief 01 default: "authenticated SELECT, admin write". landscaping_jobs is
-- read by staff on /labour, extra_charge_items by the complete-visit dialog.
-- scheduling_queue is a table, only touched by admin surfaces — same default.)

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'admin_actions', 'admin_enquiries', 'client_contact_messages',
    'estimate_calendar_blocks', 'estimates', 'extra_charge_items',
    'landscaping_jobs', 'property_frequency_review',
    'property_service_templates', 'quote_drafts', 'quote_templates',
    'sales_leads', 'scheduling_queue'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      t || '_select_authenticated', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (is_admin())',
      t || '_insert_admin', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin())',
      t || '_update_admin', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (is_admin())',
      t || '_delete_admin', t);
  END LOOP;
END $$;

-- ─── 7. Views must not hand back what we just locked down ─────────────────────
-- Definer-owned views bypass RLS; security_invoker makes them run as the
-- querying user (service-role consumers like Make bypass RLS regardless).
-- Relkind-checked at run time: only real views are altered; anything that is
-- a table, materialised view, or missing raises a WARNING in the editor
-- output instead of failing — read the output and handle stragglers.
-- (scheduling_queue is deliberately absent — it is a table; see section 6.)

DO $$
DECLARE
  name text;
  kind char;
BEGIN
  FOREACH name IN ARRAY ARRAY[
    'v_invoice_queue', 'profitability_summary', 'property_profitability',
    'landscaping_job_totals', 'staff_utilisation_current_week',
    'missing_staff_hours_current_week', 'property_latest_visit_summary',
    'property_latest_next_visit_note', 'invoice_line_items_for_make',
    'quote_line_items_for_make'
  ]
  LOOP
    SELECT c.relkind INTO kind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = name;

    IF kind = 'v' THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', name);
    ELSIF kind IS NULL THEN
      RAISE WARNING '%: does not exist — skipped', name;
    ELSE
      RAISE WARNING '%: relkind is % (not a plain view) — NOT altered, needs manual handling', name, kind;
    END IF;
  END LOOP;
END $$;

COMMIT;
