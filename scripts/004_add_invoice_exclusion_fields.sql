-- Invoice exclusion support for VA invoice review.

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS invoice_note TEXT;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS invoice_handling_note TEXT;

DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  FOR constraint_record IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'visits'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%invoice_status%'
  LOOP
    EXECUTE format(
      'ALTER TABLE visits DROP CONSTRAINT IF EXISTS %I',
      constraint_record.conname
    );
  END LOOP;
END $$;

ALTER TABLE visits
  ADD CONSTRAINT visits_invoice_status_check
    CHECK (
      invoice_status IS NULL
      OR invoice_status IN (
        'ready',
        'review',
        'processing',
        'draft',
        'created',
        'sent',
        'paid',
        'error',
        'excluded'
      )
    );
