-- 068: grant the `authenticated` role table access on three admin tables that
-- shipped with RLS policies but NO grants — property_managers (063),
-- pm_reports (064), property_billing_lines (057-059).
--
-- Root cause (found 28 July via the PM-report prod live fire): staging
-- auto-grants anon/authenticated on new tables, so all staging UI verification
-- passed; every prod path that touched these tables used the SERVICE ROLE
-- (Make, the report API route), which bypasses grants. The browser-as-admin
-- read never ran on prod until now → "permission denied for table pm_reports"
-- and silent failures (property_managers had 0 real rows — PM entry never
-- persisted on prod).
--
-- SAFE: all three have RLS enabled with admin-only policies (verified 4 each),
-- so this grants the ability to ASK; RLS still decides what comes back. anon is
-- deliberately NOT granted — these are admin tables (mirrors `properties`:
-- authenticated=yes, anon=no). Idempotent, fail-loud post-check.

begin;

-- Converge both environments to the intended end-state: authenticated granted
-- (RLS gates rows to admins), anon revoked. On prod the revoke is a no-op
-- (anon never had access); on STAGING it closes a real hole — the auto-grant
-- left these admin tables world-readable via PostgREST (found by this
-- migration's own post-check, 28 July).
revoke all on public.property_managers      from anon;
revoke all on public.pm_reports             from anon;
revoke all on public.property_billing_lines from anon;

grant select, insert, update, delete on public.property_managers      to authenticated;
grant select, insert, update, delete on public.pm_reports             to authenticated;
grant select, insert, update, delete on public.property_billing_lines to authenticated;

-- Post-check: authenticated now has SELECT on all three; anon still does not.
do $$
declare t text;
begin
  foreach t in array array['property_managers','pm_reports','property_billing_lines']
  loop
    if not has_table_privilege('authenticated', 'public.'||t, 'SELECT') then
      raise exception 'FAIL: authenticated still lacks SELECT on %', t;
    end if;
    if has_table_privilege('anon', 'public.'||t, 'SELECT') then
      raise exception 'FAIL: anon unexpectedly has SELECT on % (should be admin-only)', t;
    end if;
    if not (select relrowsecurity from pg_class where relname=t and relnamespace='public'::regnamespace) then
      raise exception 'FAIL: RLS not enabled on % — granting without RLS would expose it', t;
    end if;
  end loop;
end $$;

commit;
