-- Structured maintenance subscription quote assumptions.

ALTER TABLE quote_templates
  ADD COLUMN IF NOT EXISTS frequency TEXT,
  ADD COLUMN IF NOT EXISTS labour_hours NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS labour_rate NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS greenwaste_bags NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS greenwaste_rate NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS sprays_size TEXT,
  ADD COLUMN IF NOT EXISTS sprays_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS fertiliser_size TEXT,
  ADD COLUMN IF NOT EXISTS fertiliser_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS stump_paste_size TEXT,
  ADD COLUMN IF NOT EXISTS stump_paste_price NUMERIC(10,2);

ALTER TABLE quote_drafts
  ADD COLUMN IF NOT EXISTS terms_conditions TEXT,
  ADD COLUMN IF NOT EXISTS frequency TEXT,
  ADD COLUMN IF NOT EXISTS labour_hours NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS labour_rate NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS greenwaste_bags NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS greenwaste_rate NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS sprays_size TEXT,
  ADD COLUMN IF NOT EXISTS sprays_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS fertiliser_size TEXT,
  ADD COLUMN IF NOT EXISTS fertiliser_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS stump_paste_size TEXT,
  ADD COLUMN IF NOT EXISTS stump_paste_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS per_visit_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS monthly_equivalent NUMERIC(12,2);

DO $$
DECLARE
  service_description TEXT := 'Regular garden maintenance service including pruning, trimming, weeding, lawn edging, site tidy-up, greenwaste removal, and seasonal garden care as required.';
  terms_text TEXT := 'Maintenance subscription pricing is based on the agreed service frequency and scope. Any additional work outside the quoted maintenance scope will be discussed before proceeding.';
BEGIN
  UPDATE quote_templates
  SET
    category = 'Maintenance',
    customer_scope = COALESCE(customer_scope, service_description),
    terms_conditions = COALESCE(terms_conditions, terms_text),
    default_line_items = jsonb_build_array(
      jsonb_build_object(
        'description', service_description,
        'quantity', 1,
        'unit_price', 0
      )
    ),
    is_active = TRUE,
    updated_at = NOW()
  WHERE name IN (
    'Monthly Maintenance',
    '6 Weekly Maintenance',
    '2 Monthly Maintenance',
    '3 Monthly Maintenance',
    '4 Monthly Maintenance',
    '6 Monthly Maintenance'
  );

  INSERT INTO quote_templates (
    name,
    category,
    customer_scope,
    internal_notes,
    terms_conditions,
    default_line_items,
    is_active
  )
  SELECT
    template_name,
    'Maintenance',
    service_description,
    'Internal pricing assumptions are stored on the template and should not be shown to customers unless manually written into the customer wording.',
    terms_text,
    jsonb_build_array(
      jsonb_build_object(
        'description', service_description,
        'quantity', 1,
        'unit_price', 0
      )
    ),
    TRUE
  FROM (
    VALUES
      ('Monthly Maintenance'),
      ('6 Weekly Maintenance'),
      ('2 Monthly Maintenance'),
      ('3 Monthly Maintenance'),
      ('4 Monthly Maintenance'),
      ('6 Monthly Maintenance')
  ) AS templates(template_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM quote_templates WHERE name = templates.template_name
  );

  UPDATE quote_templates
  SET frequency = 'monthly',
      labour_hours = 4,
      labour_rate = 90,
      greenwaste_bags = 2,
      greenwaste_rate = 26.50,
      sprays_size = 'small',
      sprays_price = 5,
      fertiliser_size = 'small',
      fertiliser_price = 7.50,
      stump_paste_size = 'small',
      stump_paste_price = 7
  WHERE name = 'Monthly Maintenance';

  UPDATE quote_templates
  SET frequency = '6_weekly',
      labour_hours = 4.5,
      labour_rate = 90,
      greenwaste_bags = 2,
      greenwaste_rate = 26.50,
      sprays_size = 'small',
      sprays_price = 5,
      fertiliser_size = 'small',
      fertiliser_price = 7.50,
      stump_paste_size = 'small',
      stump_paste_price = 7
  WHERE name = '6 Weekly Maintenance';

  UPDATE quote_templates
  SET frequency = '2_monthly',
      labour_hours = 4.5,
      labour_rate = 90,
      greenwaste_bags = 2.5,
      greenwaste_rate = 26.50,
      sprays_size = 'small',
      sprays_price = 5,
      fertiliser_size = 'small',
      fertiliser_price = 7.50,
      stump_paste_size = 'small',
      stump_paste_price = 7
  WHERE name = '2 Monthly Maintenance';

  UPDATE quote_templates
  SET frequency = '3_monthly',
      labour_hours = 5,
      labour_rate = 90,
      greenwaste_bags = 2.5,
      greenwaste_rate = 26.50,
      sprays_size = 'small',
      sprays_price = 5,
      fertiliser_size = 'small',
      fertiliser_price = 7.50,
      stump_paste_size = 'small',
      stump_paste_price = 7
  WHERE name = '3 Monthly Maintenance';

  UPDATE quote_templates
  SET frequency = '4_monthly',
      labour_hours = 5.5,
      labour_rate = 90,
      greenwaste_bags = 2.5,
      greenwaste_rate = 26.50,
      sprays_size = 'small',
      sprays_price = 5,
      fertiliser_size = 'small',
      fertiliser_price = 7.50,
      stump_paste_size = 'small',
      stump_paste_price = 7
  WHERE name = '4 Monthly Maintenance';

  UPDATE quote_templates
  SET frequency = '6_monthly',
      labour_hours = 6,
      labour_rate = 90,
      greenwaste_bags = 3,
      greenwaste_rate = 26.50,
      sprays_size = 'small',
      sprays_price = 5,
      fertiliser_size = 'small',
      fertiliser_price = 7.50,
      stump_paste_size = 'small',
      stump_paste_price = 7
  WHERE name = '6 Monthly Maintenance';
END $$;
