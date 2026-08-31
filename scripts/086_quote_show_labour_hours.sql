-- 086: whether the customer-facing document shows labour hours.
--
-- A WeDo proposal prints the labour line as "32 hrs x $66.96" (the quantity
-- label in lib/quote-billing-entity.ts), and the Xero invoice built from the
-- same line items prints "32 x $77.00". For a trade counterparty that is the
-- honest, expected basis. For an end customer being quoted under the WeDo
-- brand it invites a negotiation about hours that the quote was never meant
-- to open.
--
-- FALSE (the default, and what every existing row gets) hides the hours in
-- both places: no quantity label on the proposal, and the labour line goes to
-- Xero as a single row at its full value. TRUE is today's behaviour.
--
-- PRESENTATION ONLY. The total is untouched in every case — hiding hours
-- collapses 32 x $77.00 into 1 x $2,464.00, which is the same money against
-- the same account code. Nothing here changes what a customer is charged.
--
-- NOT NULL with a default rather than nullable: "no opinion recorded" and
-- "don't show hours" are the same thing here, and a three-state column would
-- only invite a silent fallback later.
--
-- Additive, no RLS change. Transactional, fail-loud post-check, idempotent.

begin;

alter table public.quote_drafts
  add column if not exists show_labour_hours boolean not null default false;

comment on column public.quote_drafts.show_labour_hours is
  'Whether labour hours print on the customer''s proposal and invoice. FALSE '
  '(default) hides them and collapses the labour line to one priced row. '
  'Presentation only — never changes the quote total.';

do $$
declare
  n int;
  col record;
begin
  select column_name, data_type, is_nullable, column_default
    into col
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'quote_drafts'
    and column_name = 'show_labour_hours';

  if col is null then
    raise exception '086 post-check failed: show_labour_hours not added';
  end if;

  if col.data_type <> 'boolean' then
    raise exception '086 post-check failed: expected boolean, found %', col.data_type;
  end if;

  if col.is_nullable <> 'NO' then
    raise exception '086 post-check failed: show_labour_hours should be NOT NULL';
  end if;

  if col.column_default is distinct from 'false' then
    raise exception '086 post-check failed: expected default false, found %',
      coalesce(col.column_default, '(none)');
  end if;

  -- Reported, not asserted. On the first run every row lands on FALSE via the
  -- default; on a re-run some quotes may legitimately have hours switched on,
  -- and a hard assertion here would fail the migration for doing its job.
  select count(*) into n
  from public.quote_drafts
  where show_labour_hours;

  raise notice '086: % quote(s) set to show labour hours (0 expected on first run)', n;
end $$;

commit;
