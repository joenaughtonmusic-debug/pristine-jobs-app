-- Make.com-driven proposal send tracking.

ALTER TABLE quote_drafts
  ADD COLUMN IF NOT EXISTS proposal_status TEXT NOT NULL DEFAULT 'not_ready',
  ADD COLUMN IF NOT EXISTS proposal_ready_to_send_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proposal_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proposal_send_error TEXT,
  ADD COLUMN IF NOT EXISTS proposal_email_subject TEXT,
  ADD COLUMN IF NOT EXISTS proposal_email_body TEXT;

ALTER TABLE quote_drafts
  DROP CONSTRAINT IF EXISTS quote_drafts_proposal_status_check;

ALTER TABLE quote_drafts
  ADD CONSTRAINT quote_drafts_proposal_status_check
    CHECK (
      proposal_status IN (
        'not_ready',
        'ready_to_send',
        'sent',
        'error'
      )
    );

CREATE INDEX IF NOT EXISTS idx_quote_drafts_proposal_status
  ON quote_drafts(proposal_status);
