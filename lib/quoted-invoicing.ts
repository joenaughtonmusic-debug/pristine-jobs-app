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
