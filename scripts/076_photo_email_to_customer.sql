-- 076: customer photo email (Brief_Photo_Email_To_Customer) — VA reviews,
-- curates, sends a link to the public photo page. Four additive columns:
--   properties.send_photos            — per-property opt-in (default OFF)
--   visits.photo_email_sent_at        — double-send guard
--   visits.photo_email_skip_reason    — why the VA skipped a card
--   job_photos.hidden_from_customer_at — photo excluded from the customer
--     view (public page + email preview) without deleting it
--
-- Additive only. No drops, no type changes, NO RLS/grant changes — all four
-- columns ride the existing admin policies on their tables.
-- Transactional, fail-loud post-check, idempotent.

begin;

alter table public.properties
  add column if not exists send_photos boolean not null default false;

comment on column public.properties.send_photos is
  'Opt-in: completed visits at this property enter the VA photo-email review pile. Photos are captured regardless.';

alter table public.visits
  add column if not exists photo_email_sent_at timestamptz,
  add column if not exists photo_email_skip_reason text;

comment on column public.visits.photo_email_sent_at is
  'Set when the photo email was queued to the customer. Guard against double-send.';
comment on column public.visits.photo_email_skip_reason is
  'VA skipped this visit''s photo email; reason required (dropdown + optional note).';

alter table public.job_photos
  add column if not exists hidden_from_customer_at timestamptz;

comment on column public.job_photos.hidden_from_customer_at is
  'Hidden from the customer-facing photo page and email preview; kept internally.';

do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
  where table_schema = 'public'
    and ((table_name = 'properties' and column_name = 'send_photos')
      or (table_name = 'visits' and column_name in ('photo_email_sent_at', 'photo_email_skip_reason'))
      or (table_name = 'job_photos' and column_name = 'hidden_from_customer_at'));
  if n <> 4 then
    raise exception '076 post-check failed: expected 4 new columns, found %', n;
  end if;

  select count(*) into n from public.properties where send_photos = true;
  if n <> 0 then
    raise exception '076 post-check failed: % properties opted in at migration time (default must be OFF)', n;
  end if;
end $$;

commit;
