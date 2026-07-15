-- Phase 1 Slice 5: app-only invoice tracking for the Invoiced jobs section.
--
-- The Paid checkbox is the owner's own tracking — it never pushes to Xero
-- (Xero is reconciled separately). "Clear paid" archives rows off the page.
--
-- Verified live 2026-07-16: neither column exists on scheduled_jobs yet.

ALTER TABLE scheduled_jobs
  ADD COLUMN IF NOT EXISTS invoice_paid_in_app_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoice_archived_at TIMESTAMPTZ;
