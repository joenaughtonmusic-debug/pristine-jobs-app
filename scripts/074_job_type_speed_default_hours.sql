-- 074: three linked scheduling features (Joe, 28 Jul):
--   1. Real job types on scheduled_jobs (one_off / maintenance / lawn_mowing /
--      landscaping; legacy rows keep 'job', untyped — no guessing history).
--   2. Speed tag: properties.speed orange|yellow|green (ALL default yellow —
--      Joe edits from there); scheduled_jobs.speed_override for per-job
--      exceptions. Lawn jobs render orange by RULE in the app (lib/job-speed),
--      not stored — property speed deliberately does not reach into lawns.
--   3. Default visit hours: NO schema change — properties.default_duration_hours
--      already exists live (4/94 set by hand) and the scheduler already
--      pre-fills from it; the build only adds the missing property-dialog UI.
--
-- Columns on EXISTING tables with settled grants/RLS (properties 041/069,
-- scheduled_jobs 041) — no new grants needed; app writes ride existing
-- admin policies. CHECKs are the guard: bad values fail loudly at write.
-- Live prod+staging verified 28 Jul: scheduled_jobs.job_type is 'job' on
-- every row (194 prod / 189 staging), so the CHECK allowlist includes the
-- legacy value. Transactional, fail-loud post-checks, idempotent.

begin;

alter table public.properties
  add column if not exists speed text not null default 'yellow';

alter table public.properties
  drop constraint if exists properties_speed_check;
alter table public.properties
  add constraint properties_speed_check
  check (speed in ('orange', 'yellow', 'green'));

comment on column public.properties.speed is
  'Crew pace tag: orange=high speed, yellow=medium, green=detail. Default yellow; lawn jobs render orange by rule regardless.';

alter table public.scheduled_jobs
  add column if not exists speed_override text;

alter table public.scheduled_jobs
  drop constraint if exists scheduled_jobs_speed_override_check;
alter table public.scheduled_jobs
  add constraint scheduled_jobs_speed_override_check
  check (speed_override is null or speed_override in ('orange', 'yellow', 'green'));

-- Allowlist = the four real types + every value EXISTING CODE can write:
-- 'job' (legacy constant, all 194 prod rows) and 'estimate' (estimates
-- calendar) — verified by sweeping every scheduled_jobs insert 28 Jul.
-- 'quoted_work' is defensive only: the estimates calendar writes it to
-- scheduling_queue (a different table), kept here in case that ever moves.
alter table public.scheduled_jobs
  drop constraint if exists scheduled_jobs_job_type_check;
alter table public.scheduled_jobs
  add constraint scheduled_jobs_job_type_check
  check (job_type is null or job_type in
    ('job', 'estimate', 'quoted_work',
     'one_off', 'maintenance', 'lawn_mowing', 'landscaping'));

comment on column public.scheduled_jobs.speed_override is
  'Per-job speed exception; NULL = derive (lawn_mowing -> orange, else property speed).';

do $$
declare n int;
begin
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public'
    and ((table_name = 'properties' and column_name = 'speed')
      or (table_name = 'scheduled_jobs' and column_name = 'speed_override'));
  if n <> 2 then
    raise exception '074 post-check failed: expected 2 new columns, found %', n;
  end if;

  -- every existing property must satisfy the default
  select count(*) into n from public.properties where speed not in ('orange','yellow','green');
  if n <> 0 then
    raise exception '074 post-check failed: % properties with invalid speed', n;
  end if;

  -- legacy job_type values must all pass the new CHECK
  select count(*) into n from public.scheduled_jobs
  where job_type is not null
    and job_type not in ('job','estimate','quoted_work',
                         'one_off','maintenance','lawn_mowing','landscaping');
  if n <> 0 then
    raise exception '074 post-check failed: % scheduled_jobs with out-of-list job_type', n;
  end if;
end $$;

commit;
