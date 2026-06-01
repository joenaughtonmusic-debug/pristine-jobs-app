import Link from "next/link"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

type PropertySummary = {
  id?: string | null
  property_code?: string | null
  client_name?: string | null
  address_line_1?: string | null
  suburb?: string | null
  invoice_handling_note?: string | null
  hourly_rate?: number | string | null
  greenwaste_rate?: number | string | null
}

type ScheduledJobSummary = {
  id?: string | null
  scheduled_date?: string | null
  status?: string | null
  job_type?: string | null
  invoice_method?: string | null
  xero_quote_number?: string | null
  quoted_invoice_status?: string | null
  quoted_scope?: string | null
  quoted_materials?: string | null
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
  invoice_note?: string | null
  xero_invoice_id?: string | null
  xero_invoice_number?: string | null
  invoice_draft_created_at?: string | null
  invoice_sent_at?: string | null
  invoice_paid_at?: string | null
  invoice_amount?: number | null
  invoice_error?: string | null
  scheduled_jobs?: ScheduledJobSummary | ScheduledJobSummary[] | null
  properties?: PropertySummary | PropertySummary[] | null
}

type VisitExtraCharge = {
  id: string
  visit_id: string | null
  item_code?: string | null
  staff_label?: string | null
  invoice_description?: string | null
  quantity?: number | string | null
  unit_price?: number | string | null
  notes?: string | null
  invoice_status?: string | null
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

async function excludeVisitFromInvoicing(formData: FormData) {
  "use server"

  const supabase = await createClient()
  const visitId = formData.get("visitId") as string
  const invoiceNote = formData.get("invoiceNote") as string

  if (!visitId) return

  await supabase
    .from("visits")
    .update({
      invoice_status: "excluded",
      invoice_note: invoiceNote.trim() || null,
    })
    .eq("id", visitId)

  revalidatePath("/admin/invoices")
}

async function markVisitNotReady(formData: FormData) {
  "use server"

  const supabase = await createClient()
  const visitId = formData.get("visitId") as string

  if (!visitId) return

  await supabase
    .from("visits")
    .update({
      ready_for_invoice: false,
      invoice_status: "review",
    })
    .eq("id", visitId)

  revalidatePath("/admin/invoices")
}

async function resetInvoiceStatusToReady(formData: FormData) {
  "use server"

  const supabase = await createClient()
  const visitId = formData.get("visitId") as string

  if (!visitId) return

  await supabase
    .from("visits")
    .update({
      ready_for_invoice: true,
      invoice_status: "ready",
      invoice_error: null,
    })
    .eq("id", visitId)

  revalidatePath("/admin/invoices")
}

function getPropertyAddress(property?: PropertySummary | null) {
  return [property?.address_line_1, property?.suburb].filter(Boolean).join(", ")
}

function stageClasses(active: boolean) {
  return active
    ? "border-green-200 bg-green-50 text-green-800"
    : "border-gray-200 bg-gray-50 text-gray-500"
}

function invoiceStatusClasses(status?: string | null) {
  if (status === "error") return "border-red-200 bg-red-50 text-red-800"
  if (status === "excluded") return "border-slate-200 bg-slate-50 text-slate-700"
  if (status === "paid") return "border-green-200 bg-green-50 text-green-800"
  if (status === "sent") return "border-blue-200 bg-blue-50 text-blue-800"
  if (status === "draft" || status === "created") {
    return "border-purple-200 bg-purple-50 text-purple-800"
  }
  if (status === "processing") {
    return "border-amber-200 bg-amber-50 text-amber-800"
  }
  return "border-gray-200 bg-gray-50 text-gray-700"
}

function StageChip({
  label,
  active,
  tone,
}: {
  label: string
  active: boolean
  tone?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium ${
        active && tone ? tone : stageClasses(active)
      }`}
    >
      <span>{active ? "✓" : "○"}</span>
      {label}
    </span>
  )
}

function formatCurrency(value?: number | null) {
  const numericValue = Number(value || 0)

  if (!Number.isFinite(numericValue)) return null

  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
  }).format(numericValue)
}

function getChargeLabel(charge: VisitExtraCharge) {
  return (
    charge.staff_label ||
    charge.invoice_description ||
    charge.item_code ||
    "Extra charge"
  )
}

function getChargeLineTotal(charge: VisitExtraCharge) {
  return Number(charge.quantity || 0) * Number(charge.unit_price || 0)
}

function shouldShowInActiveInvoiceQueue(visit: InvoiceVisit) {
  const job = firstOrValue(visit.scheduled_jobs)

  return (
    job?.invoice_method !== "subscription" &&
    job?.invoice_method !== "non_billable"
  )
}

function WarningBadge({ children, tone = "amber" }: { children: string; tone?: "amber" | "red" | "blue" | "gray" }) {
  const classes = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    gray: "border-gray-200 bg-gray-50 text-gray-700",
  }

  return (
    <span className={`rounded-full border px-2 py-1 text-xs font-medium ${classes[tone]}`}>
      {children}
    </span>
  )
}

export default async function AdminInvoicesPage() {
  const supabase = await createClient()

  const visitSelect = `
    id,
    scheduled_job_id,
    visit_date,
    hours_worked,
    greenwaste_bags,
    work_notes,
    ready_for_invoice,
    invoice_status,
    invoice_note,
    xero_invoice_id,
    xero_invoice_number,
    invoice_draft_created_at,
    invoice_sent_at,
    invoice_paid_at,
    invoice_amount,
    invoice_error,
    scheduled_jobs (
      id,
      scheduled_date,
      status,
      job_type,
      invoice_method,
      xero_quote_number,
      quoted_invoice_status,
      quoted_scope,
      quoted_materials,
      properties (
        id,
        property_code,
        client_name,
        address_line_1,
        suburb,
        invoice_handling_note,
        hourly_rate,
        greenwaste_rate
      )
    ),
    properties (
      id,
      property_code,
      client_name,
      address_line_1,
      suburb,
      invoice_handling_note,
      hourly_rate,
      greenwaste_rate
    )
  `

  const { data: visits, error } = await supabase
    .from("visits")
    .select(visitSelect)
    .eq("ready_for_invoice", true)
    .or("invoice_status.is.null,invoice_status.neq.excluded")
    .order("visit_date", { ascending: false })
    .limit(200)

  const activeInvoiceVisits = ((visits || []) as InvoiceVisit[]).filter(
    shouldShowInActiveInvoiceQueue
  )

  const activeVisitIds = activeInvoiceVisits.map((visit) => visit.id)
  const { data: extraCharges, error: extraChargesError } =
    activeVisitIds.length > 0
      ? await supabase
          .from("visit_extra_charges")
          .select(
            `
              id,
              visit_id,
              item_code,
              staff_label,
              invoice_description,
              quantity,
              unit_price,
              notes,
              invoice_status
            `
          )
          .in("visit_id", activeVisitIds)
          .order("created_at", { ascending: true })
      : { data: [], error: null }

  const extraChargesByVisit = ((extraCharges || []) as VisitExtraCharge[]).reduce<
    Record<string, VisitExtraCharge[]>
  >((grouped, charge) => {
    if (!charge.visit_id) return grouped

    grouped[charge.visit_id] = [...(grouped[charge.visit_id] || []), charge]
    return grouped
  }, {})

  const { data: excludedVisits, error: excludedError } = await supabase
    .from("visits")
    .select(visitSelect)
    .eq("invoice_status", "excluded")
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
        ) : extraChargesError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Error loading visit extra charges: {extraChargesError.message}
          </div>
        ) : activeInvoiceVisits.length > 0 ? (
          <div className="space-y-3">
            {activeInvoiceVisits.map((visit) => {
              const job = firstOrValue(visit.scheduled_jobs)
              const property =
                firstOrValue(job?.properties) || firstOrValue(visit.properties)
              const address = getPropertyAddress(property)
              const invoiceStatus = visit.invoice_status || "ready"
              const visitExtraCharges = extraChargesByVisit[visit.id] || []
              const hasExtraCharges = visitExtraCharges.length > 0
              const invoiceNote = visit.invoice_note?.trim()
              const invoiceHandlingNote = property?.invoice_handling_note?.trim()
              const ready = Boolean(visit.ready_for_invoice)
              const processing = invoiceStatus === "processing"
              const draftCreated =
                invoiceStatus === "draft" ||
                invoiceStatus === "created" ||
                Boolean(visit.invoice_draft_created_at) ||
                Boolean(visit.xero_invoice_id) ||
                Boolean(visit.xero_invoice_number) ||
                job?.quoted_invoice_status === "converted"
              const sent = invoiceStatus === "sent" || Boolean(visit.invoice_sent_at)
              const paid = invoiceStatus === "paid" || Boolean(visit.invoice_paid_at)
              const hasError = invoiceStatus === "error"
              const invoiceAmount = formatCurrency(visit.invoice_amount)
              const missingProperty = !property?.id
              const missingInvoiceMethod = !job?.invoice_method
              const missingHours = !visit.hours_worked || Number(visit.hours_worked) <= 0
              const hasGreenwaste = Number(visit.greenwaste_bags || 0) > 0
              const hoursWorked = Number(visit.hours_worked || 0)
              const greenwasteBags = Number(visit.greenwaste_bags || 0)
              const hourlyRate = Number(property?.hourly_rate || 0)
              const greenwasteRate = Number(property?.greenwaste_rate || 0)
              const missingLabourRate = hoursWorked > 0 && hourlyRate <= 0
              const missingGreenwasteRate = greenwasteBags > 0 && greenwasteRate <= 0
              const labourTotal = missingLabourRate ? null : hoursWorked * hourlyRate
              const greenwasteTotal = missingGreenwasteRate
                ? null
                : greenwasteBags * greenwasteRate
              const extraChargeTotal = visitExtraCharges.reduce((total, charge) => {
                return total + getChargeLineTotal(charge)
              }, 0)
              const miscCharges = visitExtraCharges.filter(
                (charge) =>
                  charge.item_code === "MISC-REVIEW" ||
                  charge.invoice_status === "review"
              )
              const regularExtraCharges = visitExtraCharges.filter(
                (charge) => !miscCharges.includes(charge)
              )
              const canCalculateTotalPreview =
                !missingLabourRate && !missingGreenwasteRate
              const invoiceTotalPreview = canCalculateTotalPreview
                ? Number(labourTotal || 0) +
                  Number(greenwasteTotal || 0) +
                  extraChargeTotal
                : null

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
                        <span>Invoice method: {job?.invoice_method || "Missing"}</span>
                        <span>Status: {invoiceStatus}</span>
                        <span>Ready: {ready ? "Yes" : "No"}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-start gap-2 lg:justify-end">
                      <StageChip
                        label="Ready"
                        active={ready}
                        tone={invoiceStatusClasses("ready")}
                      />
                      <StageChip
                        label="Processing"
                        active={processing}
                        tone={invoiceStatusClasses("processing")}
                      />
                      <StageChip
                        label="Draft Created"
                        active={draftCreated}
                        tone={invoiceStatusClasses("draft")}
                      />
                      <StageChip
                        label="Sent"
                        active={sent}
                        tone={invoiceStatusClasses("sent")}
                      />
                      <StageChip
                        label="Paid"
                        active={paid}
                        tone={invoiceStatusClasses("paid")}
                      />
                      <StageChip
                        label="Error"
                        active={hasError}
                        tone={invoiceStatusClasses("error")}
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {missingProperty && (
                      <WarningBadge tone="red">No property linked</WarningBadge>
                    )}
                    {missingInvoiceMethod && (
                      <WarningBadge tone="red">Missing invoice method</WarningBadge>
                    )}
                    {missingHours && (
                      <WarningBadge tone="red">Missing or zero hours</WarningBadge>
                    )}
                    {missingLabourRate && (
                      <WarningBadge tone="red">Missing labour rate</WarningBadge>
                    )}
                    {missingGreenwasteRate && (
                      <WarningBadge tone="red">Missing greenwaste rate</WarningBadge>
                    )}
                    {hasGreenwaste && (
                      <WarningBadge tone="blue">Greenwaste recorded</WarningBadge>
                    )}
                    {hasExtraCharges && (
                      <WarningBadge tone="blue">Extra charges recorded</WarningBadge>
                    )}
                    {invoiceStatus === "error" && (
                      <WarningBadge tone="red">Invoice error</WarningBadge>
                    )}
                    {invoiceStatus === "processing" && (
                      <WarningBadge>Invoice processing</WarningBadge>
                    )}
                    {!ready && (
                      <WarningBadge tone="gray">Not ready for invoice</WarningBadge>
                    )}
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
                    {visit.xero_invoice_number && (
                      <span className="rounded-full bg-blue-100 px-2 py-1 text-blue-800">
                        Invoice {visit.xero_invoice_number}
                      </span>
                    )}
                    {invoiceAmount && (
                      <span className="rounded-full bg-green-100 px-2 py-1 text-green-800">
                        {invoiceAmount}
                      </span>
                    )}
                    {hasExtraCharges && (
                      <span className="rounded-full bg-blue-100 px-2 py-1 text-blue-800">
                        Extras {formatCurrency(extraChargeTotal)}
                      </span>
                    )}
                  </div>

                  {hasError && visit.invoice_error && (
                    <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      {visit.invoice_error}
                    </div>
                  )}

                  {invoiceHandlingNote && (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <div className="mb-1 font-medium">Invoice handling note</div>
                      {invoiceHandlingNote}
                    </div>
                  )}

                  {invoiceNote && (
                    <div className="mt-3 rounded-md border bg-gray-50 p-3 text-sm text-gray-700">
                      <div className="mb-1 font-medium">Invoice note</div>
                      {invoiceNote}
                    </div>
                  )}

                  {visit.work_notes && (
                    <div className="mt-3 line-clamp-3 rounded-md bg-gray-50 p-3 text-sm text-gray-700">
                      {visit.work_notes}
                    </div>
                  )}

                  <div className="mt-4 rounded-lg border bg-gray-50 p-4">
                    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
                      <div>
                        <h4 className="font-semibold text-gray-900">
                          Billable Breakdown
                        </h4>

                        <div className="mt-3 overflow-x-auto rounded-md border bg-white">
                          <table className="w-full border-collapse text-left text-sm">
                            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                              <tr>
                                <th className="px-3 py-2">Item</th>
                                <th className="px-3 py-2 text-right">Qty</th>
                                <th className="px-3 py-2 text-right">Rate</th>
                                <th className="px-3 py-2 text-right">Value</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-b">
                                <td className="px-3 py-3">
                                  <div className="font-medium text-gray-900">
                                    Labour
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    Visit hours worked
                                  </div>
                                </td>
                                <td className="px-3 py-3 text-right">
                                  {hoursWorked}h
                                </td>
                                <td className="px-3 py-3 text-right">
                                  {hourlyRate > 0
                                    ? formatCurrency(hourlyRate)
                                    : "Missing"}
                                </td>
                                <td className="px-3 py-3 text-right font-medium">
                                  {labourTotal === null
                                    ? "Not calculated"
                                    : formatCurrency(labourTotal)}
                                </td>
                              </tr>

                              <tr className="border-b">
                                <td className="px-3 py-3">
                                  <div className="font-medium text-gray-900">
                                    Greenwaste
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    Bags recorded on visit
                                  </div>
                                </td>
                                <td className="px-3 py-3 text-right">
                                  {greenwasteBags} bags
                                </td>
                                <td className="px-3 py-3 text-right">
                                  {greenwasteRate > 0
                                    ? formatCurrency(greenwasteRate)
                                    : greenwasteBags > 0
                                      ? "Missing"
                                      : formatCurrency(0)}
                                </td>
                                <td className="px-3 py-3 text-right font-medium">
                                  {greenwasteTotal === null
                                    ? "Greenwaste price not calculated"
                                    : formatCurrency(greenwasteTotal)}
                                </td>
                              </tr>

                              {regularExtraCharges.map((charge) => {
                                const quantity = Number(charge.quantity || 0)
                                const unitPrice = Number(charge.unit_price || 0)
                                const lineTotal = getChargeLineTotal(charge)

                                return (
                                  <tr key={charge.id} className="border-b">
                                    <td className="px-3 py-3">
                                      <div className="font-medium text-gray-900">
                                        {getChargeLabel(charge)}
                                      </div>
                                      {charge.invoice_description &&
                                        charge.invoice_description !== getChargeLabel(charge) && (
                                          <div className="text-xs text-gray-500">
                                            {charge.invoice_description}
                                          </div>
                                        )}
                                      {charge.notes && (
                                        <div className="text-xs text-gray-500">
                                          {charge.notes}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-3 py-3 text-right">
                                      {quantity}
                                    </td>
                                    <td className="px-3 py-3 text-right">
                                      {formatCurrency(unitPrice)}
                                    </td>
                                    <td className="px-3 py-3 text-right font-medium">
                                      {formatCurrency(lineTotal)}
                                    </td>
                                  </tr>
                                )
                              })}

                              {miscCharges.map((charge) => {
                                const quantity = Number(charge.quantity || 0)
                                const unitPrice = Number(charge.unit_price || 0)
                                const lineTotal = getChargeLineTotal(charge)

                                return (
                                  <tr key={charge.id} className="border-b bg-amber-50/60">
                                    <td className="px-3 py-3">
                                      <div className="font-medium text-gray-900">
                                        {charge.invoice_description ||
                                          charge.notes ||
                                          "Misc charge"}
                                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                                          Review
                                        </span>
                                      </div>
                                      {charge.notes && (
                                        <div className="mt-1 text-xs text-gray-600">
                                          {charge.notes}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-3 py-3 text-right">
                                      {quantity}
                                    </td>
                                    <td className="px-3 py-3 text-right">
                                      {formatCurrency(unitPrice)}
                                    </td>
                                    <td className="px-3 py-3 text-right font-medium">
                                      {formatCurrency(lineTotal)}
                                    </td>
                                  </tr>
                                )
                              })}

                              {visitExtraCharges.length === 0 && (
                                <tr>
                                  <td
                                    colSpan={4}
                                    className="px-3 py-3 text-sm text-gray-500"
                                  >
                                    No extra or misc charges recorded.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="rounded-lg border bg-white p-4">
                        <h4 className="font-semibold text-gray-900">
                          Invoice Total Preview
                        </h4>

                        {canCalculateTotalPreview ? (
                          <div className="mt-3">
                            <div className="text-3xl font-bold text-gray-900">
                              {formatCurrency(invoiceTotalPreview)}
                            </div>
                            <div className="mt-2 space-y-1 text-sm text-gray-600">
                              <div className="flex justify-between gap-3">
                                <span>Labour</span>
                                <span>{formatCurrency(labourTotal || 0)}</span>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span>Greenwaste</span>
                                <span>{formatCurrency(greenwasteTotal || 0)}</span>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span>Extras / misc</span>
                                <span>{formatCurrency(extraChargeTotal)}</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                            <div className="font-semibold">
                              Total preview incomplete
                            </div>
                            <div className="mt-1">
                              {[
                                missingLabourRate ? "labour rate" : null,
                                missingGreenwasteRate ? "greenwaste rate" : null,
                              ]
                                .filter(Boolean)
                                .join(" and ")}{" "}
                              missing.
                            </div>
                          </div>
                        )}

                        {visit.invoice_amount !== null &&
                          visit.invoice_amount !== undefined && (
                            <div className="mt-3 rounded-md bg-green-50 p-2 text-xs text-green-800">
                              Stored invoice amount:{" "}
                              {formatCurrency(visit.invoice_amount)}
                            </div>
                          )}
                      </div>

                      {(visit.work_notes ||
                        invoiceNote ||
                        job?.quoted_scope ||
                        job?.quoted_materials) && (
                        <div className="rounded-md bg-white p-3 lg:col-span-2">
                          <div className="mb-2 font-medium text-gray-900">
                            Work / Invoice Notes
                          </div>
                          <div className="space-y-3 whitespace-pre-wrap text-sm text-gray-700">
                            {invoiceNote && (
                              <div>
                                <div className="text-xs font-medium uppercase text-gray-500">
                                  Invoice note
                                </div>
                                {invoiceNote}
                              </div>
                            )}
                            {visit.work_notes && (
                              <div>
                                <div className="text-xs font-medium uppercase text-gray-500">
                                  Work notes
                                </div>
                                {visit.work_notes}
                              </div>
                            )}
                            {job?.quoted_scope && (
                              <div>
                                <div className="text-xs font-medium uppercase text-gray-500">
                                  Scheduled job scope
                                </div>
                                {job.quoted_scope}
                              </div>
                            )}
                            {job?.quoted_materials && (
                              <div>
                                <div className="text-xs font-medium uppercase text-gray-500">
                                  Included materials
                                </div>
                                {job.quoted_materials}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex flex-wrap gap-3">
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

                      <form action={excludeVisitFromInvoicing} className="flex flex-wrap gap-2">
                        <input type="hidden" name="visitId" value={visit.id} />
                        <input
                          name="invoiceNote"
                          className="h-9 rounded-md border px-3 text-sm"
                          placeholder="Reason for exclusion"
                          defaultValue={visit.invoice_note || ""}
                        />
                        <button
                          type="submit"
                          className="h-9 rounded-md border px-3 text-sm font-medium hover:bg-gray-50"
                        >
                        Exclude
                      </button>
                      </form>

                      <form action={markVisitNotReady}>
                        <input type="hidden" name="visitId" value={visit.id} />
                        <button
                          type="submit"
                          className="h-9 rounded-md border px-3 text-sm font-medium hover:bg-gray-50"
                        >
                          Mark Not Ready
                        </button>
                      </form>

                      {(invoiceStatus === "error" || invoiceStatus === "processing") && (
                        <form action={resetInvoiceStatusToReady}>
                          <input type="hidden" name="visitId" value={visit.id} />
                          <button
                            type="submit"
                            className="h-9 rounded-md border border-amber-200 bg-amber-50 px-3 text-sm font-medium text-amber-900 hover:bg-amber-100"
                          >
                            Reset to Ready
                          </button>
                        </form>
                      )}
                    </div>
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

      <section className="mb-8 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Excluded</h2>
        <p className="mb-4 text-sm text-gray-500">
          Visits intentionally excluded from invoice creation.
        </p>

        {excludedError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Error loading excluded visits: {excludedError.message}
          </div>
        ) : excludedVisits && excludedVisits.length > 0 ? (
          <div className="space-y-3">
            {(excludedVisits as InvoiceVisit[]).map((visit) => {
              const job = firstOrValue(visit.scheduled_jobs)
              const property =
                firstOrValue(job?.properties) || firstOrValue(visit.properties)
              const address = getPropertyAddress(property)

              return (
                <article key={visit.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {getPropertyLabel(property)}
                      </h3>
                      {address && (
                        <p className="mt-1 text-sm text-gray-500">{address}</p>
                      )}
                      <div className="mt-2 text-xs text-gray-600">
                        Visit: {formatDate(visit.visit_date || job?.scheduled_date)}
                      </div>
                    </div>

                    <StageChip
                      label="Excluded"
                      active
                      tone={invoiceStatusClasses("excluded")}
                    />
                  </div>

                  {property?.invoice_handling_note && (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <div className="mb-1 font-medium">Invoice handling note</div>
                      {property.invoice_handling_note}
                    </div>
                  )}

                  {visit.invoice_note && (
                    <div className="mt-3 rounded-md border bg-gray-50 p-3 text-sm text-gray-700">
                      <div className="mb-1 font-medium">Invoice note</div>
                      {visit.invoice_note}
                    </div>
                  )}

                  {job?.id && (
                    <Link
                      href={`/jobs/${job.id}`}
                      className="mt-4 inline-flex rounded-md border px-3 py-2 text-sm font-medium hover:bg-gray-50"
                    >
                      Open Job
                    </Link>
                  )}
                </article>
              )
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-sm text-gray-500">
            No excluded visits.
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-gray-50 p-4 text-sm text-gray-600">
        <h2 className="mb-2 font-semibold text-gray-900">Tracking Notes</h2>
        <p>
          TODO: Add explicit invoice draft, sent, paid, and Xero invoice ID fields
          when invoice creation is wired. Current tracking is limited to
          Supabase visit invoice fields and scheduled job quote metadata.
        </p>
      </section>
    </div>
  )
}
