-- Brief 04 Part 2 ⭐ — invoice_line_items_for_make branches on invoice_method.
--
-- Before this migration the view had three branches (labour hours × hourly
-- rate, greenwaste bags × rate, extras hardcoded to account 10010) and none
-- of them looked at invoice_method — a fixed-price landscaping job would
-- invoice as "Garden Maintenance" hours with materials revenue in the labour
-- account. This is why quotes always went out from Xero by hand.
--
-- After: ONE scenario ("Pristine App to Xero Invoice", unchanged — it has no
-- invoice_method filter, so quoted-safety lives entirely here) reads ONE view:
--   quoted jobs   → the accepted quote's own lines (via first_scheduled_job_id
--                   through quote_line_items_for_make, rebuilt in 045), gated
--                   to emit once; extras still emit per-visit as variations.
--   everything else → the three original branches, VERBATIM from the live
--                   definition (docs/viewdef.txt paste, 18 July 2026), with
--                   two deliberate changes only:
--                   (1) quoted jobs' visits are excluded from the labour and
--                       greenwaste branches, so a quoted visit can never emit
--                       hours × rate;
--                   (2) the extras branch reads extra_charge_items.account_code
--                       (added in 045, default 10011 — owner's call: extras
--                       are materials, not labour) instead of hardcoding 10010.
--
-- Quoted gating decision (stated, per the brief): the quote's lines attach to
-- a visit only while NO other visit of the job has been invoiced or is in
-- flight (xero_invoice_id / invoiced_at set, or status processing →
-- draft_created → authorised → sent → paid). More robust than "first visit by
-- date" if a visit is deleted or excluded. Later visits of a quoted job
-- therefore emit variations only — which is the variations model working as
-- intended. Residual race: two visits of one quoted job simultaneously at
-- 'ready' would both carry the quote's lines until Make flips the first to
-- 'processing'; quoted jobs are single-invoice by nature and Make processes
-- sequentially, so this is accepted and noted rather than engineered away.
--
-- REQUIRES 045. CREATE OR REPLACE (not DROP) so existing grants survive.
-- Pair with the app-side belt retirement (lib/quoted-invoicing.ts): this
-- migration must be applied BEFORE that code deploys.

BEGIN;

-- Guard: 045 must be in place (quote view reshaped + extras account column).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quote_line_items_for_make'
      AND column_name = 'unit_amount'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'extra_charge_items'
      AND column_name = 'account_code'
  ) THEN
    RAISE EXCEPTION 'Migration 045 must be applied before 046.';
  END IF;
END $$;

CREATE OR REPLACE VIEW invoice_line_items_for_make AS
-- Branch 1: labour — verbatim, minus quoted jobs' visits.
SELECT v.id AS visit_id,
    1 AS sort_order,
    'Labour'::text AS item_code,
    ((('Garden Maintenance – '::text || COALESCE(p.address_line_1, ''::text)) || '
Date: '::text) || v.visit_date::text) ||
        CASE
            WHEN v.work_notes IS NOT NULL AND v.work_notes <> ''::text THEN '

'::text || v.work_notes
            ELSE ''::text
        END AS description,
    v.hours_worked::numeric AS quantity,
    p.hourly_rate::numeric AS unit_amount,
    '10010'::text AS account_code,
    'OUTPUT2'::text AS tax_type
   FROM visits v
     JOIN properties p ON p.id = v.property_id
  WHERE NOT EXISTS (
    SELECT 1 FROM scheduled_jobs sj
    WHERE sj.id = v.scheduled_job_id AND sj.invoice_method = 'quoted'::text
  )
UNION ALL
-- Branch 2: greenwaste — verbatim, minus quoted jobs' visits.
 SELECT v.id AS visit_id,
    2 AS sort_order,
    'Greenwaste'::text AS item_code,
    'Greenwaste removal'::text AS description,
    v.greenwaste_bags::numeric AS quantity,
    p.greenwaste_rate::numeric AS unit_amount,
    '10114'::text AS account_code,
    'OUTPUT2'::text AS tax_type
   FROM visits v
     JOIN properties p ON p.id = v.property_id
  WHERE COALESCE(v.greenwaste_bags, 0::numeric) > 0::numeric
    AND NOT EXISTS (
      SELECT 1 FROM scheduled_jobs sj
      WHERE sj.id = v.scheduled_job_id AND sj.invoice_method = 'quoted'::text
    )
UNION ALL
-- Branch 3: extras — account from the catalogue (10011 default), and on a
-- quoted job the description says it is a variation on top of the quote.
 SELECT vec.visit_id,
    10 AS sort_order,
    vec.item_code,
    CASE
        WHEN sj.invoice_method = 'quoted'::text
          THEN 'Variation — in addition to the quoted price: '::text || vec.invoice_description
        ELSE vec.invoice_description
    END AS description,
    vec.quantity::numeric AS quantity,
    vec.unit_price::numeric AS unit_amount,
    COALESCE(eci.account_code, '10011'::text) AS account_code,
    'OUTPUT2'::text AS tax_type
   FROM visit_extra_charges vec
     LEFT JOIN extra_charge_items eci ON eci.id = vec.extra_charge_item_id
     LEFT JOIN scheduled_jobs sj ON sj.id = vec.scheduled_job_id
  WHERE vec.invoice_status = 'ready'::text
UNION ALL
-- Branch 4: quoted — the accepted quote's lines, attached to the invoicing
-- visit, only while nothing else on the job has been invoiced.
 SELECT v.id AS visit_id,
    q.sort_order,
    q.item_code,
    q.description,
    q.quantity,
    q.unit_amount,
    q.account_code,
    q.tax_type
   FROM visits v
     JOIN scheduled_jobs sj
       ON sj.id = v.scheduled_job_id AND sj.invoice_method = 'quoted'::text
     JOIN quote_line_items_for_make q ON q.scheduled_job_id = sj.id
  WHERE NOT EXISTS (
    SELECT 1 FROM visits prior
    WHERE prior.scheduled_job_id = v.scheduled_job_id
      AND prior.id <> v.id
      AND (
        prior.xero_invoice_id IS NOT NULL
        OR prior.invoiced_at IS NOT NULL
        OR prior.invoice_status = ANY (ARRAY['processing'::text, 'draft_created'::text, 'authorised'::text, 'sent'::text, 'paid'::text])
      )
  );

-- Post-checks.
DO $$
DECLARE
  col_count integer;
BEGIN
  SELECT count(*) INTO col_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'invoice_line_items_for_make'
    AND column_name IN ('visit_id','sort_order','item_code','description','quantity','unit_amount','account_code','tax_type');

  IF col_count <> 8 THEN
    RAISE EXCEPTION 'invoice_line_items_for_make is missing expected columns — rolling back.';
  END IF;

  -- The view must be selectable (catches type mismatches across the UNION).
  PERFORM * FROM invoice_line_items_for_make LIMIT 1;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
