-- 047: structured job type on the lead (Backlog: "Job type on the lead" / 3a).
--
-- service_needed stays free text (the website form fills it, the wording is
-- useful). job_type is the structured answer: it maps 1:1 to the three
-- proposal templates and lets the quote builder pre-select the quote type
-- with certainty instead of guessing from words.
--
-- Nullable by design: website-webhook leads arrive without it, and the app
-- falls back to the wording guess until someone sets it.

alter table public.sales_leads
  add column if not exists job_type text
  check (job_type in ('maintenance', 'one_off', 'landscaping'));

comment on column public.sales_leads.job_type is
  'Structured service type (maintenance | one_off | landscaping). Nullable — website leads arrive unset; maps 1:1 to quote/proposal types.';

-- Post-check (run after; expect one row with data_type = text):
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_name = 'sales_leads' and column_name = 'job_type';
