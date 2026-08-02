-- 077: add 'spray' as a real job type, and standardise
-- property_billing_lines.job_type onto the canonical set so the scheduler's
-- job-type picker can match a property's billing line.
--
-- Canonical set (lib/job-speed.ts JOB_TYPE_CHOICES):
--   maintenance, one_off, lawn_mowing, spray, landscaping
--
-- Two parts:
--  1. Widen the scheduled_jobs.job_type CHECK (from 074) to allow 'spray' —
--     without this, saving a spray job is rejected by the constraint.
--  2. Standardise the two free-text billing-line stragglers created by the
--     057 backfill / hand entry:
--       'Lawn mowing'                                  -> lawn_mowing
--       'Regular 2 monthly garden maintenance visits'  -> maintenance
--     Everything else is already canonical or NULL (left as-is).
--
-- Transactional, idempotent, fail-loud post-checks.

begin;

-- Part 1: allow 'spray' on scheduled_jobs.job_type (mirrors 074's allowlist).
alter table public.scheduled_jobs
  drop constraint if exists scheduled_jobs_job_type_check;
alter table public.scheduled_jobs
  add constraint scheduled_jobs_job_type_check
  check (job_type is null or job_type in
    ('job', 'estimate', 'quoted_work',
     'one_off', 'maintenance', 'lawn_mowing', 'spray', 'landscaping'));

-- Part 2: standardise the free-text billing-line job types.
update public.property_billing_lines
  set job_type = 'lawn_mowing', updated_at = now()
  where job_type = 'Lawn mowing';

update public.property_billing_lines
  set job_type = 'maintenance', updated_at = now()
  where job_type = 'Regular 2 monthly garden maintenance visits';

do $$
declare n int;
begin
  -- No free-text stragglers left: every non-null job_type must be canonical.
  select count(*) into n from public.property_billing_lines
  where job_type is not null
    and job_type not in ('maintenance', 'one_off', 'lawn_mowing', 'spray', 'landscaping');
  if n <> 0 then
    raise exception '077 post-check failed: % billing lines still have a non-canonical job_type', n;
  end if;

  -- The widened CHECK must list 'spray'.
  if pg_get_constraintdef(
       (select oid from pg_constraint
        where conname = 'scheduled_jobs_job_type_check'
          and conrelid = 'public.scheduled_jobs'::regclass)
     ) !~ 'spray' then
    raise exception '077 post-check failed: scheduled_jobs CHECK does not include spray';
  end if;
end $$;

commit;
