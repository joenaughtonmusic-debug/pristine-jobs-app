-- Quote template management fields.

ALTER TABLE quote_templates
  ADD COLUMN IF NOT EXISTS customer_scope TEXT,
  ADD COLUMN IF NOT EXISTS internal_notes TEXT,
  ADD COLUMN IF NOT EXISTS terms_conditions TEXT;

UPDATE quote_templates
SET
  customer_scope = COALESCE(customer_scope, default_scope),
  terms_conditions = COALESCE(terms_conditions, default_terms)
WHERE customer_scope IS NULL
   OR terms_conditions IS NULL;

ALTER TABLE quote_templates
  ALTER COLUMN default_line_items SET DEFAULT '[]'::jsonb,
  ALTER COLUMN is_active SET DEFAULT TRUE,
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW();
