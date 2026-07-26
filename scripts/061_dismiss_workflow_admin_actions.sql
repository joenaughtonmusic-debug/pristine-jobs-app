-- 061: VA actions board clear-out (Tier 1 item 2) — dismiss the generated backlog
--
-- The six page-load generators that mirrored signals into admin_actions are
-- being removed (the signals live on their own pages: invoices warning badges
-- and tabs, communications lists, team-notes page + nav badge, quotes awaiting
-- buckets, labour-recon misc labels, dashboard subscription card → properties).
-- This migration dismisses the generated OPEN backlog so the board empties.
--
-- Pattern follows 056 exactly:
-- - Status flip, NOT delete: history kept, and 'dismissed' rows block
--   regeneration (both lib/admin-actions.ts dedupe and the partial unique
--   index treat non-'done' rows as existing).
-- - Scoped by source_record_type: MANUAL rows (source_record_type IS NULL —
--   the board's Add Action form) are untouchable by this WHERE clause.
-- - Idempotent: the NOT IN guard makes re-runs no-ops.
-- - 'labour_reconciliation' is included for completeness; 056 already
--   dismissed those, so it is a no-op here.

begin;

update admin_actions
set status = 'dismissed'
where source_record_type in (
    'visit',
    'communication',
    'internal_job_note',
    'job_labour_entry',
    'quote_draft',
    'property_billing_line',
    'labour_reconciliation'
  )
  and coalesce(status, 'open') not in ('done', 'dismissed');

-- Post-check 1: zero open generated rows remain.
do $$
declare
  remaining integer;
begin
  select count(*) into remaining
  from admin_actions
  where source_record_type is not null
    and coalesce(status, 'open') not in ('done', 'dismissed');

  if remaining <> 0 then
    raise exception 'FAIL: % generated rows still open after dismiss', remaining;
  end if;

  raise notice 'OK: no open generated rows remain';
end $$;

-- Post-check 2: manual rows (null source) were not touched — count must be
-- unchanged by this migration (it cannot touch them by construction; this
-- guards against the WHERE clause ever being edited carelessly).
do $$
declare
  manual_dismissed integer;
begin
  select count(*) into manual_dismissed
  from admin_actions
  where source_record_type is null and status = 'dismissed';

  raise notice 'INFO: manual rows with dismissed status: % (expected 0 today)', manual_dismissed;
end $$;

notify pgrst, 'reload schema';

commit;

-- Verification queries (run after apply):
-- select source_record_type, action_type, status, count(*)
--   from admin_actions group by 1,2,3 order by 1,2,3;
-- Expect: no rows with a non-null source_record_type and a status outside
-- ('done','dismissed').
