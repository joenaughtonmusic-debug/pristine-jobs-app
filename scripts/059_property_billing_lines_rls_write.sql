-- 059: Phase B WRITES — INSERT/UPDATE/DELETE RLS policies on
-- property_billing_lines, mirroring the properties write policies (gated on
-- is_admin()). (Renumbered from 058 pre-prod; capture branch owns 054-056.)
--
-- The confirm control (PropertyDialog / new-property-modal) writes per-line
-- confirmation + amount CLIENT-SIDE as the authenticated user, and creation now
-- writes a billing line. 058 only added SELECT, so those writes would be blocked
-- by RLS. These policies let an admin write, matching properties_insert_admin /
-- properties_update_admin exactly (is_admin() = a profiles row role='admin').
--
-- Idempotent.

drop policy if exists property_billing_lines_insert_admin on public.property_billing_lines;
drop policy if exists property_billing_lines_update_admin on public.property_billing_lines;
drop policy if exists property_billing_lines_delete_admin on public.property_billing_lines;

create policy property_billing_lines_insert_admin
  on public.property_billing_lines
  for insert to authenticated
  with check (is_admin());

create policy property_billing_lines_update_admin
  on public.property_billing_lines
  for update to authenticated
  using (is_admin()) with check (is_admin());

create policy property_billing_lines_delete_admin
  on public.property_billing_lines
  for delete to authenticated
  using (is_admin());

-- POST-CHECK:
-- select policyname, cmd from pg_policies where tablename='property_billing_lines' order by cmd;
--   expect: DELETE, INSERT, SELECT, UPDATE
