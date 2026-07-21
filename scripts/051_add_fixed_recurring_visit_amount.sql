-- 051: add scheduled_jobs.fixed_visit_amount — the per-visit fixed price for
-- Pattern 2 (recurring fixed-price-on-completion) jobs. Option A, part 1 of 2.
--
-- WHY: Pattern 2 AUTOMATES A MANUAL STEP — nothing is unbilled today. Joe
-- currently copies the previous Xero invoice each visit for a few recurring jobs
-- (a lawn mow, a 2-monthly maintenance visit), same amount every time. A
-- recurring job is one
-- scheduled_job that owns many visits over time; each completed visit should emit
-- one fixed-amount invoice line. This column stores that amount. It is NOT the
-- one-off quoted total (scheduled_jobs.quoted_amount) — that column means
-- "accepted total for a single fixed-price job" and is read by job-detail /
-- invoiced-jobs; do NOT overload it.
--
-- WHAT CHANGES: two nullable columns on scheduled_jobs, both used only by
-- invoice_method = 'fixed_recurring' jobs (NULL for every other job):
--   - fixed_visit_amount (numeric) — the GST-inclusive price emitted per visit.
--     A fixed_recurring job with a NULL amount is caught at mark-ready by Guard
--     2's null-rate refusal (branch 5 emits a NULL unit_amount → the guard
--     refuses to queue it), so a mis-configured job cannot silently bill wrong.
--   - fixed_visit_label (text) — the service wording shown in the invoice line
--     description, so it matches Joe's current MANUAL invoices to the word (e.g.
--     "Lawn mowing"). Required for the line-for-line cutover match: job_type is a
--     category enum ('maintenance'/'one_off'/'landscaping'), too coarse for the
--     description. Branch 5 falls back to job_type if the label is NULL, so the
--     description never renders blank.
--
-- GST: amounts are stored GST-INCLUSIVE and RAW (e.g. 150.00). The view (052)
-- emits them raw with tax_type OUTPUT2 — identical treatment to branch 1's
-- GST-inclusive hourly_rate ($80 incl GST). No GST arithmetic anywhere, so the
-- automated invoice matches Joe's manual one to the cent.
--
-- invoice_method 'fixed_recurring': the column is free-text — no CHECK constraint
-- on invoice_method exists in scripts/. BUT quoted_invoice_status was created
-- directly in the live DB with a constraint the scripts didn't show, so DO NOT
-- assume: run POST-CHECK 2 on the live DB first. If a constraint gates
-- invoice_method, extend it to allow 'fixed_recurring' BEFORE applying 052.
--
-- ORDER MATTERS (prod rollout): apply 051 before 052 (the view reads this
-- column). Rehearse on staging, get Joe's OK, then prod. No code depends on this
-- column until the Pattern-2 scheduling UI is built.

ALTER TABLE scheduled_jobs
  ADD COLUMN IF NOT EXISTS fixed_visit_amount numeric,
  ADD COLUMN IF NOT EXISTS fixed_visit_label text;

COMMENT ON COLUMN scheduled_jobs.fixed_visit_amount IS
  'Pattern 2 (invoice_method=fixed_recurring): GST-inclusive fixed price emitted '
  'per completed visit by invoice_line_items_for_make branch 5. NULL for every '
  'other invoice method. Not to be confused with quoted_amount (one-off total).';

COMMENT ON COLUMN scheduled_jobs.fixed_visit_label IS
  'Pattern 2 (invoice_method=fixed_recurring): service wording for the invoice '
  'line description (e.g. "Lawn mowing"), matching Joe''s manual invoices. Branch '
  '5 falls back to job_type when NULL. NULL for every other invoice method.';

-- POST-CHECK 1 — both columns exist, nullable, correct types:
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
-- WHERE table_name = 'scheduled_jobs'
--   AND column_name IN ('fixed_visit_amount','fixed_visit_label');
--   expect two rows: fixed_visit_amount | numeric | YES
--                    fixed_visit_label  | text    | YES
--
-- POST-CHECK 2 — is there a CHECK constraint gating invoice_method values?
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid = 'scheduled_jobs'::regclass AND contype = 'c'
--   AND pg_get_constraintdef(oid) ILIKE '%invoice_method%';
--   expect: ZERO rows. If any row is returned, that constraint must be dropped
--   and re-added to include 'fixed_recurring' (mirror the DO-block pattern in
--   034 for quoted_invoice_status) BEFORE 052 is applied.
