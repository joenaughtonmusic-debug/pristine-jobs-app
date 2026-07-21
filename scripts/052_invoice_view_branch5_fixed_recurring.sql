-- 052: invoice_line_items_for_make gains branch 5 — fixed_recurring (Pattern 2).
-- Option A, part 2 of 2. Supersedes 049.
--
-- WHY: Pattern 2 jobs (recurring fixed-price mowing / maintenance) bill a fixed
-- amount per completed visit, replacing Joe's manual "copy the last Xero invoice"
-- step. A recurring job is ONE scheduled_job with MANY visits, so — unlike the
-- quoted branch (4), which is gated to fire once per job — branch 5 must emit for
-- EVERY visit, exactly like branch 1 (labour) does. Make only invoices visits at
-- invoice_status='ready', so each visit bills once as it is marked ready.
--
-- WHAT CHANGES vs 049 — TWO changes only, branches 3 & 4 byte-identical:
--   (1) Branches 1 (labour) & 2 (greenwaste) exclusion list extends from
--       ('quoted','subscription') to ('quoted','subscription','fixed_recurring').
--       A fixed_recurring visit must NOT also emit hours × rate on top of its
--       fixed price — same treatment quoted/subscription already get. (Extras,
--       branch 3, still bill on top as genuine variations.)
--   (2) New branch 5: one line per fixed_recurring visit — qty 1, unit_amount =
--       the job's fixed_visit_amount, account 10010 (Income - Labour), tax_type
--       OUTPUT2. The amount is emitted RAW and GST-INCLUSIVE — the identical
--       treatment branch 1 gives the GST-inclusive hourly_rate — so NO GST is
--       double-added and the invoice matches Joe's manual one to the cent.
--
-- DESCRIPTION: "{fixed_visit_label} — {address_line_1} — {visit_date}", falling
-- back to job_type when the label is NULL so nothing renders blank. The label
-- (051) carries Joe's real service wording (e.g. "Lawn mowing") so the automated
-- line matches his manual invoices to the word — job_type alone is only the
-- category enum ('maintenance'/'one_off'/'landscaping'). visit_date renders ISO
-- (YYYY-MM-DD), consistent with branch 1's date format.
--
-- SCOPE: read-time only, like 048/049. Nothing already in Xero is affected; Make
-- polls invoice_status='ready' visits. REQUIRES 051 (the column). CREATE OR
-- REPLACE so existing grants survive.
-- ORDER MATTERS (prod rollout): 051 first, then this, both BEFORE any related
-- code deploy. Post-checks at the bottom.

BEGIN;

-- Guard: 051 must be in place (the amount column the new branch reads).
DO $$
BEGIN
  IF (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'scheduled_jobs'
      AND column_name IN ('fixed_visit_amount', 'fixed_visit_label')
  ) <> 2 THEN
    RAISE EXCEPTION 'Migration 051 (scheduled_jobs.fixed_visit_amount + fixed_visit_label) must be applied before 052.';
  END IF;
END $$;

CREATE OR REPLACE VIEW invoice_line_items_for_make AS
-- Branch 1: labour — per-visit hours × rate; never for quoted, subscription or
-- fixed_recurring jobs.
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
    WHERE sj.id = v.scheduled_job_id
      AND sj.invoice_method IN ('quoted'::text, 'subscription'::text, 'fixed_recurring'::text)
  )
UNION ALL
-- Branch 2: greenwaste — same exclusion as labour.
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
      WHERE sj.id = v.scheduled_job_id
        AND sj.invoice_method IN ('quoted'::text, 'subscription'::text, 'fixed_recurring'::text)
    )
UNION ALL
-- Branch 3: extra charges — unchanged from 049 (extras bill everywhere; quoted
-- jobs get the "Variation" prefix).
 SELECT vec.visit_id,
    10 AS sort_order,
    vec.item_code,
        CASE
            WHEN sj.invoice_method = 'quoted'::text THEN 'Variation — in addition to the quoted price: '::text || vec.invoice_description
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
-- Branch 4: quoted jobs — unchanged from 049 (the accepted quote's own lines,
-- for at most ONE visit; single deterministic winner when several are 'ready').
 SELECT v.id AS visit_id,
    q.sort_order,
    q.item_code,
    q.description,
    q.quantity,
    q.unit_amount,
    q.account_code,
    q.tax_type
   FROM visits v
     JOIN scheduled_jobs sj ON sj.id = v.scheduled_job_id AND sj.invoice_method = 'quoted'::text
     JOIN quote_line_items_for_make q ON q.scheduled_job_id = sj.id
  WHERE NOT EXISTS (
    SELECT 1 FROM visits prior
    WHERE prior.scheduled_job_id = v.scheduled_job_id
      AND prior.id <> v.id
      AND (
        prior.xero_invoice_id IS NOT NULL
        OR prior.invoiced_at IS NOT NULL
        OR prior.invoice_status = ANY (ARRAY['processing'::text, 'draft_created'::text, 'authorised'::text, 'sent'::text, 'paid'::text])
        OR (
          prior.invoice_status = 'ready'::text
          AND (prior.visit_date, prior.created_at, prior.id)
              < (v.visit_date, v.created_at, v.id)
        )
      )
  )
UNION ALL
-- Branch 5: fixed_recurring (Pattern 2) — one fixed-amount line per visit. NO
-- single-emission gate: a recurring job's every visit invoices once (Make only
-- acts on invoice_status='ready'), the same per-visit shape as branch 1. The
-- amount is emitted RAW and GST-INCLUSIVE (tax_type OUTPUT2) — no GST arithmetic,
-- so it matches the manual invoice exactly. Account 10010 (Income - Labour).
-- If fixed_visit_amount is NULL, unit_amount is NULL and Guard 2's null-rate
-- refusal blocks the visit at mark-ready — the intended safety net.
 SELECT v.id AS visit_id,
    1 AS sort_order,
    'Labour'::text AS item_code,
    ((COALESCE(sj.fixed_visit_label, sj.job_type, 'Maintenance'::text) || ' — '::text)
       || (COALESCE(p.address_line_1, ''::text) || ' — '::text))
       || v.visit_date::text AS description,
    1::numeric AS quantity,
    sj.fixed_visit_amount::numeric AS unit_amount,
    '10010'::text AS account_code,
    'OUTPUT2'::text AS tax_type
   FROM visits v
     JOIN scheduled_jobs sj ON sj.id = v.scheduled_job_id AND sj.invoice_method = 'fixed_recurring'::text
     JOIN properties p ON p.id = v.property_id;

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

-- MANUAL POST-CHECKS (run after COMMIT on staging, then prod):
--
-- A. No fixed_recurring visit emits a labour or greenwaste line (branches 1-2):
-- SELECT count(*) FROM invoice_line_items_for_make ili
-- JOIN visits v ON v.id = ili.visit_id
-- JOIN scheduled_jobs sj ON sj.id = v.scheduled_job_id
-- WHERE sj.invoice_method = 'fixed_recurring' AND ili.item_code IN ('Labour','Greenwaste')
--   AND ili.sort_order IN (1,2) AND ili.quantity IS DISTINCT FROM 1;
--   NOTE: branch 5 also uses item_code 'Labour'/sort_order 1; distinguish it by
--   quantity = 1 and unit_amount = the job's fixed_visit_amount. See post-check B.
--
-- B. Every fixed_recurring visit emits EXACTLY ONE branch-5 line, qty 1, amount =
--    the job's fixed_visit_amount, NO multiplier (proves no GST double-add):
-- SELECT v.id AS visit_id,
--        count(*) AS lines,
--        bool_and(ili.quantity = 1
--                 AND ili.unit_amount = sj.fixed_visit_amount
--                 AND ili.account_code = '10010'
--                 AND ili.tax_type = 'OUTPUT2') AS all_correct
-- FROM visits v
-- JOIN scheduled_jobs sj ON sj.id = v.scheduled_job_id AND sj.invoice_method = 'fixed_recurring'
-- JOIN invoice_line_items_for_make ili ON ili.visit_id = v.id
-- GROUP BY v.id, sj.fixed_visit_amount;
--   expect: lines = 1 and all_correct = true for every row (assuming no extras;
--   an extra adds a branch-3 line at sort_order 10, which is intended).
--
-- C. Column list/order unchanged from 049 (Make's field mapping is positional):
-- SELECT ordinal_position, column_name FROM information_schema.columns
-- WHERE table_name = 'invoice_line_items_for_make' ORDER BY ordinal_position;
--   expect: visit_id, sort_order, item_code, description, quantity, unit_amount,
--           account_code, tax_type.
