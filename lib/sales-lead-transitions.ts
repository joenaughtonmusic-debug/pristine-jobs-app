import type { SupabaseClient } from "@supabase/supabase-js"
import {
  BOARD_STAGES,
  addDaysFromNow,
  appendActivities,
  createActivity,
  formatDateTime,
  getBoardStageIndex,
  type SalesLead,
  type SalesLeadActivity,
  type SalesLeadStatus,
} from "@/lib/sales-leads"

// Stage transitions for the pipeline board (Phase 1 Slice 3). Each function
// takes a SupabaseClient (same pattern as lib/admin-actions.ts) so the server
// actions and runtime verification drive identical code. Advancement is
// manual — nothing here is triggered by inbound replies — and every
// transition appends activity entries so the card drawer shows what happened.

export type TransitionResult = { ok: true } | { error: string }

async function getLead(
  supabase: SupabaseClient,
  leadId: string
): Promise<{ lead: SalesLead } | { error: string }> {
  const { data, error } = await supabase
    .from("sales_leads")
    .select("*")
    .eq("id", leadId)
    .single()

  if (error || !data) {
    return { error: error?.message || "Lead not found." }
  }

  return { lead: data as SalesLead }
}

async function updateLead(
  supabase: SupabaseClient,
  lead: SalesLead,
  patch: Record<string, unknown>,
  ...activities: SalesLeadActivity[]
): Promise<TransitionResult> {
  const { error } = await supabase
    .from("sales_leads")
    .update({
      ...patch,
      notes: appendActivities(lead.notes, ...activities),
    })
    .eq("id", lead.id)

  if (error) {
    return { error: error.message }
  }

  return { ok: true }
}

// New lead → Contacted. Queues the email via client_contact_messages (the
// existing Make send pattern — the app never sends email directly) and logs
// it to the lead's thread.
export async function queueContactAndMarkContacted(
  supabase: SupabaseClient,
  leadId: string,
  input: { subject: string; body: string }
): Promise<TransitionResult> {
  const subject = input.subject.trim()
  const body = input.body.trim()

  if (!subject || !body) {
    return { error: "Subject and message are both required." }
  }

  const found = await getLead(supabase, leadId)
  if ("error" in found) return found
  const { lead } = found

  // Fresh-status guard: the queue insert and the lead update below are two
  // separate writes, so a stale card or double-click must never queue a
  // second customer email.
  if (lead.status !== "new") {
    return {
      error:
        "This lead has already been contacted — check the activity thread before sending again.",
    }
  }

  const recipient = lead.email?.trim()
  if (!recipient) {
    return { error: "This lead has no email address — add one first." }
  }

  const { error: queueError } = await supabase
    .from("client_contact_messages")
    .insert({
      recipient_email: recipient,
      subject,
      body,
      status: "ready_to_send",
    })

  if (queueError) {
    return { error: `Could not queue the email: ${queueError.message}` }
  }

  const updated = await updateLead(
    supabase,
    lead,
    { status: "contacted" },
    createActivity(
      "communication",
      `Contact email queued to ${recipient}: "${subject}"\n\n${body}`
    ),
    createActivity("status_change", "New lead → Contacted")
  )

  if ("error" in updated) {
    // The email is already queued and Make will still send it — make sure the
    // operator doesn't send a duplicate.
    return {
      error: `The email was queued and will still be sent, but the card could not be updated (${updated.error}). Refresh the page and do NOT send again.`,
    }
  }

  return updated
}

// Contacted → Visit booked, capturing the agreed date/time.
export async function confirmVisit(
  supabase: SupabaseClient,
  leadId: string,
  siteVisitAt: string
): Promise<TransitionResult> {
  if (!siteVisitAt || Number.isNaN(new Date(siteVisitAt).getTime())) {
    return { error: "Enter a valid visit date and time." }
  }

  const found = await getLead(supabase, leadId)
  if ("error" in found) return found

  return updateLead(
    supabase,
    found.lead,
    { status: "visit_booked", site_visit_at: siteVisitAt },
    createActivity(
      "status_change",
      `Visit confirmed for ${formatDateTime(siteVisitAt)} — Contacted → Visit booked`
    )
  )
}

// Visit booked → Quote (after the visit has happened and you're ready to price).
export async function moveToQuote(
  supabase: SupabaseClient,
  leadId: string
): Promise<TransitionResult> {
  const found = await getLead(supabase, leadId)
  if ("error" in found) return found

  return updateLead(
    supabase,
    found.lead,
    { status: "estimate_done" },
    createActivity("status_change", "Visit booked → Quote")
  )
}

// Quote created and sent (manually via the quote builder for now).
// Sets the 2-day follow-up, matching the earlier pipeline behaviour.
export async function markQuoteSent(
  supabase: SupabaseClient,
  leadId: string
): Promise<TransitionResult> {
  const found = await getLead(supabase, leadId)
  if ("error" in found) return found

  const nextFollowUpAt = addDaysFromNow(2)

  return updateLead(
    supabase,
    found.lead,
    { status: "quote_sent", next_follow_up_at: nextFollowUpAt },
    createActivity("status_change", "Quote sent to client."),
    createActivity(
      "follow_up",
      `Follow-up scheduled for ${formatDateTime(nextFollowUpAt)}`
    )
  )
}

// Owner marks the quote accepted (yes-by-text/phone). The public quote link
// flow will set the same state automatically once leads are linked to quotes
// (Phase 2). Acceptance is a state on the Quote stage, not its own column.
export async function markQuoteAccepted(
  supabase: SupabaseClient,
  leadId: string
): Promise<TransitionResult> {
  const found = await getLead(supabase, leadId)
  if ("error" in found) return found

  if (found.lead.quote_accepted_at) {
    return { error: "Quote is already marked accepted." }
  }

  return updateLead(
    supabase,
    found.lead,
    { quote_accepted_at: new Date().toISOString() },
    createActivity("note", "Quote accepted — marked manually.")
  )
}

// Quote → Job scheduled. Only allowed once the quote is accepted. The actual
// scheduled_jobs row is booked through the existing quote-builder flow
// (createAcceptedQuoteSchedule); this records the advancement on the lead.
export async function markJobScheduled(
  supabase: SupabaseClient,
  leadId: string
): Promise<TransitionResult> {
  const found = await getLead(supabase, leadId)
  if ("error" in found) return found

  if (!found.lead.quote_accepted_at) {
    return { error: "The quote must be accepted before scheduling the job." }
  }

  return updateLead(
    supabase,
    found.lead,
    { status: "scheduled" },
    createActivity(
      "status_change",
      "Quote → Job scheduled (booked via the quote builder)."
    )
  )
}

// The canonical status a lead lands on when advanced from each board stage
// without firing that stage's action (skip). Index = current board stage.
const SKIP_TARGET_STATUS: Array<SalesLeadStatus | null> = [
  "contacted", // from New lead
  "visit_booked", // from Contacted
  "estimate_done", // from Visit booked (→ Quote column)
  "scheduled", // from Quote
  "completed", // from Job scheduled
  null, // Job completed is the final stage
]

// Advance to the next board stage WITHOUT the stage's action — for leads
// whose step already happened outside the app (e.g. contacted by phone
// before the lead was entered). Queues nothing and sends nothing; same shape
// as markQuoteAccepted: recording offline reality.
export async function advanceStageWithoutAction(
  supabase: SupabaseClient,
  leadId: string
): Promise<TransitionResult> {
  const found = await getLead(supabase, leadId)
  if ("error" in found) return found
  const { lead } = found

  const stageIndex = getBoardStageIndex(lead.status)
  const nextStatus = SKIP_TARGET_STATUS[stageIndex]

  if (!nextStatus) {
    return { error: "This lead is already at the final stage." }
  }

  const fromLabel = BOARD_STAGES[stageIndex].label
  const toLabel = BOARD_STAGES[getBoardStageIndex(nextStatus)].label

  return updateLead(
    supabase,
    lead,
    { status: nextStatus },
    createActivity(
      "status_change",
      `Advanced without action: ${fromLabel} → ${toLabel} (handled outside the app).`
    )
  )
}

// Mark lost — available from any stage via the card drawer.
export async function markLost(
  supabase: SupabaseClient,
  leadId: string,
  reason: string
): Promise<TransitionResult> {
  const found = await getLead(supabase, leadId)
  if ("error" in found) return found

  const trimmed = reason.trim()

  return updateLead(
    supabase,
    found.lead,
    { status: "lost", lost_reason: trimmed || null },
    createActivity(
      "status_change",
      `Marked lost${trimmed ? ` — ${trimmed}` : ""}`
    )
  )
}
