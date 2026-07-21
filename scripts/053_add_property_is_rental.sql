-- 053: add properties.is_rental — a simple tag marking a property as a rental /
-- PM-managed property. ATTRIBUTE ONLY, not billing-adjacent: the Make invoice
-- view, billing_type and invoice_method are untouched. It's the hook a future PM
-- portal / reporting / photo rules will hang off — not any of those things yet.
--
-- Orthogonal to property_category (maintenance/one_off/landscaping) and
-- billing_type: a rental still gets maintenance work and bills normally, so a
-- dedicated boolean is correct rather than a new category value.
--
-- Mirrors the existing is_active boolean (NOT NULL DEFAULT). Existing rows
-- default to false (non-rental); nothing else changes.
--
-- Rehearse on staging, then prod (per the migration workflow). Non-billing, so no
-- money-path regression applies.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS is_rental boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN properties.is_rental IS
  'Tag: property is a rental / PM-managed. Attribute only, not billing-related.';

-- POST-CHECK: column exists NOT NULL default false, and every existing row is
-- false (nothing silently flipped):
-- SELECT is_rental, count(*) FROM properties GROUP BY 1;  -- expect one row: f | <all>
