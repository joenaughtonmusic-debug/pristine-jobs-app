-- Quote send and follow-up tracking fields for the app quote workflow.

ALTER TABLE quote_drafts
  ADD COLUMN IF NOT EXISTS quote_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quote_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quote_declined_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followup_3day_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followup_7day_sent_at TIMESTAMPTZ;
