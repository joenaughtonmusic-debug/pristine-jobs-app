-- Phase 1 Slice 4: follow-up tracking on the lead itself.
--
-- quote_drafts already has followup_3day/7day/14day_sent_at (011/015), but
-- leads aren't linked to quote drafts until Phase 2, so the pipeline board
-- tracks follow-ups at lead level: one contacted-stage follow-up (2-day) and
-- the 3/7/14-day quote ladder.
--
-- Verified live 2026-07-16: none of these columns exist on sales_leads yet.

ALTER TABLE sales_leads
  ADD COLUMN IF NOT EXISTS contact_followup_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followup_3day_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followup_7day_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followup_14day_sent_at TIMESTAMPTZ;
