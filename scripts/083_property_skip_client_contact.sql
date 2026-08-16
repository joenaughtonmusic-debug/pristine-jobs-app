-- 083: per-property "no client contact needed" flag. Commercial / standing-
-- arrangement sites (McDonalds, and a few residential with no pre-visit
-- contact) shouldn't show the "Contact Client" nag on the schedule. When this
-- is true the schedule treats client contact as not required, for existing and
-- future jobs alike.
--
-- Also flips it on for the known no-contact properties (matched by stable
-- property_code, so it's safe to run on staging where those rows may not
-- exist — a missing code just updates zero rows).
--
-- Additive column + data backfill. Transactional, fail-loud post-check,
-- idempotent.

begin;

alter table public.properties
  add column if not exists skip_client_contact boolean not null default false;

comment on column public.properties.skip_client_contact is
  'When true, the schedule treats client contact as not required for this '
  'property (commercial / standing arrangement) — no "Contact Client" step.';

update public.properties
  set skip_client_contact = true
  where property_code in (
    'SH15',
    'POWELL17',
    '58ALLENDALE',
    'MCDLUNN',
    'MCDPENROSE',
    'MCDROYALOAK',
    'MCDSTODDARDROAD'
  );

do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
  where table_schema = 'public' and table_name = 'properties'
    and column_name = 'skip_client_contact';
  if n <> 1 then
    raise exception '083 post-check failed: skip_client_contact not added';
  end if;
end $$;

commit;
