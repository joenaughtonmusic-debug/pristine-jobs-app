-- Track the first maintenance visit created from an accepted quote.

ALTER TABLE quote_drafts
  ADD COLUMN IF NOT EXISTS first_scheduled_job_id UUID NULL
    REFERENCES scheduled_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quote_drafts_first_scheduled_job_id
  ON quote_drafts(first_scheduled_job_id);
