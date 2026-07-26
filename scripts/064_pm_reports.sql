-- 064: PM issue reports — a record of each report sent to a property manager,
-- plus a PRIVATE storage bucket for the generated PDFs.
--
-- The report PDF contains a property address, tenant photos and the PM's email
-- — the most sensitive artifact in the app — so it must NOT live on a permanent
-- public URL (unlike job-photos, which is public). Private bucket: the server
-- generates + uploads the PDF with the service role and hands Make a short-lived
-- SIGNED URL to fetch & attach. No object policies for authenticated — the
-- bucket is service-role-only (server generates; nobody reads it client-side).
--
-- pm_reports records each send so the office can see what went out, avoid
-- double-sending, and (piece 3) stamp reported_to_pm_at on the underlying
-- issues. RLS admin-only: the office UI reads it as an admin; the server writes
-- it with the service role (which bypasses RLS). Mirrors property_managers.
--
-- Transactional, fail-loud post-checks, idempotent.

begin;

-- Private bucket for the generated report PDFs.
insert into storage.buckets (id, name, public)
values ('pm-reports', 'pm-reports', false)
on conflict (id) do nothing;

create table if not exists public.pm_reports (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid references public.visits(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  property_manager_id uuid references public.property_managers(id) on delete set null,
  recipient_email text,
  pdf_path text,
  issue_count integer not null default 0,
  status text not null default 'sent',   -- 'sent' | 'failed'
  error text,
  sent_at timestamptz,
  sent_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_pm_reports_visit_id on public.pm_reports(visit_id);
create index if not exists idx_pm_reports_property_id on public.pm_reports(property_id);

alter table public.pm_reports enable row level security;

drop policy if exists pm_reports_select_admin on public.pm_reports;
drop policy if exists pm_reports_insert_admin on public.pm_reports;
drop policy if exists pm_reports_update_admin on public.pm_reports;
drop policy if exists pm_reports_delete_admin on public.pm_reports;

create policy pm_reports_select_admin on public.pm_reports
  for select to authenticated using (is_admin());
create policy pm_reports_insert_admin on public.pm_reports
  for insert to authenticated with check (is_admin());
create policy pm_reports_update_admin on public.pm_reports
  for update to authenticated using (is_admin()) with check (is_admin());
create policy pm_reports_delete_admin on public.pm_reports
  for delete to authenticated using (is_admin());

-- Post-check 1: bucket private.
do $$
begin
  if not exists (select 1 from storage.buckets where id='pm-reports' and public=false) then
    raise exception 'FAIL: pm-reports bucket missing or not private';
  end if;
end $$;

-- Post-check 2: table + RLS + 4 policies.
do $$
declare n int;
begin
  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='pm_reports') then
    raise exception 'FAIL: pm_reports table missing';
  end if;
  if not (select relrowsecurity from pg_class where relname='pm_reports' and relnamespace='public'::regnamespace) then
    raise exception 'FAIL: RLS not enabled on pm_reports';
  end if;
  select count(*) into n from pg_policies where schemaname='public' and tablename='pm_reports';
  if n <> 4 then raise exception 'FAIL: expected 4 policies on pm_reports, found %', n; end if;
end $$;

commit;
