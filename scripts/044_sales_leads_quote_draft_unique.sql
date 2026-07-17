-- Fix-up for 043: the live database got a pre-review copy of 043 in which
-- sales_leads_quote_draft_id_idx was a plain (non-unique) index. Verified
-- live on 17 July 2026 — duplicate quote_draft_id inserts were accepted.
-- The link must be one-lead-per-draft, and the app's write-once guard
-- (linkQuoteDraft) assumes the database enforces it.
--
-- 043's own post-check couldn't catch this: it counts index NAMES only.
-- This one checks uniqueness itself, so it fails loudly instead.
--
-- Safe to run: sales_leads has no duplicate quote_draft_id values (test rows
-- from verification were deleted). If real duplicates have appeared since,
-- the CREATE UNIQUE INDEX aborts and the transaction rolls back — nothing
-- half-applies.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'sales_leads_quote_draft_id_idx' AND i.indisunique
  ) THEN
    RAISE EXCEPTION 'sales_leads_quote_draft_id_idx is already UNIQUE — migration 044 appears to have run already.';
  END IF;
END $$;

DROP INDEX IF EXISTS sales_leads_quote_draft_id_idx;
CREATE UNIQUE INDEX sales_leads_quote_draft_id_idx ON sales_leads (quote_draft_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'sales_leads_quote_draft_id_idx' AND i.indisunique
  ) THEN
    RAISE EXCEPTION 'sales_leads_quote_draft_id_idx is not unique after CREATE — rolling back.';
  END IF;
END $$;

COMMIT;
