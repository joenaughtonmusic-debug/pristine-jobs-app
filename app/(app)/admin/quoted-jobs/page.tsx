import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { CreateInvoiceButton } from "@/components/create-invoice-button"

export const dynamic = "force-dynamic"

type QuoteDraftForJob = {
  scheduled_job_id: string | null
  first_scheduled_job_id: string | null
  quote_type: string | null
  customer_name: string | null
}

function getQuoteTypeLabel(value?: string | null) {
  if (value === "maintenance") return "Maintenance"
  if (value === "landscaping") return "Landscaping"
  return "One-off"
}

// Manual fallback: mark a job as invoiced when the invoice was created in Xero
// outside the app (so it drops off this list without sending anything).
async function markConverted(formData: FormData) {
  "use server"

  const supabase = await createClient()
  const jobId = formData.get("jobId") as string

  await supabase
    .from("scheduled_jobs")
    .update({
      quoted_invoice_status: "converted",
    })
    .eq("id", jobId)

  revalidatePath("/admin/quoted-jobs")
}

export default async function QuotedJobsPage() {
  const supabase = await createClient()

  const { data: jobs, error } = await supabase
    .from("scheduled_jobs")
    .select(`
      id,
      scheduled_date,
      xero_quote_number,
      quoted_scope,
      quoted_materials,
      quoted_invoice_status,
      properties (
        property_code,
        address_line_1
      )
    `)
    .eq("invoice_method", "quoted")
    .neq("quoted_invoice_status", "converted")
    .order("scheduled_date", { ascending: false })

  const jobIds = (jobs || []).map((job) => job.id)
  // A quote links to its job via first_scheduled_job_id (populated direction);
  // older rows may use scheduled_job_id. Look up both so every quoted job finds
  // its quote (for the type label and the customer name on the invoice button).
  const { data: linkedQuoteDrafts } =
    jobIds.length > 0
      ? await supabase
          .from("quote_drafts")
          .select(
            "scheduled_job_id, first_scheduled_job_id, quote_type, customer_name",
          )
          .or(
            `first_scheduled_job_id.in.(${jobIds.join(
              ",",
            )}),scheduled_job_id.in.(${jobIds.join(",")})`,
          )
      : { data: [] }
  const quoteByJobId = ((linkedQuoteDrafts || []) as QuoteDraftForJob[]).reduce<
    Record<string, QuoteDraftForJob>
  >((map, draft) => {
    const key = draft.first_scheduled_job_id || draft.scheduled_job_id
    if (key) map[key] = draft
    return map
  }, {})

  if (error) {
    return (
      <div className="p-6 text-red-600">
        Error loading quoted jobs: {error.message}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-2 text-3xl font-bold">
        Quoted Jobs To Invoice
      </h1>

      <p className="mb-6 text-sm text-gray-500">
        Quoted jobs waiting to be invoiced. Once the work is done, click{" "}
        <strong>Create &amp; send invoice</strong> to build the invoice in Xero
        from the accepted quote and email it to the customer.
      </p>

      <div className="space-y-4">
        {jobs?.length === 0 && (
          <div className="rounded-lg border bg-white p-6 text-gray-500">
            No quoted jobs waiting for invoice conversion.
          </div>
        )}

        {jobs?.map((job) => {
          const property = Array.isArray(job.properties)
            ? job.properties[0]
            : job.properties

          const linkedQuote = quoteByJobId[job.id] || null
          const quoteType = linkedQuote?.quote_type || null
          const customerName = linkedQuote?.customer_name || null

          return (
            <div
              key={job.id}
              className="rounded-xl border bg-white p-5 shadow-sm"
            >
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold">
                    {property?.property_code || "No property code"}
                  </div>

                  <div className="text-sm text-gray-500">
                    {property?.address_line_1 || "No address"}
                  </div>
                </div>

                <div className="rounded-full bg-purple-100 px-3 py-1 text-sm font-medium text-purple-800">
                  QUOTED
                </div>
              </div>

              <div className="mb-3 text-sm text-gray-600">
                Scheduled Date: {job.scheduled_date}
              </div>

              <div className="mb-3 inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                Quote Type: {getQuoteTypeLabel(quoteType)}
              </div>

              {job.xero_quote_number && (
                <div className="mb-3 rounded-md bg-blue-50 p-3 text-sm">
                  <strong>Xero Quote:</strong>{" "}
                  {job.xero_quote_number}
                </div>
              )}

              {job.quoted_scope && (
                <div className="mb-3">
                  <div className="mb-1 text-sm font-medium">
                    Scope / Notes
                  </div>

                  <div className="whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-sm">
                    {job.quoted_scope}
                  </div>
                </div>
              )}

              {job.quoted_materials && (
                <div className="mb-3">
                  <div className="mb-1 text-sm font-medium">
                    Included Materials
                  </div>

                  <div className="whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-sm">
                    {job.quoted_materials}
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-col items-end gap-3">
                <CreateInvoiceButton
                  jobId={job.id}
                  customerLabel={customerName}
                />

                <form action={markConverted}>
                  <input type="hidden" name="jobId" value={job.id} />

                  <button
                    type="submit"
                    className="text-xs text-gray-500 underline hover:text-gray-700"
                  >
                    Already invoiced in Xero? Mark as done
                  </button>
                </form>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
