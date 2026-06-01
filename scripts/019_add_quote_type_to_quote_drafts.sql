-- Classify quote drafts by work type so accepted quotes can follow the right operational path.

ALTER TABLE quote_drafts
  ADD COLUMN IF NOT EXISTS quote_type TEXT NOT NULL DEFAULT 'one_off';

UPDATE quote_drafts
SET quote_type = 'maintenance'
WHERE frequency IS NOT NULL
  AND quote_type = 'one_off';

ALTER TABLE quote_drafts
  DROP CONSTRAINT IF EXISTS quote_drafts_quote_type_check;

ALTER TABLE quote_drafts
  ADD CONSTRAINT quote_drafts_quote_type_check
    CHECK (quote_type IN ('maintenance', 'one_off', 'landscaping'));

CREATE INDEX IF NOT EXISTS idx_quote_drafts_quote_type
  ON quote_drafts(quote_type);
