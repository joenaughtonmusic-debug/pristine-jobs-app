-- 072: soft delete for sales_leads — spam/junk leads leave the board without
-- destroying the row (recoverable via DB; no restore UI by design).
--
-- Board reads filter `deleted_at is null`; nothing else changes. Hard DELETE
-- stays unused so lead_intake.approved_sales_lead_id links and activity
-- history survive a mis-click. No new grants: 041 gives sales_leads an
-- admin-only UPDATE policy, and every existing pipeline transition already
-- UPDATEs the table in prod (proving authenticated holds the UPDATE grant) —
-- setting deleted_at rides that same path.
--
-- Transactional, fail-loud post-check, idempotent.

begin;

alter table public.sales_leads
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text;

comment on column public.sales_leads.deleted_at is
  'Soft delete: set = hidden from the pipeline board. Row kept for recovery/history.';
comment on column public.sales_leads.deleted_by is
  'Email of the admin who deleted the lead.';

do $$
declare n int;
begin
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'sales_leads'
    and column_name in ('deleted_at', 'deleted_by');
  if n <> 2 then
    raise exception '072 post-check failed: expected 2 soft-delete columns, found %', n;
  end if;
end $$;

commit;
