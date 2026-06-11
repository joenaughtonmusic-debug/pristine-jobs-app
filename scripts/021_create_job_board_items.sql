-- Internal overflow / quick jobs board.

CREATE TABLE IF NOT EXISTS job_board_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  property_id UUID NULL REFERENCES properties(id) ON DELETE SET NULL,
  suburb TEXT,
  preferred_date DATE,
  preferred_time_window TEXT,
  assigned_staff_id UUID NULL REFERENCES staff_members(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT job_board_items_status_check
    CHECK (status IN ('open', 'assigned', 'completed', 'cancelled')),
  CONSTRAINT job_board_items_priority_check
    CHECK (priority IN ('low', 'normal', 'urgent'))
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS job_board_items_set_updated_at ON job_board_items;

CREATE TRIGGER job_board_items_set_updated_at
BEFORE UPDATE ON job_board_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

ALTER TABLE job_board_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_board_items_select_staff" ON job_board_items;
DROP POLICY IF EXISTS "job_board_items_insert_staff" ON job_board_items;
DROP POLICY IF EXISTS "job_board_items_update_staff" ON job_board_items;

CREATE POLICY "job_board_items_select_staff"
  ON job_board_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM staff_members
      WHERE staff_members.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "job_board_items_insert_staff"
  ON job_board_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM staff_members
      WHERE staff_members.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "job_board_items_update_staff"
  ON job_board_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM staff_members
      WHERE staff_members.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM staff_members
      WHERE staff_members.auth_user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_job_board_items_status
  ON job_board_items(status);

CREATE INDEX IF NOT EXISTS idx_job_board_items_priority
  ON job_board_items(priority);

CREATE INDEX IF NOT EXISTS idx_job_board_items_preferred_date
  ON job_board_items(preferred_date);

CREATE INDEX IF NOT EXISTS idx_job_board_items_property_id
  ON job_board_items(property_id);

CREATE INDEX IF NOT EXISTS idx_job_board_items_assigned_staff_id
  ON job_board_items(assigned_staff_id);
