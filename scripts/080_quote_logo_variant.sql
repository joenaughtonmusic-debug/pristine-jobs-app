-- 080: per-quote logo choice on quote_drafts. The public proposal page shows a
-- fixed Pristine Gardens logo; this lets a quote instead show the Pristine +
-- WeDo Garden Care partnership logo. NULL/'pristine' = the default Pristine
-- logo; 'partnership' = the combined logo. Existing quotes are unchanged.
--
-- Additive only, no RLS change. Transactional, fail-loud post-check, idempotent.

begin;

alter table public.quote_drafts
  add column if not exists logo_variant text;

comment on column public.quote_drafts.logo_variant is
  'Customer-facing logo on the proposal: NULL/''pristine'' = Pristine only, '
  '''partnership'' = Pristine + WeDo Garden Care.';

do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
  where table_schema = 'public' and table_name = 'quote_drafts'
    and column_name = 'logo_variant';
  if n <> 1 then
    raise exception '080 post-check failed: logo_variant not added';
  end if;
end $$;

commit;
