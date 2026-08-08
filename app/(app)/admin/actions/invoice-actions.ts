"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { buildInvoicePayload } from "@/lib/invoice-payload"

export type CreateInvoiceResult =
  | { ok: true; message: string }
  | { ok: false; error: string }

// Payment terms: invoice due this many days after it's created.
const DUE_IN_DAYS = 7

// Create + email a Xero invoice for a completed quoted job. The app can't talk
// to Xero directly — it POSTs the payload to a Make webhook and Make creates
// the invoice, emails the customer, and writes the Xero invoice number back
// onto the scheduled job. Human-triggered (a button), never silent. Guarded
// against double-send: refuses if the job already has a Xero invoice or has
// already been marked converted.
export async function createAndSendInvoice(
  jobId: string,
): Promise<CreateInvoiceResult> {
  if (!jobId) return { ok: false, error: "No job given." }

  const supabase = await createClient()

  const { data: job, error: jobError } = await supabase
    .from("scheduled_jobs")
    .select(
      "id, property_id, invoice_method, quoted_invoice_status, xero_invoice_id, xero_invoice_number",
    )
    .eq("id", jobId)
    .single()

  if (jobError || !job) {
    return { ok: false, error: jobError?.message || "Job not found." }
  }

  if (job.invoice_method !== "quoted") {
    return {
      ok: false,
      error:
        "This job isn't a quoted job, so it can't be invoiced from the quote here.",
    }
  }

  // Double-send guard. Make writes the Xero number back asynchronously, so we
  // also treat "converted" (stamped the moment we POST) as already-invoiced.
  if (
    job.xero_invoice_id ||
    job.xero_invoice_number ||
    job.quoted_invoice_status === "converted"
  ) {
    return {
      ok: false,
      error:
        "This job has already been invoiced. Check Xero before creating another invoice.",
    }
  }

  // The accepted quote links to the job via first_scheduled_job_id (the
  // populated direction); fall back to scheduled_job_id for older rows.
  const { data: quoteByFirst } = await supabase
    .from("quote_drafts")
    .select("id, customer_name, customer_email, line_items, total")
    .eq("first_scheduled_job_id", jobId)
    .maybeSingle()

  let quote = quoteByFirst
  if (!quote) {
    const { data: quoteByJob } = await supabase
      .from("quote_drafts")
      .select("id, customer_name, customer_email, line_items, total")
      .eq("scheduled_job_id", jobId)
      .maybeSingle()
    quote = quoteByJob
  }

  if (!quote) {
    return {
      ok: false,
      error:
        "Couldn't find the accepted quote for this job, so there's nothing to invoice from.",
    }
  }

  const { data: property, error: propError } = await supabase
    .from("properties")
    .select("property_code, client_name, client_email")
    .eq("id", job.property_id)
    .single()

  if (propError || !property) {
    return { ok: false, error: propError?.message || "Property not found." }
  }

  const built = buildInvoicePayload({
    job: { id: job.id, property_id: job.property_id },
    quote,
    property,
    now: new Date(),
    dueInDays: DUE_IN_DAYS,
  })

  if (!built.ok) return { ok: false, error: built.error }

  const webhookUrl = process.env.INVOICE_WEBHOOK_URL
  if (!webhookUrl) {
    return {
      ok: false,
      error:
        "The invoice automation isn't configured in this environment, so nothing was sent.",
    }
  }

  let response: Response
  try {
    response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(built.payload),
    })
  } catch (e) {
    return {
      ok: false,
      error: `Couldn't reach the invoice automation: ${
        e instanceof Error ? e.message : "network error"
      }`,
    }
  }

  if (!response.ok) {
    return {
      ok: false,
      error: `The invoice automation rejected the request (${response.status}).`,
    }
  }

  // Stamp only after a successful send. Marking "converted" both removes the
  // job from the Quoted Jobs list and blocks a second send until Make writes
  // the real Xero number back.
  const { error: stampError } = await supabase
    .from("scheduled_jobs")
    .update({ quoted_invoice_status: "converted" })
    .eq("id", jobId)

  if (stampError) {
    return {
      ok: false,
      error: `The invoice was sent, but recording it failed: ${stampError.message}. Don't click again — check Xero first.`,
    }
  }

  revalidatePath("/admin/quoted-jobs")
  revalidatePath("/admin/invoices")
  revalidatePath("/admin/schedule")

  return {
    ok: true,
    message: `Invoice for ${built.payload.customer_name} ($${built.payload.total_incl_gst.toFixed(
      2,
    )}, due in ${DUE_IN_DAYS} days) was sent to Xero and emailed to ${
      built.payload.customer_email
    }. The Xero invoice number will appear here shortly.`,
  }
}
