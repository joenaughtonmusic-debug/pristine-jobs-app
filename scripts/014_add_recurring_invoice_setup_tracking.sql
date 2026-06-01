-- Tracking-only setup state for recurring invoice creation after quote acceptance.

ALTER TABLE quote_drafts
  ADD COLUMN IF NOT EXISTS recurring_invoice_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS recurring_invoice_setup_status TEXT NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS recurring_invoice_setup_note TEXT,
  ADD COLUMN IF NOT EXISTS recurring_invoice_setup_completed_at TIMESTAMPTZ;

ALTER TABLE quote_drafts
  DROP CONSTRAINT IF EXISTS quote_drafts_recurring_invoice_setup_status_check;

ALTER TABLE quote_drafts
  ADD CONSTRAINT quote_drafts_recurring_invoice_setup_status_check
    CHECK (
      recurring_invoice_setup_status IN (
        'not_required',
        'required',
        'completed'
      )
    );

CREATE INDEX IF NOT EXISTS idx_quote_drafts_recurring_invoice_setup_status
  ON quote_drafts(recurring_invoice_setup_status);
