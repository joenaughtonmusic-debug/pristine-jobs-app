-- 057: Phase A EXPAND — create property_billing_lines + backfill one active line
-- per property mirroring its current billing_type.
-- (053 = rental tag, 054/055 = capture grants, 056 = capture's labour-recon
-- dismiss. Renumbered from 056 pre-prod to resolve that collision.)
--
-- Moves billing IDENTITY toward a per-job-type model WITHOUT touching the money
-- path: scheduled_jobs.invoice_method and invoice_line_items_for_make are
-- untouched. EXPAND ONLY — no code reads this table yet (Phase B), and the old
-- properties.billing_type / subscription_* columns stay in place.
--
-- RLS is enabled with NO policy: the table is locked to service_role (which
-- bypasses RLS) and hidden from anon/authenticated. Staging's default privileges
-- auto-grant anon/authenticated on new tables, so without RLS the billing amounts
-- would be world-readable via PostgREST. Phase B adds any policy client reads need.
--
-- Transactional: parity post-checks RAISE inside the tx, so ANY failure rolls
-- back the whole migration (table + backfill). Backfill is idempotent (skips a
-- property that already has a line) so a re-run is safe.

begin;

create table if not exists public.property_billing_lines (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  job_type text,
  billing_mode text not null,
  subscription_amount numeric,
  subscription_invoice_confirmed_at timestamptz,
  subscription_invoice_confirmed_by text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_property_billing_lines_property_active
  on public.property_billing_lines(property_id, active);

alter table public.property_billing_lines enable row level security;

comment on table public.property_billing_lines is
  'Phase A: per-job-type billing identity. One row per billing arrangement at a '
  'property. Does not affect invoicing (scheduled_jobs.invoice_method is the money '
  'path). Backfilled one line per property from billing_type.';

-- Backfill: one active line per property, mirroring current billing. Idempotent.
insert into public.property_billing_lines
  (property_id, job_type, billing_mode, subscription_amount,
   subscription_invoice_confirmed_at, subscription_invoice_confirmed_by, active)
select p.id,
       coalesce(nullif(p.service_type, ''), p.property_category),
       p.billing_type,
       p.subscription_amount,
       p.subscription_invoice_confirmed_at,
       p.subscription_invoice_confirmed_by,
       true
from public.properties p
where p.billing_type is not null
  and not exists (
    select 1 from public.property_billing_lines b where b.property_id = p.id
  );

-- Parity post-checks — RAISE (=> rollback) on any failure.
do $$
declare
  n_props    int;  -- properties with a defined billing_type
  n_lines    int;  -- active lines
  n_badcard  int;  -- properties whose active-line count <> 1
  n_mismatch int;  -- subscription lines whose confirmed_at <> property's
  n_pre      int;  -- pre-migration unconfirmed subscription PROPERTIES
  n_post     int;  -- unconfirmed subscription LINES
begin
  select count(*) into n_props from public.properties where billing_type is not null;
  select count(*) into n_lines from public.property_billing_lines where active;

  select count(*) into n_badcard from (
    select p.id from public.properties p
    where p.billing_type is not null
      and (select count(*) from public.property_billing_lines b
           where b.property_id = p.id and b.active) <> 1
  ) q;

  select count(*) into n_mismatch
  from public.property_billing_lines b
  join public.properties p on p.id = b.property_id
  where b.billing_mode = 'subscription'
    and b.subscription_invoice_confirmed_at is distinct from p.subscription_invoice_confirmed_at;

  select count(*) into n_pre
  from public.properties
  where billing_type = 'subscription'
    and (subscription_invoice_confirmed_at is null
         or subscription_invoice_confirmed_at < now() - interval '365 days');

  select count(*) into n_post
  from public.property_billing_lines
  where active and billing_mode = 'subscription'
    and (subscription_invoice_confirmed_at is null
         or subscription_invoice_confirmed_at < now() - interval '365 days');

  raise notice 'PARITY: props=%, lines=%, bad_cardinality=%, confirmed_at_mismatch=%, unconfirmed_pre=%, unconfirmed_post=%',
    n_props, n_lines, n_badcard, n_mismatch, n_pre, n_post;

  if n_lines <> n_props then
    raise exception 'FAIL: active line count % <> property count %', n_lines, n_props;
  end if;
  if n_badcard <> 0 then
    raise exception 'FAIL: % properties do not have exactly one active line', n_badcard;
  end if;
  if n_mismatch <> 0 then
    raise exception 'FAIL: % subscription lines have confirmed_at <> property', n_mismatch;
  end if;
  if n_post <> n_pre then
    raise exception 'FAIL: unconfirmed drift post=% pre=%', n_post, n_pre;
  end if;

  raise notice 'PARITY OK — all checks passed.';
end $$;

commit;
