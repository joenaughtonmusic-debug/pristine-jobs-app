-- 079: a chooseable customer-facing proposal heading on quote_drafts.
-- The public proposal page currently derives its big heading purely from
-- quote_type (one_off -> "Garden Tidy Proposal", always). This lets the owner
-- pick the heading (e.g. "Garden Tidy Proposal" vs "One-off Job Proposal", or
-- anything custom). NULL/empty = fall back to the type default, so existing
-- quotes are unchanged.
--
-- Additive only, no RLS change (rides existing quote_drafts policies).
-- Transactional, fail-loud post-check, idempotent.

begin;

alter table public.quote_drafts
  add column if not exists proposal_heading text;

comment on column public.quote_drafts.proposal_heading is
  'Customer-facing proposal heading. NULL = use the quote_type default.';

do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
  where table_schema = 'public' and table_name = 'quote_drafts'
    and column_name = 'proposal_heading';
  if n <> 1 then
    raise exception '079 post-check failed: proposal_heading not added';
  end if;
end $$;

commit;
