import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { JobsList } from "@/components/jobs-list"
import { StaffTimesheetForm } from "@/components/staff-timesheet-form"
import type { ScheduledJob } from "@/lib/types"

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

function formatDayLabel(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number)
  const date = new Date(year, month - 1, day)

  return date.toLocaleDateString("en-NZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
}

export default async function JobsPage() {
  const supabase = await createClient()

  const today = new Date()
  const todayStr = toDateString(today)

  const monday = getMonday(today)
  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)

  const weekStart = toDateString(monday)
  const weekEnd = toDateString(friday)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/")
  }

  const { data: staffMember } = await supabase
    .from("staff_members")
    .select("id, name")
    .eq("auth_user_id", user.id)
    .maybeSingle()

  if (!staffMember) {
    return (
      <div className="p-4">
        <h1 className="text-xl font-bold">No staff profile linked</h1>
        <p className="text-muted-foreground">
          Your login is working, but this account is not linked to a staff member.
        </p>
      </div>
    )
  }

  const { data: linkedJobRows } = await supabase
  .from("scheduled_job_staff")
  .select("scheduled_job_id")
  .eq("staff_member_id", staffMember.id)

const linkedJobIds =
  linkedJobRows?.map((row) => row.scheduled_job_id) || []

const { data: jobs } = await supabase
  .from("scheduled_jobs")
  .select(`
    *,
    properties (*),
    visits (
      property_id,
      visit_date,
      next_visit_notes
    ),
    scheduled_job_staff (
      staff_member_id
    )
  `)
  .gte("scheduled_date", weekStart)
  .lte("scheduled_date", weekEnd)
  .in("id", linkedJobIds.length > 0 ? linkedJobIds : ["00000000-0000-0000-0000-000000000000"])
  .not("status", "eq", "cancelled")
  .order("scheduled_date", { ascending: true })
  .order("job_order", { ascending: true })

  const { data: timesheets } = await supabase
    .from("staff_daily_timesheets")
    .select("*")
    .eq("staff_member_id", staffMember.id)
    .gte("work_date", weekStart)
    .lte("work_date", weekEnd)

  const weekDays = [0, 1, 2, 3, 4].map((offset) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + offset)
    return toDateString(d)
  })

  const weeklyTotalHours =
    timesheets?.reduce((total, timesheet) => {
      return total + Number(timesheet.total_hours || 0)
    }, 0) || 0

  const missingTimesheetCount = weekDays.filter((day) => {
    return day < todayStr && !timesheets?.some((t) => t.work_date === day)
  }).length

  return (
    <div className="p-4 pb-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">My Jobs This Week</h1>
        <p className="text-muted-foreground">
          {staffMember.name} · Monday to Friday
        </p>
      </header>

      <div className="mb-6 rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">Week total</p>
        <p className="text-3xl font-bold">{weeklyTotalHours}h</p>

        {missingTimesheetCount > 0 ? (
          <p className="mt-1 text-sm font-medium text-red-600">
            {missingTimesheetCount} missing timesheet
            {missingTimesheetCount === 1 ? "" : "s"}
          </p>
        ) : (
          <p className="mt-1 text-sm font-medium text-green-700">
            Timesheets up to date
          </p>
        )}
      </div>

      <div className="flex flex-col gap-6">
        {weekDays.map((day) => {
          const dayJobs = ((jobs as ScheduledJob[]) || []).filter(
            (job) => job.scheduled_date === day
          )

          const isToday = day === todayStr

          const timesheet = timesheets?.find((t) => t.work_date === day)

          const previousDayMissing = day < todayStr && !timesheet

          return (
            <section
              key={day}
              className={
                previousDayMissing
                  ? "rounded-xl border-2 border-red-500 bg-red-50 p-3"
                  : isToday
                    ? "rounded-xl border-2 border-primary bg-primary/5 p-3"
                    : "rounded-xl border bg-card p-3"
              }
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">
                    {formatDayLabel(day)}
                  </h2>

                  {isToday && (
                    <p className="text-sm font-medium text-primary">Today</p>
                  )}

                  {previousDayMissing && (
                    <p className="text-sm font-medium text-red-600">
                      Hours not submitted
                    </p>
                  )}

                  {timesheet && (
                    <p className="text-sm font-medium text-green-700">
                      Hours submitted: {timesheet.total_hours}h
                    </p>
                  )}
                </div>

                <p className="text-sm text-muted-foreground">
                  {dayJobs.length} job{dayJobs.length === 1 ? "" : "s"}
                </p>
              </div>

              <StaffTimesheetForm
                staffMemberId={staffMember.id}
                staffName={staffMember.name}
                workDate={day}
                existingTimesheet={timesheet || null}
              />

              {dayJobs.length > 0 ? (
                <JobsList jobs={dayJobs} />
              ) : (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No jobs scheduled.
                </p>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}