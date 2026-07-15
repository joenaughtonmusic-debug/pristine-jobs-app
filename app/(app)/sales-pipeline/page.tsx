import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { PipelineBoard } from "@/components/pipeline-board"
import type { InvoicedJob } from "@/components/invoiced-jobs-section"
import type { SalesLead } from "@/lib/sales-leads"

export const dynamic = "force-dynamic"

export default async function SalesPipelinePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/")
  }

  const { data: leads, error } = await supabase
    .from("sales_leads")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[sales-pipeline] failed to load leads", error)
  }

  // Slice 5: invoiced jobs (Make writes xero_invoice_number back onto
  // scheduled_jobs). Archived rows have been cleared off the page.
  const { data: invoicedJobs, error: invoicedError } = await supabase
    .from("scheduled_jobs")
    .select(
      "id, xero_invoice_number, quoted_amount, invoice_paid_in_app_at, properties(client_name, suburb)"
    )
    .not("xero_invoice_number", "is", null)
    .is("invoice_archived_at", null)
    .order("scheduled_date", { ascending: false })

  if (invoicedError) {
    console.error("[sales-pipeline] failed to load invoiced jobs", invoicedError)
  }

  return (
    <PipelineBoard
      leads={(leads || []) as SalesLead[]}
      invoicedJobs={(invoicedJobs || []) as unknown as InvoicedJob[]}
    />
  )
}
