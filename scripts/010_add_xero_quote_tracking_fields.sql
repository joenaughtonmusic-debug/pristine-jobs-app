-- Xero quote tracking fields for Make.com quote creation workflow.

ALTER TABLE quote_drafts
  ADD COLUMN IF NOT EXISTS xero_quote_id TEXT,
  ADD COLUMN IF NOT EXISTS xero_quote_number TEXT,
  ADD COLUMN IF NOT EXISTS xero_quote_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS xero_quote_status TEXT,
  ADD COLUMN IF NOT EXISTS xero_quote_error TEXT;

ALTER TABLE quote_drafts
  DROP CONSTRAINT IF EXISTS quote_drafts_status_check;

ALTER TABLE quote_drafts
  ADD CONSTRAINT quote_drafts_status_check
    CHECK (
      status IN (
        'draft',
        'ready_for_xero',
        'xero_created',
        'sent',
        'accepted',
        'declined',
        'error'
      )
    );

CREATE INDEX IF NOT EXISTS idx_quote_drafts_xero_quote_status
  ON quote_drafts(xero_quote_status);
