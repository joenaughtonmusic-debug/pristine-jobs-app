import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { JobDetail } from "@/components/job-detail"
import type { ScheduledJob, Visit } from "@/lib/types"

interface JobDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: job } = await supabase
    .from("scheduled_jobs")
    .select(`
      *,
      properties (*)
    `)
    .eq("id", id)
    .single()

  if (!job) {
    notFound()
  }

  const { data: recentVisits } = await supabase
    .from("visits")
    .select("*")
    .eq("property_id", job.property_id)
    .order("visit_date", { ascending: false })
    .limit(5)

  const { data: latestVisitNote } = await supabase
    .from("visits")
    .select("next_visit_notes, visit_date")
    .eq("property_id", job.property_id)
    .not("next_visit_notes", "is", null)
.neq("next_visit_notes", "")
    .order("visit_date", { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <JobDetail
      job={job as ScheduledJob}
      recentVisits={(recentVisits as Visit[]) || []}
      latestNextVisitNote={latestVisitNote?.next_visit_notes || null}
    />
  )
}