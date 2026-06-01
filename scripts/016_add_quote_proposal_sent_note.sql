-- Tracking-only proposal send note for app proposal links.

ALTER TABLE quote_drafts
  ADD COLUMN IF NOT EXISTS proposal_sent_note TEXT;
