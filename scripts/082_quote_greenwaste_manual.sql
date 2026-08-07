-- 082: manual greenwaste range on maintenance quotes. Extends the greenwaste
-- choice from "auto range vs fixed" to three modes, and stores the choice so a
-- quote reloads correctly when Revised:
--   greenwaste_mode: 'auto' (default/NULL) | 'fixed' | 'manual'
--   greenwaste_min / greenwaste_max: the typed range, used only in 'manual' mode
-- Existing quotes have NULL mode = 'auto' = unchanged behaviour.
--
-- Additive only, no RLS change. Transactional, fail-loud post-check, idempotent.

begin;

alter table public.quote_drafts
  add column if not exists greenwaste_mode text,
  add column if not exists greenwaste_min numeric,
  add column if not exists greenwaste_max numeric;

comment on column public.quote_drafts.greenwaste_mode is
  'Greenwaste presentation: NULL/''auto'' = derived range, ''fixed'' = single '
  'amount, ''manual'' = typed greenwaste_min/greenwaste_max range.';

do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
  where table_schema = 'public' and table_name = 'quote_drafts'
    and column_name in ('greenwaste_mode', 'greenwaste_min', 'greenwaste_max');
  if n <> 3 then
    raise exception '082 post-check failed: expected 3 new columns, found %', n;
  end if;
end $$;

commit;
