-- Completion tracking for internal job notes.

ALTER TABLE internal_job_notes
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_by TEXT;

DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  FOR constraint_record IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'internal_job_notes'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format(
      'ALTER TABLE internal_job_notes DROP CONSTRAINT IF EXISTS %I',
      constraint_record.conname
    );
  END LOOP;
END $$;

ALTER TABLE internal_job_notes
  ADD CONSTRAINT internal_job_notes_status_check
    CHECK (status IN ('open', 'completed'));
