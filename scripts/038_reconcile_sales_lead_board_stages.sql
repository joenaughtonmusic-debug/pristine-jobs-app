-- Phase 1 Slice 3: reconcile sales_leads with the six-stage pipeline board.
--
-- Adds the two job-stage statuses (scheduled, completed), the booked visit
-- date/time, and the quote-accepted state (mirrors quote_drafts.quote_accepted_at).
--
-- Live values verified 2026-07-15 before writing this: sales_leads has 0 rows,
-- so replacing the status constraint cannot orphan any existing value.
-- This also covers 033 (site_visit_at), which was never applied live.

ALTER TABLE sales_leads
  ADD COLUMN IF NOT EXISTS site_visit_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sales_leads_site_visit_at
  ON sales_leads(site_visit_at);

ALTER TABLE sales_leads
  ADD COLUMN IF NOT EXISTS quote_accepted_at TIMESTAMPTZ;

ALTER TABLE sales_leads
  DROP CONSTRAINT IF EXISTS sales_leads_status_check;

ALTER TABLE sales_leads
  ADD CONSTRAINT sales_leads_status_check
    CHECK (status IN (
      'new',
      'contacted',
      'visit_booked',
      'estimate_done',
      'quote_sent',
      'follow_up_due',
      'won',
      'lost',
      'scheduled',
      'completed'
    ));
