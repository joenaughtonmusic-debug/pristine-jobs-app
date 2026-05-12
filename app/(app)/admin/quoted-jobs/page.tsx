import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export const dynamic = "force-dynamic"

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

  if (error) {
    return (
      <div className="p-6 text-red-600">
        Error loading quoted jobs: {error.message}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-6 text-3xl font-bold">
        Quoted Jobs To Invoice
      </h1>

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

          return (
            <div
              key={job.id}
              className="rounded-xl border bg-white p-5 shadow-sm"
            >
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold">
                    {property?.property_code}
                  </div>

                  <div className="text-sm text-gray-500">
                    {property?.address_line_1}
                  </div>
                </div>

                <div className="rounded-full bg-purple-100 px-3 py-1 text-sm font-medium text-purple-800">
                  QUOTED
                </div>
              </div>

              <div className="mb-3 text-sm text-gray-600">
                Scheduled Date: {job.scheduled_date}
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

                  <div className="rounded-md bg-gray-50 p-3 text-sm whitespace-pre-wrap">
                    {job.quoted_scope}
                  </div>
                </div>
              )}

              {job.quoted_materials && (
                <div className="mb-3">
                  <div className="mb-1 text-sm font-medium">
                    Included Materials
                  </div>

                  <div className="rounded-md bg-gray-50 p-3 text-sm whitespace-pre-wrap">
                    {job.quoted_materials}
                  </div>
                </div>
              )}

              <div className="mt-4 flex justify-end">
                <form action={markConverted}>
                  <input
                    type="hidden"
                    name="jobId"
                    value={job.id}
                  />

                  <button
                    type="submit"
                    className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                  >
                    Mark Quote Converted
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