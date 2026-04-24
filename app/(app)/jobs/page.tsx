import { createClient } from "@/lib/supabase/server"
import { JobsList } from "@/components/jobs-list"
import type { ScheduledJob } from "@/lib/types"

export default async function JobsPage() {
  const supabase = await createClient()
  const today = new Date().toISOString().split("T")[0]

  const { data: jobs } = await supabase
  .from("scheduled_jobs")
  .select(`
    *,
    properties (*),
    visits (
      property_id,
      visit_date,
      next_visit_notes
    )
  `)
    .eq("scheduled_date", today)
    .order("created_at", { ascending: true })

  return (
    <div className="p-4">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Today&apos;s Jobs</h1>
        <p className="text-muted-foreground">
          {new Date().toLocaleDateString("en-AU", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
      </header>
      <JobsList jobs={(jobs as ScheduledJob[]) || []} />
    </div>
  )
}
