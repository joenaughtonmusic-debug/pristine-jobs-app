-- 063: property_managers — a shared PM contact one-to-many with properties.
--
-- The PM pivot is "one PM = many properties" (land Heights PM, several
-- properties arrive together). A shared table means the PM email is entered
-- once and fixed once — per-property fields would drift, the exact bug class we
-- just spent effort removing (hardcoded rates vs the staff_cost_rates table).
--
-- Adds:
--   - property_managers (contact record: name, email, phone, company, notes).
--   - properties.property_manager_id -> property_managers(id), ON DELETE SET NULL
--     (removing a PM detaches their properties, never deletes property rows).
--
-- RLS: admin-only for ALL commands (tighter than properties, whose SELECT is
-- authenticated-true). PM contact data is office-only and every surface that
-- touches it is admin-gated, so crew never need read access. Mirrors the
-- properties write policies (is_admin()); SELECT is is_admin() too.
-- Staging auto-grants anon/authenticated on new tables, so RLS MUST be enabled
-- or the emails would be world-readable via PostgREST.
--
-- Transactional with fail-loud post-checks. Idempotent (IF NOT EXISTS + DROP
-- POLICY IF EXISTS); safe to re-run.

begin;

create table if not exists public.property_managers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  company text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.properties
  add column if not exists property_manager_id uuid
  references public.property_managers(id) on delete set null;

create index if not exists idx_properties_property_manager_id
  on public.properties(property_manager_id);

alter table public.property_managers enable row level security;

drop policy if exists property_managers_select_admin on public.property_managers;
drop policy if exists property_managers_insert_admin on public.property_managers;
drop policy if exists property_managers_update_admin on public.property_managers;
drop policy if exists property_managers_delete_admin on public.property_managers;

create policy property_managers_select_admin
  on public.property_managers
  for select to authenticated
  using (is_admin());

create policy property_managers_insert_admin
  on public.property_managers
  for insert to authenticated
  with check (is_admin());

create policy property_managers_update_admin
  on public.property_managers
  for update to authenticated
  using (is_admin()) with check (is_admin());

create policy property_managers_delete_admin
  on public.property_managers
  for delete to authenticated
  using (is_admin());

-- Post-check 1: table + column + FK present.
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='property_managers'
  ) then
    raise exception 'FAIL: property_managers table missing after apply';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='properties'
      and column_name='property_manager_id'
  ) then
    raise exception 'FAIL: properties.property_manager_id missing after apply';
  end if;
  if not exists (
    select 1 from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name=tc.constraint_name
    where tc.table_name='properties' and tc.constraint_type='FOREIGN KEY'
      and kcu.column_name='property_manager_id'
  ) then
    raise exception 'FAIL: property_manager_id FK missing after apply';
  end if;
end $$;

-- Post-check 2: RLS enabled + exactly the 4 admin policies.
do $$
declare n int;
begin
  if not (select relrowsecurity from pg_class where relname='property_managers' and relnamespace='public'::regnamespace) then
    raise exception 'FAIL: RLS not enabled on property_managers (would be world-readable via PostgREST)';
  end if;
  select count(*) into n from pg_policies
  where schemaname='public' and tablename='property_managers';
  if n <> 4 then
    raise exception 'FAIL: expected 4 policies on property_managers, found %', n;
  end if;
end $$;

commit;
