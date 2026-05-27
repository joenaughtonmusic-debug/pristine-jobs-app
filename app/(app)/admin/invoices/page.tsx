import Link from "next/link"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

type PropertySummary = {
  id?: string | null
  property_code?: string | null
  client_name?: string | null
  address_line_1?: string | null
  suburb?: string | null
}

type ScheduledJobSummary = {
  id?: string | null
  scheduled_date?: string | null
  status?: string | null
  job_type?: string | null
  invoice_method?: string | null
  xero_quote_number?: string | null
  quoted_invoice_status?: string | null
  properties?: PropertySummary | PropertySummary[] | null
}

type InvoiceVisit = {
  id: string
  scheduled_job_id?: string | null
  visit_date?: string | null
  hours_worked?: number | null
  greenwaste_bags?: number | null
  work_notes?: string | null
  ready_for_invoice?: boolean | null
  invoice_status?: string | null
  scheduled_jobs?: ScheduledJobSummary | ScheduledJobSummary[] | null
  properties?: PropertySummary | PropertySummary[] | null
}

function firstOrValue<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function formatDate(value?: string | null) {
  if (!value) return "No date"
  return new Date(value).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function getPropertyLabel(property?: PropertySummary | null) {
  if (!property) return "No property"

  return (
    property.client_name ||
    property.property_code ||
    [property.address_line_1, property.suburb].filter(Boolean).join(", ") ||
    "No property"
  )
}

function getPropertyAddress(property?: PropertySummary | null) {
  return [property?.address_line_1, property?.suburb].filter(Boolean).join(", ")
}

function stageClasses(active: boolean) {
  return active
    ? "border-green-200 bg-green-50 text-green-800"
    : "border-gray-200 bg-gray-50 text-gray-500"
}

function StageChip({
  label,
  active,
}: {
  label: string
  active: boolean
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium ${stageClasses(
        active
      )}`}
    >
      <span>{active ? "✓" : "○"}</span>
      {label}
    </span>
  )
}

export default async function AdminInvoicesPage() {
  const supabase = await createClient()

  const { data: visits, error } = await supabase
    .from("visits")
    .select(`
      id,
      scheduled_job_id,
      visit_date,
      hours_worked,
      greenwaste_bags,
      work_notes,
      ready_for_invoice,
      invoice_status,
      scheduled_jobs (
        id,
        scheduled_date,
        status,
        job_type,
        invoice_method,
        xero_quote_number,
        quoted_invoice_status,
        properties (
          id,
          property_code,
          client_name,
          address_line_1,
          suburb
        )
      ),
      properties (
        id,
        property_code,
        client_name,
        address_line_1,
        suburb
      )
    `)
    .eq("ready_for_invoice", true)
    .order("visit_date", { ascending: false })
    .limit(200)

  return (
    <div className="mx-auto max-w-7xl p-4 pb-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Invoices</h1>
        <p className="text-sm text-gray-500">
          Job invoicing control board for completed work ready for VA review.
        </p>
      </header>

      <section className="mb-8 rounded-xl border bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Job Invoice Board</h2>
            <p className="text-sm text-gray-500">
              Uses completed visits marked ready for invoice. Supplier/fuel emails are handled in Communications, not here.
            </p>
          </div>

          <Link
            href="/admin/quoted-jobs"
            className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Quoted Jobs
          </Link>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Error loading invoice jobs: {error.message}
          </div>
        ) : visits && visits.length > 0 ? (
          <div className="space-y-3">
            {(visits as InvoiceVisit[]).map((visit) => {
              const job = firstOrValue(visit.scheduled_jobs)
              const property =
                firstOrValue(job?.properties) || firstOrValue(visit.properties)
              const address = getPropertyAddress(property)
              const invoiceStatus = visit.invoice_status || "ready"
              const completed = job?.status === "completed" || Boolean(visit.visit_date)
              const ready = Boolean(visit.ready_for_invoice)
              const draftCreated =
                invoiceStatus === "draft" ||
                invoiceStatus === "created" ||
                job?.quoted_invoice_status === "converted"
              const sent = invoiceStatus === "sent"
              const paid = invoiceStatus === "paid"

              return (
                <article key={visit.id} className="rounded-lg border p-4">
                  <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900">
                        {getPropertyLabel(property)}
                      </h3>
                      {address && (
                        <p className="mt-1 text-sm text-gray-500">{address}</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                        <span>Visit: {formatDate(visit.visit_date || job?.scheduled_date)}</span>
                        <span>Job type: {job?.job_type || job?.invoice_method || "maintenance"}</span>
                        <span>Status: {invoiceStatus}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-start gap-2 lg:justify-end">
                      <StageChip label="Completed" active={completed} />
                      <StageChip label="Ready" active={ready} />
                      <StageChip label="Draft" active={draftCreated} />
                      <StageChip label="Sent" active={sent} />
                      <StageChip label="Paid" active={paid} />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-600">
                    {typeof visit.hours_worked === "number" && (
                      <span className="rounded-full bg-gray-100 px-2 py-1">
                        {visit.hours_worked}h labour
                      </span>
                    )}
                    {typeof visit.greenwaste_bags === "number" &&
                      visit.greenwaste_bags > 0 && (
                        <span className="rounded-full bg-gray-100 px-2 py-1">
                          {visit.greenwaste_bags} greenwaste bags
                        </span>
                      )}
                    {job?.invoice_method && (
                      <span className="rounded-full bg-gray-100 px-2 py-1">
                        {job.invoice_method}
                      </span>
                    )}
                    {job?.xero_quote_number && (
                      <span className="rounded-full bg-blue-100 px-2 py-1 text-blue-800">
                        Quote {job.xero_quote_number}
                      </span>
                    )}
                  </div>

                  {visit.work_notes && (
                    <div className="mt-3 line-clamp-3 rounded-md bg-gray-50 p-3 text-sm text-gray-700">
                      {visit.work_notes}
                    </div>
                  )}

                  <div className="mt-4">
                    {job?.id ? (
                      <Link
                        href={`/jobs/${job.id}`}
                        className="inline-flex rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white"
                      >
                        Open Job
                      </Link>
                    ) : (
                      <p className="text-xs text-gray-500">
                        TODO: Add a visit detail route before linking directly to visits.
                      </p>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-sm text-gray-500">
            No jobs are currently marked ready for invoice.
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-gray-50 p-4 text-sm text-gray-600">
        <h2 className="mb-2 font-semibold text-gray-900">Tracking Notes</h2>
        <p>
          TODO: Add explicit invoice draft, sent, paid, and Xero invoice ID fields
          when invoice creation is wired. Current tracking is limited to
          visits.ready_for_invoice, visits.invoice_status, scheduled_jobs.invoice_method,
          scheduled_jobs.xero_quote_number, and scheduled_jobs.quoted_invoice_status.
        </p>
      </section>
    </div>
  )
}
