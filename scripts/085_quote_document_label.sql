-- 085: what the customer-facing document calls itself.
--
-- The proposal page currently says "Proposal" in its headings and "Quote Type"
-- in the summary. Some work — WeDo partnership jobs especially — should read as
-- an ESTIMATE instead: same document, same numbers, different noun.
--
-- NULL/'proposal' = today's wording, unchanged. 'estimate' swaps the noun
-- throughout ("Garden Maintenance Estimate", "Estimate Type", "Accept
-- Estimate"). Presentation only — nothing about pricing, billing or the Xero
-- path reads this column.
--
-- Independent of quote_type and billing_entity on purpose: any of the three job
-- types, for either business, can be presented either way.
--
-- Additive, NULL-defaulted, no RLS change. Transactional, fail-loud post-check,
-- idempotent.

begin;

alter table public.quote_drafts
  add column if not exists document_label text;

alter table public.quote_drafts
  drop constraint if exists quote_drafts_document_label_check;

alter table public.quote_drafts
  add constraint quote_drafts_document_label_check
  check (document_label is null or document_label in ('proposal', 'estimate'));

comment on column public.quote_drafts.document_label is
  'What the customer-facing document calls itself: NULL/''proposal'' = the '
  'existing wording, ''estimate'' swaps the noun throughout. Presentation only.';

do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
  where table_schema = 'public' and table_name = 'quote_drafts'
    and column_name = 'document_label';
  if n <> 1 then
    raise exception '085 post-check failed: document_label not added';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'quote_drafts_document_label_check'
  ) then
    raise exception '085 post-check failed: check constraint missing';
  end if;

  select count(*) into n from public.quote_drafts where document_label is not null;
  if n <> 0 then
    raise exception '085 post-check failed: expected 0 rows with document_label set, found %', n;
  end if;
end $$;

commit;
