-- Google Calendar busy-time/blockout sync target.

CREATE TABLE IF NOT EXISTS calendar_blockouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_event_id TEXT UNIQUE NOT NULL,
  title TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  location TEXT,
  notes TEXT,
  source TEXT DEFAULT 'google_calendar',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calendar_blockouts_set_updated_at ON calendar_blockouts;

CREATE TRIGGER calendar_blockouts_set_updated_at
BEFORE UPDATE ON calendar_blockouts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

ALTER TABLE calendar_blockouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calendar_blockouts_select_authenticated" ON calendar_blockouts;
DROP POLICY IF EXISTS "calendar_blockouts_insert_authenticated" ON calendar_blockouts;
DROP POLICY IF EXISTS "calendar_blockouts_update_authenticated" ON calendar_blockouts;
DROP POLICY IF EXISTS "calendar_blockouts_delete_authenticated" ON calendar_blockouts;

CREATE POLICY "calendar_blockouts_select_authenticated"
  ON calendar_blockouts FOR SELECT
  USING (auth.role() IN ('anon', 'authenticated'));

CREATE POLICY "calendar_blockouts_insert_authenticated"
  ON calendar_blockouts FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "calendar_blockouts_update_authenticated"
  ON calendar_blockouts FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "calendar_blockouts_delete_authenticated"
  ON calendar_blockouts FOR DELETE
  USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_calendar_blockouts_start_time
  ON calendar_blockouts(start_time);

CREATE INDEX IF NOT EXISTS idx_calendar_blockouts_end_time
  ON calendar_blockouts(end_time);
