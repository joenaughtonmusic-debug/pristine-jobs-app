-- 058: Phase B READS — RLS SELECT policy on property_billing_lines.
-- (Renumbered from 057 pre-prod; capture branch owns 054-056.)
--
-- Phase A (057) enabled RLS with NO policy, locking the table to service_role.
-- The admin server components that now read per-line billing identity (the VA
-- action on /admin, the profitability badge, the schedule mismatch guard) run as
-- the AUTHENTICATED user, so they need an explicit SELECT policy — mirroring
-- properties_select_authenticated (SELECT / authenticated / using true).
--
-- anon is deliberately NOT granted: billing amounts stay off the public surface,
-- so the public quote page keeps reading properties.billing_type for its
-- subscription presentation rather than the lines. service_role (server jobs)
-- already bypasses RLS.
--
-- Idempotent. No writes to data.

drop policy if exists property_billing_lines_select_authenticated
  on public.property_billing_lines;

create policy property_billing_lines_select_authenticated
  on public.property_billing_lines
  for select
  to authenticated
  using (true);

-- POST-CHECK:
-- select policyname, roles::text, cmd from pg_policies
-- where tablename='property_billing_lines';  -- expect the select/authenticated row
