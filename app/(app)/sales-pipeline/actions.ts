"use server"

import { revalidatePath } from "next/cache"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import {
  buildExistingCustomerLeadRow,
  buildManualLeadRow,
  type ExistingCustomerLeadInput,
  type ManualLeadInput,
} from "@/lib/sales-lead-manual"
import {
  advanceStageWithoutAction,
  confirmVisit,
  linkQuoteDraft,
  markJobScheduled,
  markLost,
  markQuoteAccepted,
  markQuoteSent,
  markQuoteSentForDraft,
  moveToQuote,
  queueContactAndMarkContacted,
  sendFollowUp,
  setLeadProperty,
  setLeadPropertyForDraft,
  type TransitionResult,
} from "@/lib/sales-lead-transitions"

// sales_leads is admin-write under RLS (migration 041; authenticated users
// can only SELECT). These actions run under the signed-in session — the
// sales-pipeline layout is is_admin()-gated, so that session is an admin's;
// a non-admin hitting an action directly gets a clean refusal from the
// database, not a crash.
export async function createManualLead(
  input: ManualLeadInput
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to add a lead." }
  }

  const built = buildManualLeadRow(input)

  if ("error" in built) {
    return { error: built.error }
  }

  const { error } = await supabase.from("sales_leads").insert(built.row)

  if (error) {
    console.error("[sales-pipeline] manual lead insert failed", {
      code: error.code,
      message: error.message,
    })
    return { error: "Failed to save the lead. Please try again." }
  }

  revalidatePath("/sales-pipeline")
  return { ok: true }
}

// Slice 6: existing customer → lead entering at Visit booked. The property
// is fetched server-side so the row is built from trusted data.
export async function createExistingCustomerLead(
  propertyId: string,
  input: ExistingCustomerLeadInput
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to add a customer." }
  }

  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select(
      "id, client_name, client_email, phone, suburb, address_line_1, property_code"
    )
    .eq("id", propertyId)
    .single()

  if (propertyError || !property) {
    return { error: propertyError?.message || "Customer not found." }
  }

  const built = buildExistingCustomerLeadRow(property, input)

  if ("error" in built) {
    return { error: built.error }
  }

  const { error } = await supabase.from("sales_leads").insert(built.row)

  if (error) {
    console.error("[sales-pipeline] existing-customer lead insert failed", {
      code: error.code,
      message: error.message,
    })
    return { error: "Failed to save the lead. Please try again." }
  }

  revalidatePath("/sales-pipeline")
  return { ok: true }
}

// Shared wrapper for the stage actions: authenticate, run the transition
// under the signed-in session (admin-write RLS per migration 041 — see the
// note at the top of this file), refresh the board.
async function runTransition(
  transition: (supabase: SupabaseClient) => Promise<TransitionResult>
): Promise<TransitionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in." }
  }

  const result = await transition(supabase)

  if ("ok" in result) {
    revalidatePath("/sales-pipeline")
  }

  return result
}

export async function contactLeadAction(
  leadId: string,
  input: { subject: string; body: string }
): Promise<TransitionResult> {
  return runTransition((supabase) =>
    queueContactAndMarkContacted(supabase, leadId, input)
  )
}

export async function confirmVisitAction(
  leadId: string,
  siteVisitAt: string
): Promise<TransitionResult> {
  return runTransition((supabase) => confirmVisit(supabase, leadId, siteVisitAt))
}

export async function moveToQuoteAction(
  leadId: string
): Promise<TransitionResult> {
  return runTransition((supabase) => moveToQuote(supabase, leadId))
}

export async function markQuoteSentAction(
  leadId: string
): Promise<TransitionResult> {
  return runTransition((supabase) => markQuoteSent(supabase, leadId))
}

export async function markQuoteAcceptedAction(
  leadId: string
): Promise<TransitionResult> {
  return runTransition((supabase) => markQuoteAccepted(supabase, leadId))
}

export async function markJobScheduledAction(
  leadId: string
): Promise<TransitionResult> {
  return runTransition((supabase) => markJobScheduled(supabase, leadId))
}

export async function advanceStageAction(
  leadId: string
): Promise<TransitionResult> {
  return runTransition((supabase) => advanceStageWithoutAction(supabase, leadId))
}

export async function sendFollowUpAction(
  leadId: string,
  input: { subject: string; body: string }
): Promise<TransitionResult> {
  return runTransition((supabase) => sendFollowUp(supabase, leadId, input))
}

// Phase 2: called by the quote builder after saving a draft that was opened
// from a pipeline lead (/admin/quotes?lead=<id>). Also refreshes the board
// the builder can't reach via its own revalidate.
export async function linkQuoteDraftAction(
  leadId: string,
  quoteDraftId: string
): Promise<TransitionResult> {
  return runTransition((supabase) =>
    linkQuoteDraft(supabase, leadId, quoteDraftId)
  )
}

// Brief 03: called by the quote builder when a proposal is queued for Make —
// advances the linked lead to Quote sent (2-day follow-up) without a second
// board click. No linked lead, or already past Quote: quiet no-op.
export async function markQuoteSentForDraftAction(
  quoteDraftId: string
): Promise<TransitionResult> {
  return runTransition((supabase) =>
    markQuoteSentForDraft(supabase, quoteDraftId)
  )
}

// Brief 03: property created for a lead's customer (new-customer save in the
// builder) — write sales_leads.property_id.
export async function setLeadPropertyAction(
  leadId: string,
  propertyId: string
): Promise<TransitionResult> {
  return runTransition((supabase) => setLeadProperty(supabase, leadId, propertyId))
}

// Brief 03: same link resolved via the draft (accepted-quote conversion).
export async function setLeadPropertyForDraftAction(
  quoteDraftId: string,
  propertyId: string
): Promise<TransitionResult> {
  return runTransition((supabase) =>
    setLeadPropertyForDraft(supabase, quoteDraftId, propertyId)
  )
}

// Migration 047: structured job type, editable from the expanded card. The
// CHECK constraint is the backstop; the UI only offers the three values.
export async function setLeadJobTypeAction(
  leadId: string,
  jobType: "maintenance" | "one_off" | "landscaping" | null
): Promise<TransitionResult> {
  return runTransition(async (supabase) => {
    const { error } = await supabase
      .from("sales_leads")
      .update({ job_type: jobType, updated_at: new Date().toISOString() })
      .eq("id", leadId)

    return error ? { error: error.message } : { ok: true }
  })
}

export async function markLostAction(
  leadId: string,
  reason: string
): Promise<TransitionResult> {
  return runTransition((supabase) => markLost(supabase, leadId, reason))
}

// --- Slice 5: invoiced jobs section ----------------------------------------
// Paid is app-only tracking on scheduled_jobs — it never touches Xero.

export async function setInvoicePaidAction(
  jobId: string,
  paid: boolean
): Promise<TransitionResult> {
  return runTransition(async (supabase) => {
    const { error } = await supabase
      .from("scheduled_jobs")
      .update({ invoice_paid_in_app_at: paid ? new Date().toISOString() : null })
      .eq("id", jobId)
      .not("xero_invoice_number", "is", null)

    return error ? { error: error.message } : { ok: true }
  })
}

// Archive every row currently ticked paid off the page.
export async function clearPaidInvoicesAction(): Promise<TransitionResult> {
  return runTransition(async (supabase) => {
    const { error } = await supabase
      .from("scheduled_jobs")
      .update({ invoice_archived_at: new Date().toISOString() })
      .not("invoice_paid_in_app_at", "is", null)
      .is("invoice_archived_at", null)

    return error ? { error: error.message } : { ok: true }
  })
}
