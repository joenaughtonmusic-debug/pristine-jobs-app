-- 049: branch 4 must emit a quoted job's lines for at most ONE visit even when
-- several visits are 'ready' at once.
--
-- WHY: the prior-visit guard only recognised invoicing-started statuses
-- ('processing'...'paid'). Two visits of one quoted job simultaneously 'ready'
-- each emitted the full quote lines — the double-invoice window found in the
-- 2026-07-20 branch-4 E2E.
--
-- WHY NOT just add 'ready' to the array: two ready visits would then each see
-- the other as a blocking prior, BOTH would emit zero lines, and Make would
-- stick on an empty invoice. The guard needs a deterministic winner, so a
-- ready visit is only blocked by an EARLIER ready visit (visit_date,
-- created_at, id tuple order). Exactly one ready visit — the earliest — emits.
--
-- Branches 1-3 are byte-identical to 048. Column list/order unchanged.
-- ORDER MATTERS (prod rollout): apply 048 first, then this, both BEFORE any
-- related code deploy. Post-check at the bottom.

CREATE OR REPLACE VIEW invoice_line_items_for_make AS
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
-- Branch 4: quoted jobs — the accepted quote's own lines, for at most one
-- visit. Blocked by any visit already being invoiced, or by an EARLIER
-- 'ready' visit (deterministic single winner when several are queued).
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
  );

-- POST-CHECK: no quoted job may have more than one visit emitting branch-4 rows
-- SELECT sj.id, count(DISTINCT ili.visit_id) FROM invoice_line_items_for_make ili
-- JOIN visits v ON v.id = ili.visit_id
-- JOIN scheduled_jobs sj ON sj.id = v.scheduled_job_id AND sj.invoice_method='quoted'
-- GROUP BY sj.id HAVING count(DISTINCT ili.visit_id) > 1;  -- expect zero rows
