import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { JobDetail } from "@/components/job-detail"
import {
  attachBlockedReason,
  findAttachableQuotes,
} from "@/lib/quote-job-linking"
import type { JobPhoto, ScheduledJob, Visit } from "@/lib/types"

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

    const { data: completedVisit } = await supabase
  .from("visits")
  .select("*")
  .eq("scheduled_job_id", job.id)
  .maybeSingle()

  const { data: latestVisitNote } = await supabase
    .from("visits")
    .select("next_visit_notes, visit_date")
    .eq("property_id", job.property_id)
    .not("next_visit_notes", "is", null)
.neq("next_visit_notes", "")
    .order("visit_date", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: labourEntries } = await supabase
  .from("job_labour_entries")
  .select("*")
  .eq("scheduled_job_id", job.id)
  .order("work_date", { ascending: false })

  const { data: jobPhotos } = await supabase
    .from("job_photos")
    .select("*")
    .eq("scheduled_job_id", job.id)
    .order("created_at", { ascending: false })

  // Quote→job repair (Norm, 14 Aug): a job created by hand never picked up its
  // accepted quote, so it billed charge_up instead of the quoted price. Offer
  // the property's unclaimed accepted quotes, and say why when it's too late.
  const attachableQuotes = await findAttachableQuotes(supabase, job.property_id)
  const attachBlocked =
    attachableQuotes.length > 0
      ? await attachBlockedReason(supabase, job.id)
      : null

  return (
  <JobDetail
    job={job as ScheduledJob}
    recentVisits={(recentVisits as Visit[]) || []}
    completedVisit={(completedVisit as Visit) || null}
    latestNextVisitNote={latestVisitNote?.next_visit_notes || null}
    labourEntries={labourEntries || []}
    jobPhotos={(jobPhotos as JobPhoto[]) || []}
    attachableQuotes={attachableQuotes}
    attachBlockedReason={attachBlocked}
    isAdmin={true}
  />
)
}
