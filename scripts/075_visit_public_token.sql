-- 075: visits.public_token — short unguessable slug for the public visit
-- photo page (/v/{token}, printed on Xero invoice lines).
--
-- Additive only. NO RLS change anywhere: the page reads via the service role
-- server-side; anon has no grant on visits and that stays true. 9 chars from
-- a 31-char alphabet (no 0/O/1/l/i/o confusables) = ~2.6e13 combinations;
-- the generator is SECURITY DEFINER so its collision check sees ALL rows
-- (the inserting role is often a crew member whose RLS view of visits is
-- partial — an invoker-rights check would miss collisions and blow up the
-- unique constraint mid-completion).
--
-- Transactional, fail-loud post-checks, idempotent.

begin;

create or replace function public.generate_visit_public_token()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  token text;
  bytes bytea;
begin
  loop
    bytes := extensions.gen_random_bytes(9);
    token := '';
    for i in 0..8 loop
      token := token || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.visits where public_token = token);
  end loop;
  return token;
end;
$$;

alter table public.visits
  add column if not exists public_token text default public.generate_visit_public_token();

comment on column public.visits.public_token is
  'Unguessable slug for the public photo page /v/{token}. Printed on invoice lines by Make. Never expires.';

update public.visits set public_token = public.generate_visit_public_token()
where public_token is null;

alter table public.visits alter column public_token set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'visits_public_token_key' and conrelid = 'public.visits'::regclass
  ) then
    alter table public.visits add constraint visits_public_token_key unique (public_token);
  end if;
end $$;

do $$
declare n int;
begin
  select count(*) into n from public.visits where public_token is null;
  if n <> 0 then
    raise exception '075 post-check failed: % visits with null public_token', n;
  end if;

  select count(*) - count(distinct public_token) into n from public.visits;
  if n <> 0 then
    raise exception '075 post-check failed: % duplicate tokens', n;
  end if;

  select count(*) into n from public.visits
  where public_token !~ '^[abcdefghjkmnpqrstuvwxyz23456789]{9}$';
  if n <> 0 then
    raise exception '075 post-check failed: % malformed tokens', n;
  end if;
end $$;

commit;
