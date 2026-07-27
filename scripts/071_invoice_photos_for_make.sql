-- 071: invoice_photos_for_make — the allowlist feed of completed-work photos
-- for Make to attach to a customer's Xero invoice.
--
-- THE SINGLE SAFETY CHOKEPOINT. Its WHERE clause is an allowlist
-- (photo_type IN ('after','completion')) — NEVER a denylist — so a walk-around
-- fault (photo_type='issue') is structurally incapable of appearing, and can
-- never reach a customer invoice. This is the one place to test issue-exclusion.
--
-- Per scheduled_job_id: the 3 most-recent after/completion photos, jpg/png only
-- (extension backstop so an existing un-normalised HEIC can't reach Xero — the
-- forward-only client resize normalises new uploads to JPEG). Exposed per
-- visit_id (Make queries by the visit it's invoicing). Filename uses the STABLE
-- photo_id (photo-<photo_id>.jpg) so a regenerated draft / Make retry overwrites
-- the right attachment instead of duplicating.
--
-- Association is job-level (scheduled_job_id): a recurring job's 3 most-recent
-- attach to each visit's invoice. Acceptable for v1; per-visit preference is a
-- deferred refinement (BUILD_QUEUE). Read only by Make (service role); NOT
-- granted to anon/authenticated. security_invoker so it can never become a
-- privilege-escalation path onto job_photos.
--
-- Idempotent, fail-loud post-check.

begin;

drop view if exists public.invoice_photos_for_make;

create view public.invoice_photos_for_make
with (security_invoker = true) as
with ranked as (
  select
    jp.id            as photo_id,
    jp.scheduled_job_id,
    jp.public_url,
    row_number() over (
      partition by jp.scheduled_job_id
      order by jp.created_at desc, jp.id
    ) as rn
  from public.job_photos jp
  where jp.photo_type in ('after','completion')          -- ALLOWLIST — never a denylist
    and jp.public_url is not null
    and (
      lower(jp.public_url) like '%.jpg'
      or lower(jp.public_url) like '%.jpeg'
      or lower(jp.public_url) like '%.png'
    )
)
select
  v.id                              as visit_id,
  r.photo_id,
  r.public_url,
  'photo-' || r.photo_id || '.jpg'  as filename,
  r.rn                              as photo_rank
from public.visits v
join ranked r on r.scheduled_job_id = v.scheduled_job_id
where r.rn <= 3;

-- Read only by Make (service role). Explicitly lock out anon + authenticated.
grant select on public.invoice_photos_for_make to service_role;
revoke all on public.invoice_photos_for_make from anon, authenticated;

-- Post-check: the view can NEVER surface an issue photo. Assert on definition
-- (allowlist present) AND on data (no row maps to a photo_type='issue' row).
do $$
declare leaked int;
begin
  -- The authoritative guarantee: NO row the view surfaces maps to a photo
  -- outside the allowlist (in particular, never a photo_type='issue' fault).
  select count(*) into leaked
  from public.invoice_photos_for_make f
  join public.job_photos jp on jp.id = f.photo_id
  where jp.photo_type not in ('after','completion');
  if leaked <> 0 then
    raise exception 'FAIL: % rows in invoice_photos_for_make are not after/completion', leaked;
  end if;

  -- Belt-and-braces: the view definition must reference the allowlist and must
  -- NOT reference 'issue' anywhere (Postgres normalises IN -> = ANY(ARRAY[...])).
  if not exists (
    select 1 from pg_views where schemaname='public' and viewname='invoice_photos_for_make'
      and definition like '%after%' and definition like '%completion%'
      and definition not like '%issue%'
  ) then
    raise exception 'FAIL: invoice_photos_for_make definition is not a clean after/completion allowlist';
  end if;

  if has_table_privilege('anon','public.invoice_photos_for_make','SELECT')
     or has_table_privilege('authenticated','public.invoice_photos_for_make','SELECT') then
    raise exception 'FAIL: invoice_photos_for_make is readable by anon/authenticated (service-role only)';
  end if;
end $$;

commit;
