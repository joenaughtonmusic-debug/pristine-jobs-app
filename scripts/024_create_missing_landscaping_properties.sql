-- Optional helper to create properties for landscaping jobs with labour entries.
-- Run this before 023_backfill_landscaping_labour_links.sql.
-- Only unique landscaping job codes/locations are inserted.
-- Existing properties are never updated.

WITH location_candidates AS (
  SELECT
    LOWER(TRIM(landscaping.address_line_1)) AS normalized_address,
    LOWER(TRIM(COALESCE(landscaping.suburb, ''))) AS normalized_suburb,
    MIN(TRIM(landscaping.job_code)) AS property_code,
    MIN(NULLIF(TRIM(landscaping.client_name), '')) AS client_name,
    MIN(NULLIF(TRIM(landscaping.job_name), '')) AS job_name,
    MIN(TRIM(landscaping.address_line_1)) AS address_line_1,
    MIN(NULLIF(TRIM(landscaping.suburb), '')) AS suburb
  FROM landscaping_jobs landscaping
  WHERE landscaping.address_line_1 IS NOT NULL
    AND TRIM(landscaping.address_line_1) <> ''
    AND landscaping.job_code IS NOT NULL
    AND TRIM(landscaping.job_code) <> ''
    AND EXISTS (
      SELECT 1
      FROM job_labour_entries labour
      WHERE labour.job_type = 'landscaping'
        AND labour.job_code = landscaping.job_code
    )
  GROUP BY
    LOWER(TRIM(landscaping.address_line_1)),
    LOWER(TRIM(COALESCE(landscaping.suburb, '')))
  HAVING COUNT(DISTINCT TRIM(landscaping.job_code)) = 1
),
safe_candidates AS (
  SELECT candidate.*
  FROM location_candidates candidate
  WHERE (
    SELECT COUNT(*)
    FROM location_candidates same_code
    WHERE same_code.property_code = candidate.property_code
  ) = 1
    AND NOT EXISTS (
      SELECT 1
      FROM properties property
      WHERE LOWER(TRIM(property.address_line_1)) = candidate.normalized_address
        AND LOWER(TRIM(COALESCE(property.suburb, ''))) =
          candidate.normalized_suburb
    )
    AND NOT EXISTS (
      SELECT 1
      FROM properties property
      WHERE property.property_code = candidate.property_code
    )
)
INSERT INTO properties (
  property_code,
  client_name,
  address_line_1,
  suburb,
  city,
  is_active
)
SELECT
  candidate.property_code,
  COALESCE(
    candidate.client_name,
    candidate.job_name,
    candidate.property_code,
    'Landscaping job'
  ),
  candidate.address_line_1,
  candidate.suburb,
  'Auckland',
  TRUE
FROM safe_candidates candidate
RETURNING
  id,
  property_code,
  client_name,
  address_line_1,
  suburb,
  city,
  is_active;
