-- Add lightweight metadata for unscheduled / misc labour entries.

ALTER TABLE job_labour_entries
  ADD COLUMN IF NOT EXISTS work_type TEXT,
  ADD COLUMN IF NOT EXISTS billable_status TEXT;

ALTER TABLE job_labour_entries
  DROP CONSTRAINT IF EXISTS job_labour_entries_work_type_check,
  DROP CONSTRAINT IF EXISTS job_labour_entries_billable_status_check;

ALTER TABLE job_labour_entries
  ADD CONSTRAINT job_labour_entries_work_type_check
    CHECK (
      work_type IS NULL OR work_type IN (
        'tip_run',
        'extra_property_work',
        'travel',
        'pickup_delivery',
        'admin',
        'yard_equipment',
        'estimator_work',
        'other'
      )
    ),
  ADD CONSTRAINT job_labour_entries_billable_status_check
    CHECK (
      billable_status IS NULL OR billable_status IN (
        'billable',
        'non_billable',
        'needs_review'
      )
    );

CREATE INDEX IF NOT EXISTS idx_job_labour_entries_work_type
  ON job_labour_entries(work_type);

CREATE INDEX IF NOT EXISTS idx_job_labour_entries_billable_status
  ON job_labour_entries(billable_status);
