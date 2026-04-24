-- Pristine Jobs Database Schema
-- Job management for landscaping and garden maintenance

-- Properties table (clients/locations)
CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  address TEXT NOT NULL,
  access_notes TEXT,
  permanent_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Jobs table (scheduled visits)
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  next_visit_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Visits table (completed work records)
CREATE TABLE IF NOT EXISTS visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  hours_worked DECIMAL(4,2) NOT NULL,
  greenwaste_bags INTEGER DEFAULT 0,
  work_notes TEXT,
  next_visit_notes TEXT,
  ready_for_invoice BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;

-- RLS Policies for properties
CREATE POLICY "properties_select_own" ON properties FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "properties_insert_own" ON properties FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "properties_update_own" ON properties FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "properties_delete_own" ON properties FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for jobs
CREATE POLICY "jobs_select_own" ON jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "jobs_insert_own" ON jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "jobs_update_own" ON jobs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "jobs_delete_own" ON jobs FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for visits
CREATE POLICY "visits_select_own" ON visits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "visits_insert_own" ON visits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "visits_update_own" ON visits FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "visits_delete_own" ON visits FOR DELETE USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_date ON jobs(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_jobs_property_id ON jobs(property_id);
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_visits_property_id ON visits(property_id);
CREATE INDEX IF NOT EXISTS idx_properties_user_id ON properties(user_id);
