import Link from "next/link"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import {
  type CostCaptureStatus,
  getCostCaptureIssueLabels,
  getCostCaptureStatus,
} from "@/lib/cost-capture"
import { isQuotedJob, readyInvoiceStatusForVisit } from "@/lib/quoted-invoicing"

export const dynamic = "force-dynamic"
const DEFAULT_COST_CAPTURE_START_DATE = "2026-06-10"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

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
  properties?: PropertySummary | PropertySummary[] | null
}

type VisitRow = {
  id: string
  scheduled_job_id?: string | null
  property_id?: string | null
  visit_date?: string | null
  hours_worked?: number | string | null
  greenwaste_bags?: number | string | null
  work_notes?: string | null
  ready_for_invoice?: boolean | null
  invoice_status?: string | null
  xero_invoice_number?: string | null
  invoice_amount?: number | string | null
  materials_review_note?: string | null
  cost_capture_reviewed_at?: string | null
  cost_capture_override_reason?: string | null
  scheduled_jobs?: ScheduledJobSummary | ScheduledJobSummary[] | null
  properties?: PropertySummary | PropertySummary[] | null
}

type VisitLabourEntry = {
  id: string
  visit_id: string
  scheduled_job_id?: string | null
  property_id?: string | null
  staff_member_id?: string | null
  staff_name?: string | null
  hours_worked?: number | string | null
  labour_type?: string | null
  notes?: string | null
}

type VisitExtraCharge = {
  id: string
  visit_id?: string | null
  item_code?: string | null
  staff_label?: string | null
  invoice_description?: string | null
  quantity?: number | string | null
  unit_price?: number | string | null
  unit_cost?: number | string | null
  unit_sell_price?: number | string | null
  total_cost?: number | string | null
  total_sell_price?: number | string | null
  billable_status?: string | null
  invoice_status?: string | null
  notes?: string | null
}

function firstOrValue<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function money(value: number) {
  return value.toLocaleString("en-NZ", {
    style: "currency",
    currency: "NZD",
  })
}

function percent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "-"
  return `${value.toFixed(1)}%`
}

function formatDate(value?: string | null) {
  if (!value) return "No date"

  return new Date(`${value}T12:00:00`).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function getPropertyLabel(visit: VisitRow) {
  const job = firstOrValue(visit.scheduled_jobs)
  const property = firstOrValue(job?.properties) || firstOrValue(visit.properties)

  return (
    property?.client_name ||
    property?.property_code ||
    [property?.address_line_1, property?.suburb].filter(Boolean).join(", ") ||
    "No property"
  )
}

function getLabourRate(staffName?: string | null) {
  const name = String(staffName || "").trim().toLowerCase()

  if (name.includes("fletcher") || name.includes("fletch")) return 43
  if (name.includes("hugh")) return 39
  if (name.includes("charles")) return 39
  if (name.includes("alex")) return 35

  return 39
}

function getExtraCost(charge: VisitExtraCharge) {
  if (charge.total_cost !== null && charge.total_cost !== undefined) {
    return Number(charge.total_cost || 0)
  }

  return Number(charge.quantity || 0) * Number(charge.unit_cost || 0)
}

function getExtraSell(charge: VisitExtraCharge) {
  if (charge.total_sell_price !== null && charge.total_sell_price !== undefined) {
    return Number(charge.total_sell_price || 0)
  }

  const unitSell = charge.unit_sell_price ?? charge.unit_price ?? 0
  return Number(charge.quantity || 0) * Number(unitSell || 0)
}

function issueBadgeClasses(issue: string) {
  if (issue.includes("sent") || issue.includes("ready")) {
    return "border-red-200 bg-red-50 text-red-800"
  }

  return "border-amber-200 bg-amber-50 text-amber-800"
}

function statusLabel(status: CostCaptureStatus) {
  const labels: Record<CostCaptureStatus, string> = {
    complete: "Complete",
    missing_labour: "Missing labour",
    labour_mismatch: "Labour mismatch",
    missing_material_review: "Missing material review",
    ready_for_invoice_with_warnings: "Ready with warnings",
  }

  return labels[status]
}

function statusClasses(status: CostCaptureStatus) {
  if (status === "complete") return "border-green-200 bg-green-50 text-green-800"
  if (status === "ready_for_invoice_with_warnings") {
    return "border-red-200 bg-red-50 text-red-800"
  }

  return "border-amber-200 bg-amber-50 text-amber-800"
}

async function syncVisitHoursFromLabour(
  supabase: SupabaseServerClient,
  visitId: string
) {
  const { data } = await supabase
    .from("visit_labour_entries")
    .select("hours_worked")
    .eq("visit_id", visitId)

  const derivedHours = (data || []).reduce(
    (total, entry) => total + Number(entry.hours_worked || 0),
    0
  )

  if (derivedHours > 0) {
    await supabase
      .from("visits")
      .update({ hours_worked: derivedHours })
      .eq("id", visitId)
  }
}

async function updateVisitLabourEntry(formData: FormData) {
  "use server"

  const supabase = await createClient()
  const entryId = String(formData.get("entryId") || "")
  const visitId = String(formData.get("visitId") || "")
  const staffName = String(formData.get("staffName") || "").trim()
  const hoursWorked = Number(formData.get("hoursWorked") || 0)
  const labourType = String(formData.get("labourType") || "other")
  const notes = String(formData.get("notes") || "").trim()

  if (!entryId || !visitId || !staffName || hoursWorked <= 0) return

  await supabase
    .from("visit_labour_entries")
    .update({
      staff_name: staffName,
      hours_worked: hoursWorked,
      labour_type: labourType,
      notes: notes || null,
    })
    .eq("id", entryId)

  await syncVisitHoursFromLabour(supabase, visitId)
  revalidatePath("/admin/cost-capture")
  revalidatePath("/admin/invoices")
}

async function addVisitLabourEntry(formData: FormData) {
  "use server"

  const supabase = await createClient()
  const visitId = String(formData.get("visitId") || "")
  const scheduledJobId = String(formData.get("scheduledJobId") || "") || null
  const propertyId = String(formData.get("propertyId") || "") || null
  const staffName = String(formData.get("staffName") || "").trim()
  const hoursWorked = Number(formData.get("hoursWorked") || 0)
  const labourType = String(formData.get("labourType") || "primary")
  const notes = String(formData.get("notes") || "").trim()

  if (!visitId || !staffName || hoursWorked <= 0) return

  await supabase.from("visit_labour_entries").insert({
    visit_id: visitId,
    scheduled_job_id: scheduledJobId,
    property_id: propertyId,
    staff_name: staffName,
    hours_worked: hoursWorked,
    labour_type: labourType,
    notes: notes || null,
  })

  await syncVisitHoursFromLabour(supabase, visitId)
  revalidatePath("/admin/cost-capture")
  revalidatePath("/admin/invoices")
}

async function addVisitMaterialCost(formData: FormData) {
  "use server"

  const supabase = await createClient()
  const visitId = String(formData.get("visitId") || "")
  const scheduledJobId = String(formData.get("scheduledJobId") || "") || null
  const propertyId = String(formData.get("propertyId") || "") || null
  const category = String(formData.get("category") || "other")
  const description = String(formData.get("description") || "").trim()
  const quantity = Number(formData.get("quantity") || 0)
  const unitCost = Number(formData.get("unitCost") || 0)
  const unitSellPrice = Number(formData.get("unitSellPrice") || 0)
  const billableStatus = String(formData.get("billableStatus") || "needs_review")

  if (!visitId || !description || quantity <= 0) return

  // Quoted jobs are invoiced once from the quote, never per visit — exclude any
  // extra charges too so they can't leak into a per-visit invoice.
  const quoted = await isQuotedJob(supabase, scheduledJobId)
  const invoiceStatus = quoted
    ? "excluded"
    : billableStatus === "needs_review"
      ? "review"
      : "ready"

  await supabase.from("visit_extra_charges").insert({
    visit_id: visitId,
    scheduled_job_id: scheduledJobId,
    property_id: propertyId,
    category,
    item_code: category.toUpperCase(),
    staff_label: description,
    invoice_description: description,
    quantity,
    unit_cost: unitCost,
    unit_sell_price: unitSellPrice,
    unit_price: unitSellPrice,
    total_cost: quantity * unitCost,
    total_sell_price: quantity * unitSellPrice,
    billable_status: billableStatus,
    invoice_status: invoiceStatus,
  })

  revalidatePath("/admin/cost-capture")
  revalidatePath("/admin/invoices")
}

async function markMaterialReviewComplete(formData: FormData) {
  "use server"

  const supabase = await createClient()
  const visitId = String(formData.get("visitId") || "")
  const overrideReason = String(formData.get("overrideReason") || "").trim()

  if (!visitId) return

  await supabase
    .from("visits")
    .update({
      cost_capture_reviewed_at: new Date().toISOString(),
      cost_capture_reviewed_by: "admin",
      cost_capture_override_reason: overrideReason || null,
    })
    .eq("id", visitId)

  revalidatePath("/admin/cost-capture")
  revalidatePath("/admin/invoices")
}

async function markReadyForInvoice(formData: FormData) {
  "use server"

  const supabase = await createClient()
  const visitId = String(formData.get("visitId") || "")
  const overrideReason = String(formData.get("overrideReason") || "").trim()

  if (!visitId) return

  // Quoted jobs are invoiced once from the quote, never per visit — exclude instead.
  const invoiceStatus = await readyInvoiceStatusForVisit(supabase, visitId)

  await supabase
    .from("visits")
    .update({
      ready_for_invoice: true,
      invoice_status: invoiceStatus,
      cost_capture_override_reason: overrideReason || null,
    })
    .eq("id", visitId)

  revalidatePath("/admin/cost-capture")
  revalidatePath("/admin/invoices")
}

async function backfillFallbackVisitLabour() {
  "use server"

  const supabase = await createClient()
  const { data: visits } = await supabase
    .from("visits")
    .select("id, scheduled_job_id, property_id, hours_worked")
    .eq("completion_status", "completed")
    .gte("visit_date", "2026-05-13")
    .gt("hours_worked", 0)

  const candidateVisits = visits || []
  const visitIds = candidateVisits.map((visit) => visit.id)

  if (visitIds.length === 0) return

  const { data: existingLabour } = await supabase
    .from("visit_labour_entries")
    .select("visit_id")
    .in("visit_id", visitIds)

  const visitsWithLabour = new Set((existingLabour || []).map((entry) => entry.visit_id))
  const fallbackRows = candidateVisits
    .filter((visit) => !visitsWithLabour.has(visit.id))
    .map((visit) => ({
      visit_id: visit.id,
      scheduled_job_id: visit.scheduled_job_id || null,
      property_id: visit.property_id || null,
      staff_name: "Unknown",
      hours_worked: Number(visit.hours_worked || 0),
      labour_type: "fallback_backfill",
      notes:
        "Created from visits.hours_worked during cost capture backfill",
    }))

  if (fallbackRows.length > 0) {
    await supabase.from("visit_labour_entries").insert(fallbackRows)
  }

  revalidatePath("/admin/cost-capture")
  revalidatePath("/admin/invoices")
}

export default async function AdminCostCapturePage({
  searchParams,
}: {
  searchParams?: Promise<{ start?: string; end?: string; older?: string }> | {
    start?: string
    end?: string
    older?: string
  }
}) {
  const params = await Promise.resolve(searchParams || {})
  const includeOlderVisits = params.older === "1"
  const startDate = includeOlderVisits
    ? params.start || ""
    : params.start || DEFAULT_COST_CAPTURE_START_DATE
  const endDate = params.end || ""
  const filterQuery = new URLSearchParams()

  if (startDate) filterQuery.set("start", startDate)
  if (endDate) filterQuery.set("end", endDate)
  if (includeOlderVisits) filterQuery.set("older", "1")

  const supabase = await createClient()

  const visitSelectBase = `
    id,
    scheduled_job_id,
    property_id,
    visit_date,
    hours_worked,
    greenwaste_bags,
    work_notes,
    ready_for_invoice,
    invoice_status,
    xero_invoice_number,
    invoice_amount,
    cost_capture_reviewed_at,
    scheduled_jobs (
      id,
      scheduled_date,
      status,
      job_type,
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
  `
  const visitSelectWithOptionalColumns = `
    id,
    scheduled_job_id,
    property_id,
    visit_date,
    hours_worked,
    greenwaste_bags,
    work_notes,
    ready_for_invoice,
    invoice_status,
    xero_invoice_number,
    invoice_amount,
    materials_review_note,
    cost_capture_reviewed_at,
    cost_capture_override_reason,
    scheduled_jobs (
      id,
      scheduled_date,
      status,
      job_type,
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
  `

  let visitsQuery = supabase
    .from("visits")
    .select(visitSelectWithOptionalColumns)

  if (startDate) visitsQuery = visitsQuery.gte("visit_date", startDate)
  if (endDate) visitsQuery = visitsQuery.lte("visit_date", endDate)

  let visitsResult: {
    data: unknown[] | null
    error: { message: string } | null
  } = await visitsQuery
    .order("visit_date", { ascending: false })
    .limit(200)

  if (
    visitsResult.error &&
    (visitsResult.error.message.includes("materials_review_note") ||
      visitsResult.error.message.includes("cost_capture_override_reason"))
  ) {
    let fallbackVisitsQuery = supabase
      .from("visits")
      .select(visitSelectBase)

    if (startDate) fallbackVisitsQuery = fallbackVisitsQuery.gte("visit_date", startDate)
    if (endDate) fallbackVisitsQuery = fallbackVisitsQuery.lte("visit_date", endDate)

    visitsResult = await fallbackVisitsQuery
      .order("visit_date", { ascending: false })
      .limit(200)
  }

  const visits = visitsResult.data
  const visitsError = visitsResult.error
  const visitRows = (visits || []) as VisitRow[]
  const visitIds = visitRows.map((visit) => visit.id)

  const { data: labourEntries, error: labourError } =
    visitIds.length > 0
      ? await supabase
          .from("visit_labour_entries")
          .select(`
            id,
            visit_id,
            scheduled_job_id,
            property_id,
            staff_member_id,
            staff_name,
            hours_worked,
            labour_type,
            notes
          `)
          .in("visit_id", visitIds)
      : { data: [], error: null }

  let extraCharges: VisitExtraCharge[] = []
  let extrasErrorMessage: string | null = null

  if (visitIds.length > 0) {
    const fullExtras = await supabase
      .from("visit_extra_charges")
      .select(`
        id,
        visit_id,
        item_code,
        staff_label,
        invoice_description,
        quantity,
        unit_price,
        unit_cost,
        unit_sell_price,
        total_cost,
        total_sell_price,
        billable_status,
        invoice_status,
        notes
      `)
      .in("visit_id", visitIds)

    if (fullExtras.error) {
      const fallbackExtras = await supabase
        .from("visit_extra_charges")
        .select(`
          id,
          visit_id,
          item_code,
          staff_label,
          invoice_description,
          quantity,
          unit_price,
          invoice_status,
          notes
        `)
        .in("visit_id", visitIds)

      extraCharges = ((fallbackExtras.data || []) as VisitExtraCharge[])
      extrasErrorMessage = fallbackExtras.error?.message || fullExtras.error.message
    } else {
      extraCharges = (fullExtras.data || []) as VisitExtraCharge[]
    }
  }

  const labourByVisit = ((labourEntries || []) as VisitLabourEntry[]).reduce<
    Record<string, VisitLabourEntry[]>
  >((grouped, entry) => {
    grouped[entry.visit_id] = [...(grouped[entry.visit_id] || []), entry]
    return grouped
  }, {})

  const extrasByVisit = extraCharges.reduce<Record<string, VisitExtraCharge[]>>(
    (grouped, charge) => {
      if (!charge.visit_id) return grouped
      grouped[charge.visit_id] = [...(grouped[charge.visit_id] || []), charge]
      return grouped
    },
    {}
  )

  const costRows = visitRows.map((visit) => {
    const labour = labourByVisit[visit.id] || []
    const extras = extrasByVisit[visit.id] || []
    const visitHours = Number(visit.hours_worked || 0)
    const labourHours = labour.reduce(
      (total, entry) => total + Number(entry.hours_worked || 0),
      0
    )
    const labourCost = labour.reduce((total, entry) => {
      return total + Number(entry.hours_worked || 0) * getLabourRate(entry.staff_name)
    }, 0)
    const materialCost = extras.reduce((total, charge) => total + getExtraCost(charge), 0)
    const materialSell = extras.reduce((total, charge) => total + getExtraSell(charge), 0)
    const materialReviewRequired =
      Boolean(visit.materials_review_note?.trim()) ||
      extras.some((charge) => charge.billable_status === "needs_review")
    const invoiceAmount = Number(visit.invoice_amount || 0)
    const revenue = invoiceAmount > 0 ? invoiceAmount : materialSell
    const cogs = labourCost + materialCost
    const grossProfit = revenue - cogs
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : null
    const marginPerHour = visitHours > 0 ? grossProfit / visitHours : null
    const invoiceStatus = String(visit.invoice_status || "")
    const costCaptureInput = {
      readyForInvoice: visit.ready_for_invoice,
      visitHours,
      labourCount: labour.length,
      labourHours,
      materialReviewRequired,
      materialReviewed: Boolean(visit.cost_capture_reviewed_at),
      hasWorkNotes: Boolean(visit.work_notes?.trim()),
      invoiceStatus,
      hasXeroInvoice: Boolean(visit.xero_invoice_number),
    }
    const issues = getCostCaptureIssueLabels(costCaptureInput)
    const status = getCostCaptureStatus({
      ...costCaptureInput,
    })

    return {
      visit,
      labour,
      extras,
      status,
      visitHours,
      labourHours,
      labourCost,
      materialCost,
      cogs,
      revenue,
      grossProfit,
      grossMargin,
      marginPerHour,
      issues,
    }
  })

  const reviewRows = costRows
    .filter((row) => row.issues.length > 0)
    .slice(0, 30)

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-950">
            Cost Capture Review
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            Review completed visits for reliable labour, materials and back-costing
            data before relying on margin reporting.
          </p>
          <p className="mt-2 text-xs font-medium text-gray-500">
            {includeOlderVisits
              ? "Showing older visits too."
              : "Showing visits from 10 Jun 2026 onward."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/cost-capture/export${filterQuery.toString() ? `?${filterQuery.toString()}` : ""}`}
            className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Export CSV
          </Link>
          <form action={backfillFallbackVisitLabour}>
            <button
              type="submit"
              className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Backfill Missing Labour
            </button>
          </form>
        </div>
      </header>

      <form className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-gray-700">Start date</span>
            <input
              type="date"
              name="start"
              defaultValue={startDate}
              className="h-10 rounded-md border px-3"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-gray-700">End date</span>
            <input
              type="date"
              name="end"
              defaultValue={endDate}
              className="h-10 rounded-md border px-3"
            />
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="older"
              value="1"
              defaultChecked={includeOlderVisits}
            />
            Include older visits
          </label>
          <button
            type="submit"
            className="h-10 self-end rounded-md bg-gray-900 px-4 text-sm font-medium text-white"
          >
            Apply
          </button>
        </div>
      </form>

      {(visitsError || labourError || extrasErrorMessage) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {visitsError?.message ||
            labourError?.message ||
            extrasErrorMessage ||
            "Some cost capture data could not be loaded."}
        </div>
      )}

      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs font-medium uppercase text-gray-500">
            Visits checked
          </div>
          <div className="mt-2 text-2xl font-semibold">{costRows.length}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs font-medium uppercase text-gray-500">
            Need review
          </div>
          <div className="mt-2 text-2xl font-semibold">{reviewRows.length}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs font-medium uppercase text-gray-500">
            Labour cost
          </div>
          <div className="mt-2 text-2xl font-semibold">
            {money(costRows.reduce((total, row) => total + row.labourCost, 0))}
          </div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs font-medium uppercase text-gray-500">
            Material cost
          </div>
          <div className="mt-2 text-2xl font-semibold">
            {money(costRows.reduce((total, row) => total + row.materialCost, 0))}
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Review Queue</h2>
            <p className="text-sm text-gray-500">
              Completed visits with missing or inconsistent back-cost data.
            </p>
          </div>
          <Link
            href="/admin/invoices"
            className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Open Invoices
          </Link>
        </div>

        {reviewRows.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {reviewRows.map((row) => (
              <article key={row.visit.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-950">
                      {getPropertyLabel(row.visit)}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Visit {formatDate(row.visit.visit_date)}
                    </p>
                  </div>
                  <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700">
                    {row.visit.invoice_status || "no invoice status"}
                  </span>
                  <span className={`rounded-full border px-2 py-1 text-xs font-medium ${statusClasses(row.status)}`}>
                    {statusLabel(row.status)}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {row.issues.map((issue) => (
                    <span
                      key={issue}
                      className={`rounded-full border px-2 py-1 text-xs font-medium ${issueBadgeClasses(issue)}`}
                    >
                      {issue}
                    </span>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase text-gray-500">Hours</div>
                    <div className="font-semibold text-gray-900">
                      {row.visitHours.toFixed(2)}h
                    </div>
                    <div className="text-xs text-gray-500">
                      Labour rows: {row.labourHours.toFixed(2)}h / {row.labour.length}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-gray-500">Labour cost</div>
                    <div className="font-semibold text-gray-900">
                      {money(row.labourCost)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-gray-500">
                      Material review
                    </div>
                    <div className="font-semibold text-gray-900">
                      {row.visit.cost_capture_reviewed_at
                        ? "Reviewed"
                        : "Needs review"}
                    </div>
                    <div className="text-xs text-gray-500">
                      Material rows: {row.extras.length}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-gray-500">
                      Invoice status
                    </div>
                    <div className="font-semibold text-gray-900">
                      {row.visit.invoice_status || "No status"}
                    </div>
                  </div>
                </div>

                {row.visit.materials_review_note && (
                  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <div className="mb-1 font-medium">Staff materials/admin note</div>
                    <div className="whitespace-pre-wrap">
                      {row.visit.materials_review_note}
                    </div>
                  </div>
                )}

                <details className="mt-4 rounded-lg border bg-gray-50 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-gray-900">
                    Admin fixes
                  </summary>
                  <div className="mt-4 space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900">
                      Labour correction
                    </h4>
                    <div className="mt-2 space-y-2">
                      {row.labour.map((entry) => (
                        <form
                          key={entry.id}
                          action={updateVisitLabourEntry}
                          className="grid gap-2 rounded-md bg-white p-2 sm:grid-cols-[1fr_90px_130px_auto]"
                        >
                          <input type="hidden" name="entryId" value={entry.id} />
                          <input type="hidden" name="visitId" value={row.visit.id} />
                          <input
                            name="staffName"
                            className="h-9 rounded-md border px-2 text-sm"
                            defaultValue={entry.staff_name || ""}
                            placeholder="Staff name"
                          />
                          <input
                            name="hoursWorked"
                            type="number"
                            min="0.01"
                            step="0.25"
                            className="h-9 rounded-md border px-2 text-sm"
                            defaultValue={entry.hours_worked || ""}
                            placeholder="Hours"
                          />
                          <select
                            name="labourType"
                            className="h-9 rounded-md border px-2 text-sm"
                            defaultValue={entry.labour_type || "other"}
                          >
                            <option value="primary">Primary</option>
                            <option value="helper">Helper</option>
                            <option value="extra">Extra</option>
                            <option value="travel">Travel</option>
                            <option value="admin">Admin</option>
                            <option value="fallback_backfill">Fallback backfill</option>
                            <option value="other">Other</option>
                          </select>
                          <button
                            type="submit"
                            className="h-9 rounded-md bg-gray-900 px-3 text-sm font-medium text-white"
                          >
                            Save
                          </button>
                          <textarea
                            name="notes"
                            className="min-h-16 rounded-md border px-2 py-1 text-sm sm:col-span-4"
                            defaultValue={entry.notes || ""}
                            placeholder="Labour note"
                          />
                        </form>
                      ))}

                      <form
                        action={addVisitLabourEntry}
                        className="grid gap-2 rounded-md border border-dashed bg-white p-2 sm:grid-cols-[1fr_90px_130px_auto]"
                      >
                        <input type="hidden" name="visitId" value={row.visit.id} />
                        <input
                          type="hidden"
                          name="scheduledJobId"
                          value={row.visit.scheduled_job_id || ""}
                        />
                        <input
                          type="hidden"
                          name="propertyId"
                          value={row.visit.property_id || ""}
                        />
                        <input
                          name="staffName"
                          className="h-9 rounded-md border px-2 text-sm"
                          placeholder={row.labour.length === 0 ? "Missing primary worker" : "Staff name"}
                        />
                        <input
                          name="hoursWorked"
                          type="number"
                          min="0.01"
                          step="0.25"
                          className="h-9 rounded-md border px-2 text-sm"
                          defaultValue={row.labour.length === 0 ? row.visitHours || "" : ""}
                          placeholder="Hours"
                        />
                        <select
                          name="labourType"
                          className="h-9 rounded-md border px-2 text-sm"
                          defaultValue={row.labour.length === 0 ? "primary" : "extra"}
                        >
                          <option value="primary">Primary</option>
                          <option value="helper">Helper</option>
                          <option value="extra">Extra</option>
                          <option value="travel">Travel</option>
                          <option value="admin">Admin</option>
                          <option value="other">Other</option>
                        </select>
                        <button
                          type="submit"
                          className="h-9 rounded-md border px-3 text-sm font-medium hover:bg-gray-50"
                        >
                          Add
                        </button>
                        <textarea
                          name="notes"
                          className="min-h-16 rounded-md border px-2 py-1 text-sm sm:col-span-4"
                          placeholder="Optional labour note"
                        />
                      </form>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-gray-900">
                      Material correction
                    </h4>
                    <form
                      action={addVisitMaterialCost}
                      className="mt-2 grid gap-2 rounded-md bg-white p-2 sm:grid-cols-2 lg:grid-cols-6"
                    >
                      <input type="hidden" name="visitId" value={row.visit.id} />
                      <input
                        type="hidden"
                        name="scheduledJobId"
                        value={row.visit.scheduled_job_id || ""}
                      />
                      <input
                        type="hidden"
                        name="propertyId"
                        value={row.visit.property_id || ""}
                      />
                      <select
                        name="category"
                        className="h-9 rounded-md border px-2 text-sm"
                        defaultValue="other"
                      >
                        <option value="green_waste">Green waste</option>
                        <option value="plants">Plants</option>
                        <option value="soil">Soil</option>
                        <option value="mulch">Mulch</option>
                        <option value="fertiliser">Fertiliser</option>
                        <option value="spray">Spray</option>
                        <option value="petrol">Petrol</option>
                        <option value="delivery">Delivery</option>
                        <option value="general_waste">General waste</option>
                        <option value="subcontractor">Subcontractor</option>
                        <option value="other">Other</option>
                      </select>
                      <input
                        name="description"
                        className="h-9 rounded-md border px-2 text-sm lg:col-span-2"
                        placeholder="Description"
                      />
                      <input
                        name="quantity"
                        type="number"
                        min="0.01"
                        step="0.01"
                        className="h-9 rounded-md border px-2 text-sm"
                        defaultValue="1"
                        placeholder="Qty"
                      />
                      <input
                        name="unitCost"
                        type="number"
                        min="0"
                        step="0.01"
                        className="h-9 rounded-md border px-2 text-sm"
                        placeholder="Unit cost"
                      />
                      <input
                        name="unitSellPrice"
                        type="number"
                        min="0"
                        step="0.01"
                        className="h-9 rounded-md border px-2 text-sm"
                        placeholder="Sell price"
                      />
                      <select
                        name="billableStatus"
                        className="h-9 rounded-md border px-2 text-sm"
                        defaultValue="needs_review"
                      >
                        <option value="needs_review">Needs review</option>
                        <option value="billable">Billable</option>
                        <option value="non_billable">Non-billable</option>
                      </select>
                      <button
                        type="submit"
                        className="h-9 rounded-md border px-3 text-sm font-medium hover:bg-gray-50 lg:col-span-5"
                      >
                        Add material cost
                      </button>
                    </form>

                    <form action={markMaterialReviewComplete} className="mt-2 grid gap-2">
                      <input type="hidden" name="visitId" value={row.visit.id} />
                      <textarea
                        name="overrideReason"
                        className="min-h-16 rounded-md border bg-white px-2 py-1 text-sm"
                        defaultValue={row.visit.cost_capture_override_reason || ""}
                        placeholder="Override / review note"
                      />
                      <button
                        type="submit"
                        className="w-fit rounded-md border px-3 py-2 text-sm font-medium hover:bg-gray-50"
                      >
                        Mark material review complete
                      </button>
                    </form>
                  </div>

                  <form action={markReadyForInvoice} className="grid gap-2">
                    <input type="hidden" name="visitId" value={row.visit.id} />
                    <textarea
                      name="overrideReason"
                      className="min-h-16 rounded-md border bg-white px-2 py-1 text-sm"
                      defaultValue={row.visit.cost_capture_override_reason || ""}
                      placeholder="Optional override reason before marking ready"
                    />
                    <button
                      type="submit"
                      className="w-fit rounded-md bg-green-700 px-3 py-2 text-sm font-medium text-white"
                    >
                      Mark ready for invoice
                    </button>
                  </form>
                  </div>
                </details>

                <div className="mt-4 flex flex-wrap gap-2">
                  {row.visit.scheduled_job_id && (
                    <Link
                      href={`/jobs/${row.visit.scheduled_job_id}`}
                      className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-gray-50"
                    >
                      Open Job
                    </Link>
                  )}
                  <Link
                    href="/admin/labour-reconciliation"
                    className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-gray-50"
                  >
                    Labour Reconciliation
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed bg-gray-50 p-4 text-sm text-gray-500">
            No cost capture issues found in the latest visits.
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Back-Costing Report</h2>
          <p className="text-sm text-gray-500">
            Labour rates: Fletcher $43/hr, Hugh $39/hr, Charles $39/hr, Alex
            $35/hr, fallback $39/hr.
          </p>
        </div>

        <div className="grid gap-3">
          {costRows.slice(0, 50).map((row) => (
            <article key={row.visit.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-gray-950">
                    {getPropertyLabel(row.visit)}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {formatDate(row.visit.visit_date)}
                    {row.visit.xero_invoice_number
                      ? ` - Invoice ${row.visit.xero_invoice_number}`
                      : ""}
                  </p>
                </div>
                <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700">
                  {row.issues.length > 0
                    ? `${row.issues.length} issue${row.issues.length === 1 ? "" : "s"}`
                    : "complete"}
                </span>
                <span className={`rounded-full border px-2 py-1 text-xs font-medium ${statusClasses(row.status)}`}>
                  {statusLabel(row.status)}
                </span>
              </div>

              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <div className="text-xs uppercase text-gray-500">Invoice amount</div>
                  <div className="font-semibold">{money(row.revenue)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-gray-500">Total hours</div>
                  <div className="font-semibold">{row.visitHours.toFixed(2)}h</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-gray-500">Labour cost</div>
                  <div className="font-semibold">{money(row.labourCost)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-gray-500">Material cost</div>
                  <div className="font-semibold">{money(row.materialCost)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-gray-500">COGS</div>
                  <div className="font-semibold">{money(row.cogs)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-gray-500">Gross profit</div>
                  <div className="font-semibold">{money(row.grossProfit)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-gray-500">GP margin</div>
                  <div className="font-semibold">{percent(row.grossMargin)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-gray-500">Margin/hr</div>
                  <div className="font-semibold">
                    {row.marginPerHour === null ? "-" : money(row.marginPerHour)}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
