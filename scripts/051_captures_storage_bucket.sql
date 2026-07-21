-- 051: Storage bucket for /capture audio.
--
-- Companion to 050. The /api/capture route uploads the raw voice note to a
-- private bucket named 'captures' and stores the returned path in
-- captures.audio_url. Upload is best-effort — a capture still saves with
-- audio_url NULL if this never ran — so this is optional but wanted.
--
-- Private bucket (public = false): audio is internal. The route uploads with the
-- authenticated user's client, so authenticated users need INSERT + SELECT on
-- objects in this bucket. Service-role bypasses these regardless.
--
-- Idempotent: safe to re-run.

BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('captures', 'captures', false)
ON CONFLICT (id) DO NOTHING;

-- Authenticated staff can upload capture audio.
DROP POLICY IF EXISTS captures_bucket_insert ON storage.objects;
CREATE POLICY captures_bucket_insert ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'captures');

-- ...and read it back (e.g. to play the note later).
DROP POLICY IF EXISTS captures_bucket_select ON storage.objects;
CREATE POLICY captures_bucket_select ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'captures');

COMMIT;

-- Post-check (expect one row: id = captures, public = f):
-- select id, name, public from storage.buckets where id = 'captures';
-- select policyname from pg_policies
-- where schemaname = 'storage' and tablename = 'objects'
--   and policyname like 'captures_bucket_%';
