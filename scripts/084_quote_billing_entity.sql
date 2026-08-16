-- 084: which business a quote is priced and presented for.
--
-- Pristine quotes are GST-INCLUSIVE and show a single per-visit price — the
-- homeowner sees one number they pay. WeDo partnership quotes present the same
-- money GST-EXCLUSIVE with the labour hours visible and greenwaste and
-- treatments on their own lines, which is what a trade counterparty expects.
--
-- PRESENTATION ONLY. Deliberately NOT a fourth quote_type: that column decides
-- how the job is scheduled and billed (maintenance -> charge_up, everything
-- else -> quoted), and a 'wedo' value would fall through to one-off and
-- mis-bill every WeDo maintenance job. Entity and job type stay independent.
--
-- The money path is untouched. quote_drafts.line_items stays GST-inclusive
-- because invoice_line_items_for_make feeds those unit prices straight to Xero
-- and Make marks the invoice tax-inclusive; storing ex-GST prices there would
-- underbill by ~13% silently. The ex-GST figures are derived for display.
-- When Make learns to set the tax mode per invoice, that becomes a separate
-- change on top of this column.
--
-- NULL = 'pristine'. Existing quotes are unchanged and keep reading inclusive.
-- Additive, no RLS change. Transactional, fail-loud post-check, idempotent.

begin;

alter table public.quote_drafts
  add column if not exists billing_entity text;

alter table public.quote_drafts
  drop constraint if exists quote_drafts_billing_entity_check;

alter table public.quote_drafts
  add constraint quote_drafts_billing_entity_check
  check (billing_entity is null or billing_entity in ('pristine', 'wedo'));

comment on column public.quote_drafts.billing_entity is
  'Which business the quote is presented for: NULL/''pristine'' = Pristine '
  'Gardens, GST-inclusive single price. ''wedo'' = WeDo partnership, '
  'GST-exclusive with itemised lines and labour hours shown. Presentation '
  'only — line_items stay GST-inclusive for the Xero path.';

do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
  where table_schema = 'public' and table_name = 'quote_drafts'
    and column_name = 'billing_entity';
  if n <> 1 then
    raise exception '084 post-check failed: billing_entity not added';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'quote_drafts_billing_entity_check'
  ) then
    raise exception '084 post-check failed: billing_entity check constraint missing';
  end if;

  -- No existing quote may have been given a value by this migration.
  select count(*) into n from public.quote_drafts where billing_entity is not null;
  if n <> 0 then
    raise exception '084 post-check failed: expected 0 rows with billing_entity set, found %', n;
  end if;
end $$;

commit;
