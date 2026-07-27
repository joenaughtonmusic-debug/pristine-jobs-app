-- 069: revoke the vestigial `anon` grants on 7 tables that RLS already
-- default-denies to anon (verified 28 July by querying as the anon role:
-- 0 rows on every one; no anon/public INSERT/UPDATE/DELETE policy exists).
-- Pure hardening — grants are made to match actual intent so a future RLS
-- slip can't silently open these. Behaviour no-op: anon could not read or
-- write them before this. Same family as migration 068.
--
-- LEFT ALONE: public_suburb_locations — its `anon` grant is real and intended
-- (the public map feed; SELECT policy USING is_active=true). Not touched here.
-- authenticated is NOT touched — that is the role the app actually uses, and
-- 069 only revokes from anon.
--
-- Applied to prod AND staging (the same 7 tables — the "equivalent staging
-- surface"; staging's broader auto-grant on other tables is out of scope).
-- Transactional, fail-loud post-checks, idempotent.

begin;

revoke all on public.calendar_blockouts  from anon;
revoke all on public.job_board_items     from anon;
revoke all on public.job_board_responses from anon;
revoke all on public.job_photos          from anon;
revoke all on public.profiles            from anon;
revoke all on public.sales_leads         from anon;
revoke all on public.scheduling_queue    from anon;

do $$
declare t text;
begin
  foreach t in array array[
    'calendar_blockouts','job_board_items','job_board_responses',
    'job_photos','profiles','sales_leads','scheduling_queue'
  ]
  loop
    -- anon fully de-granted
    if has_table_privilege('anon', 'public.'||t, 'SELECT') then
      raise exception 'FAIL: anon still has SELECT on %', t;
    end if;
    if has_table_privilege('anon', 'public.'||t, 'INSERT') then
      raise exception 'FAIL: anon still has INSERT on %', t;
    end if;
    -- authenticated untouched — the app's role must keep working
    if not has_table_privilege('authenticated', 'public.'||t, 'SELECT') then
      raise exception 'FAIL: authenticated lost SELECT on % (must not happen)', t;
    end if;
  end loop;

  -- the intended public feed stays public
  if not has_table_privilege('anon', 'public.public_suburb_locations', 'SELECT') then
    raise exception 'FAIL: public_suburb_locations anon SELECT was revoked (should be left alone)';
  end if;
end $$;

commit;
