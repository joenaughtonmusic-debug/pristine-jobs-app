-- Add cost-capture fields for reliable visit back-costing.
-- Existing invoicing fields remain unchanged.

CREATE TABLE IF NOT EXISTS visit_labour_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  scheduled_job_id UUID NULL REFERENCES scheduled_jobs(id) ON DELETE SET NULL,
  property_id UUID NULL REFERENCES properties(id) ON DELETE SET NULL,
  staff_member_id UUID NULL REFERENCES staff_members(id) ON DELETE SET NULL,
  staff_name TEXT NOT NULL,
  hours_worked NUMERIC(8,2) NOT NULL,
  labour_type TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE visit_labour_entries
  ADD COLUMN IF NOT EXISTS scheduled_job_id UUID NULL REFERENCES scheduled_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS property_id UUID NULL REFERENCES properties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS staff_member_id UUID NULL REFERENCES staff_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS staff_name TEXT,
  ADD COLUMN IF NOT EXISTS hours_worked NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS labour_type TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE visit_labour_entries
  DROP CONSTRAINT IF EXISTS visit_labour_entries_labour_type_check;

ALTER TABLE visit_labour_entries
  ADD CONSTRAINT visit_labour_entries_labour_type_check
    CHECK (
      labour_type IS NULL OR labour_type IN (
        'primary',
        'helper',
        'extra',
        'travel',
        'admin',
        'fallback_backfill',
        'other'
      )
    );

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS cost_capture_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cost_capture_reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS cost_capture_override_reason TEXT,
  ADD COLUMN IF NOT EXISTS materials_review_note TEXT;

ALTER TABLE visit_extra_charges
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS unit_sell_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS total_cost NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS total_sell_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS billable_status TEXT;

ALTER TABLE visit_extra_charges
  DROP CONSTRAINT IF EXISTS visit_extra_charges_category_check,
  DROP CONSTRAINT IF EXISTS visit_extra_charges_billable_status_check;

ALTER TABLE visit_extra_charges
  ADD CONSTRAINT visit_extra_charges_category_check
    CHECK (
      category IS NULL OR category IN (
        'green_waste',
        'plants',
        'soil',
        'mulch',
        'fertiliser',
        'spray',
        'petrol',
        'delivery',
        'general_waste',
        'subcontractor',
        'other'
      )
    ),
  ADD CONSTRAINT visit_extra_charges_billable_status_check
    CHECK (
      billable_status IS NULL OR billable_status IN (
        'billable',
        'non_billable',
        'needs_review'
      )
    );

CREATE INDEX IF NOT EXISTS idx_visit_labour_entries_visit_id
  ON visit_labour_entries(visit_id);

CREATE INDEX IF NOT EXISTS idx_visit_labour_entries_scheduled_job_id
  ON visit_labour_entries(scheduled_job_id);

CREATE INDEX IF NOT EXISTS idx_visit_extra_charges_category
  ON visit_extra_charges(category);

CREATE INDEX IF NOT EXISTS idx_visit_extra_charges_billable_status
  ON visit_extra_charges(billable_status);
