-- 066: add 'lawn_mowing' to the job_labour_entries.work_type CHECK.
-- Joe's ask (27 July): crew can log lawn mowing as a misc work type on the
-- Staff Labour page. UI change rides with this; the CHECK would otherwise
-- reject the insert (verified against the live DB, not scripts/).
-- Transactional, fail-loud post-check, idempotent.

begin;

alter table public.job_labour_entries
  drop constraint if exists job_labour_entries_work_type_check;

alter table public.job_labour_entries
  add constraint job_labour_entries_work_type_check
  check (work_type is null or work_type in (
    'lawn_mowing','tip_run','extra_property_work','travel',
    'pickup_delivery','admin','yard_equipment','estimator_work','other'
  ));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='job_labour_entries_work_type_check'
      and conrelid='public.job_labour_entries'::regclass
      and pg_get_constraintdef(oid) like '%lawn_mowing%'
  ) then
    raise exception 'FAIL: work_type CHECK missing lawn_mowing';
  end if;
end $$;

commit;
