import type { SupabaseClient } from "@supabase/supabase-js"

// Phase 0 built a belt here: quoted jobs' visits were set 'excluded' so they
// could never become wrong hours × rate invoices (the invoice view didn't
// understand quoted jobs). Brief 04 / migration 046 taught the view to emit
// the accepted quote's own lines for quoted jobs, so for APP-QUOTED jobs the
// belt inverted into a blocker and is retired.
//
// It survives for one class only: LEGACY quoted jobs — invoice_method =
// 'quoted' but no app quote linked (12 such jobs live as of 18 July 2026,
// all quoted by hand from Xero before the app could quote). Their visits
// must stay 'excluded': at 'ready' they would emit ZERO view rows and Make
// would fire on a visit with no line items.
//
// ORDER MATTERS: migration 046 must be applied to the live DB before this
// code deploys, or an app-quoted visit reaching 'ready' is invoiced by the
// old view as hours × hourly rate — the exact wrong invoice Brief 04 kills.

export async function isQuotedJob(
  supabase: SupabaseClient,
  scheduledJobId: string | null | undefined,
): Promise<boolean> {
  if (!scheduledJobId) return false

  const { data } = await supabase
    .from("scheduled_jobs")
    .select("invoice_method")
    .eq("id", scheduledJobId)
    .maybeSingle()

  return data?.invoice_method === "quoted"
}

// A quoted job with no app quote linked via first_scheduled_job_id — the
// pre-app population, invoiced by hand from Xero.
export async function isLegacyQuotedJob(
  supabase: SupabaseClient,
  scheduledJobId: string | null | undefined,
): Promise<boolean> {
  if (!(await isQuotedJob(supabase, scheduledJobId))) return false

  const { data } = await supabase
    .from("quote_drafts")
    .select("id")
    .eq("first_scheduled_job_id", scheduledJobId)
    .limit(1)
    .maybeSingle()

  return !data
}

// 'ready' for everything the invoice view can price — including app-quoted
// jobs (046 emits the quote's lines). 'excluded' only for legacy quoted
// jobs, where 'ready' would hand Make an empty invoice.
export async function readyInvoiceStatusForJob(
  supabase: SupabaseClient,
  scheduledJobId: string | null | undefined,
): Promise<"ready" | "excluded"> {
  return (await isLegacyQuotedJob(supabase, scheduledJobId))
    ? "excluded"
    : "ready"
}

// Guard 2 (Brief 05): a visit must never reach Make with a bad invoice —
// refuse before it queues. Two failure shapes, both surfaced via
// visits.invoice_error with a 'Not queued:' prefix (kept distinguishable from
// Make write-backs):
//   - ZERO lines: Make stamps 'processing', creates nothing, the visit
//     dead-ends silently (the 5 stuck legacy visits of 18 July).
//   - A line with a NULL unit_amount (Step 3): a charge_up property with no
//     hourly_rate/greenwaste_rate — the line would bill at Xero's item default
//     instead of the agreed rate. (Subscription visits emit no rate-bearing
//     lines; quoted visits bill from quote prices — so this only bites
//     charge_up null rates and genuinely null-priced quote lines, both of
//     which should be blocked.)
// Returns null when the visit is safe to queue.
export async function zeroLineRefusalForVisit(
  supabase: SupabaseClient,
  visitId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("invoice_line_items_for_make")
    .select("unit_amount")
    .eq("visit_id", visitId)

  // A failed read must not wave the visit through — refuse and say why.
  if (error) {
    return `Not queued: could not confirm invoice lines (${error.message}). Try again.`
  }

  const rows = data ?? []

  if (rows.length === 0) {
    return (
      "Not queued: this visit would produce 0 invoice lines, so Make would " +
      "create an empty invoice and the visit would stick at 'processing'. " +
      "Check the linked quote's line items (quoted jobs) or the visit's hours, " +
      "greenwaste and extra charges, then mark it ready again."
    )
  }

  if (rows.some((row) => row.unit_amount == null)) {
    return (
      "Not queued: this visit's property has no labour/greenwaste rate set, " +
      "so a line would bill at Xero's default instead of the agreed rate. " +
      "Set the property's rate, then mark ready again."
    )
  }

  return null
}

export async function readyInvoiceStatusForVisit(
  supabase: SupabaseClient,
  visitId: string | null | undefined,
): Promise<"ready" | "excluded"> {
  if (!visitId) return "ready"

  const { data } = await supabase
    .from("visits")
    .select("scheduled_job_id")
    .eq("id", visitId)
    .maybeSingle()

  return readyInvoiceStatusForJob(supabase, data?.scheduled_job_id ?? null)
}
