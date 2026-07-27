-- 067: human-citable reference number on pm_reports (PG-2026-0001 style).
-- Joe's ask: a PM handling several reports can cite one back to us — ref goes
-- in the email subject and the PDF header.
--
-- Design (signed off 28 July, incl. Joe's reuse addition):
--   * ONE VISIT = ONE REF, PERMANENTLY. A re-send REUSES the visit's original
--     ref — the engine looks up any existing pm_reports.report_ref for the
--     visit before minting. Because every send inserts a history row, the SAME
--     ref legitimately appears on multiple rows → report_ref is deliberately
--     NOT unique; the invariant "a ref never spans two visits" is enforced by
--     the lookup-before-mint engine (sole writer, service role) and asserted
--     fail-loud in this migration's post-check.
--   * Single GLOBAL sequence, never resets at year-end (PG-2027-0057 after
--     PG-2026-0056 is deliberate — unambiguous to cite; yearly resets need
--     race-proofing this volume doesn't justify). Year in the ref = year of
--     first issue.
--   * next_pm_report_ref() is SECURITY DEFINER so callers need no sequence
--     grants; the engine calls it BEFORE rendering (the ref appears in the
--     PDF, generated before the row insert).
--
-- Transactional, fail-loud post-checks, idempotent (also cleans up the
-- short-lived UNIQUE constraint from this migration's earlier draft).

begin;

create sequence if not exists pm_report_ref_seq;

alter table public.pm_reports
  add column if not exists report_ref text;

-- Earlier draft of 067 (staging only) added a global UNIQUE; the reuse rule
-- makes that wrong. Replace with a plain lookup index.
alter table public.pm_reports
  drop constraint if exists pm_reports_report_ref_key;

create index if not exists idx_pm_reports_visit_ref
  on public.pm_reports (visit_id, report_ref);

create or replace function public.next_pm_report_ref()
returns text
language sql
security definer
set search_path = public
as $$
  select 'PG-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('public.pm_report_ref_seq')::text, 4, '0');
$$;

-- Backfill existing rows: one ref per VISIT (oldest row mints, siblings reuse).
with firsts as (
  select distinct on (visit_id) id, visit_id
  from public.pm_reports
  where report_ref is null
  order by visit_id, created_at
),
minted as (
  select f.visit_id, next_pm_report_ref() as ref from firsts f
)
update public.pm_reports p
set report_ref = m.ref
from minted m
where p.visit_id = m.visit_id and p.report_ref is null;

-- Post-check 1: column, index, function exist; no UNIQUE left over.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='pm_reports' and column_name='report_ref') then
    raise exception 'FAIL: report_ref column missing';
  end if;
  if exists (select 1 from pg_constraint where conname='pm_reports_report_ref_key') then
    raise exception 'FAIL: obsolete UNIQUE constraint still present';
  end if;
  if not exists (select 1 from pg_proc where proname='next_pm_report_ref') then
    raise exception 'FAIL: next_pm_report_ref() missing';
  end if;
end $$;

-- Post-check 2: every row has a well-formed ref; no ref spans two visits;
-- no visit carries two refs.
do $$
declare n int;
begin
  select count(*) into n from public.pm_reports where report_ref is null;
  if n <> 0 then raise exception 'FAIL: % rows without report_ref', n; end if;
  select count(*) into n from public.pm_reports where report_ref !~ '^PG-\d{4}-\d{4,}$';
  if n <> 0 then raise exception 'FAIL: % malformed report_refs', n; end if;
  select count(*) into n from (
    select report_ref from public.pm_reports
    group by report_ref having count(distinct visit_id) > 1
  ) x;
  if n <> 0 then raise exception 'FAIL: % refs span multiple visits', n; end if;
  select count(*) into n from (
    select visit_id from public.pm_reports
    where visit_id is not null
    group by visit_id having count(distinct report_ref) > 1
  ) x;
  if n <> 0 then raise exception 'FAIL: % visits carry multiple refs', n; end if;
end $$;

commit;
