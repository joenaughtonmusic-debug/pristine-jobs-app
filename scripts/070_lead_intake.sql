-- 070: lead_intake — the pending-approval tray for pasted/forwarded enquiries.
-- Nothing reaches sales_leads until an admin approves an intake row.
--
-- One extractor behind every channel (LEAD_CAPTURE_SPEC): `channel` starts at
-- 'paste' but the table is channel-agnostic so email_forward/share_sheet/voice
-- slot in later without schema change. `extraction` holds the LeadExtraction
-- JSON; `extraction_error` is set when the AI call failed or returned garbage
-- so the card renders BLANK + flagged, never a silent drop.
--
-- GRANTS ARE EXPLICIT (068/069 lesson — this is exactly the browser-read table
-- that bug class bites): RLS enabled, admin-only policies, GRANT authenticated,
-- REVOKE anon. Do NOT rely on staging's auto-grant.
--
-- Transactional, fail-loud post-checks, idempotent.

begin;

create table if not exists public.lead_intake (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  channel text not null default 'paste',
  source text,                       -- messenger | bark | other (user-selected)
  raw_source text not null,          -- the pasted enquiry, verbatim
  extraction jsonb,                  -- LeadExtraction result; null if AI failed
  extraction_error text,             -- set on AI failure/garbage -> blank flagged card
  status text not null default 'pending_approval'
    check (status in ('pending_approval','approved','dismissed')),
  approved_sales_lead_id uuid references public.sales_leads(id) on delete set null,
  dismissed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null
);

create index if not exists idx_lead_intake_status on public.lead_intake(status);

alter table public.lead_intake enable row level security;

drop policy if exists lead_intake_select_admin on public.lead_intake;
drop policy if exists lead_intake_insert_admin on public.lead_intake;
drop policy if exists lead_intake_update_admin on public.lead_intake;
drop policy if exists lead_intake_delete_admin on public.lead_intake;

create policy lead_intake_select_admin on public.lead_intake
  for select to authenticated using (is_admin());
create policy lead_intake_insert_admin on public.lead_intake
  for insert to authenticated with check (is_admin());
create policy lead_intake_update_admin on public.lead_intake
  for update to authenticated using (is_admin()) with check (is_admin());
create policy lead_intake_delete_admin on public.lead_intake
  for delete to authenticated using (is_admin());

-- Explicit grants: authenticated may operate (RLS gates rows to admins); anon
-- is locked out entirely (admin table, never public).
grant select, insert, update, delete on public.lead_intake to authenticated;
revoke all on public.lead_intake from anon;

-- Post-check: RLS on, 4 policies, authenticated granted, anon not.
do $$
declare n int;
begin
  if not (select relrowsecurity from pg_class where relname='lead_intake' and relnamespace='public'::regnamespace) then
    raise exception 'FAIL: RLS not enabled on lead_intake';
  end if;
  select count(*) into n from pg_policies where schemaname='public' and tablename='lead_intake';
  if n <> 4 then raise exception 'FAIL: expected 4 policies on lead_intake, found %', n; end if;
  if not has_table_privilege('authenticated','public.lead_intake','SELECT') then
    raise exception 'FAIL: authenticated lacks SELECT on lead_intake';
  end if;
  if has_table_privilege('anon','public.lead_intake','SELECT') then
    raise exception 'FAIL: anon has SELECT on lead_intake (should be locked out)';
  end if;
end $$;

commit;
