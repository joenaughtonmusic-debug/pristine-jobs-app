-- Communications table for messages, SMS, email, phone and internal notes
CREATE TABLE IF NOT EXISTS communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enquiry_id UUID NULL REFERENCES admin_enquiries(id) ON DELETE SET NULL,
  property_id UUID NULL REFERENCES properties(id) ON DELETE SET NULL,
  job_id UUID NULL REFERENCES scheduled_jobs(id) ON DELETE SET NULL,
  visit_id UUID NULL REFERENCES visits(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email','sms','phone','internal')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  subject TEXT NULL,
  body TEXT NULL,
  metadata JSONB NULL,
  external_id TEXT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','delivered','received','draft','archived')),
  sent_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_communications_user_id ON communications(user_id);
CREATE INDEX IF NOT EXISTS idx_communications_enquiry_id ON communications(enquiry_id);
CREATE INDEX IF NOT EXISTS idx_communications_property_id ON communications(property_id);
CREATE INDEX IF NOT EXISTS idx_communications_job_id ON communications(job_id);
CREATE INDEX IF NOT EXISTS idx_communications_visit_id ON communications(visit_id);
CREATE INDEX IF NOT EXISTS idx_communications_external_id ON communications(external_id);
CREATE INDEX IF NOT EXISTS idx_communications_created_at ON communications(created_at);

-- Row Level Security
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "communications_select_own" ON communications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "communications_insert_own" ON communications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "communications_update_own" ON communications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "communications_delete_own" ON communications FOR DELETE USING (auth.uid() = user_id);
