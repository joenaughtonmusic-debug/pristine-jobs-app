-- Backfill public_suburb_locations with all Auckland suburbs used by
-- Pristine Gardens properties.
--
-- Coordinates are approximate suburb centroids sourced from LINZ / OSM data.
-- They are intentionally imprecise — good enough to place a map marker in the
-- right suburb while revealing no customer address or property information.
--
-- Aliases rows (e.g. "Halfmoon Bay", "Mt Eden") point to the same coordinates
-- and display_name as their canonical counterpart so property suburb strings
-- stored in either format resolve to the same map marker.
--
-- Safe to re-run: ON CONFLICT upserts by the same normalised index used by the
-- API  →  LOWER(TRIM(suburb)).

INSERT INTO public_suburb_locations
  (suburb, display_name, latitude, longitude, is_active)
VALUES

  -- A
  ('Avondale',            'Avondale',             -36.895800, 174.696300, true),

  -- B
  ('Blockhouse Bay',      'Blockhouse Bay',        -36.923500, 174.700900, true),

  -- D
  ('Devonport',           'Devonport',             -36.829500, 174.800300, true),

  -- E
  ('Ellerslie',           'Ellerslie',             -36.907800, 174.813100, true),
  ('Epsom',               'Epsom',                 -36.894100, 174.774500, true),

  -- F
  ('Freemans Bay',        'Freemans Bay',          -36.850900, 174.748900, true),

  -- G
  -- "Glendene" is the west-Auckland suburb (not Glendowie on the east)
  ('Glendene',            'Glendene',              -36.889000, 174.639200, true),
  ('Greenlane',           'Greenlane',             -36.888600, 174.799300, true),
  ('Grey Lynn',           'Grey Lynn',             -36.858500, 174.733400, true),

  -- H
  ('Half Moon Bay',       'Half Moon Bay',         -36.899400, 174.902100, true),
  ('Halfmoon Bay',        'Half Moon Bay',         -36.899400, 174.902100, true), -- alias
  ('Henderson',           'Henderson',             -36.877600, 174.630800, true),
  ('Hillsborough',        'Hillsborough',          -36.923600, 174.758100, true),

  -- K
  ('Kingsland',           'Kingsland',             -36.872200, 174.744100, true),
  ('Kohimarama',          'Kohimarama',            -36.849100, 174.841900, true),

  -- M
  ('Mangere',             'Māngere',               -36.979300, 174.796300, true),
  ('Mangere Bridge',      'Māngere Bridge',        -36.960000, 174.795900, true),
  ('Meadowbank',          'Meadowbank',            -36.868600, 174.829800, true),
  ('Morningside',         'Morningside',           -36.873500, 174.736300, true),
  ('Mount Albert',        'Mount Albert',          -36.884800, 174.717200, true),
  ('Mount Eden',          'Mount Eden',            -36.878100, 174.764500, true),
  ('Mount Roskill',       'Mount Roskill',         -36.909600, 174.734000, true),
  ('Mount Wellington',    'Mount Wellington',      -36.905600, 174.839400, true),
  ('Mt Albert',           'Mount Albert',          -36.884800, 174.717200, true), -- alias
  ('Mt Eden',             'Mount Eden',            -36.878100, 174.764500, true), -- alias

  -- P
  ('Parnell',             'Parnell',               -36.855700, 174.781200, true),
  ('Penrose',             'Penrose',               -36.914800, 174.815600, true),
  ('Point Chevalier',     'Point Chevalier',       -36.865800, 174.707800, true),
  ('Ponsonby',            'Ponsonby',              -36.848800, 174.741100, true),

  -- R
  ('Remuera',             'Remuera',               -36.879500, 174.800200, true),
  ('Royal Oak',           'Royal Oak',             -36.910500, 174.775500, true),

  -- S
  ('Sandringham',         'Sandringham',           -36.884700, 174.739700, true),
  ('St Heliers',          'St Heliers',            -36.852400, 174.858000, true),
  ('St Lukes',            'St Lukes',              -36.884200, 174.734000, true),
  ('St Marys Bay',        'St Marys Bay',          -36.845300, 174.738100, true),
  ('Sunnyvale',           'Sunnyvale',             -36.888000, 174.626700, true),

  -- T
  ('Te Atatu',            'Te Atatū',              -36.879000, 174.669700, true),
  ('Te Atatu Peninsula',  'Te Atatū Peninsula',    -36.856500, 174.647200, true),
  ('Titirangi',           'Titirangi',             -36.921500, 174.652000, true),

  -- W
  ('Westmere',            'Westmere',              -36.852900, 174.720500, true)

ON CONFLICT ((LOWER(TRIM(suburb)))) DO UPDATE
  SET
    display_name = EXCLUDED.display_name,
    latitude     = EXCLUDED.latitude,
    longitude    = EXCLUDED.longitude,
    is_active    = true,
    updated_at   = NOW();
