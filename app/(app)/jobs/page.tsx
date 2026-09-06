import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { JobsList } from "@/components/jobs-list"
import { StaffTimesheetForm } from "@/components/staff-timesheet-form"
import type { ScheduledJob } from "@/lib/types"
import { toZonedTime } from "date-fns-tz"
import {
  NZ_TIME_ZONE,
  getCrewWeekMonday,
  getMonday,
  getWeekDays,
  isCrewWeekRolledOver,
  nowInNZ,
  toDateString,
} from "@/lib/crew-week"

function formatDayLabel(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number)
  const date = new Date(year, month - 1, day)

  return date.toLocaleDateString("en-NZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
}

function isPastDay(day: string) {
  const [year, month, date] = day.split("-").map(Number)

  const d = new Date(year, month - 1, date)
  d.setHours(0, 0, 0, 0)

  const today = toZonedTime(new Date(), NZ_TIME_ZONE)
  today.setHours(0, 0, 0, 0)

  return d < today
}

function isExpectedWorkDay(staffName: string, day: string) {
  const [year, month, date] = day.split("-").map(Number)
  const dayNumber = new Date(year, month - 1, date).getDay()
  const name = staffName.trim().toLowerCase()

  if (name.includes("charles")) {
    return [2, 3, 4, 5].includes(dayNumber)
  }

  return [1, 2, 3, 4, 5].includes(dayNumber)
}

export default async function JobsPage() {
  const supabase = await createClient()

  const today = nowInNZ()
  const todayStr = toDateString(today)
  const showingNextWeek = isCrewWeekRolledOver(today)

  // Jobs: the week the crew should be preparing for.
  const monday = getCrewWeekMonday(today)
  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)

  const weekStart = toDateString(monday)
  const weekEnd = toDateString(friday)

  // Hours: always the week just worked, so Sunday's rollover can't hide
  // outstanding timesheets. Same week as the jobs list Monday to Saturday.
  const timesheetMonday = getMonday(today)
  const timesheetFriday = new Date(timesheetMonday)
  timesheetFriday.setDate(timesheetMonday.getDate() + 4)

  const timesheetWeekStart = toDateString(timesheetMonday)
  const timesheetWeekEnd = toDateString(timesheetFriday)

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
    .in(
      "id",
      linkedJobIds.length > 0
        ? linkedJobIds
        : ["00000000-0000-0000-0000-000000000000"]
    )
    .not("status", "eq", "cancelled")
    .order("scheduled_date", { ascending: true })
    .order("job_order", { ascending: true })

  const { data: timesheets } = await supabase
    .from("staff_daily_timesheets")
    .select("*")
    .eq("staff_member_id", staffMember.id)
    .gte("work_date", timesheetWeekStart)
    .lte("work_date", timesheetWeekEnd)

  const weekDays = getWeekDays(monday)
  const timesheetWeekDays = getWeekDays(timesheetMonday)

  const weeklyTotalHours =
    timesheets?.reduce((total, timesheet) => {
      return total + Number(timesheet.total_hours || 0)
    }, 0) || 0

  const missingTimesheetCount = timesheetWeekDays.filter((day) => {
    const expectedWorkDay = isExpectedWorkDay(staffMember.name, day)

    return (
      expectedWorkDay &&
      isPastDay(day) &&
      !timesheets?.some((t) => t.work_date === day)
    )
  }).length

  return (
    <div className="p-4 pb-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">
          {showingNextWeek ? "My Jobs Next Week" : "My Jobs This Week"}
        </h1>
        <p className="text-muted-foreground">
          {staffMember.name} · Monday to Friday
        </p>
        {showingNextWeek && (
          <p className="text-sm text-muted-foreground">
            Week beginning {formatDayLabel(weekStart)}
          </p>
        )}
      </header>

      <div className="mb-6 rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          {showingNextWeek ? "Last week's total" : "Week total"}
        </p>
        <p className="text-3xl font-bold">{weeklyTotalHours}h</p>

        {missingTimesheetCount > 0 ? (
          <p className="mt-1 text-sm font-medium text-red-600">
            {missingTimesheetCount} missing timesheet
            {missingTimesheetCount === 1 ? "" : "s"}
            {showingNextWeek ? " from last week" : ""}
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

          const expectedWorkDay = isExpectedWorkDay(staffMember.name, day)
          const previousDayMissing =
            expectedWorkDay && isPastDay(day) && !timesheet

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

      {/* From 9am Sunday the list above jumps to the coming week, so last week's
          daily hours stay reachable here until Monday. */}
      {showingNextWeek && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold">Last week&apos;s hours</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Finish these off before Monday.
          </p>

          <div className="flex flex-col gap-4">
            {timesheetWeekDays.map((day) => {
              const timesheet = timesheets?.find((t) => t.work_date === day)

              if (!timesheet && !isExpectedWorkDay(staffMember.name, day)) {
                return null
              }

              return (
                <section key={day} className="rounded-xl border bg-card p-3">
                  <h3 className="mb-3 text-base font-semibold">
                    {formatDayLabel(day)}
                  </h3>

                  <StaffTimesheetForm
                    staffMemberId={staffMember.id}
                    staffName={staffMember.name}
                    workDate={day}
                    existingTimesheet={timesheet || null}
                  />
                </section>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}