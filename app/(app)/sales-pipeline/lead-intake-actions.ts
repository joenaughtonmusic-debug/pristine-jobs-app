"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { extractLead, BLANK_EXTRACTION } from "@/lib/lead-extraction"
import { buildManualLeadRow, type ManualLeadInput } from "@/lib/sales-lead-manual"
import { sendLeadNotificationToJoe } from "@/lib/lead-notifications"

const PASTE_SOURCES = new Set(["messenger", "bark", "other"])

// Paste -> extract -> insert a pending_approval row. The AI call NEVER blocks a
// paste from being captured: on failure the row still lands with a BLANK
// extraction + extraction_error, so it surfaces as a blank flagged card. Never
// a silent drop, never a partial write (single insert).
export async function createLeadIntake(input: {
  rawSource: string
  source: string
}): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "You must be signed in." }

  const rawSource = (input.rawSource || "").trim()
  if (!rawSource) return { error: "Paste the enquiry text first." }
  const source = PASTE_SOURCES.has(input.source) ? input.source : "other"

  // Received date drives relative-date resolution in the prompt. NZ calendar day.
  const receivedDateISO = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())

  const outcome = await extractLead(rawSource, receivedDateISO)

  const row = {
    channel: "paste",
    source,
    raw_source: rawSource,
    extraction: outcome.ok ? outcome.extraction : BLANK_EXTRACTION,
    extraction_error: outcome.ok ? null : outcome.error,
    status: "pending_approval",
    created_by: user.id,
  }

  const { error } = await supabase.from("lead_intake").insert(row)
  if (error) {
    console.error("[lead-intake] insert failed", { code: error.code, message: error.message })
    return { error: "Couldn't save the pasted enquiry. Please try again." }
  }

  revalidatePath("/sales-pipeline")
  return { ok: true }
}

// Approve: the confirm form's (edited) fields become a manual lead, then the
// intake is stamped approved + linked. The board never sees anything until now.
export async function approveLeadIntake(input: {
  intakeId: string
  lead: ManualLeadInput
}): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "You must be signed in." }

  const built = buildManualLeadRow(input.lead)
  if ("error" in built) return { error: built.error }

  const { data: createdLead, error: leadError } = await supabase
    .from("sales_leads")
    .insert(built.row)
    .select("id")
    .single()
  if (leadError || !createdLead) {
    console.error("[lead-intake] approve -> lead insert failed", {
      code: leadError?.code,
      message: leadError?.message,
    })
    return { error: "Couldn't create the lead. Please try again." }
  }

  const { error: stampError } = await supabase
    .from("lead_intake")
    .update({
      status: "approved",
      approved_sales_lead_id: createdLead.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.intakeId)
    .eq("status", "pending_approval")
  if (stampError) {
    // The lead exists; surface the stamp failure rather than hide it. The intake
    // stays pending and will show a still-pending card — not a silent success.
    console.error("[lead-intake] approve stamp failed", { message: stampError.message })
    return { error: "Lead created, but the tray didn't update. Refresh and check." }
  }

  // Notify after success; a notify failure never fails the approval.
  try {
    await sendLeadNotificationToJoe({
      supabase,
      enquiry: {
        id: createdLead.id,
        name: built.row.name,
        suburb: built.row.suburb,
        job_type: built.row.job_type ?? null,
        notes: built.row.message,
        source: built.row.source,
        link_path: "/sales-pipeline",
      },
      action: "created",
    })
  } catch (e) {
    console.error(
      `LEAD_NOTIFY_FAILED lead=${createdLead.id} source=${built.row.source} error=${
        e instanceof Error ? e.message : String(e)
      }`
    )
  }

  revalidatePath("/sales-pipeline")
  return { ok: true }
}

export async function dismissLeadIntake(
  intakeId: string
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("lead_intake")
    .update({ status: "dismissed", dismissed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", intakeId)
    .eq("status", "pending_approval")
  if (error) return { error: "Couldn't dismiss. Please try again." }
  revalidatePath("/sales-pipeline")
  return { ok: true }
}

export async function restoreLeadIntake(
  intakeId: string
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("lead_intake")
    .update({ status: "pending_approval", dismissed_at: null, updated_at: new Date().toISOString() })
    .eq("id", intakeId)
    .eq("status", "dismissed")
  if (error) return { error: "Couldn't restore. Please try again." }
  revalidatePath("/sales-pipeline")
  return { ok: true }
}
