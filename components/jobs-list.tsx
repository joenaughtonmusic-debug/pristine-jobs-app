"use client"

import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ChevronRight, MapPin, Calendar } from "lucide-react"
import type { ScheduledJob } from "@/lib/types"
import { cn } from "@/lib/utils"

interface JobsListProps {
  jobs: ScheduledJob[]
}

const statusStyles = {
  scheduled: "bg-secondary text-secondary-foreground",
  in_progress: "bg-primary text-primary-foreground",
  completed: "bg-chart-5 text-foreground",
  cancelled: "bg-muted text-muted-foreground",
}

const statusLabels = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
}

export function JobsList({ jobs }: JobsListProps) {
  if (jobs.length === 0) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
      <Calendar className="mb-3 h-10 w-10 text-muted-foreground" />
      <h3 className="text-lg font-semibold">No jobs today</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Check back tomorrow or add jobs from Properties.
      </p>
    </div>
  )
}

  return (
  <div className="flex flex-col gap-3">
    {jobs.map((job, index) => {
      const latestNote = jobs
  .flatMap((j) => j.visits || [])
  .filter(
    (v) =>
      v.property_id === job.property_id &&
      v.next_visit_notes
  )
  .sort(
    (a, b) =>
      new Date(b.visit_date).getTime() -
      new Date(a.visit_date).getTime()
  )[0]?.next_visit_notes

      return (
        <Link key={job.id} href={`/jobs/${job.id}`}>
          <Card className="hover:border-primary/50 transition-colors active:scale-[0.99]">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
  <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
    Job {index + 1}
  </span>
  <h3 className="font-semibold text-foreground truncate">
    {job.properties?.client_name || "Unknown Client"}
  </h3>
</div>

                  <div className="flex items-center gap-1.5 mt-1 text-muted-foreground">
                    <MapPin className="w-4 h-4 shrink-0" />
                    <span className="text-sm truncate">
                      {job.properties?.address_line_1 || "No address"}
                    </span>
                  </div>

                  {latestNote && (
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                      Next: {latestNote}
                    </p>
                  )}

                  <div className="mt-3">
                    <Badge
                      variant="secondary"
                      className={cn("text-xs", statusStyles[job.status])}
                    >
                      {statusLabels[job.status]}
                    </Badge>
                  </div>
                </div>

                <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 mt-1" />
              </div>
            </CardContent>
          </Card>
        </Link>
      )
    })}
  </div>
)
}