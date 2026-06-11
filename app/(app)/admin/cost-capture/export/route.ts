import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"
const DEFAULT_COST_CAPTURE_START_DATE = "2026-06-10"

type VisitRow = {
  id: string
  scheduled_job_id?: string | null
  visit_date?: string | null
  hours_worked?: number | string | null
  invoice_amount?: number | string | null
  xero_invoice_number?: string | null
  scheduled_jobs?: {
    id?: string | null
    job_type?: string | null
    properties?: { client_name?: string | null } | { client_name?: string | null }[] | null
  } | {
    id?: string | null
    job_type?: string | null
    properties?: { client_name?: string | null } | { client_name?: string | null }[] | null
  }[] | null
}

type LabourEntry = {
  visit_id: string
  staff_name?: string | null
  hours_worked?: number | string | null
}

type ExtraCharge = {
  visit_id?: string | null
  quantity?: number | string | null
  unit_cost?: number | string | null
  unit_sell_price?: number | string | null
  unit_price?: number | string | null
  total_cost?: number | string | null
  total_sell_price?: number | string | null
}

function firstOrValue<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function csvValue(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

function getLabourRate(staffName?: string | null) {
  const name = String(staffName || "").trim().toLowerCase()

  if (name.includes("fletcher") || name.includes("fletch")) return 43
  if (name.includes("hugh")) return 39
  if (name.includes("charles")) return 39
  if (name.includes("alex")) return 35

  return 39
}

function getExtraCost(charge: ExtraCharge) {
  if (charge.total_cost !== null && charge.total_cost !== undefined) {
    return Number(charge.total_cost || 0)
  }

  return Number(charge.quantity || 0) * Number(charge.unit_cost || 0)
}

function getExtraSell(charge: ExtraCharge) {
  if (charge.total_sell_price !== null && charge.total_sell_price !== undefined) {
    return Number(charge.total_sell_price || 0)
  }

  const unitSell = charge.unit_sell_price ?? charge.unit_price ?? 0
  return Number(charge.quantity || 0) * Number(unitSell || 0)
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const includeOlderVisits = searchParams.get("older") === "1"
  const startDate = includeOlderVisits
    ? searchParams.get("start") || ""
    : searchParams.get("start") || DEFAULT_COST_CAPTURE_START_DATE
  const endDate = searchParams.get("end") || ""

  let visitsQuery = supabase
    .from("visits")
    .select(`
      id,
      scheduled_job_id,
      visit_date,
      hours_worked,
      invoice_amount,
      xero_invoice_number,
      scheduled_jobs (
        id,
        job_type,
        properties (
          client_name
        )
      )
    `)

  if (startDate) visitsQuery = visitsQuery.gte("visit_date", startDate)
  if (endDate) visitsQuery = visitsQuery.lte("visit_date", endDate)

  const { data: visits } = await visitsQuery
    .order("visit_date", { ascending: false })
    .limit(1000)

  const visitRows = (visits || []) as VisitRow[]
  const visitIds = visitRows.map((visit) => visit.id)

  const { data: labourEntries } =
    visitIds.length > 0
      ? await supabase
          .from("visit_labour_entries")
          .select("visit_id, staff_name, hours_worked")
          .in("visit_id", visitIds)
      : { data: [] }

  const { data: extraCharges } =
    visitIds.length > 0
      ? await supabase
          .from("visit_extra_charges")
          .select(`
            visit_id,
            quantity,
            unit_cost,
            unit_sell_price,
            unit_price,
            total_cost,
            total_sell_price
          `)
          .in("visit_id", visitIds)
      : { data: [] }

  const labourByVisit = ((labourEntries || []) as LabourEntry[]).reduce<
    Record<string, LabourEntry[]>
  >((grouped, entry) => {
    grouped[entry.visit_id] = [...(grouped[entry.visit_id] || []), entry]
    return grouped
  }, {})

  const extrasByVisit = ((extraCharges || []) as ExtraCharge[]).reduce<
    Record<string, ExtraCharge[]>
  >((grouped, charge) => {
    if (!charge.visit_id) return grouped
    grouped[charge.visit_id] = [...(grouped[charge.visit_id] || []), charge]
    return grouped
  }, {})

  const header = [
    "Invoice No",
    "Job No",
    "Date",
    "Labour Cost",
    "Material Cost",
    "COGS",
    "Sales Amount",
    "Gross Profit",
    "GPM%",
    "Job Type",
    "Hours Billed",
    "Margin Per Hour",
    "Lead Source",
  ]

  const rows = visitRows.map((visit) => {
    const job = firstOrValue(visit.scheduled_jobs)
    const labour = labourByVisit[visit.id] || []
    const extras = extrasByVisit[visit.id] || []
    const hours = Number(visit.hours_worked || 0)
    const labourCost = labour.reduce(
      (total, entry) =>
        total + Number(entry.hours_worked || 0) * getLabourRate(entry.staff_name),
      0
    )
    const materialCost = extras.reduce(
      (total, charge) => total + getExtraCost(charge),
      0
    )
    const materialSell = extras.reduce(
      (total, charge) => total + getExtraSell(charge),
      0
    )
    const salesAmount = Number(visit.invoice_amount || 0) || materialSell
    const cogs = labourCost + materialCost
    const grossProfit = salesAmount - cogs
    const gpm = salesAmount > 0 ? (grossProfit / salesAmount) * 100 : ""
    const marginPerHour = hours > 0 ? grossProfit / hours : ""

    return [
      visit.xero_invoice_number || "",
      job?.id || visit.scheduled_job_id || "",
      visit.visit_date || "",
      labourCost.toFixed(2),
      materialCost.toFixed(2),
      cogs.toFixed(2),
      salesAmount.toFixed(2),
      grossProfit.toFixed(2),
      typeof gpm === "number" ? gpm.toFixed(2) : "",
      job?.job_type || "",
      hours.toFixed(2),
      typeof marginPerHour === "number" ? marginPerHour.toFixed(2) : "",
      "",
    ]
  })

  const csv = [header, ...rows]
    .map((row) => row.map((value) => csvValue(value)).join(","))
    .join("\n")

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="cost-capture-export.csv"',
    },
  })
}
