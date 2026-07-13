import type { SupabaseClient } from "@supabase/supabase-js"

// Phase 0 belt: a job with invoice_method = 'quoted' is billed as ONE fixed-price
// Xero invoice built from the accepted quote. Its individual visits must never
// become their own per-visit invoices. So anywhere a visit would be marked
// 'ready' for invoicing, a quoted job's visit is set to 'excluded' instead, and
// never enters the invoice queue. (Make.com adds the second, independent guard.)

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

// The invoice_status a would-be-ready visit should receive: 'excluded' when its
// job is quoted, otherwise 'ready'.
export async function readyInvoiceStatusForJob(
  supabase: SupabaseClient,
  scheduledJobId: string | null | undefined,
): Promise<"ready" | "excluded"> {
  return (await isQuotedJob(supabase, scheduledJobId)) ? "excluded" : "ready"
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
