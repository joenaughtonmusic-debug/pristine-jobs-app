-- Phase 2 (Brief 02): give sales_leads its first foreign keys.
--
-- sales_leads is the only unlinked island in the schema. Two nullable links
-- fix that:
--   property_id    -> properties.id    (set by add-existing-customer, and
--                                       later backfilled on quote conversion)
--   quote_draft_id -> quote_drafts.id  (set when a quote is created from the
--                                       board; quote_drafts already carries
--                                       property/job/invoice downstream)
-- Deliberately NO scheduled_jobs link — the job is reachable via
-- quote_drafts.first_scheduled_job_id, and a third path would drift.
--
-- No backfill: sales_leads had 2 rows on 17 July 2026, neither with a quote
-- or property yet. Both columns are nullable — a new website lead has neither.
--
-- RLS: 041's policies (authenticated SELECT, admin write) are table-level and
-- cover new columns automatically. Nothing to add.

BEGIN;

-- Guard: this migration expects to run exactly once.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales_leads'
      AND column_name IN ('property_id', 'quote_draft_id')
  ) THEN
    RAISE EXCEPTION 'sales_leads already has property_id/quote_draft_id — migration 043 appears to have run already.';
  END IF;
END $$;

ALTER TABLE sales_leads
  ADD COLUMN property_id    uuid REFERENCES properties(id),
  ADD COLUMN quote_draft_id uuid REFERENCES quote_drafts(id);

CREATE INDEX sales_leads_property_id_idx ON sales_leads (property_id);

-- UNIQUE: a quote draft belongs to exactly one lead (nulls are unconstrained,
-- so unquoted leads are fine). property_id stays non-unique — one customer
-- can produce several leads over time.
CREATE UNIQUE INDEX sales_leads_quote_draft_id_idx ON sales_leads (quote_draft_id);

-- Post-check: fail loudly inside the transaction if anything is missing,
-- so a partial paste (the migration-040 failure mode) can't half-apply.
DO $$
BEGIN
  IF (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales_leads'
      AND column_name IN ('property_id', 'quote_draft_id')
  ) <> 2 THEN
    RAISE EXCEPTION 'sales_leads link columns missing after ALTER — rolling back.';
  END IF;

  IF (
    SELECT count(*) FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'sales_leads'
      AND indexname IN ('sales_leads_property_id_idx', 'sales_leads_quote_draft_id_idx')
  ) <> 2 THEN
    RAISE EXCEPTION 'sales_leads link indexes missing — rolling back.';
  END IF;
END $$;

COMMIT;
