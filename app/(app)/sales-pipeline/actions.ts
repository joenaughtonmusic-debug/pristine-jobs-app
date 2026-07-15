"use server"

import { revalidatePath } from "next/cache"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { buildManualLeadRow, type ManualLeadInput } from "@/lib/sales-lead-manual"
import {
  advanceStageWithoutAction,
  confirmVisit,
  markJobScheduled,
  markLost,
  markQuoteAccepted,
  markQuoteSent,
  moveToQuote,
  queueContactAndMarkContacted,
  sendFollowUp,
  type TransitionResult,
} from "@/lib/sales-lead-transitions"

// sales_leads has no user_id column; its RLS policies check
// auth.role() = 'authenticated' (migration 032), so the insert runs
// server-side under the signed-in user's session.
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

// Shared wrapper for the stage actions: authenticate, run the transition
// under the signed-in session (sales_leads RLS is authenticated-role, no
// user_id column), refresh the board.
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

export async function markLostAction(
  leadId: string,
  reason: string
): Promise<TransitionResult> {
  return runTransition((supabase) => markLost(supabase, leadId, reason))
}
