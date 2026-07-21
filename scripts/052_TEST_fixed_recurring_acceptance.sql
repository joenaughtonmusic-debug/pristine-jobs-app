-- ACCEPTANCE TEST for Option A (051 + 052) — fixed_recurring / branch 5.
-- Self-cleaning: everything runs inside BEGIN; ... ROLLBACK; so NO test rows
-- persist. Run on STAGING after 051 + 052 are applied there. Fail-loud: any
-- assertion that fails RAISEs and aborts (the transaction rolls back anyway).
--
-- If a SETUP insert errors on a NOT NULL column that differs from prod's live
-- schema, add that column to the insert here — all rows are discarded at ROLLBACK
-- regardless, so this is safe to iterate on during the staging rehearsal.
--
-- Covers, from the Option A spec:
--   T1  one fixed line per visit: qty 1, amount = fixed_visit_amount, acct 10010, OUTPUT2
--   T2  GST: amount emitted RAW (100.00, not 115.00) — no double-add
--   T3  no branch-1/2 labour/greenwaste ON TOP, despite hours_worked & greenwaste_bags set
--   T4  recurrence: a SECOND visit of the SAME job ALSO emits (no single-emission gate)
--   T5  description uses fixed_visit_label ("Lawn mowing — …"), NOT the coarser job_type
--   T6  NULL amount → view emits a NULL unit_amount (so Guard 2's null-rate refusal fires)
--   T7  NULL label → description FALLS BACK to job_type (never renders blank)

BEGIN;
DO $$
DECLARE
  test_prop  uuid;
  job_fixed  uuid;   -- fixed_recurring, amount 100.00
  job_null   uuid;   -- fixed_recurring, amount NULL (mis-configured)
  v1 uuid; v2 uuid;  -- two visits of job_fixed
  vnull uuid;        -- one visit of job_null
  r record;
  n integer;
BEGIN
  -- ---- SETUP (add NOT NULL columns here if an insert errors on staging) -------
  INSERT INTO properties (property_code, client_name, address_line_1, hourly_rate, greenwaste_rate, billing_type)
  VALUES ('ZZTESTROW', 'Acceptance Test Row', '999 Test Row Street', 80, 26.50, 'charge_up')
  RETURNING id INTO test_prop;

  -- job_fixed: label set to "Lawn mowing", job_type deliberately the coarse
  -- category 'maintenance' — so T5 proves the description uses the LABEL, not job_type.
  INSERT INTO scheduled_jobs (property_id, invoice_method, fixed_visit_amount, fixed_visit_label, job_type, scheduled_date, status)
  VALUES (test_prop, 'fixed_recurring', 100.00, 'Lawn mowing', 'maintenance', CURRENT_DATE, 'scheduled')
  RETURNING id INTO job_fixed;

  -- job_null: label NULL — so T7 proves the description FALLS BACK to job_type.
  INSERT INTO scheduled_jobs (property_id, invoice_method, fixed_visit_amount, fixed_visit_label, job_type, scheduled_date, status)
  VALUES (test_prop, 'fixed_recurring', NULL, NULL, 'Maintenance', CURRENT_DATE, 'scheduled')
  RETURNING id INTO job_null;

  INSERT INTO visits (property_id, scheduled_job_id, visit_date, hours_worked, greenwaste_bags, invoice_status)
  VALUES (test_prop, job_fixed, DATE '2026-08-01', 3, 2, 'ready') RETURNING id INTO v1;
  INSERT INTO visits (property_id, scheduled_job_id, visit_date, hours_worked, greenwaste_bags, invoice_status)
  VALUES (test_prop, job_fixed, DATE '2026-09-01', 4, 0, 'ready') RETURNING id INTO v2;
  INSERT INTO visits (property_id, scheduled_job_id, visit_date, hours_worked, invoice_status)
  VALUES (test_prop, job_null, DATE '2026-08-01', 3, 'ready') RETURNING id INTO vnull;

  -- ---- ASSERTIONS ------------------------------------------------------------
  -- T1: v1 emits exactly ONE line, correct shape.
  SELECT count(*) INTO n FROM invoice_line_items_for_make WHERE visit_id = v1;
  IF n <> 1 THEN RAISE EXCEPTION 'T1 FAIL: v1 emitted % line(s), expected 1', n; END IF;
  SELECT * INTO r FROM invoice_line_items_for_make WHERE visit_id = v1;
  IF r.quantity <> 1 OR r.unit_amount <> 100.00 OR r.account_code <> '10010' OR r.tax_type <> 'OUTPUT2' THEN
    RAISE EXCEPTION 'T1 FAIL: v1 line qty=%, amt=%, acct=%, tax=%', r.quantity, r.unit_amount, r.account_code, r.tax_type;
  END IF;

  -- T2: GST — amount is RAW/inclusive, not multiplied by 1.15.
  IF r.unit_amount <> 100.00 THEN
    RAISE EXCEPTION 'T2 FAIL (GST): expected raw 100.00, got % (double-add?)', r.unit_amount;
  END IF;

  -- T3: NO branch-1 labour (qty would be hours_worked=3) and NO branch-2
  -- greenwaste, despite the visit carrying hours and bags.
  SELECT count(*) INTO n FROM invoice_line_items_for_make
   WHERE visit_id = v1 AND ((item_code = 'Labour' AND quantity <> 1) OR item_code = 'Greenwaste');
  IF n <> 0 THEN RAISE EXCEPTION 'T3 FAIL: v1 emitted % branch-1/2 line(s) on top, expected 0', n; END IF;

  -- T4: recurrence — the second visit ALSO emits (unlike quoted's single gate).
  SELECT count(*) INTO n FROM invoice_line_items_for_make WHERE visit_id = v2;
  IF n <> 1 THEN RAISE EXCEPTION 'T4 FAIL: v2 emitted % line(s), expected 1 — recurring must not be gated', n; END IF;

  -- T5: description uses the LABEL "Lawn mowing", not job_type ('maintenance').
  IF r.description <> 'Lawn mowing — 999 Test Row Street — 2026-08-01' THEN
    RAISE EXCEPTION 'T5 FAIL: description = "%" (label not used?)', r.description;
  END IF;

  -- T6: NULL amount → NULL unit_amount emitted (Guard 2 will refuse at mark-ready).
  SELECT count(*) INTO n FROM invoice_line_items_for_make WHERE visit_id = vnull AND unit_amount IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'T6 FAIL: null-amount visit emitted % null-amount line(s), expected 1', n; END IF;

  -- T7: NULL label → description falls back to job_type ('Maintenance'), not blank.
  SELECT * INTO r FROM invoice_line_items_for_make WHERE visit_id = vnull;
  IF r.description <> 'Maintenance — 999 Test Row Street — 2026-08-01' THEN
    RAISE EXCEPTION 'T7 FAIL: fallback description = "%"', r.description;
  END IF;

  RAISE NOTICE 'ALL PASS — branch 5 fixed_recurring behaves (T1-T7).';
END $$;
ROLLBACK;

-- BEHAVIOURAL checks NOT covered by SQL (verify in the app on staging):
--   B1 (Guard 2): mark-ready the NULL-amount fixed_recurring visit in the
--       invoices UI → refused with "no labour/greenwaste rate set" (the view's
--       NULL unit_amount trips zeroLineRefusalForVisit). Set the amount → queues.
--   B2 (Mismatch guard #21, once Phase B lands): a property whose billing lines
--       include a fixed_recurring line accepts invoice_method='fixed_recurring'
--       without the "intentional exception" override.
--   B3 (cutover parity): configure a real recurring job as fixed_recurring with
--       its agreed amount, complete one visit, and compare the Make-built Xero
--       draft line-for-line against Joe's last manual copy — amount, GST, account,
--       description. Only stop the manual copy once B3 matches.
