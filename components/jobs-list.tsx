"use client"

import Link from "next/link"
import type { ScheduledJob } from "@/lib/types"

type JobWithStaff = ScheduledJob & {
  scheduled_job_staff?: {
    id: string
    staff_member_id: string
  }[]
}

interface JobsListProps {
  jobs: JobWithStaff[]
}

function calculateEndTime(
  startTime: string | null | undefined,
  durationHours: number | null | undefined
) {
  if (!startTime || !durationHours) return null

  const [hours, minutes] = startTime.split(":").map(Number)

  const start = new Date()
  start.setHours(hours, minutes, 0, 0)

  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000)

  const endHours = String(end.getHours()).padStart(2, "0")
  const endMinutes = String(end.getMinutes()).padStart(2, "0")

  return `${endHours}:${endMinutes}`
}

export function JobsList({ jobs }: JobsListProps) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
        No jobs scheduled
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {jobs.map((job) => {
        const completed = job.status === "completed"

        const crewSize =
  Math.max(
    (job.scheduled_job_staff?.length || 0),
    job.assigned_staff_id ? 1 : 0,
    1
  )

const siteDurationHours = job.planned_duration_hours
  ? job.planned_duration_hours / crewSize
  : null

const endTime = calculateEndTime(
  job.planned_start_time,
  siteDurationHours
)

        return (
          <Link
            key={job.id}
            href={`/jobs/${job.id}`}
            className={
              completed
                ? "block rounded-xl border bg-muted/40 p-4 opacity-60 transition hover:opacity-80"
                : "block rounded-xl border bg-card p-4 transition hover:border-primary hover:bg-accent"
            }
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-lg font-semibold">
                    {job.properties?.client_name || "Unknown Property"}
                  </h2>

                  {completed && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      Completed
                    </span>
                  )}
                </div>

                <p className="mt-1 text-sm text-muted-foreground">
                  {job.properties?.address_line_1}
                </p>

                {(job.planned_start_time ||
                  job.planned_duration_hours) && (
                  <div className="mt-2 text-sm font-medium text-foreground">
                    {job.planned_start_time || "--:--"}

                    {endTime ? `–${endTime}` : ""}

                    {siteDurationHours
  ? ` · ${siteDurationHours}h`
  : ""}

{crewSize > 1 && job.planned_duration_hours
  ? ` (${job.planned_duration_hours} labour-hours, ${crewSize} staff)`
  : ""}
                  </div>
                )}

                {job.visits?.[0]?.next_visit_notes && (
                  <div className="mt-3 rounded-md bg-muted p-2 text-sm">
                    <p className="font-medium">Next Visit Notes</p>
                    <p className="text-muted-foreground">
                      {job.visits[0].next_visit_notes}
                    </p>
                  </div>
                )}
              </div>

              <div className="shrink-0 text-right">
                {job.job_order && (
                  <p className="text-sm font-medium">
                    Job {job.job_order}
                  </p>
                )}

                <p className="mt-1 text-xs capitalize text-muted-foreground">
                  {job.status.replace("_", " ")}
                </p>
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}