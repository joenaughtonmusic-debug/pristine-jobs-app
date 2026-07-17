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

  const queueError = await queueClientEmail(supabase, recipient, subject, body)
  if (queueError) return queueError

  const nextFollowUpAt = addDaysFromNow(2)

  const updated = await updateLead(
    supabase,
    lead,
    { status: "contacted", next_follow_up_at: nextFollowUpAt },
    createActivity(
      "communication",
      `Contact email queued to ${recipient}: "${subject}"\n\n${body}`
    ),
    createActivity("status_change", "New lead → Contacted"),
    createActivity(
      "follow_up",
      `Follow-up due ${formatDateTime(nextFollowUpAt)} if no reply.`
    )
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

async function queueClientEmail(
  supabase: SupabaseClient,
  recipient: string,
  subject: string,
  body: string
): Promise<TransitionResult | null> {
  const { error } = await supabase.from("client_contact_messages").insert({
    recipient_email: recipient,
    subject,
    body,
    status: "ready_to_send",
  })

  return error
    ? { error: `Could not queue the email: ${error.message}` }
    : null
}

// Send a follow-up for the lead's current stage (Slice 4). Contacted stage
// has one 2-day follow-up; the Quote stage walks the 3/7/14-day ladder
// (lead-level mirror of the quote_drafts fields — leads aren't linked to
// quote drafts until Phase 2). Queues via client_contact_messages, stamps
// the sent-at field, and schedules the next rung.
export async function sendFollowUp(
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

  const recipient = lead.email?.trim()
  if (!recipient) {
    return { error: "This lead has no email address — add one first." }
  }

  let patch: Record<string, unknown>
  let rungLabel: string

  if (lead.status === "contacted") {
    if (lead.contact_followup_sent_at) {
      return { error: "The contact follow-up has already been sent." }
    }
    patch = {
      contact_followup_sent_at: new Date().toISOString(),
      next_follow_up_at: null,
    }
    rungLabel = "Contacted-stage follow-up"
  } else if (lead.status === "quote_sent" || lead.status === "follow_up_due") {
    if (!lead.followup_3day_sent_at) {
      patch = {
        followup_3day_sent_at: new Date().toISOString(),
        next_follow_up_at: addDaysFromNow(4), // 3-day → 7-day rung
      }
      rungLabel = "Quote follow-up 1 of 3 (3-day)"
    } else if (!lead.followup_7day_sent_at) {
      patch = {
        followup_7day_sent_at: new Date().toISOString(),
        next_follow_up_at: addDaysFromNow(7), // 7-day → 14-day rung
      }
      rungLabel = "Quote follow-up 2 of 3 (7-day)"
    } else if (!lead.followup_14day_sent_at) {
      patch = {
        followup_14day_sent_at: new Date().toISOString(),
        next_follow_up_at: null,
      }
      rungLabel = "Quote follow-up 3 of 3 (14-day)"
    } else {
      return { error: "All quote follow-ups have already been sent." }
    }
  } else {
    return { error: "This stage doesn't have follow-ups." }
  }

  const queueError = await queueClientEmail(supabase, recipient, subject, body)
  if (queueError) return queueError

  const activities = [
    createActivity(
      "follow_up",
      `${rungLabel} queued to ${recipient}: "${subject}"\n\n${body}`
    ),
  ]

  if (patch.next_follow_up_at) {
    activities.push(
      createActivity(
        "follow_up",
        `Next follow-up due ${formatDateTime(patch.next_follow_up_at as string)}.`
      )
    )
  }

  const updated = await updateLead(supabase, lead, patch, ...activities)

  if ("error" in updated) {
    return {
      error: `The follow-up was queued and will still be sent, but the card could not be updated (${updated.error}). Refresh the page and do NOT send again.`,
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

// Phase 2: a quote draft saved in the quote builder (opened via
// /admin/quotes?lead=<id>) links back to its lead, write-once. No status
// change — the lead advances when Joe marks the quote sent, not when the
// draft is saved.
export async function linkQuoteDraft(
  supabase: SupabaseClient,
  leadId: string,
  quoteDraftId: string
): Promise<TransitionResult> {
  if (!quoteDraftId.trim()) {
    return { error: "Missing quote draft id." }
  }

  const found = await getLead(supabase, leadId)
  if ("error" in found) return found
  const { lead } = found

  if (lead.quote_draft_id) {
    return lead.quote_draft_id === quoteDraftId
      ? { ok: true }
      : {
          error:
            "This lead is already linked to a different quote draft — check the activity thread.",
        }
  }

  // Guarded at the database, not just the read above: `.is(..., null)` makes
  // the write-once atomic (same pattern as first_scheduled_job_id in the
  // quote builder), so two concurrent saves can't both link.
  const { data: updated, error } = await supabase
    .from("sales_leads")
    .update({
      quote_draft_id: quoteDraftId,
      notes: appendActivities(
        lead.notes,
        createActivity(
          "note",
          "Quote draft created in the quote builder and linked to this lead."
        )
      ),
    })
    .eq("id", lead.id)
    .is("quote_draft_id", null)
    .select("id")

  if (error) {
    return { error: error.message }
  }

  if (!updated || updated.length === 0) {
    return {
      error:
        "Another quote draft was linked to this lead at the same time — refresh the board and check which draft is linked before sending anything.",
    }
  }

  return { ok: true }
}

// Brief 03: queueing a proposal send from the quote builder IS the "quote
// sent" stage action, so the linked lead advances without a second click on
// the board. Only advances forward from pre-quote stages — a lead already at
// Quote sent or beyond is left alone (ok, not an error: a resend shouldn't
// fail the queue flow).
const PRE_QUOTE_STATUSES: SalesLeadStatus[] = [
  "new",
  "contacted",
  "visit_booked",
  "estimate_done",
]

export async function markQuoteSentForDraft(
  supabase: SupabaseClient,
  quoteDraftId: string
): Promise<TransitionResult> {
  const { data: lead, error } = await supabase
    .from("sales_leads")
    .select("id, status")
    .eq("quote_draft_id", quoteDraftId)
    .maybeSingle()

  if (error) {
    return { error: error.message }
  }

  if (!lead || !PRE_QUOTE_STATUSES.includes(lead.status)) {
    return { ok: true }
  }

  return markQuoteSent(supabase, lead.id)
}

// Brief 03: when a property is created for a lead's customer (new-customer
// save or accepted-quote conversion), the lead gets its property link.
// Never overwrites an existing link.
export async function setLeadProperty(
  supabase: SupabaseClient,
  leadId: string,
  propertyId: string
): Promise<TransitionResult> {
  if (!propertyId.trim()) {
    return { error: "Missing property id." }
  }

  const found = await getLead(supabase, leadId)
  if ("error" in found) return found
  const { lead } = found

  if (lead.property_id) {
    return { ok: true }
  }

  return updateLead(
    supabase,
    lead,
    { property_id: propertyId },
    createActivity("note", "Customer property created and linked to this lead.")
  )
}

// Same link, but resolved via the lead's quote draft — used where the builder
// only knows the draft (accepted-quote conversion). No linked lead is fine.
export async function setLeadPropertyForDraft(
  supabase: SupabaseClient,
  quoteDraftId: string,
  propertyId: string
): Promise<TransitionResult> {
  const { data: lead, error } = await supabase
    .from("sales_leads")
    .select("id")
    .eq("quote_draft_id", quoteDraftId)
    .maybeSingle()

  if (error) {
    return { error: error.message }
  }

  if (!lead) {
    return { ok: true }
  }

  return setLeadProperty(supabase, lead.id, propertyId)
}

// Phase 2: the public quote page stamps acceptance on the linked lead.
// Stamp only — advancement stays manual (Phase 1 spec §7); the card is moved
// when the job is scheduled. Idempotent so a double-submit can't error the
// customer's accept page.
export async function recordOnlineQuoteAcceptance(
  supabase: SupabaseClient,
  leadId: string,
  acceptedName?: string | null
): Promise<TransitionResult> {
  const found = await getLead(supabase, leadId)
  if ("error" in found) return found

  if (found.lead.quote_accepted_at) {
    return { ok: true }
  }

  return updateLead(
    supabase,
    found.lead,
    { quote_accepted_at: new Date().toISOString() },
    createActivity(
      "communication",
      `Customer accepted the quote online${
        acceptedName?.trim() ? ` (name given: ${acceptedName.trim()})` : ""
      }.`
    )
  )
}

// A decline is logged but changes nothing — the customer may still be worth a
// call, so marking Lost stays a human decision.
export async function recordOnlineQuoteDecline(
  supabase: SupabaseClient,
  leadId: string
): Promise<TransitionResult> {
  const found = await getLead(supabase, leadId)
  if ("error" in found) return found

  return updateLead(
    supabase,
    found.lead,
    {},
    createActivity(
      "communication",
      "Customer declined the quote online. No status change — review and mark lost if appropriate."
    )
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
