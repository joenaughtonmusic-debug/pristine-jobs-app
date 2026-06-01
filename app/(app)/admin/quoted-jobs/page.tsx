import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export const dynamic = "force-dynamic"

type QuoteDraftForJob = {
  scheduled_job_id: string | null
  quote_type: string | null
}

function getQuoteTypeLabel(value?: string | null) {
  if (value === "maintenance") return "Maintenance"
  if (value === "landscaping") return "Landscaping"
  return "One-off"
}

async function markReadyToConvert(formData: FormData) {
  "use server"

  const supabase = await createClient()
  const jobId = formData.get("jobId") as string

  await supabase
    .from("scheduled_jobs")
    .update({
      quoted_invoice_status: "ready_to_convert",
    })
    .eq("id", jobId)

  revalidatePath("/admin/quoted-jobs")
}

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
  const { data: linkedQuoteDrafts } =
    jobIds.length > 0
      ? await supabase
          .from("quote_drafts")
          .select("scheduled_job_id, quote_type")
          .in("scheduled_job_id", jobIds)
      : { data: [] }
  const quoteTypeByJobId = ((linkedQuoteDrafts || []) as QuoteDraftForJob[]).reduce<
    Record<string, string | null>
  >((types, draft) => {
    if (!draft.scheduled_job_id) return types
    types[draft.scheduled_job_id] = draft.quote_type
    return types
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
        Mark quoted jobs as ready to convert first, then mark as converted once the invoice has been created.
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

          const invoiceStatus = job.quoted_invoice_status || "pending"
          const isReadyToConvert = invoiceStatus === "ready_to_convert"
          const quoteType = quoteTypeByJobId[job.id] || null

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

                <div
                  className={`rounded-full px-3 py-1 text-sm font-medium ${
                    isReadyToConvert
                      ? "bg-green-100 text-green-800"
                      : "bg-purple-100 text-purple-800"
                  }`}
                >
                  {isReadyToConvert ? "READY TO CONVERT" : "QUOTED"}
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

              <div className="mt-4 flex justify-end gap-3">
                {!isReadyToConvert ? (
  <form action={markReadyToConvert}>
    <input type="hidden" name="jobId" value={job.id} />

    <button
  type="submit"
  className="flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
>
  <span className="flex h-4 w-4 items-center justify-center rounded border border-gray-400">
  </span>

  Ready to convert to invoice
</button>
  </form>
) : (
  <form action={markConverted}>
    <input type="hidden" name="jobId" value={job.id} />

    <button
      type="submit"
      className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
    >
      Mark Converted
    </button>
  </form>
)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
