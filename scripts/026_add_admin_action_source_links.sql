-- Link admin actions back to the workflow record that generated them.
-- This lets Admin Actions act as the central operational task layer.

ALTER TABLE admin_actions
  ADD COLUMN IF NOT EXISTS source_record_type TEXT,
  ADD COLUMN IF NOT EXISTS source_record_id TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_actions_open_source
  ON admin_actions(source_record_type, source_record_id, action_type)
  WHERE source_record_type IS NOT NULL
    AND source_record_id IS NOT NULL
    AND COALESCE(status, 'open') <> 'done';

CREATE INDEX IF NOT EXISTS idx_admin_actions_source
  ON admin_actions(source_record_type, source_record_id);
