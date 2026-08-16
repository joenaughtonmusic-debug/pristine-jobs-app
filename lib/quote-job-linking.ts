import type { SupabaseClient } from "@supabase/supabase-js"

// Norm, 14 Aug 2026: an accepted $395.30 one-off quote, a job typed straight
// into the schedule instead of created from the quote, and an invoice that
// went out at 8.5h × $80 = $706.50. The quote→job link is stamped ONLY at
// job-creation time (admin-quote-builder-client "schedule this quote" and the
// schedule page's ?quote= prefill). Once a job existed without it there was no
// way back — no attach, no relink, nothing. This module is that way back.
//
// It deliberately mirrors the create-from-quote writes rather than inventing a
// second set: same invoice_method/billing_mode/quoted_amount derivation, same
// write-once stamp on first_scheduled_job_id, same recurring-invoice clear.
// Two paths that are supposed to agree and quietly stop agreeing is how the
// historical double-billing bugs happened.

// A visit whose invoice already exists in Xero or is on its way there. Same
// list the quoted branch of invoice_line_items_for_make gates on (migration
// 046) — kept in sync with it by hand, since the view can't be imported.
export const IN_FLIGHT_INVOICE_STATUSES = [
  "processing",
  "draft_created",
  "authorised",
  "sent",
  "paid",
  // 'invoiced' is set by hand for visits billed outside the app (subscription
  // properties, mostly). Prod has visits in this state with NO xero_invoice_id
  // and NO invoiced_at, so it is the only signal that they're already billed —
  // leaving it out let attach proceed on a visit Xero has already invoiced.
  "invoiced",
] as const

// Billing arrangements a quote must never silently overwrite. Subscription is
// invoiced by hand in Xero via Make and is settled ("do not rebuild");
// fixed_recurring bills a set amount per visit. Flipping either to 'quoted'
// because someone attached a one-off quote at the same property would break
// the property's ongoing billing with no signal anywhere.
export const PROTECTED_BILLING_METHODS = ["subscription", "fixed_recurring"] as const

export type AttachableQuote = {
  id: string
  customer_name: string | null
  quote_title: string | null
  quote_type: string | null
  total: number | string | null
  quote_accepted_at: string | null
}

export type AttachResult = { ok: true } | { ok: false; error: string }

// quote_type is a three-value field; anything else means one-off. Same rule as
// getNormalisedQuoteType in the quote builder — duplicated rather than shared
// because that one lives in a "use client" component.
export function normaliseQuoteType(value?: string | null) {
  if (value === "maintenance" || value === "landscaping") return value
  return "one_off"
}

// Maintenance bills per visit (charge_up); everything else bills the quote's
// own lines. Verbatim from the builder's schedule path so an attached job is
// indistinguishable from one created off the quote in the first place.
export function billingForQuoteType(quoteType: string | null | undefined) {
  const normalised = normaliseQuoteType(quoteType)
  const method = normalised === "maintenance" ? "charge_up" : "quoted"
  return { invoiceMethod: method, billingMode: method }
}

// Accepted quotes for this property that no job has claimed yet. Drafts are
// excluded on purpose: Melanie's job is linked to a superseded $359 draft
// while the $422 she actually accepted sits unlinked, and offering drafts is
// how that happens.
export async function findAttachableQuotes(
  supabase: SupabaseClient,
  propertyId: string | null | undefined
): Promise<AttachableQuote[]> {
  if (!propertyId) return []

  const { data } = await supabase
    .from("quote_drafts")
    .select(
      "id, customer_name, quote_title, quote_type, total, quote_accepted_at"
    )
    .eq("property_id", propertyId)
    .eq("status", "accepted")
    .is("first_scheduled_job_id", null)
    .order("quote_accepted_at", { ascending: false })

  return (data as AttachableQuote[]) || []
}

// Why a job may not be attachable. Returns null when it's safe.
//
// The hard one is an invoice that already exists: attaching would flip the job
// to 'quoted' and change what the invoice view emits, while Xero still holds
// the charge_up invoice it was sent. The app and Xero would disagree with no
// signal. Norm's job is refused by this and has to be fixed in Xero by hand —
// correctly.
export async function attachBlockedReason(
  supabase: SupabaseClient,
  jobId: string
): Promise<string | null> {
  const { data: job } = await supabase
    .from("scheduled_jobs")
    .select("id, property_id, invoice_method, billing_mode")
    .eq("id", jobId)
    .maybeSingle()

  if (!job) return "That job no longer exists."

  // A recurring subscription or fixed-price job must not be repurposed by a
  // quote that merely shares its property. 50 live jobs bill this way and
  // their invoicing happens outside the app entirely.
  const protectedMethod = [job.invoice_method, job.billing_mode].find((value) =>
    PROTECTED_BILLING_METHODS.includes(
      value as (typeof PROTECTED_BILLING_METHODS)[number]
    )
  )

  if (protectedMethod) {
    return (
      `This job bills as ${protectedMethod.replace("_", " ")}, which is set up ` +
      "outside the app. Attaching a quote would change how it invoices. " +
      "Schedule the quote as its own job instead."
    )
  }

  const { data: linked } = await supabase
    .from("quote_drafts")
    .select("id")
    .eq("first_scheduled_job_id", jobId)
    .limit(1)
    .maybeSingle()

  if (linked) return "This job is already linked to a quote."

  const { data: visits } = await supabase
    .from("visits")
    .select("invoice_status, xero_invoice_id, invoiced_at")
    .eq("scheduled_job_id", jobId)

  const inFlight = (visits || []).find(
    (visit) =>
      visit.xero_invoice_id ||
      visit.invoiced_at ||
      IN_FLIGHT_INVOICE_STATUSES.includes(
        visit.invoice_status as (typeof IN_FLIGHT_INVOICE_STATUSES)[number]
      )
  )

  if (inFlight) {
    return (
      "This job has already been invoiced, so attaching a quote now would " +
      "leave the app and Xero disagreeing. Fix the invoice in Xero instead."
    )
  }

  return null
}

// Attach an accepted quote to an existing job. Mirrors the create-from-quote
// writes exactly; the quote stamp keeps its write-once guard so a quote can
// never end up on two jobs.
export async function attachQuoteToJob(
  supabase: SupabaseClient,
  jobId: string,
  quoteDraftId: string
): Promise<AttachResult> {
  const blocked = await attachBlockedReason(supabase, jobId)
  if (blocked) return { ok: false, error: blocked }

  const { data: quote } = await supabase
    .from("quote_drafts")
    .select("id, property_id, quote_type, total, status, first_scheduled_job_id")
    .eq("id", quoteDraftId)
    .maybeSingle()

  if (!quote) return { ok: false, error: "That quote no longer exists." }
  if (quote.status !== "accepted") {
    return { ok: false, error: "Only an accepted quote can be attached." }
  }
  if (quote.first_scheduled_job_id) {
    return { ok: false, error: "That quote is already linked to another job." }
  }

  const { data: job } = await supabase
    .from("scheduled_jobs")
    .select("id, property_id")
    .eq("id", jobId)
    .maybeSingle()

  if (!job) return { ok: false, error: "That job no longer exists." }
  if (job.property_id !== quote.property_id) {
    return {
      ok: false,
      error: "That quote belongs to a different property.",
    }
  }

  const { invoiceMethod, billingMode } = billingForQuoteType(quote.quote_type)
  const normalised = normaliseQuoteType(quote.quote_type)

  // Stamp the quote FIRST. If this loses the write-once race the job is still
  // untouched, which is the recoverable order — the reverse would leave a job
  // set to 'quoted' with no quote behind it, and a quoted job with no quote
  // emits zero invoice lines.
  const { data: stamped, error: stampError } = await supabase
    .from("quote_drafts")
    .update({
      first_scheduled_job_id: jobId,
      recurring_invoice_required: false,
      recurring_invoice_setup_status: "not_required",
      updated_at: new Date().toISOString(),
    })
    .eq("id", quoteDraftId)
    .is("first_scheduled_job_id", null)
    .select("id")

  if (stampError) {
    return { ok: false, error: `Could not link the quote: ${stampError.message}` }
  }

  if (!stamped || stamped.length === 0) {
    return {
      ok: false,
      error:
        "That quote was linked to another job a moment ago. Nothing was changed here.",
    }
  }

  const { error: jobError } = await supabase
    .from("scheduled_jobs")
    .update({
      invoice_method: invoiceMethod,
      billing_mode: billingMode,
      quoted_amount:
        normalised === "maintenance" ? null : Number(quote.total || 0),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)

  if (jobError) {
    // The quote now points at this job but the job didn't take its billing.
    // Say so plainly rather than reporting success — a 'quoted' quote sitting
    // on a charge_up job is exactly the Norm shape this module exists to kill.
    return {
      ok: false,
      error:
        `The quote was linked, but setting the job's billing failed: ${jobError.message}. ` +
        "The attach option is now hidden for this job, so fix it by hand: open " +
        "the job on the schedule and set Invoice Method to " +
        `"${invoiceMethod}" before it is invoiced.`,
    }
  }

  return { ok: true }
}
