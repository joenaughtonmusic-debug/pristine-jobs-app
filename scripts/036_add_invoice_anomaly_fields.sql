-- Optional: persist invoice anomaly flags so a scheduled digest (Make.com / cron)
-- can read them without recomputing. Skip this if you only compute flags on page
-- load, the way cost-capture flags already work.

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS anomaly_quote_mismatch BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS anomaly_above_usual BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS anomaly_baseline_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS anomaly_checked_at TIMESTAMPTZ;

-- Partial index: only the flagged rows, which is all a morning digest queries.
CREATE INDEX IF NOT EXISTS idx_visits_anomaly_flagged
  ON visits (property_id)
  WHERE anomaly_quote_mismatch OR anomaly_above_usual;
