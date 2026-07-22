-- Migration 056: dismiss auto-generated labour-reconciliation admin actions.
-- (055 is taken by the captures work; this is the next free number.)
--
-- /admin/actions had ~271 open items, mostly auto-generated labour_reconciliation
-- exceptions — data-quality noise, not VA-delegated tasks. The generator for
-- these is removed in the same change (labour-reconciliation/page.tsx no longer
-- creates labour_exception actions). This closes the existing backlog.
--
-- Scope: ONLY source_record_type = 'labour_reconciliation' (the hours-mismatch
-- exceptions). The 'job_labour_entry' / misc_work_review "Link extra work" items
-- are kept — they're real VA tasks and still generate.
--
-- Sets status = 'dismissed' (a terminal state distinct from 'done', so these
-- read as auto-closed rather than VA-completed). No rows deleted — history kept.
-- completed_at is intentionally left untouched (these were not completed).
--
-- Pairs with the page filter change: /admin/actions now hides both 'done' and
-- 'dismissed'.
--
-- Idempotent: rows already 'dismissed'/'done' are excluded, so re-running is a
-- no-op. NOTE: admin_actions.status is free text (no CHECK constraint found in
-- scripts/). The staging run below confirms 'dismissed' is accepted before prod.

BEGIN;

UPDATE public.admin_actions
SET status = 'dismissed'
WHERE source_record_type = 'labour_reconciliation'
  AND COALESCE(status, 'open') NOT IN ('done', 'dismissed');

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Post-check (expect 0 remaining open labour_reconciliation actions):
-- select coalesce(status,'open') as status, count(*)
-- from public.admin_actions
-- where source_record_type = 'labour_reconciliation'
-- group by 1 order by 1;
--
-- Sanity (misc_work_review / job_labour_entry untouched — should be unchanged):
-- select coalesce(status,'open') as status, count(*)
-- from public.admin_actions
-- where source_record_type = 'job_labour_entry'
-- group by 1 order by 1;
