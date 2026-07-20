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

type StaffSummary = {
  id?: string | null
  name?: string | null
}

type ScheduledJobStaff = {
  staff_members?: StaffSummary | StaffSummary[] | null
}

type ScheduledJob = {
  id: string
  scheduled_date: string
  status?: string | null
  job_type?: string | null
  properties?: PropertySummary | PropertySummary[] | null
  scheduled_job_staff?: ScheduledJobStaff[] | null
}

type InternalJobNote = {
  id: string
  scheduled_job_id?: string | null
  property_address?: string | null
  note?: string | null
  submitted_by_staff_name?: string | null
  created_at?: string | null
  status?: string | null
  properties?: PropertySummary | PropertySummary[] | null
}

type LabourEntry = {
  id: string
  staff_name?: string | null
  work_date: string
  work_type?: string | null
  job_name?: string | null
  job_code?: string | null
  hours_worked?: number | string | null
  billable?: boolean | null
  billable_status?: string | null
  scheduled_job_id?: string | null
  properties?: PropertySummary | PropertySummary[] | null
}

type JobBoardItem = {
  id: string
  title: string
  suburb?: string | null
  priority?: string | null
  status?: string | null
  assigned_staff?: StaffSummary | StaffSummary[] | null
  job_board_responses?: { id: string }[] | null
}

type AdminAction = {
  id: string
  title: string
  action_type?: string | null
  priority?: string | null
  status?: string | null
  assigned_to?: string | null
  due_date?: string | null
  source_record_type?: string | null
  source_record_id?: string | null
  source_url?: string | null
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

function formatDate(value?: string | null) {
  if (!value) return "No date"

  return new Date(`${value}T12:00:00`).toLocaleDateString("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}

function formatDateTime(value?: string | null) {
  if (!value) return "No date"

  return new Date(value).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
  })
}

function formatLabel(value?: string | null) {
  if (!value) return "Not set"

  return value
    .split("_")
    .map((part, index) =>
      index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part
    )
    .join(" ")
}

function formatHours(value?: number | string | null) {
  return `${Number(value || 0).toFixed(2)}h`
}

function getPropertyLabel(property?: PropertySummary | null) {
  return (
    property?.client_name ||
    property?.property_code ||
    [property?.address_line_1, property?.suburb].filter(Boolean).join(", ") ||
    "No property"
  )
}

function getPropertyAddress(property?: PropertySummary | null) {
  return [property?.address_line_1, property?.suburb].filter(Boolean).join(", ")
}

function getStaffNames(job: ScheduledJob) {
  const names =
    job.scheduled_job_staff
      ?.map((assignment) => firstOrValue(assignment.staff_members)?.name)
      .filter(Boolean) || []

  return names.length > 0 ? names.join(", ") : "Unassigned"
}

function getLabourLabel(entry: LabourEntry) {
  const property = firstOrValue(entry.properties)
  const propertyAddress = getPropertyAddress(property)

  return propertyAddress || entry.job_name || entry.job_code || "Misc work"
}

function badgeClasses(value?: string | null) {
  if (value === "urgent" || value === "high" || value === "needs_review") {
    return "border-red-200 bg-red-50 text-red-800"
  }

  if (value === "assigned" || value === "in_progress") {
    return "border-blue-200 bg-blue-50 text-blue-800"
  }

  if (value === "billable" || value === "open") {
    return "border-amber-200 bg-amber-50 text-amber-800"
  }

  return "border-gray-200 bg-gray-50 text-gray-700"
}

function Section({
  title,
  count,
  viewAllHref,
  children,
}: {
  title: string
  count: number
  viewAllHref: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">{title}</h2>
          <p className="text-sm text-gray-500">
            {count} item{count === 1 ? "" : "s"}
          </p>
        </div>

        <Link
          href={viewAllHref}
          className="shrink-0 rounded-md border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          View All
        </Link>
      </div>

      <div className="space-y-3">{children}</div>
    </section>
  )
}

function EmptyState({ children }: { children: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-gray-50 p-4 text-sm text-gray-500">
      {children}
    </div>
  )
}

export default async function AdminTeamHubPage() {
  const supabase = await createClient()
  const today = new Date()
  const end = new Date(today)
  end.setDate(today.getDate() + 7)

  const startDate = toDateString(today)
  const endDate = toDateString(end)

  const { data: scheduledJobs, error: scheduledJobsError } = await supabase
    .from("scheduled_jobs")
    .select(`
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
      ),
      scheduled_job_staff (
        staff_members (
          id,
          name
        )
      )
    `)
    .gte("scheduled_date", startDate)
    .lte("scheduled_date", endDate)
    .order("scheduled_date", { ascending: true })
    .limit(10)

  const { data: teamNotes, error: teamNotesError } = await supabase
    .from("internal_job_notes")
    .select(`
      id,
      scheduled_job_id,
      property_address,
      note,
      submitted_by_staff_name,
      created_at,
      status,
      properties (
        id,
        property_code,
        client_name,
        address_line_1,
        suburb
      )
    `)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(10)

  const { data: miscLabour, error: miscLabourError } = await supabase
    .from("job_labour_entries")
    .select(`
      id,
      staff_name,
      work_date,
      work_type,
      job_name,
      job_code,
      hours_worked,
      billable,
      billable_status,
      scheduled_job_id,
      properties (
        id,
        property_code,
        client_name,
        address_line_1,
        suburb
      )
    `)
    .eq("job_type", "misc")
    .is("scheduled_job_id", null)
    .order("work_date", { ascending: false })
    .limit(10)

  const { data: jobBoardItems, error: jobBoardError } = await supabase
    .from("job_board_items")
    .select(`
      id,
      title,
      suburb,
      priority,
      status,
      assigned_staff:staff_members!job_board_items_assigned_staff_id_fkey (
        id,
        name
      ),
      job_board_responses (
        id
      )
    `)
    .in("status", ["open", "assigned"])
    .order("created_at", { ascending: false })
    .limit(10)

  const teamActionTypes = [
    "team_note",
    "labour_exception",
    "job_board",
    "schedule_issue",
    "misc_work_review",
    "accepted_quote_setup",
  ]

  const { data: directTeamActions, error: directActionsError } = await supabase
    .from("admin_actions")
    .select(`
      id,
      title,
      action_type,
      priority,
      status,
      assigned_to,
      due_date,
      source_record_type,
      source_record_id,
      source_url
    `)
    .neq("status", "done")
    .in("action_type", teamActionTypes)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(10)

  const { data: possibleCommunicationActions, error: communicationActionsError } =
    await supabase
      .from("admin_actions")
      .select(`
        id,
        title,
        action_type,
        priority,
        status,
        assigned_to,
        due_date,
        source_record_type,
        source_record_id,
        source_url
      `)
      .neq("status", "done")
      .eq("action_type", "communication_follow_up")
      .or(
        "title.ilike.%team%,title.ilike.%staff%,title.ilike.%job%,title.ilike.%schedule%,title.ilike.%labour%,notes.ilike.%team%,notes.ilike.%staff%,notes.ilike.%job%,notes.ilike.%schedule%,notes.ilike.%labour%"
      )
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(10)

  const teamActions = [
    ...((directTeamActions || []) as AdminAction[]),
    ...((possibleCommunicationActions || []) as AdminAction[]),
  ]
    .filter(
      (action, index, actions) =>
        actions.findIndex((candidate) => candidate.id === action.id) === index
    )
    .slice(0, 10)

  const jobs = (scheduledJobs || []) as ScheduledJob[]
  const notes = (teamNotes || []) as InternalJobNote[]
  const labour = (miscLabour || []) as LabourEntry[]
  const boardItems = (jobBoardItems || []) as JobBoardItem[]

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 pb-10">
      <header>
        <h1 className="text-2xl font-bold text-gray-950">Team Hub</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          What the team needs to know, do, or fix today.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section
          title="Today / This Week"
          count={jobs.length}
          viewAllHref="/admin/schedule"
        >
          {scheduledJobsError ? (
            <EmptyState>Could not load scheduled jobs.</EmptyState>
          ) : jobs.length > 0 ? (
            jobs.map((job) => {
              const property = firstOrValue(job.properties)

              return (
                <article key={job.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium text-gray-950">
                        {getPropertyLabel(property)}
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        {getPropertyAddress(property)}
                      </p>
                    </div>

                    <span className={`rounded-full border px-2 py-1 text-xs font-medium ${badgeClasses(job.status)}`}>
                      {formatLabel(job.status)}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-1 text-sm text-gray-600">
                    <span>Date: {formatDate(job.scheduled_date)}</span>
                    <span>Staff: {getStaffNames(job)}</span>
                    <span>Type: {formatLabel(job.job_type)}</span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`/jobs/${job.id}`} className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-gray-50">
                      Open Job
                    </Link>
                    <Link href="/admin/schedule" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-gray-50">
                      View Schedule
                    </Link>
                  </div>
                </article>
              )
            })
          ) : (
            <EmptyState>No scheduled jobs found for the next 7 days.</EmptyState>
          )}
        </Section>

        <Section title="Team Notes" count={notes.length} viewAllHref="/admin/internal-notes">
          {teamNotesError ? (
            <EmptyState>Could not load team notes.</EmptyState>
          ) : notes.length > 0 ? (
            notes.map((note) => {
              const property = firstOrValue(note.properties)

              return (
                <article key={note.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium text-gray-950">
                        {getPropertyLabel(property) || note.property_address || "Team note"}
                      </h3>
                      <p className="mt-1 text-xs text-gray-500">
                        Created {formatDateTime(note.created_at)}
                        {note.submitted_by_staff_name
                          ? ` by ${note.submitted_by_staff_name}`
                          : ""}
                      </p>
                    </div>

                    <span className={`rounded-full border px-2 py-1 text-xs font-medium ${badgeClasses(note.status)}`}>
                      {formatLabel(note.status || "open")}
                    </span>
                  </div>

                  <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm text-gray-600">
                    {note.note || "No note text"}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href="/admin/internal-notes" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-gray-50">
                      Open Note
                    </Link>
                    {note.scheduled_job_id && (
                      <Link href={`/jobs/${note.scheduled_job_id}`} className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-gray-50">
                        Open Job
                      </Link>
                    )}
                  </div>
                </article>
              )
            })
          ) : (
            <EmptyState>No open team notes right now.</EmptyState>
          )}
        </Section>

        <Section
          title="Misc / Extra Work Needing Review"
          count={labour.length}
          viewAllHref="/admin/labour-reconciliation"
        >
          {miscLabourError ? (
            <EmptyState>Could not load misc work.</EmptyState>
          ) : labour.length > 0 ? (
            labour.map((entry) => (
              <article key={entry.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium text-gray-950">
                      {entry.staff_name || "Unknown staff"}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {getLabourLabel(entry)}
                    </p>
                  </div>

                </div>

                <div className="mt-3 grid gap-1 text-sm text-gray-600">
                  <span>Date: {formatDate(entry.work_date)}</span>
                  <span>Work: {formatLabel(entry.work_type || entry.job_code)}</span>
                  <span>Hours: {formatHours(entry.hours_worked)}</span>
                </div>

                <div className="mt-3">
                  <Link
                    href={`/admin/labour-reconciliation?start=${entry.work_date}&end=${entry.work_date}`}
                    className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-gray-50"
                  >
                    Open Labour Reconciliation
                  </Link>
                </div>
              </article>
            ))
          ) : (
            <EmptyState>No misc or extra work needs review.</EmptyState>
          )}
        </Section>

        <Section title="Team Job Board" count={boardItems.length} viewAllHref="/admin/job-board">
          {jobBoardError ? (
            <EmptyState>Could not load team job board items.</EmptyState>
          ) : boardItems.length > 0 ? (
            boardItems.map((item) => {
              const assignedStaff = firstOrValue(item.assigned_staff)

              return (
                <article key={item.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium text-gray-950">{item.title}</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        {item.suburb || "No suburb"}
                      </p>
                    </div>

                    <span className={`rounded-full border px-2 py-1 text-xs font-medium ${badgeClasses(item.priority)}`}>
                      {formatLabel(item.priority)}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-1 text-sm text-gray-600">
                    <span>Status: {formatLabel(item.status)}</span>
                    <span>Assigned: {assignedStaff?.name || "Unassigned"}</span>
                    <span>
                      Responses: {item.job_board_responses?.length || 0}
                    </span>
                  </div>

                  <div className="mt-3">
                    <Link href="/admin/job-board" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-gray-50">
                      Open Item
                    </Link>
                  </div>
                </article>
              )
            })
          ) : (
            <EmptyState>No open or assigned job board items.</EmptyState>
          )}
        </Section>

        <section className="xl:col-span-2">
          <Section
            title="Team Admin Actions"
            count={teamActions.length}
            viewAllHref="/admin/actions"
          >
            {directActionsError || communicationActionsError ? (
              <EmptyState>Could not load team admin actions.</EmptyState>
            ) : teamActions.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {teamActions.map((action) => (
                  <article key={action.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-medium text-gray-950">
                          {action.title}
                        </h3>
                        <p className="mt-1 text-sm text-gray-500">
                          Owner: {action.assigned_to || "Unassigned"}
                        </p>
                      </div>

                      <span className={`rounded-full border px-2 py-1 text-xs font-medium ${badgeClasses(action.priority)}`}>
                        {formatLabel(action.priority || "normal")}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-1 text-sm text-gray-600">
                      <span>Due: {formatDate(action.due_date)}</span>
                      <span>Source: {formatLabel(action.source_record_type || action.action_type)}</span>
                      {action.source_record_id && (
                        <span className="break-all">ID: {action.source_record_id}</span>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href="/admin/actions" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-gray-50">
                        Open Action
                      </Link>
                      {action.source_url && (
                        <Link href={action.source_url} className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-gray-50">
                          Open Source
                        </Link>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState>No team admin actions need attention.</EmptyState>
            )}
          </Section>
        </section>
      </div>
    </div>
  )
}
