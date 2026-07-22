// Build A: a subscription property must not be silently un-billable. The app
// can't see Xero repeating invoices (no API), so billability is a human-
// confirmed state (migration 050). A confirmation goes stale after ~12 months
// because a repeating invoice can be deleted/paused in Xero long after it was
// first confirmed — so staleness re-flags it.
//
// Phase B: billing identity is now per-job-type (property_billing_lines), so the
// confirmable entity is a LINE (billing_mode) as well as, transitionally, a
// property (billing_type). isSubscriptionUnconfirmed accepts either shape.

export const SUBSCRIPTION_CONFIRMATION_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000

export type SubscriptionConfirmable = {
  billing_type?: string | null
  billing_mode?: string | null
  subscription_invoice_confirmed_at?: string | null
}

export function isSubscriptionUnconfirmed(entity: SubscriptionConfirmable) {
  // A line carries billing_mode; a property carries billing_type. Either counts.
  const mode = entity.billing_mode ?? entity.billing_type
  if (mode !== "subscription") return false

  const confirmedAt = entity.subscription_invoice_confirmed_at
  if (!confirmedAt) return true

  const ts = Date.parse(confirmedAt)
  if (!Number.isFinite(ts)) return true

  return Date.now() - ts > SUBSCRIPTION_CONFIRMATION_MAX_AGE_MS
}

// ---- Phase B: a property can host several active billing lines ----
// The scheduling surfaces derive their behaviour from the SET of active line
// modes, not a single per-property billing_type.

export type BillingLineMode = { billing_mode?: string | null }

// Distinct, non-empty modes across a property's active billing lines.
export function activeBillingModes(
  lines: BillingLineMode[] | null | undefined
): string[] {
  return Array.from(
    new Set(
      (lines ?? [])
        .map((line) => line.billing_mode)
        .filter((mode): mode is string => Boolean(mode))
    )
  )
}

// Prefill for the schedule invoice-method field: exactly one line → that method;
// multiple (or none) → no silent default (operator chooses explicitly).
// charge_up keeps its deliberate no-default — the old silent charge_up fallback
// let fixed-price jobs get invoiced per visit.
export function defaultInvoiceMethodFromModes(modes: string[]): string {
  if (modes.length !== 1) return ""
  const mode = modes[0]
  return mode === "charge_up" ? "" : mode
}

// Mismatch guard (#21, multi-method): a chosen method is valid if it matches an
// active line's mode. Block (+require override) only when it matches NONE. A
// charge_up line is permissive — it preserves the pre-Phase-B rule that a
// charge_up property accepts any explicit method — so a mixed property with a
// charge_up line never blocks, while a subscription-only property still blocks a
// charge_up job (the double-bill shape #21 was built to catch).
export function isMethodMismatchForModes(
  modes: string[],
  method: string
): boolean {
  if (!method || modes.length === 0) return false
  if (modes.includes("charge_up")) return false
  return !modes.includes(method)
}
