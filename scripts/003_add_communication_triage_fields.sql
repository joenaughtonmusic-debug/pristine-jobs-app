-- Communications triage workflow for VA review and future automation.
-- This migration intentionally changes communications.status from delivery state
-- to workflow state using explicit conservative mappings.

ALTER TABLE communications
  DROP CONSTRAINT IF EXISTS communications_status_check;

ALTER TABLE communications
  DROP CONSTRAINT IF EXISTS communications_status_workflow_check,
  DROP CONSTRAINT IF EXISTS communications_category_check,
  DROP CONSTRAINT IF EXISTS communications_priority_check,
  DROP CONSTRAINT IF EXISTS communications_risk_level_check,
  DROP CONSTRAINT IF EXISTS communications_assigned_to_check;

ALTER TABLE communications
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS priority TEXT,
  ADD COLUMN IF NOT EXISTS risk_level TEXT,
  ADD COLUMN IF NOT EXISTS assigned_to TEXT,
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN,
  ADD COLUMN IF NOT EXISTS ai_summary TEXT,
  ADD COLUMN IF NOT EXISTS suggested_reply TEXT;

UPDATE communications
SET status = CASE status
  WHEN 'received' THEN 'new'
  WHEN 'draft' THEN 'needs_reply'
  WHEN 'queued' THEN 'new'
  WHEN 'sent' THEN 'waiting_customer'
  WHEN 'delivered' THEN 'waiting_customer'
  WHEN 'failed' THEN 'needs_reply'
  WHEN 'archived' THEN 'closed'
  ELSE status
END
WHERE status IN ('received', 'draft', 'queued', 'sent', 'delivered', 'failed', 'archived');

UPDATE communications
SET
  category = COALESCE(category, 'general'),
  priority = COALESCE(priority, 'normal'),
  risk_level = COALESCE(risk_level, 'low'),
  assigned_to = COALESCE(assigned_to, 'unassigned'),
  requires_review = COALESCE(requires_review, FALSE);

ALTER TABLE communications
  ALTER COLUMN status SET DEFAULT 'new',
  ALTER COLUMN category SET DEFAULT 'general',
  ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN priority SET DEFAULT 'normal',
  ALTER COLUMN priority SET NOT NULL,
  ALTER COLUMN risk_level SET DEFAULT 'low',
  ALTER COLUMN risk_level SET NOT NULL,
  ALTER COLUMN assigned_to SET DEFAULT 'unassigned',
  ALTER COLUMN assigned_to SET NOT NULL,
  ALTER COLUMN requires_review SET DEFAULT FALSE,
  ALTER COLUMN requires_review SET NOT NULL;

ALTER TABLE communications
  ADD CONSTRAINT communications_status_workflow_check
    CHECK (status IN ('new','needs_reply','needs_scheduling','needs_estimator','waiting_customer','escalate_to_joe','closed')),
  ADD CONSTRAINT communications_category_check
    CHECK (category IN ('quote_request','scheduling','maintenance_query','invoice_payment','complaint','general','internal_note')),
  ADD CONSTRAINT communications_priority_check
    CHECK (priority IN ('low','normal','high','urgent')),
  ADD CONSTRAINT communications_risk_level_check
    CHECK (risk_level IN ('low','medium','high')),
  ADD CONSTRAINT communications_assigned_to_check
    CHECK (assigned_to IN ('unassigned','va','estimator','maintenance_team','landscaping_team','joe'));

CREATE INDEX IF NOT EXISTS idx_communications_status ON communications(status);
CREATE INDEX IF NOT EXISTS idx_communications_category ON communications(category);
CREATE INDEX IF NOT EXISTS idx_communications_priority ON communications(priority);
CREATE INDEX IF NOT EXISTS idx_communications_assigned_to ON communications(assigned_to);
CREATE INDEX IF NOT EXISTS idx_communications_requires_review ON communications(requires_review);
