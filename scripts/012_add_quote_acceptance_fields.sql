-- App-side quote proposal acceptance fields.

ALTER TABLE quote_drafts
  ADD COLUMN IF NOT EXISTS public_accept_token TEXT,
  ADD COLUMN IF NOT EXISTS public_accept_url TEXT,
  ADD COLUMN IF NOT EXISTS quote_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quote_declined_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_customer_name TEXT,
  ADD COLUMN IF NOT EXISTS accepted_customer_email TEXT,
  ADD COLUMN IF NOT EXISTS acceptance_notes TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_drafts_public_accept_token
  ON quote_drafts(public_accept_token)
  WHERE public_accept_token IS NOT NULL;
