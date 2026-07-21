// Build A: a subscription property must not be silently un-billable. The app
// can't see Xero repeating invoices (no API), so billability is a human-
// confirmed state on the property (migration 050). A confirmation goes stale
// after ~12 months because a repeating invoice can be deleted/paused in Xero
// long after it was first confirmed — so staleness re-flags it.

export const SUBSCRIPTION_CONFIRMATION_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000

export type SubscriptionConfirmable = {
  billing_type?: string | null
  subscription_invoice_confirmed_at?: string | null
}

export function isSubscriptionUnconfirmed(property: SubscriptionConfirmable) {
  if (property.billing_type !== "subscription") return false

  const confirmedAt = property.subscription_invoice_confirmed_at
  if (!confirmedAt) return true

  const ts = Date.parse(confirmedAt)
  if (!Number.isFinite(ts)) return true

  return Date.now() - ts > SUBSCRIPTION_CONFIRMATION_MAX_AGE_MS
}
