-- 065: walk-around issue lifecycle (PM report piece 3).
--
-- Decisions locked with Joe (see docs/BUILD_QUEUE.md Tier 3):
--   * four states: open / resolved / dismissed / not_our_job
--   * the property badge and property-dialog list count/show OPEN only
--   * status is set from the property dialog only (admin surface)
--   * reported_to_pm_at is a STAMP set when a PM report sends — not a state
--
-- Columns land on job_photos because an issue IS a job_photos row
-- (photo_type='issue' + severity, migration 060). issue_status defaults 'open'
-- for every row; it only MEANS anything alongside photo_type='issue' — all
-- issue queries already pair these filters. Greenfield: zero prod issues
-- today, so the backfilled default rewrites nothing that is read.
--
-- issue_status_by is a display name (matches pm_reports.sent_by), NOT an
-- auth.users FK — status history must survive account deletions.
--
-- Transactional, fail-loud post-checks, idempotent.

begin;

alter table public.job_photos
  add column if not exists issue_status text not null default 'open',
  add column if not exists issue_status_at timestamptz,
  add column if not exists issue_status_by text,
  add column if not exists issue_status_note text,
  add column if not exists reported_to_pm_at timestamptz;

-- CHECK added separately so re-runs don't duplicate it.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'job_photos_issue_status_check'
      and conrelid = 'public.job_photos'::regclass
  ) then
    alter table public.job_photos
      add constraint job_photos_issue_status_check
      check (issue_status in ('open','resolved','dismissed','not_our_job'));
  end if;
end $$;

-- Post-check 1: all five columns exist.
do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
  where table_schema='public' and table_name='job_photos'
    and column_name in ('issue_status','issue_status_at','issue_status_by',
                        'issue_status_note','reported_to_pm_at');
  if n <> 5 then
    raise exception 'FAIL: expected 5 lifecycle columns on job_photos, found %', n;
  end if;
end $$;

-- Post-check 2: CHECK constraint present and default is 'open'.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='job_photos_issue_status_check'
      and conrelid='public.job_photos'::regclass
  ) then
    raise exception 'FAIL: job_photos_issue_status_check missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='job_photos'
      and column_name='issue_status' and column_default like '%open%'
  ) then
    raise exception 'FAIL: issue_status default is not open';
  end if;
end $$;

-- Post-check 3: no row escaped the default.
do $$
declare n int;
begin
  select count(*) into n from public.job_photos where issue_status is null;
  if n <> 0 then
    raise exception 'FAIL: % job_photos rows with NULL issue_status', n;
  end if;
end $$;

commit;
