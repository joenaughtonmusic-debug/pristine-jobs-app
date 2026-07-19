-- 048: exclude subscription jobs' visits from per-visit labour/greenwaste invoicing.
--
-- WHY: branches 1-2 of invoice_line_items_for_make excluded only invoice_method =
-- 'quoted'. A visit on an invoice_method = 'subscription' job marked 'ready' would
-- emit hours × rate labour lines ON TOP of the hand-made Xero repeating invoice —
-- the double-billing shape. Audit 2026-07-19/20 found 18 such visits emitting lines.
--
-- WHAT CHANGES: branches 1 (Labour) and 2 (Greenwaste) now skip visits whose
-- scheduled job has invoice_method IN ('quoted','subscription'). Branch 3 (extra
-- charges) is deliberately untouched — extras at subscription properties are billable
-- beyond the fixed price. Branch 4 (quoted) untouched. Column list/order unchanged.
--
-- SCOPE: read-time only. The view computes rows when queried; nothing already
-- created in Xero is affected, and Make only polls invoice_status='ready' visits.
--
-- ORDER MATTERS (prod rollout): apply this in the Supabase SQL editor BEFORE any
-- related code deploy. Post-check at the bottom.

CREATE OR REPLACE VIEW invoice_line_items_for_make AS
-- Branch 1: labour — per-visit hours × property rate; never for quoted or
-- subscription jobs (quoted bills from the quote's lines, subscription from the
-- Xero repeating invoice).
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
      AND sj.invoice_method IN ('quoted'::text, 'subscription'::text)
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
        AND sj.invoice_method IN ('quoted'::text, 'subscription'::text)
    )
UNION ALL
-- Branch 3: extra charges — unchanged (extras bill everywhere; quoted jobs get the
-- "Variation" prefix).
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
-- Branch 4: quoted jobs — unchanged (the accepted quote's own lines, first
-- non-invoiced visit only).
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
      )
  );

-- POST-CHECK: expect zero rows (no subscription visit emits labour/greenwaste)
-- SELECT count(*) FROM invoice_line_items_for_make ili
-- JOIN visits v ON v.id = ili.visit_id
-- JOIN scheduled_jobs sj ON sj.id = v.scheduled_job_id
-- WHERE sj.invoice_method = 'subscription' AND ili.item_code IN ('Labour','Greenwaste');
