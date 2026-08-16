"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { attachQuoteToJob, type AttachResult } from "@/lib/quote-job-linking"

// Attach an accepted quote to a job that was created without one. Admin-only
// by table RLS (quote_drafts + scheduled_jobs writes gate on is_admin()), so
// the action only has to prove there's a session — the DB refuses the rest.
export async function attachQuoteToJobAction(
  jobId: string,
  quoteDraftId: string
): Promise<AttachResult> {
  if (!jobId || !quoteDraftId) {
    return { ok: false, error: "Pick a quote to attach." }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, error: "You must be signed in." }
  }

  const result = await attachQuoteToJob(supabase, jobId, quoteDraftId)

  if (result.ok) {
    revalidatePath(`/jobs/${jobId}`)
    revalidatePath("/admin/schedule")
    revalidatePath("/admin/quotes")
  }

  return result
}
