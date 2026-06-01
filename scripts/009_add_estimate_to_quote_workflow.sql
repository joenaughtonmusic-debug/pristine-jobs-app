-- Lead / estimate to quote workflow.

CREATE TABLE IF NOT EXISTS estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id UUID NULL REFERENCES admin_enquiries(id) ON DELETE SET NULL,
  communication_id UUID NULL REFERENCES communications(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NULL,
  customer_phone TEXT NULL,
  address_line_1 TEXT NULL,
  suburb TEXT NULL,
  enquiry_details TEXT NULL,
  estimate_status TEXT NOT NULL DEFAULT 'new',
  estimate_date DATE NULL,
  estimate_start_time TIME NULL,
  estimate_notes TEXT NULL,
  quote_draft_id UUID NULL,
  converted_property_id UUID NULL REFERENCES properties(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT estimates_status_check
    CHECK (
      estimate_status IN (
        'new',
        'scheduled',
        'completed',
        'quote_created',
        'accepted',
        'declined',
        'converted'
      )
    )
);

ALTER TABLE quote_drafts
  ADD COLUMN IF NOT EXISTS estimate_id UUID NULL REFERENCES estimates(id) ON DELETE SET NULL,
  ALTER COLUMN property_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'estimates_quote_draft_id_fkey'
      AND conrelid = 'estimates'::regclass
  ) THEN
    ALTER TABLE estimates
      ADD CONSTRAINT estimates_quote_draft_id_fkey
      FOREIGN KEY (quote_draft_id) REFERENCES quote_drafts(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_estimates_enquiry_id ON estimates(enquiry_id);
CREATE INDEX IF NOT EXISTS idx_estimates_communication_id ON estimates(communication_id);
CREATE INDEX IF NOT EXISTS idx_estimates_estimate_status ON estimates(estimate_status);
CREATE INDEX IF NOT EXISTS idx_estimates_estimate_date ON estimates(estimate_date);
CREATE INDEX IF NOT EXISTS idx_estimates_quote_draft_id ON estimates(quote_draft_id);
CREATE INDEX IF NOT EXISTS idx_estimates_converted_property_id ON estimates(converted_property_id);
CREATE INDEX IF NOT EXISTS idx_quote_drafts_estimate_id ON quote_drafts(estimate_id);
