-- Phase 0 support: expose a quote's line items as one row per item, so the
-- Make.com "Quoted Job -> Xero Invoice (Submitted)" scenario can read them the
-- same way it reads per-visit charges from invoice_line_items_for_make.
--
-- quote_drafts.line_items is a JSONB array of objects shaped like:
--   { "description": text, "quantity": number, "unit_price": number, "line_total": number }
-- This view unnests that array and attaches the quote's scheduled job so Make
-- can join line items back to the job being invoiced.
--
-- Mirrors the flat, one-row-per-line-item shape of invoice_line_items_for_make.

DROP VIEW IF EXISTS quote_line_items_for_make;

CREATE VIEW quote_line_items_for_make AS
SELECT
  qd.first_scheduled_job_id AS scheduled_job_id,
  li.description,
  li.quantity,
  li.unit_price
FROM quote_drafts qd
-- Guard the input: jsonb_to_recordset errors on a non-array, and the LATERAL
-- function runs per row before any WHERE filter could exclude it. Coercing a
-- null/non-array to '[]' yields zero rows for that quote instead of erroring.
CROSS JOIN LATERAL jsonb_to_recordset(
  CASE
    WHEN jsonb_typeof(qd.line_items) = 'array' THEN qd.line_items
    ELSE '[]'::jsonb
  END
) AS li(
  description TEXT,
  quantity NUMERIC,
  unit_price NUMERIC
);

-- Match the access of invoice_line_items_for_make so Make can read it identically.
GRANT SELECT ON quote_line_items_for_make TO anon, authenticated, service_role;
