-- Staff responses to internal job board items.

CREATE TABLE IF NOT EXISTS job_board_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_board_item_id UUID NOT NULL REFERENCES job_board_items(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  response TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT job_board_responses_response_check
    CHECK (response IN ('available', 'claimed', 'not_available')),
  CONSTRAINT job_board_responses_unique_staff_item
    UNIQUE (job_board_item_id, staff_id)
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS job_board_responses_set_updated_at ON job_board_responses;

CREATE TRIGGER job_board_responses_set_updated_at
BEFORE UPDATE ON job_board_responses
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

ALTER TABLE job_board_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_board_responses_select_staff" ON job_board_responses;
DROP POLICY IF EXISTS "job_board_responses_insert_own" ON job_board_responses;
DROP POLICY IF EXISTS "job_board_responses_update_own" ON job_board_responses;

CREATE POLICY "job_board_responses_select_staff"
  ON job_board_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM staff_members
      WHERE staff_members.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "job_board_responses_insert_own"
  ON job_board_responses FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM staff_members
      WHERE staff_members.id = job_board_responses.staff_id
        AND staff_members.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "job_board_responses_update_own"
  ON job_board_responses FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM staff_members
      WHERE staff_members.id = job_board_responses.staff_id
        AND staff_members.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM staff_members
      WHERE staff_members.id = job_board_responses.staff_id
        AND staff_members.auth_user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_job_board_responses_item_id
  ON job_board_responses(job_board_item_id);

CREATE INDEX IF NOT EXISTS idx_job_board_responses_staff_id
  ON job_board_responses(staff_id);

CREATE INDEX IF NOT EXISTS idx_job_board_responses_response
  ON job_board_responses(response);
