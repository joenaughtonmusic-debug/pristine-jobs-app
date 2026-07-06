-- Sales pipeline leads for the Lead Journey view.

CREATE TABLE IF NOT EXISTS sales_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  suburb TEXT,
  service_needed TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  assigned_to TEXT,
  next_follow_up_at TIMESTAMPTZ,
  quote_value NUMERIC(12, 2),
  lost_reason TEXT,
  notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT sales_leads_status_check
    CHECK (status IN (
      'new',
      'contacted',
      'visit_booked',
      'estimate_done',
      'quote_sent',
      'follow_up_due',
      'won',
      'lost'
    ))
);

CREATE INDEX IF NOT EXISTS idx_sales_leads_status ON sales_leads(status);
CREATE INDEX IF NOT EXISTS idx_sales_leads_created_at ON sales_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_leads_next_follow_up_at ON sales_leads(next_follow_up_at);

DROP TRIGGER IF EXISTS sales_leads_set_updated_at ON sales_leads;

CREATE TRIGGER sales_leads_set_updated_at
BEFORE UPDATE ON sales_leads
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

ALTER TABLE sales_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_leads_select_authenticated" ON sales_leads;
DROP POLICY IF EXISTS "sales_leads_insert_authenticated" ON sales_leads;
DROP POLICY IF EXISTS "sales_leads_update_authenticated" ON sales_leads;
DROP POLICY IF EXISTS "sales_leads_delete_authenticated" ON sales_leads;

CREATE POLICY "sales_leads_select_authenticated"
  ON sales_leads FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "sales_leads_insert_authenticated"
  ON sales_leads FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "sales_leads_update_authenticated"
  ON sales_leads FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "sales_leads_delete_authenticated"
  ON sales_leads FOR DELETE
  USING (auth.role() = 'authenticated');
