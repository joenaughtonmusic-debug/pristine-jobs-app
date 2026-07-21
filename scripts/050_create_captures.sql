-- 050: voice capture inbox.
--
-- A dead-simple capture table for the /capture page: record a voice note in the
-- field, transcribe it, triage it into a type, save the row. Property research /
-- enrichment is a LATER slice — this schema (type, coords, status) is deliberately
-- enough to support pushing commercial_leads into the pipeline, exporting
-- annoying_tasks, and per-property follow-up WITHOUT another migration.
--
-- type: triage bucket. Defaults to 'unsorted' — the fallback whenever triage is
--   unsure or errors, so a capture is never lost.
-- triage_confidence: 'high' | 'low' so low-confidence ones can be flagged for a
--   human glance later. Nullable (typed fallback may skip triage).
-- status: 'new' until someone actions or dismisses it.
--
-- NOTE (rollout): the API also needs a Storage bucket named 'captures' for the
-- optional audio_url. Audio upload is best-effort — a capture still saves with
-- audio_url NULL if the bucket is missing or upload fails.

BEGIN;

CREATE TABLE IF NOT EXISTS public.captures (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type              text NOT NULL DEFAULT 'unsorted'
                      CHECK (type IN ('commercial_lead', 'property_followup', 'annoying_task', 'unsorted')),
  transcript        text,
  audio_url         text,
  lat               numeric,
  lng               numeric,
  triage_confidence text CHECK (triage_confidence IN ('high', 'low')),
  status            text NOT NULL DEFAULT 'new'
                      CHECK (status IN ('new', 'actioned', 'dismissed')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.captures IS
  'Voice/typed field captures from /capture, triaged into a type. Supports later enrichment/pipeline/offload slices without further migration.';

-- Today''s-captures list and status filters both read created_at + status.
CREATE INDEX IF NOT EXISTS captures_created_at_idx ON public.captures (created_at DESC);
CREATE INDEX IF NOT EXISTS captures_type_status_idx ON public.captures (type, status);

-- RLS: authenticated app users (the same signed-in staff who reach /capture) can
-- read/write. Service-role (the API route) bypasses RLS regardless.
ALTER TABLE public.captures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS captures_authenticated_all ON public.captures;
CREATE POLICY captures_authenticated_all ON public.captures
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Post-check (run after; expect the four type values and three status values):
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_name = 'captures' order by ordinal_position;
