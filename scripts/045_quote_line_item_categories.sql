-- Brief 04 Parts 1 + 3a: line items carry their Xero accounts; quotes carry
-- their own photos.
--
-- 1. extra_charge_items.account_code (default '10011' — Income · Materials).
--    Owner's call, 18 July: sprays/fertiliser/stump paste are materials, not
--    labour. The invoice view (rewritten in 046) reads this instead of the
--    hardcoded '10010'.
-- 2. quote_drafts.hero_image_url + photos — the proposal page's hero becomes
--    per-quote (falling back to the current default) and gains an optional
--    captioned gallery. photos is a jsonb array of
--    { "url": text, "caption": text, "sort_order": number }.
-- 3. quote_drafts.line_items elements gain item_code / account_code /
--    tax_type / sort_order. Existing rows default to Labour / 10010 /
--    OUTPUT2 — that is what they effectively were.
-- 4. quote_line_items_for_make is rebuilt to mirror
--    invoice_line_items_for_make's column shape (sort_order, item_code,
--    description, quantity, unit_amount, account_code, tax_type) so 046 can
--    union them. Keyed by first_scheduled_job_id — the authoritative
--    quote→job link (write-once, set by the accept-and-schedule flow).

BEGIN;

-- Guard: run-once.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'extra_charge_items'
      AND column_name = 'account_code'
  ) THEN
    RAISE EXCEPTION 'extra_charge_items.account_code already exists — migration 045 appears to have run already.';
  END IF;
END $$;

ALTER TABLE extra_charge_items
  ADD COLUMN account_code text NOT NULL DEFAULT '10011';

ALTER TABLE quote_drafts
  ADD COLUMN hero_image_url text,
  ADD COLUMN photos jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill account fields onto existing line_items (Labour/10010/OUTPUT2,
-- sort_order by position). Elements that already carry a value keep it.
UPDATE quote_drafts
SET line_items = (
  SELECT jsonb_agg(
    t.item || jsonb_build_object(
      'item_code', COALESCE(t.item->>'item_code', 'Labour'),
      'account_code', COALESCE(t.item->>'account_code', '10010'),
      'tax_type', COALESCE(t.item->>'tax_type', 'OUTPUT2'),
      'sort_order', COALESCE((t.item->>'sort_order')::numeric, t.ord)
    ) ORDER BY t.ord
  )
  FROM jsonb_array_elements(line_items) WITH ORDINALITY AS t(item, ord)
)
WHERE jsonb_typeof(line_items) = 'array'
  AND jsonb_array_length(line_items) > 0;

-- Rebuild the quote view in the invoice view's shape. Grants preserved
-- exactly as 035 had them (including anon): the containment work
-- (docs/security/2026-07-15) deliberately left anon on this view pending
-- confirmation of which key Make's Supabase connection uses. Revoking anon
-- is a separate decision — this migration must not change security posture
-- in passing.
DROP VIEW IF EXISTS quote_line_items_for_make;

CREATE VIEW quote_line_items_for_make AS
SELECT
  qd.first_scheduled_job_id AS scheduled_job_id,
  COALESCE((li.item->>'sort_order')::numeric, li.ord)::integer AS sort_order,
  COALESCE(li.item->>'item_code', 'Labour') AS item_code,
  COALESCE(li.item->>'description', '') AS description,
  COALESCE((li.item->>'quantity')::numeric, 1) AS quantity,
  (li.item->>'unit_price')::numeric AS unit_amount,
  COALESCE(li.item->>'account_code', '10010') AS account_code,
  COALESCE(li.item->>'tax_type', 'OUTPUT2') AS tax_type
FROM quote_drafts qd
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(qd.line_items) = 'array' THEN qd.line_items
    ELSE '[]'::jsonb
  END
) WITH ORDINALITY AS li(item, ord);

GRANT SELECT ON quote_line_items_for_make TO anon, authenticated, service_role;

-- Post-checks: fail loudly inside the transaction rather than half-apply.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM quote_drafts qd,
         jsonb_array_elements(
           CASE WHEN jsonb_typeof(qd.line_items) = 'array'
                THEN qd.line_items ELSE '[]'::jsonb END
         ) AS item
    WHERE item->>'account_code' IS NULL
  ) THEN
    RAISE EXCEPTION 'line_items backfill incomplete — rolling back.';
  END IF;

  IF (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quote_line_items_for_make'
      AND column_name IN ('scheduled_job_id','sort_order','item_code','description','quantity','unit_amount','account_code','tax_type')
  ) <> 8 THEN
    RAISE EXCEPTION 'quote_line_items_for_make is missing expected columns — rolling back.';
  END IF;

  IF (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quote_drafts'
      AND column_name IN ('hero_image_url','photos')
  ) <> 2 THEN
    RAISE EXCEPTION 'quote_drafts photo columns missing — rolling back.';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
