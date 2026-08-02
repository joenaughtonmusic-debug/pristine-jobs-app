-- 078: guard column for the auto-created recurring maintenance calendar event.
-- Set when the app fires the "add recurring maintenance visit to Google
-- Calendar" webhook, so the button can't create the event twice.
--
-- Additive only. No RLS change (rides the existing properties admin policies).
-- Transactional, fail-loud post-check, idempotent.

begin;

alter table public.properties
  add column if not exists gcal_recurring_event_created_at timestamptz;

comment on column public.properties.gcal_recurring_event_created_at is
  'Set when the recurring maintenance Google Calendar event was fired to Make. '
  'Guards against double-creating the event.';

do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
  where table_schema = 'public' and table_name = 'properties'
    and column_name = 'gcal_recurring_event_created_at';
  if n <> 1 then
    raise exception '078 post-check failed: gcal_recurring_event_created_at not added';
  end if;
end $$;

commit;
