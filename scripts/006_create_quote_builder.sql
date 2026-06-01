-- MVP quote builder tables for admin quote drafting.

CREATE TABLE IF NOT EXISTS quote_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NULL,
  default_scope TEXT NULL,
  default_terms TEXT NULL,
  default_line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quote_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  scheduled_job_id UUID NULL REFERENCES scheduled_jobs(id) ON DELETE SET NULL,
  quote_template_id UUID NULL REFERENCES quote_templates(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NULL,
  quote_title TEXT NOT NULL,
  customer_scope TEXT NULL,
  internal_notes TEXT NULL,
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  xero_quote_id TEXT NULL,
  xero_quote_number TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quote_drafts_status_check
    CHECK (status IN ('draft','ready_for_xero','xero_created','sent','accepted','declined'))
);

CREATE INDEX IF NOT EXISTS idx_quote_templates_is_active ON quote_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_quote_drafts_property_id ON quote_drafts(property_id);
CREATE INDEX IF NOT EXISTS idx_quote_drafts_scheduled_job_id ON quote_drafts(scheduled_job_id);
CREATE INDEX IF NOT EXISTS idx_quote_drafts_status ON quote_drafts(status);
CREATE INDEX IF NOT EXISTS idx_quote_drafts_created_at ON quote_drafts(created_at);

INSERT INTO quote_templates (
  name,
  category,
  default_scope,
  default_terms,
  default_line_items,
  is_active
)
SELECT
  'Standard Garden Quote',
  'general',
  'Garden tidy and landscaping work as discussed.',
  'Quote valid for 30 days. Materials and greenwaste charged as listed.',
  '[{"description":"Labour","quantity":1,"unit_price":0}]'::jsonb,
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM quote_templates WHERE name = 'Standard Garden Quote'
);
