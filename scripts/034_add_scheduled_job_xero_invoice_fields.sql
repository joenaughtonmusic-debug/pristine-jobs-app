-- Phase 0: fixed-price (quoted) jobs produce ONE Xero invoice built from the
-- accepted quote, at Xero status SUBMITTED, instead of stray per-visit invoices.
--
-- This migration:
--   1. Stores the resulting Xero invoice id/number/status back on scheduled_jobs
--      so Make.com can write results back and sync status later.
--   2. Allows a new 'ready_to_convert' value for quoted_invoice_status — the
--      signal the app sets and Make.com picks up to build the invoice.
--
-- Verified against the live DB (2026-07): scheduled_jobs already has
-- invoice_method / billing_mode / quoted_amount / quoted_scope / quoted_materials
-- / quoted_invoice_status; the xero_invoice_* columns did NOT yet exist.
-- Existing quoted_invoice_status values are only 'pending' and 'converted'.

-- 1. Xero invoice result fields on the job -----------------------------------
ALTER TABLE scheduled_jobs
  ADD COLUMN IF NOT EXISTS xero_invoice_id TEXT,
  ADD COLUMN IF NOT EXISTS xero_invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS xero_invoice_status TEXT;

-- 2. Allow 'ready_to_convert' on quoted_invoice_status -----------------------
-- Drop any existing CHECK constraint on quoted_invoice_status (the column was
-- created directly in the live DB, so we don't assume the constraint name), then
-- re-add one that permits the full set of values the app uses.
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
        'converted'
      )
    );
