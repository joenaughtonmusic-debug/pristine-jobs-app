import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import {
  classifyCommunication,
  isClosedCommunication,
} from "@/lib/communication-classification"

export const dynamic = "force-dynamic"

type PipelineCard = {
  stage: string
  title: string
  count: number
  href: string
  purpose: string
  nextAction: string
  opens: string
  urgent?: boolean
}

type VisitCountRow = {
  scheduled_jobs?:
    | {
        invoice_method?: string | null
      }
    | {
        invoice_method?: string | null
      }[]
    | null
}

type TimesheetRow = {
  staff_member_id: string
  work_date: string
  total_hours: number | string | null
  day_status?: string | null
}

type LabourEntryRow = {
  staff_member_id: string
  work_date: string
  hours_worked: number | string | null
}

type CommunicationCountRow = {
  id: string
  ignored?: boolean | null
  requires_action?: boolean | null
  status?: string | null
  direction: "inbound" | "outbound"
  source_category?: string | null
  category?: string | null
  subject?: string | null
  body?: string | null
  metadata?: Record<string, unknown> | string | null
}

function firstOrValue<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function toDateString(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function getMonday(date: Date) {
  const d = new Date(date)
  const day = d.getDay()
  const mondayOffset = (day + 6) % 7
  d.setDate(d.getDate() - mondayOffset)
  return d
}

function countLabourExceptions(
  timesheets: TimesheetRow[],
  labourEntries: LabourEntryRow[]
) {
  const timesheetByKey = new Map<string, TimesheetRow>()
  const entriesByKey = new Map<string, LabourEntryRow[]>()
  const keys = new Set<string>()

  timesheets.forEach((timesheet) => {
    const key = `${timesheet.staff_member_id}:${timesheet.work_date}`
    timesheetByKey.set(key, timesheet)
    keys.add(key)
  })

  labourEntries.forEach((entry) => {
    const key = `${entry.staff_member_id}:${entry.work_date}`
    const entries = entriesByKey.get(key) || []
    entries.push(entry)
    entriesByKey.set(key, entries)
    keys.add(key)
  })

  return Array.from(keys).filter((key) => {
    const timesheet = timesheetByKey.get(key)
    const entries = entriesByKey.get(key) || []
    const dailyHours =
      timesheet?.total_hours === null || timesheet?.total_hours === undefined
        ? null
        : Number(timesheet.total_hours)
    const jobHours = entries.reduce(
      (total, entry) => total + Number(entry.hours_worked || 0),
      0
    )

    const dayStatus = timesheet?.day_status || (timesheet ? "worked" : null)

    if (dayStatus && dayStatus !== "worked") return false
    if (dailyHours === null && jobHours > 0) return true
    if (dailyHours !== null && jobHours > dailyHours) return true
    if (dailyHours !== null && jobHours === 0) return true
    if (dailyHours !== null && dailyHours - jobHours > 1) return true

    return false
  }).length
}

function PipelineCard({ card }: { card: PipelineCard }) {
  const active = card.count > 0
  const classes =
    active && card.urgent
      ? "border-amber-300 bg-amber-50 hover:bg-amber-100"
      : active
        ? "border-blue-200 bg-blue-50 hover:bg-blue-100"
        : "border-gray-200 bg-white hover:bg-gray-50"
  const countClasses =
    active && card.urgent
      ? "text-amber-900"
      : active
        ? "text-blue-900"
        : "text-gray-500"

  return (
    <Link
      href={card.href}
      className={`block rounded-xl border p-5 shadow-sm transition ${classes}`}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        {card.stage}
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="mt-2">
          <h2 className="text-lg font-semibold text-gray-900">{card.title}</h2>
          <p className="mt-2 text-sm text-gray-600">{card.purpose}</p>
        </div>
        {active && card.urgent && (
          <span className="rounded-full bg-amber-200 px-2 py-1 text-xs font-medium text-amber-900">
            Attention
          </span>
        )}
      </div>

      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <div className={`text-4xl font-bold ${countClasses}`}>
            {card.count}
          </div>
          <div className="mt-1 text-xs text-gray-500">Current attention items</div>
        </div>
      </div>

      <div className="mt-5 space-y-2 border-t pt-4 text-sm">
        <p className="text-gray-700">
          <span className="font-medium text-gray-900">Next action:</span>{" "}
          {card.nextAction}
        </p>
        <p className="text-gray-500">
          Opens: <span className="font-medium text-gray-700">{card.opens}</span>
        </p>
      </div>
    </Link>
  )
}

export default async function AdminDashboardPage() {
  const supabase = await createClient()
  const today = new Date()
  const monday = getMonday(today)
  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)
  const startDate = toDateString(monday)
  const endDate = toDateString(friday)

  const [
    phoneEnquiriesResult,
    enquiriesAwaitingSchedulingResult,
    approvedQuoteRequestsResult,
    quotesReadyToSendResult,
    acceptedAwaitingConversionResult,
    convertedAwaitingScheduleResult,
    visitsReadyResult,
    communicationsResult,
    timesheetsResult,
    labourEntriesResult,
  ] = await Promise.all([
    supabase
      .from("admin_enquiries")
      .select("id")
      .neq("status", "archived")
      .limit(500),
    supabase
      .from("admin_enquiries")
      .select("id")
      .in("status", ["new", "needs_scheduling"])
      .limit(500),
    supabase
      .from("communications")
      .select("id")
      .eq("category", "quote_request")
      .eq("metadata->>estimate_action_approved", "true")
      .or(
        "metadata->>estimate_action_completed.is.null,metadata->>estimate_action_completed.neq.true"
      )
      .limit(500),
    supabase
      .from("quote_drafts")
      .select("id")
      .in("status", ["draft", "ready_for_xero", "xero_created"])
      .not("public_accept_url", "is", null)
      .is("quote_sent_at", null)
      .or("proposal_status.is.null,proposal_status.eq.not_ready,proposal_status.eq.error")
      .limit(500),
    supabase
      .from("quote_drafts")
      .select("id")
      .eq("status", "accepted")
      .is("property_id", null)
      .limit(500),
    supabase
      .from("quote_drafts")
      .select("id")
      .eq("status", "accepted")
      .not("property_id", "is", null)
      .is("first_scheduled_job_id", null)
      .limit(500),
    supabase
      .from("visits")
      .select(
        `
          id,
          scheduled_jobs (
            invoice_method
          )
        `
      )
      .eq("ready_for_invoice", true)
      .or("invoice_status.is.null,invoice_status.neq.excluded")
      .limit(500),
    supabase
      .from("communications")
      .select(
        "id, ignored, requires_action, status, direction, source_category, category, subject, body, metadata"
      )
      .limit(500),
    supabase
      .from("staff_daily_timesheets")
      .select("staff_member_id, work_date, total_hours, day_status")
      .gte("work_date", startDate)
      .lte("work_date", endDate)
      .limit(1000),
    supabase
      .from("job_labour_entries")
      .select("staff_member_id, work_date, hours_worked")
      .gte("work_date", startDate)
      .lte("work_date", endDate)
      .limit(1000),
  ])

  const visitsReadyForInvoice = ((visitsReadyResult.data || []) as VisitCountRow[])
    .filter((visit) => {
      const job = firstOrValue(visit.scheduled_jobs)
      return (
        job?.invoice_method !== "subscription" &&
        job?.invoice_method !== "non_billable"
      )
    }).length
  const labourExceptions = countLabourExceptions(
    (timesheetsResult.data || []) as TimesheetRow[],
    (labourEntriesResult.data || []) as LabourEntryRow[]
  )
  const estimatesAwaitingScheduling =
    (enquiriesAwaitingSchedulingResult.data?.length || 0) +
    (approvedQuoteRequestsResult.data?.length || 0)
  const communications = (communicationsResult.data || []) as CommunicationCountRow[]
  const activeCommunications = communications.filter(
    (communication) =>
      communication.ignored !== true &&
      communication.requires_action === true &&
      !isClosedCommunication(communication)
  )
  const newOrganicLeads = activeCommunications.filter(
    (communication) => classifyCommunication(communication) === "organic_lead"
  ).length
  const customerCommunications = activeCommunications.filter(
    (communication) => classifyCommunication(communication) === "customer_message"
  ).length
  const aggregatorLeads = communications.filter(
    (communication) =>
      communication.ignored !== true &&
      !isClosedCommunication(communication) &&
      classifyCommunication(communication) === "aggregator_lead"
  ).length

  const pipelineCards: PipelineCard[] = [
    {
      stage: "Lead Intake",
      title: "Capture and qualify new leads",
      count: newOrganicLeads + (phoneEnquiriesResult.data?.length || 0) + aggregatorLeads,
      href: "/admin/enquiries",
      purpose:
        "Review organic messages, phone enquiries, and aggregator leads before they enter the quoting pipeline.",
      nextAction:
        "Classify the request, create or update the enquiry, and decide whether it needs an estimate.",
      opens: "Enquiries",
      urgent: true,
    },
    {
      stage: "Quote / Estimate",
      title: "Book estimates and prepare quotes",
      count:
        estimatesAwaitingScheduling +
        (quotesReadyToSendResult.data?.length || 0) +
        (acceptedAwaitingConversionResult.data?.length || 0),
      href: "/admin/estimates-calendar",
      purpose:
        "Move qualified enquiries into the estimates calendar and keep proposal drafts moving.",
      nextAction:
        "Schedule the estimate, send or finish the quote, then convert accepted quotes into properties.",
      opens: "Estimates Calendar",
      urgent: true,
    },
    {
      stage: "Scheduling",
      title: "Convert accepted work into scheduled jobs",
      count: convertedAwaitingScheduleResult.data?.length || 0,
      href: "/admin/schedule",
      purpose:
        "Get converted properties and accepted work onto the staff schedule.",
      nextAction:
        "Check property setup, assign staff, and place the first job on the schedule.",
      opens: "Admin Schedule",
      urgent: true,
    },
    {
      stage: "Job Completion",
      title: "Run the live work schedule",
      count: customerCommunications,
      href: "/admin/schedule",
      purpose:
        "Coordinate scheduled work, client contact, staff assignments, and job notes from one place.",
      nextAction:
        "Check the week, resolve customer messages, and keep jobs ready for completion.",
      opens: "Admin Schedule",
      urgent: true,
    },
    {
      stage: "Invoicing",
      title: "Review completed billable work",
      count: visitsReadyForInvoice,
      href: "/admin/invoices",
      purpose:
        "Confirm completed visits, Xero sync status, quoted amounts, and charge-up previews.",
      nextAction:
        "Review invoice cards, compare app preview with Xero actuals, and resolve errors.",
      opens: "Invoices",
      urgent: true,
    },
    {
      stage: "Team Exceptions",
      title: "Keep team labour and overflow work clean",
      count: labourExceptions,
      href: `/admin/labour-reconciliation?start=${startDate}&end=${endDate}`,
      purpose:
        "Catch daily timesheet mismatches, unallocated job labour, and staff workflow exceptions.",
      nextAction:
        "Reconcile the week, then use the team board for overflow or quick jobs.",
      opens: "Labour Reconciliation",
      urgent: true,
    },
  ]

  const queryErrors = [
    phoneEnquiriesResult.error?.message,
    enquiriesAwaitingSchedulingResult.error?.message,
    approvedQuoteRequestsResult.error?.message,
    quotesReadyToSendResult.error?.message,
    acceptedAwaitingConversionResult.error?.message,
    convertedAwaitingScheduleResult.error?.message,
    visitsReadyResult.error?.message,
    communicationsResult.error?.message,
    timesheetsResult.error?.message,
    labourEntriesResult.error?.message,
  ].filter(Boolean)

  return (
    <div className="mx-auto max-w-7xl p-4 pb-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Pristine Jobs Operating Dashboard</h1>
        <p className="text-sm text-gray-500">
          One view of the work pipeline from lead intake through invoicing and team exceptions.
        </p>
      </header>

      {queryErrors.length > 0 && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="font-medium">Some dashboard counts could not load.</div>
          <div className="mt-1">{queryErrors.join(" ")}</div>
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {pipelineCards.map((card) => (
          <PipelineCard key={card.stage} card={card} />
        ))}
      </section>
    </div>
  )
}
