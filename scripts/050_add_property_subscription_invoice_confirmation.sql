-- 050: per-property subscription repeating-invoice confirmation.
--
-- WHY: the app can't see Xero repeating invoices (no API). A subscription
-- property whose repeating invoice was never set up (or got deleted/paused in
-- Xero) bills NOTHING and nothing surfaces it — since 048 its visits correctly
-- emit no per-visit lines, so a broken subscription is invisible. These
-- columns hold the human-confirmed state: "this subscription has a live Xero
-- repeating invoice for $X, confirmed by [who] on [date]".
--
-- Build A Stage 2 treats a subscription property as UNCONFIRMED when
-- billing_type='subscription' AND (subscription_invoice_confirmed_at IS NULL
-- OR it is older than 12 months) — staleness is built in, because a repeating
-- invoice can be deleted/paused in Xero long after it was first confirmed.
--
-- SCOPE: additive only. Three nullable columns, no defaults, no backfill — so
-- every existing subscription property reads as unconfirmed immediately (the
-- flagging IS the backfill; the amounts live only in Xero and Joe confirms each
-- by hand). No existing row is altered.
--
-- ORDER: this schema must be applied BEFORE the Stage 2 code deploys, or the
-- dashboard action generator and the profitability badge reference columns that
-- don't exist. Post-check at the bottom.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS subscription_amount numeric,
  ADD COLUMN IF NOT EXISTS subscription_invoice_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_invoice_confirmed_by text;

-- POST-CHECK: columns exist, and all subscription properties read unconfirmed.
-- SELECT count(*) FILTER (WHERE billing_type='subscription') AS subs,
--        count(*) FILTER (WHERE billing_type='subscription'
--                          AND subscription_invoice_confirmed_at IS NULL) AS unconfirmed
-- FROM properties;   -- expect subs = unconfirmed (all unconfirmed on day one)
