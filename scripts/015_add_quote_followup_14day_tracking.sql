-- Tracking-only quote follow-up fields.

ALTER TABLE quote_drafts
  ADD COLUMN IF NOT EXISTS quote_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followup_3day_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followup_7day_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followup_14day_sent_at TIMESTAMPTZ;
