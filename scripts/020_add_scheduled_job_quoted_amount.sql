-- Store accepted fixed quote value on scheduled jobs created from quote drafts.

ALTER TABLE scheduled_jobs
  ADD COLUMN IF NOT EXISTS quoted_amount NUMERIC(12,2);
