-- Support the public-safe "Where We're Working Today" homepage feed.
-- Public output is opt-out: confirmed scheduled work appears unless hidden.

ALTER TABLE scheduled_jobs
  ADD COLUMN IF NOT EXISTS hide_from_public_map BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public_suburb_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suburb TEXT NOT NULL,
  display_name TEXT,
  latitude NUMERIC(9,6) NOT NULL,
  longitude NUMERIC(9,6) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_public_suburb_locations_normalized_suburb
  ON public_suburb_locations (LOWER(TRIM(suburb)));

CREATE INDEX IF NOT EXISTS idx_public_suburb_locations_is_active
  ON public_suburb_locations(is_active);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_public_working_today
  ON scheduled_jobs(scheduled_date, schedule_confirmation_status, status)
  WHERE hide_from_public_map = false;

INSERT INTO public_suburb_locations (suburb, display_name, latitude, longitude)
VALUES
  ('Auckland Central', 'Auckland Central', -36.848500, 174.763300),
  ('Arch Hill', 'Arch Hill', -36.858900, 174.736800),
  ('Avondale', 'Avondale', -36.895800, 174.696300),
  ('Balmoral', 'Balmoral', -36.889100, 174.748100),
  ('Birkenhead', 'Birkenhead', -36.812300, 174.724900),
  ('Blockhouse Bay', 'Blockhouse Bay', -36.923500, 174.700900),
  ('Eden Terrace', 'Eden Terrace', -36.866000, 174.757200),
  ('Epsom', 'Epsom', -36.894100, 174.774500),
  ('Freemans Bay', 'Freemans Bay', -36.850900, 174.748900),
  ('Glendowie', 'Glendowie', -36.858800, 174.866200),
  ('Glen Innes', 'Glen Innes', -36.878200, 174.855800),
  ('Grafton', 'Grafton', -36.861900, 174.769600),
  ('Greenlane', 'Greenlane', -36.888600, 174.799300),
  ('Grey Lynn', 'Grey Lynn', -36.858500, 174.733400),
  ('Herne Bay', 'Herne Bay', -36.844100, 174.731500),
  ('Hillsborough', 'Hillsborough', -36.923600, 174.758100),
  ('Kingsland', 'Kingsland', -36.872200, 174.744100),
  ('Kohimarama', 'Kohimarama', -36.849100, 174.841900),
  ('Meadowbank', 'Meadowbank', -36.868600, 174.829800),
  ('Mission Bay', 'Mission Bay', -36.847300, 174.831800),
  ('Mt Albert', 'Mount Albert', -36.884800, 174.717200),
  ('Mount Albert', 'Mount Albert', -36.884800, 174.717200),
  ('Mt Eden', 'Mount Eden', -36.878100, 174.764500),
  ('Mount Eden', 'Mount Eden', -36.878100, 174.764500),
  ('Mt Roskill', 'Mount Roskill', -36.909600, 174.734000),
  ('Mount Roskill', 'Mount Roskill', -36.909600, 174.734000),
  ('Mt Wellington', 'Mount Wellington', -36.905600, 174.839400),
  ('Mount Wellington', 'Mount Wellington', -36.905600, 174.839400),
  ('Newmarket', 'Newmarket', -36.870600, 174.777600),
  ('One Tree Hill', 'One Tree Hill', -36.900600, 174.785900),
  ('Onehunga', 'Onehunga', -36.922100, 174.783900),
  ('Orakei', 'Orakei', -36.855500, 174.814200),
  ('Parnell', 'Parnell', -36.855700, 174.781200),
  ('Point Chevalier', 'Point Chevalier', -36.865800, 174.707800),
  ('Pt Chevalier', 'Point Chevalier', -36.865800, 174.707800),
  ('Ponsonby', 'Ponsonby', -36.848800, 174.741100),
  ('Remuera', 'Remuera', -36.879500, 174.800200),
  ('Royal Oak', 'Royal Oak', -36.910500, 174.775500),
  ('Saint Heliers', 'Saint Heliers', -36.852400, 174.858000),
  ('Saint Johns', 'Saint Johns', -36.884000, 174.838600),
  ('St Heliers', 'Saint Heliers', -36.852400, 174.858000),
  ('St Johns', 'Saint Johns', -36.884000, 174.838600),
  ('Sandringham', 'Sandringham', -36.884700, 174.739700),
  ('St Lukes', 'St Lukes', -36.884200, 174.734000),
  ('Stonefields', 'Stonefields', -36.887700, 174.839000),
  ('Three Kings', 'Three Kings', -36.907600, 174.755700),
  ('Waterview', 'Waterview', -36.878500, 174.700000),
  ('Westmere', 'Westmere', -36.852900, 174.720500)
ON CONFLICT ((LOWER(TRIM(suburb)))) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  is_active = true,
  updated_at = NOW();
