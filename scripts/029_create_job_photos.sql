-- Store scheduled job photo metadata; image bytes live in Supabase Storage.

INSERT INTO storage.buckets (id, name, public)
VALUES ('job-photos', 'job-photos', true)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

CREATE TABLE IF NOT EXISTS job_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_job_id UUID NOT NULL REFERENCES scheduled_jobs(id) ON DELETE CASCADE,
  property_id UUID NULL REFERENCES properties(id) ON DELETE SET NULL,
  visit_id UUID NULL REFERENCES visits(id) ON DELETE SET NULL,
  uploaded_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT,
  caption TEXT,
  photo_type TEXT DEFAULT 'client_instruction',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT job_photos_photo_type_check
    CHECK (
      photo_type IN (
        'client_instruction',
        'before',
        'after',
        'issue',
        'completion',
        'other'
      )
    )
);

ALTER TABLE job_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_photos_select_authenticated" ON job_photos;
DROP POLICY IF EXISTS "job_photos_insert_authenticated" ON job_photos;
DROP POLICY IF EXISTS "job_photos_delete_authenticated" ON job_photos;

CREATE POLICY "job_photos_select_authenticated"
  ON job_photos FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "job_photos_insert_authenticated"
  ON job_photos FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "job_photos_delete_authenticated"
  ON job_photos FOR DELETE
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "job_photos_storage_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "job_photos_storage_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "job_photos_storage_delete_authenticated" ON storage.objects;

CREATE POLICY "job_photos_storage_select_authenticated"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'job-photos' AND auth.role() = 'authenticated');

CREATE POLICY "job_photos_storage_insert_authenticated"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'job-photos' AND auth.role() = 'authenticated');

CREATE POLICY "job_photos_storage_delete_authenticated"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'job-photos' AND auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_job_photos_scheduled_job_id
  ON job_photos(scheduled_job_id);

CREATE INDEX IF NOT EXISTS idx_job_photos_property_id
  ON job_photos(property_id);

CREATE INDEX IF NOT EXISTS idx_job_photos_visit_id
  ON job_photos(visit_id);
