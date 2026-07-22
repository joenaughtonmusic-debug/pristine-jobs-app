-- 060: job_photos.severity — walk-around issue reports
--
-- A rental walk-around issue is a normal job photo (photo_type = 'issue')
-- plus a severity, NOT a new table. This adds the one missing column.
-- - severity is nullable and only meaningful on issue photos; the CHECK
--   enforces both the allowed values (urgent/soon/cosmetic) and the pairing
--   with photo_type = 'issue', so a mis-tagged severity fails loudly.
-- - Touches nothing else: no RLS/grant changes (column inherits job_photos'
--   existing authenticated policies from 041), no billing surface.
-- Idempotent; transactional; fail-loud post-checks.

begin;

alter table public.job_photos
  add column if not exists severity text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'job_photos_severity_check'
      and conrelid = 'public.job_photos'::regclass
  ) then
    alter table public.job_photos
      add constraint job_photos_severity_check
      check (
        severity is null
        or (photo_type = 'issue' and severity in ('urgent', 'soon', 'cosmetic'))
      );
  end if;
end $$;

-- Post-check 1: column exists.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'job_photos'
      and column_name = 'severity'
  ) then
    raise exception 'FAIL: job_photos.severity missing after apply';
  end if;
end $$;

-- Post-check 2: constraint rejects severity on a non-issue photo.
-- (The random scheduled_job_id can never satisfy the FK either, so this
-- insert can NEVER persist; we only care which constraint rejects it first.)
do $$
begin
  begin
    insert into public.job_photos (scheduled_job_id, storage_path, photo_type, severity)
    values (gen_random_uuid(), '__postcheck__', 'after', 'urgent');
    raise exception 'FAIL: insert unexpectedly succeeded';
  exception
    when check_violation then
      raise notice 'OK: severity rejected on non-issue photo';
    when foreign_key_violation then
      raise exception 'FAIL: severity CHECK did not fire on non-issue photo';
  end;
end $$;

-- Post-check 3: a valid issue+severity insert passes the CHECK (uses a real
-- scheduled_job if one exists; cleaned up immediately).
do $$
declare
  probe_job uuid;
  probe_id uuid;
begin
  select id into probe_job from public.scheduled_jobs limit 1;
  if probe_job is null then
    raise notice 'SKIP: no scheduled_jobs row to probe valid insert';
    return;
  end if;

  insert into public.job_photos (scheduled_job_id, storage_path, photo_type, severity, caption)
  values (probe_job, '__postcheck_valid__', 'issue', 'soon', '__postcheck__')
  returning id into probe_id;

  delete from public.job_photos where id = probe_id;

  raise notice 'OK: valid issue severity accepted and cleaned up';
end $$;

commit;
