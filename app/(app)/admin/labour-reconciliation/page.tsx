import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import {
  ensureWorkflowAdminActions,
  getActionDueDate,
  type WorkflowAdminActionInput,
} from "@/lib/admin-actions"

export const dynamic = "force-dynamic"

type SearchParams =
  | {
      start?: string
      end?: string
    }
  | Promise<{
      start?: string
      end?: string
    }>

type TimesheetRow = {
  id: string
  staff_member_id: string
  staff_name: string
  work_date: string
  total_hours: number | string | null
  day_status?: string | null
  status_notes?: string | null
}

type LabourEntryRow = {
  id: string
  job_type: string | null
  job_name: string | null
  job_code: string | null
  work_type?: string | null
  scheduled_job_id: string | null
  property_id: string | null
  staff_member_id: string
  staff_name: string
  work_date: string
  hours_worked: number | string | null
  billable: boolean | null
  billable_status?: string | null
  notes: string | null
  properties?: {
    address_line_1?: string | null
    suburb?: string | null
  } | {
    address_line_1?: string | null
    suburb?: string | null
  }[] | null
}

type ReconciliationStatus =
  | "ok"
  | "non_worked"
  | "missing_daily_hours"
  | "overallocated"
  | "underallocated"
  | "no_job_labour"

type ReconciliationRow = {
  key: string
  staffMemberId: string
  staffName: string
  workDate: string
  dailyHours: number | null
  jobHours: number
  difference: number | null
  status: ReconciliationStatus
  timesheet?: TimesheetRow
  entries: LabourEntryRow[]
}

function toDateString(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function parseLocalDate(dateString?: string) {
  if (!dateString) return new Date()

  const [year, month, day] = dateString.split("-").map(Number)
  const date = new Date(year, month - 1, day)

  return Number.isNaN(date.getTime()) ? new Date() : date
}

function getMonday(date: Date) {
  const d = new Date(date)
  const day = d.getDay()
  const mondayOffset = (day + 6) % 7
  d.setDate(d.getDate() - mondayOffset)
  return d
}

function formatDate(value: string) {
  return parseLocalDate(value).toLocaleDateString("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}

function formatHours(value: number | null) {
  if (value === null) return "-"
  return `${Number(value || 0).toFixed(2)}h`
}

function formatDifference(value: number | null) {
  if (value === null) return "-"
  const prefix = value > 0 ? "+" : ""
  return `${prefix}${value.toFixed(2)}h`
}

function statusLabel(status: ReconciliationStatus) {
  if (status === "non_worked") return "No job allocation required"
  if (status === "missing_daily_hours") return "Missing daily hours"
  if (status === "overallocated") return "Overallocated"
  if (status === "underallocated") return "Underallocated"
  if (status === "no_job_labour") return "No job labour"
  return "OK"
}

function statusClasses(status: ReconciliationStatus) {
  if (status === "ok") return "border-green-200 bg-green-50 text-green-800"
  if (status === "non_worked") return "border-blue-200 bg-blue-50 text-blue-800"
  if (status === "no_job_labour") return "border-gray-200 bg-gray-50 text-gray-700"
  return "border-amber-200 bg-amber-50 text-amber-800"
}

function formatDayStatus(status?: string | null) {
  if (!status) return "Worked"

  return status
    .split("_")
    .map((part, index) =>
      index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part
    )
    .join(" ")
}

function isNonWorkedStatus(status?: string | null) {
  return Boolean(status && status !== "worked")
}

function firstOrValue<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function formatWorkType(value?: string | null) {
  if (!value) return "Misc work"

  return value
    .split("_")
    .map((part, index) =>
      index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part
    )
    .join(" ")
}

function formatBillableStatus(value?: string | null, billable?: boolean | null) {
  if (value === "needs_review") return "Needs Review"
  if (value === "billable") return "Billable"
  if (value === "non_billable") return "Non-billable"
  return billable ? "Billable" : "Non-billable"
}

function getLabourEntryLabel(entry: LabourEntryRow) {
  const property = firstOrValue(entry.properties)
  const propertyAddress = [property?.address_line_1, property?.suburb]
    .filter(Boolean)
    .join(", ")

  if (entry.job_type === "misc") {
    return [
      "Unscheduled / Misc Work",
      formatWorkType(entry.work_type || entry.job_code),
      propertyAddress || entry.job_name,
    ]
      .filter(Boolean)
      .join(" - ")
  }

  return (
    propertyAddress ||
    entry.job_name ||
    entry.job_code ||
    (entry.job_type === "landscaping" ? "Landscaping job" : entry.job_type) ||
    "Job labour"
  )
}

function getStatus(
  dayStatus: string | null | undefined,
  dailyHours: number | null,
  jobHours: number
): ReconciliationStatus {
  if (isNonWorkedStatus(dayStatus)) return "non_worked"
  if (dailyHours === null && jobHours > 0) return "missing_daily_hours"
  if (dailyHours !== null && jobHours > dailyHours) return "overallocated"
  if (dailyHours !== null && jobHours === 0) return "no_job_labour"
  if (dailyHours !== null && dailyHours - jobHours > 1) return "underallocated"

  return "ok"
}

function buildReconciliationRows(
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

  return Array.from(keys)
    .map((key): ReconciliationRow => {
      const timesheet = timesheetByKey.get(key)
      const entries = entriesByKey.get(key) || []
      const [staffMemberId, workDate] = key.split(":")
      const staffName = timesheet?.staff_name || entries[0]?.staff_name || "Unknown"
      const dailyHours =
        timesheet?.total_hours === null || timesheet?.total_hours === undefined
          ? null
          : Number(timesheet.total_hours)
      const jobHours = entries.reduce((total, entry) => {
        return total + Number(entry.hours_worked || 0)
      }, 0)
      const difference = dailyHours === null ? null : dailyHours - jobHours

      return {
        key,
        staffMemberId,
        staffName,
        workDate,
        dailyHours,
        jobHours,
        difference,
        status: getStatus(timesheet?.day_status, dailyHours, jobHours),
        timesheet,
        entries,
      }
    })
    .sort((a, b) => {
      if (a.workDate !== b.workDate) return a.workDate.localeCompare(b.workDate)
      return a.staffName.localeCompare(b.staffName)
    })
}

export default async function AdminLabourReconciliationPage({
  searchParams,
}: {
  searchParams?: SearchParams
}) {
  const params = await Promise.resolve(searchParams || {})
  const today = new Date()
  const monday = getMonday(today)
  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)

  const startDate = params.start || toDateString(monday)
  const endDate = params.end || toDateString(friday)

  const supabase = await createClient()

  const { data: timesheets, error: timesheetsError } = await supabase
    .from("staff_daily_timesheets")
    .select("*")
    .gte("work_date", startDate)
    .lte("work_date", endDate)
    .order("work_date", { ascending: true })

  const { data: labourEntries, error: labourEntriesError } = await supabase
    .from("job_labour_entries")
    .select(`
      *,
      properties (
        address_line_1,
        suburb
      )
    `)
    .gte("work_date", startDate)
    .lte("work_date", endDate)
    .order("work_date", { ascending: true })

  const rows = buildReconciliationRows(
    (timesheets || []) as TimesheetRow[],
    (labourEntries || []) as LabourEntryRow[]
  )

  await ensureWorkflowAdminActions(
    supabase,
    [
      ...rows
        .filter((row) => row.status !== "ok" && row.status !== "non_worked")
        .map((row): WorkflowAdminActionInput => ({
        title: `Labour reconciliation: ${row.staffName} ${formatDate(row.workDate)}`,
        actionType: "labour_exception",
        priority:
          row.status === "missing_daily_hours" || row.status === "overallocated"
            ? "high"
            : "normal",
        owner: "VA",
        dueDate: getActionDueDate(0),
        sourceRecordType: "labour_reconciliation",
        sourceRecordId: row.key,
        sourceUrl: `/admin/labour-reconciliation?start=${startDate}&end=${endDate}`,
        notes: [
          `Staff: ${row.staffName}`,
          `Date: ${formatDate(row.workDate)}`,
          `Status: ${statusLabel(row.status)}`,
          `Day status: ${formatDayStatus(row.timesheet?.day_status)}`,
          `Daily hours: ${formatHours(row.dailyHours)}`,
          `Job hours: ${formatHours(row.jobHours)}`,
          `Difference: ${formatDifference(row.difference)}`,
          row.timesheet?.status_notes
            ? `Timesheet note: ${row.timesheet.status_notes}`
            : null,
        ]
          .filter(Boolean)
          .join("\n"),
        })),
      ...((labourEntries || []) as LabourEntryRow[])
        .filter((entry) => {
          const status =
            entry.billable_status || (entry.billable ? "billable" : "non_billable")

          return (
            entry.job_type === "misc" &&
            !entry.scheduled_job_id &&
            (status === "needs_review" || status === "billable")
          )
        })
        .map((entry): WorkflowAdminActionInput => {
          const status =
            entry.billable_status || (entry.billable ? "billable" : "non_billable")
          const title =
            status === "needs_review"
              ? "Review misc work for invoicing"
              : "Link extra work to property/job"

          return {
            title: `${title}: ${entry.staff_name}`,
            actionType: "misc_work_review",
            priority: status === "needs_review" ? "high" : "normal",
            owner: "VA",
            dueDate: getActionDueDate(0),
            propertyId: entry.property_id || null,
            sourceRecordType: "job_labour_entry",
            sourceRecordId: entry.id,
            sourceUrl: `/admin/labour-reconciliation?start=${entry.work_date}&end=${entry.work_date}`,
            notes: [
              `Staff: ${entry.staff_name}`,
              `Date: ${formatDate(entry.work_date)}`,
              `Work: ${formatWorkType(entry.work_type || entry.job_code)}`,
              `Hours: ${formatHours(Number(entry.hours_worked || 0))}`,
              `Billable status: ${formatBillableStatus(status, entry.billable)}`,
              entry.property_id ? "Linked property exists." : "No linked property.",
              entry.job_name ? `Label: ${entry.job_name}` : null,
              entry.notes ? `Notes: ${entry.notes}` : null,
            ]
              .filter(Boolean)
              .join("\n"),
          }
        }),
    ]
  )

  const warningCount = rows.filter(
    (row) => row.status !== "ok" && row.status !== "non_worked"
  ).length
  const totalDailyHours = rows.reduce((total, row) => {
    return total + Number(row.dailyHours || 0)
  }, 0)
  const totalJobHours = rows.reduce((total, row) => total + row.jobHours, 0)

  return (
    <div className="mx-auto max-w-7xl p-4 pb-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Labour Reconciliation</h1>
        <p className="text-sm text-gray-500">
          Review staff daily timesheet hours against job labour entries.
        </p>
      </header>

      <section className="mb-6 rounded-xl border bg-white p-4 shadow-sm">
        <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" action="/admin/labour-reconciliation">
          <label className="text-sm font-medium text-gray-700">
            Start date
            <input
              type="date"
              name="start"
              defaultValue={startDate}
              className="mt-1 h-10 w-full rounded-md border px-3"
            />
          </label>

          <label className="text-sm font-medium text-gray-700">
            End date
            <input
              type="date"
              name="end"
              defaultValue={endDate}
              className="mt-1 h-10 w-full rounded-md border px-3"
            />
          </label>

          <button
            type="submit"
            className="h-10 self-end rounded-md bg-black px-4 text-sm font-medium text-white"
          >
            Update
          </button>
        </form>
      </section>

      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs font-medium uppercase text-gray-500">
            Daily Hours
          </div>
          <div className="mt-2 text-xl font-semibold">
            {formatHours(totalDailyHours)}
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs font-medium uppercase text-gray-500">
            Job Labour Hours
          </div>
          <div className="mt-2 text-xl font-semibold">
            {formatHours(totalJobHours)}
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs font-medium uppercase text-gray-500">
            Rows Needing Review
          </div>
          <div className="mt-2 text-xl font-semibold">{warningCount}</div>
        </div>
      </section>

      {timesheetsError || labourEntriesError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {timesheetsError?.message || labourEntriesError?.message}
        </div>
      ) : rows.length > 0 ? (
        <section className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="border-b px-4 py-3">Staff</th>
                <th className="border-b px-4 py-3">Date</th>
                <th className="border-b px-4 py-3">Day Status</th>
                <th className="border-b px-4 py-3 text-right">Daily Hours</th>
                <th className="border-b px-4 py-3 text-right">Job Hours</th>
                <th className="border-b px-4 py-3 text-right">Difference</th>
                <th className="border-b px-4 py-3">Status</th>
                <th className="border-b px-4 py-3">Details</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="align-top hover:bg-gray-50">
                  <td className="border-b px-4 py-3 font-medium text-gray-900">
                    {row.staffName}
                  </td>
                  <td className="border-b px-4 py-3 text-gray-600">
                    {formatDate(row.workDate)}
                  </td>
                  <td className="border-b px-4 py-3">
                    {row.timesheet ? (
                      <div className="space-y-1">
                        <span
                          className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${
                            isNonWorkedStatus(row.timesheet.day_status)
                              ? "border-blue-200 bg-blue-50 text-blue-800"
                              : "border-green-200 bg-green-50 text-green-800"
                          }`}
                        >
                          {formatDayStatus(row.timesheet.day_status)}
                        </span>
                        {row.timesheet.status_notes && (
                          <div className="max-w-48 text-xs text-gray-500">
                            {row.timesheet.status_notes}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">No daily timesheet</span>
                    )}
                  </td>
                  <td className="border-b px-4 py-3 text-right">
                    {formatHours(row.dailyHours)}
                  </td>
                  <td className="border-b px-4 py-3 text-right">
                    {formatHours(row.jobHours)}
                  </td>
                  <td className="border-b px-4 py-3 text-right">
                    {formatDifference(row.difference)}
                  </td>
                  <td className="border-b px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusClasses(
                        row.status
                      )}`}
                    >
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="border-b px-4 py-3">
                    <details>
                      <summary className="cursor-pointer text-sm font-medium text-blue-700">
                        {row.entries.length} job entr
                        {row.entries.length === 1 ? "y" : "ies"}
                      </summary>

                      <div className="mt-3 space-y-2">
                        {row.timesheet?.status_notes && (
                          <div className="rounded-md bg-gray-50 p-2 text-xs text-gray-600">
                            Timesheet note: {row.timesheet.status_notes}
                          </div>
                        )}

                        {row.entries.length > 0 ? (
                          row.entries.map((entry) => (
                            <div
                              key={entry.id}
                              className="rounded-md border bg-white p-2 text-xs"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="font-medium text-gray-900">
                                  {getLabourEntryLabel(entry)}
                                </div>
                                <div>{formatHours(Number(entry.hours_worked || 0))}</div>
                              </div>

                              <div className="mt-1 flex flex-wrap gap-2 text-gray-500">
                                {entry.scheduled_job_id && (
                                  <Link
                                    href={`/jobs/${entry.scheduled_job_id}`}
                                    className="text-blue-700 hover:underline"
                                  >
                                    Open job
                                  </Link>
                                )}
                                <span>
                                  {formatBillableStatus(
                                    entry.billable_status,
                                    entry.billable
                                  )}
                                </span>
                                {entry.job_type && <span>{entry.job_type}</span>}
                                {entry.job_type === "misc" && (
                                  <span className="font-medium text-amber-700">
                                    Unscheduled / Misc Work
                                  </span>
                                )}
                                {entry.work_type && (
                                  <span>{formatWorkType(entry.work_type)}</span>
                                )}
                              </div>

                              {entry.notes && (
                                <div className="mt-1 whitespace-pre-wrap text-gray-600">
                                  {entry.notes}
                                </div>
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="rounded-md border border-dashed bg-gray-50 p-2 text-xs text-gray-500">
                            No job labour entries for this staff member on this date.
                          </div>
                        )}
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <div className="rounded-lg border border-dashed p-4 text-sm text-gray-500">
          No timesheet or job labour rows found for this date range.
        </div>
      )}
    </div>
  )
}
