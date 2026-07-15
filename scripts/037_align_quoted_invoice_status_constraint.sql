-- Phase 0 hotfix reconciliation: bring the repo migrations in line with two
-- fixes applied directly to the live Supabase DB during Phase 0 testing.
--
-- Fix 1 (this migration): the scheduled_jobs_quoted_invoice_status_check
--   constraint was widened in the live DB to also allow 'processing' — the
--   transient state Make.com sets while it is building the Xero invoice, in
--   between 'ready_to_convert' (app signals) and 'converted' (invoice built).
--   Migration 034 only permitted pending / ready_to_convert / converted, so the
--   repo and live schema had drifted. This makes the constraint definitive.
--
-- Fix 2 (already covered by 034 — nothing to do here): scheduled_jobs.xero_invoice_id
--   / xero_invoice_number / xero_invoice_status. Verified against the live DB
--   (2026-07): all three columns are present and migration 034 added them
--   correctly, so they are NOT re-added below.
--
-- The full set of quoted_invoice_status values after this migration:
--   pending          -- default; job not yet flagged for invoicing
--   ready_to_convert -- app has flagged it; Make.com will pick it up
--   processing       -- Make.com is building the Xero invoice
--   converted        -- Xero invoice built; result written back to the job

-- Drop and recreate the CHECK constraint defensively. The column was created
-- ad-hoc in the live DB, so we do not assume the constraint name or its exact
-- definition — we drop every CHECK constraint that references the column, then
-- add one canonical constraint. Mirrors the pattern used in migration 034.
DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  FOR constraint_record IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'scheduled_jobs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%quoted_invoice_status%'
  LOOP
    EXECUTE format(
      'ALTER TABLE scheduled_jobs DROP CONSTRAINT IF EXISTS %I',
      constraint_record.conname
    );
  END LOOP;
END $$;

ALTER TABLE scheduled_jobs
  ADD CONSTRAINT scheduled_jobs_quoted_invoice_status_check
    CHECK (
      quoted_invoice_status IS NULL
      OR quoted_invoice_status IN (
        'pending',
        'ready_to_convert',
        'processing',
        'converted'
      )
    );
