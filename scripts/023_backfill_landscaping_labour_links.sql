-- Optional safe backfill for legacy landscaping labour entries.
-- Only exact, unique matches are updated. Ambiguous rows remain unchanged.
-- Run 024_create_missing_landscaping_properties.sql first if the landscaping
-- locations do not yet exist in properties.
-- Join path:
-- job_labour_entries.job_code -> landscaping_jobs.job_code
-- landscaping_jobs.address_line_1/suburb -> properties.address_line_1/suburb
-- properties.id + labour work_date -> scheduled_jobs property/date

WITH unique_property_matches AS (
  SELECT
    labour.id AS labour_entry_id,
    MIN(property.id::TEXT)::UUID AS property_id
  FROM job_labour_entries labour
  JOIN landscaping_jobs landscaping
    ON landscaping.job_code = labour.job_code
  JOIN properties property
    ON LOWER(TRIM(property.address_line_1)) =
      LOWER(TRIM(landscaping.address_line_1))
    AND LOWER(TRIM(COALESCE(property.suburb, ''))) =
      LOWER(TRIM(COALESCE(landscaping.suburb, '')))
  WHERE labour.job_type = 'landscaping'
    AND labour.property_id IS NULL
    AND labour.job_code IS NOT NULL
    AND landscaping.address_line_1 IS NOT NULL
  GROUP BY labour.id
  HAVING COUNT(*) = 1
)
UPDATE job_labour_entries labour
SET property_id = match.property_id
FROM unique_property_matches match
WHERE labour.id = match.labour_entry_id;

WITH unique_scheduled_job_matches AS (
  SELECT
    labour.id AS labour_entry_id,
    MIN(job.id::TEXT)::UUID AS scheduled_job_id
  FROM job_labour_entries labour
  JOIN scheduled_jobs job
    ON job.property_id = labour.property_id
    AND job.scheduled_date = labour.work_date
    AND job.job_type = 'landscaping'
  WHERE labour.job_type = 'landscaping'
    AND labour.scheduled_job_id IS NULL
    AND labour.property_id IS NOT NULL
  GROUP BY labour.id
  HAVING COUNT(*) = 1
)
UPDATE job_labour_entries labour
SET scheduled_job_id = match.scheduled_job_id
FROM unique_scheduled_job_matches match
WHERE labour.id = match.labour_entry_id;
