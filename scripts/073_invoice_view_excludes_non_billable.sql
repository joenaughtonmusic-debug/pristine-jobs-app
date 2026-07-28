-- 073: invoice_line_items_for_make must emit NOTHING for non_billable jobs.
--
-- Verified 28 Jul: the visit branches excluded only quoted/subscription/
-- fixed_recurring, so a non_billable visit with hours and a property
-- hourly_rate produced a priced labour line — the zero-line guard passed it,
-- Make route 1 (billing_type != subscription) would have created a REAL Xero
-- invoice for unbillable work. Zero prod exposure at verification (0
-- non_billable jobs exist), but the estimates calendar creates them and the
-- schedule dialog offers the option. Belt: this view change (even a hand-set
-- 'ready' visit hands Make zero lines). Braces: readyInvoiceStatusForJob now
-- returns 'excluded' for non_billable (same PR).
--
-- BODY IS THE LIVE PROD VIEWDEF of 28 Jul (pg_get_viewdef, NOT scripts/049 —
-- the live view has a 5th fixed_recurring branch and wider exclusions that
-- 049 predates; the first cut of this migration was built from 049 and
-- clobbered that branch on staging before the diff-against-live check caught
-- it). Changes vs live: 'non_billable' appended to the two visit-branch
-- exclusion arrays, plus the extras branch (sort_order 10) skips extra
-- charges on non_billable jobs (review catch: a 'ready' extra was the one
-- line the view still emitted for them — enough to pass the zero-line guard;
-- IS DISTINCT FROM keeps orphan extras with no scheduled_job emitting, as
-- before). Grants preserved by CREATE OR REPLACE. Post-checks RAISE if the
-- exclusion didn't land 3x or the fixed_recurring branch went missing.
-- Idempotent.

begin;

CREATE OR REPLACE VIEW invoice_line_items_for_make AS
 SELECT v.id AS visit_id,
    1 AS sort_order,
    'Labour'::text AS item_code,
    (((('Garden Maintenance – '::text || COALESCE(p.address_line_1, ''::text)) || '
Date: '::text) || (v.visit_date)::text) ||
        CASE
            WHEN ((v.work_notes IS NOT NULL) AND (v.work_notes <> ''::text)) THEN ('

'::text || v.work_notes)
            ELSE ''::text
        END) AS description,
    (v.hours_worked)::numeric AS quantity,
    (p.hourly_rate)::numeric AS unit_amount,
    '10010'::text AS account_code,
    'OUTPUT2'::text AS tax_type
   FROM (visits v
     JOIN properties p ON ((p.id = v.property_id)))
  WHERE (NOT (EXISTS ( SELECT 1
           FROM scheduled_jobs sj
          WHERE ((sj.id = v.scheduled_job_id) AND (sj.invoice_method = ANY (ARRAY['quoted'::text, 'subscription'::text, 'fixed_recurring'::text, 'non_billable'::text]))))))
UNION ALL
 SELECT v.id AS visit_id,
    2 AS sort_order,
    'Greenwaste'::text AS item_code,
    'Greenwaste removal'::text AS description,
    (v.greenwaste_bags)::numeric AS quantity,
    (p.greenwaste_rate)::numeric AS unit_amount,
    '10114'::text AS account_code,
    'OUTPUT2'::text AS tax_type
   FROM (visits v
     JOIN properties p ON ((p.id = v.property_id)))
  WHERE ((COALESCE(v.greenwaste_bags, (0)::numeric) > (0)::numeric) AND (NOT (EXISTS ( SELECT 1
           FROM scheduled_jobs sj
          WHERE ((sj.id = v.scheduled_job_id) AND (sj.invoice_method = ANY (ARRAY['quoted'::text, 'subscription'::text, 'fixed_recurring'::text, 'non_billable'::text])))))))
UNION ALL
 SELECT vec.visit_id,
    10 AS sort_order,
    vec.item_code,
        CASE
            WHEN (sj.invoice_method = 'quoted'::text) THEN ('Variation — in addition to the quoted price: '::text || vec.invoice_description)
            ELSE vec.invoice_description
        END AS description,
    (vec.quantity)::numeric AS quantity,
    (vec.unit_price)::numeric AS unit_amount,
    COALESCE(eci.account_code, '10011'::text) AS account_code,
    'OUTPUT2'::text AS tax_type
   FROM ((visit_extra_charges vec
     LEFT JOIN extra_charge_items eci ON ((eci.id = vec.extra_charge_item_id)))
     LEFT JOIN scheduled_jobs sj ON ((sj.id = vec.scheduled_job_id)))
  WHERE ((vec.invoice_status = 'ready'::text) AND (sj.invoice_method IS DISTINCT FROM 'non_billable'::text))
UNION ALL
 SELECT v.id AS visit_id,
    q.sort_order,
    q.item_code,
    q.description,
    q.quantity,
    q.unit_amount,
    q.account_code,
    q.tax_type
   FROM ((visits v
     JOIN scheduled_jobs sj ON (((sj.id = v.scheduled_job_id) AND (sj.invoice_method = 'quoted'::text))))
     JOIN quote_line_items_for_make q ON ((q.scheduled_job_id = sj.id)))
  WHERE (NOT (EXISTS ( SELECT 1
           FROM visits prior
          WHERE ((prior.scheduled_job_id = v.scheduled_job_id) AND (prior.id <> v.id) AND ((prior.xero_invoice_id IS NOT NULL) OR (prior.invoiced_at IS NOT NULL) OR (prior.invoice_status = ANY (ARRAY['processing'::text, 'draft_created'::text, 'authorised'::text, 'sent'::text, 'paid'::text])) OR ((prior.invoice_status = 'ready'::text) AND (ROW(prior.visit_date, prior.created_at, prior.id) < ROW(v.visit_date, v.created_at, v.id))))))))
UNION ALL
 SELECT v.id AS visit_id,
    1 AS sort_order,
    'Labour'::text AS item_code,
    (((COALESCE(sj.fixed_visit_label, sj.job_type, 'Maintenance'::text) || ' — '::text) || (COALESCE(p.address_line_1, ''::text) || ' — '::text)) || (v.visit_date)::text) AS description,
    (1)::numeric AS quantity,
    sj.fixed_visit_amount AS unit_amount,
    '10010'::text AS account_code,
    'OUTPUT2'::text AS tax_type
   FROM ((visits v
     JOIN scheduled_jobs sj ON (((sj.id = v.scheduled_job_id) AND (sj.invoice_method = 'fixed_recurring'::text))))
     JOIN properties p ON ((p.id = v.property_id)));

do $$
declare n int;
begin
  select (length(pg_get_viewdef('invoice_line_items_for_make'::regclass))
        - length(replace(pg_get_viewdef('invoice_line_items_for_make'::regclass),
                         'non_billable', '')))
       / length('non_billable') into n;
  if n <> 3 then
    raise exception '073 post-check failed: expected non_billable 3x in viewdef (2 visit branches + extras), found %', n;
  end if;

  if pg_get_viewdef('invoice_line_items_for_make'::regclass) !~ 'fixed_visit_amount' then
    raise exception '073 post-check failed: fixed_recurring branch missing from viewdef';
  end if;
end $$;

commit;
