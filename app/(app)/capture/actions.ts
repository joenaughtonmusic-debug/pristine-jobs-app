"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export type CaptureDestination = "va" | "quote" | "follow_up"

export type ApproveCaptureResult =
  | { ok: true; warning?: string }
  | { ok: false; error: string }

const DEST_CONFIG: Record<
  CaptureDestination,
  { action_type: string; assigned_to: string; prefix: string }
> = {
  va: { action_type: "va_offload", assigned_to: "VA", prefix: "VA Offload" },
  quote: { action_type: "quote", assigned_to: "Joe", prefix: "Quote" },
  follow_up: {
    action_type: "follow_up",
    assigned_to: "Joe",
    prefix: "Follow-up",
  },
}

// Approve a reviewed capture: it becomes an admin action / to-do at the chosen
// destination, and the capture is marked actioned. Approval is the ONLY thing
// that routes a capture now (capture time no longer auto-creates anything).
export async function approveCaptureAction(
  captureId: string,
  destination: CaptureDestination,
  editedTranscript?: string
): Promise<ApproveCaptureResult> {
  if (!captureId) return { ok: false, error: "No capture given." }
  const config = DEST_CONFIG[destination]
  if (!config) return { ok: false, error: "Unknown destination." }

  const supabase = await createClient()

  const { data: capture, error: readError } = await supabase
    .from("captures")
    .select("id, transcript, status")
    .eq("id", captureId)
    .single()

  if (readError || !capture) {
    return { ok: false, error: readError?.message || "Capture not found." }
  }
  if (capture.status === "actioned") {
    return { ok: false, error: "This capture has already been approved." }
  }

  const transcript = (editedTranscript ?? capture.transcript ?? "").trim()
  if (!transcript) return { ok: false, error: "The note is empty." }

  const excerpt =
    transcript.length > 70 ? `${transcript.slice(0, 70)}…` : transcript
  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + 1)

  const { error: actionError } = await supabase.from("admin_actions").insert({
    title: `${config.prefix}: ${excerpt}`,
    action_type: config.action_type,
    priority: "normal",
    status: "open",
    due_date: dueDate.toISOString().slice(0, 10),
    assigned_to: config.assigned_to,
    notes: transcript,
    // Links the card back to the capture; the partial unique index
    // (idx_admin_actions_open_source) dedupes any double-approve.
    source_record_type: "capture",
    source_record_id: capture.id,
    source_url: "/capture",
  })

  // 23505 = unique violation: an action for this capture already exists.
  if (actionError && actionError.code !== "23505") {
    return { ok: false, error: `Couldn't create the task: ${actionError.message}` }
  }

  // Persist any edit + mark the capture actioned so it leaves the review list.
  const { error: updateError } = await supabase
    .from("captures")
    .update({ transcript, status: "actioned" })
    .eq("id", captureId)

  if (updateError) {
    return {
      ok: false,
      error: `The task was created but updating the capture failed: ${updateError.message}`,
    }
  }

  // Only VA-destined tasks notify the VA by email (same Make/Zoho scenario as
  // lead notifications). A notify failure is a warning, not a hard failure.
  let warning: string | undefined
  if (destination === "va") {
    try {
      const webhookUrl = process.env.NEXT_PUBLIC_LEAD_NOTIFICATION_WEBHOOK_URL
      const vaEmail = process.env.VA_NOTIFICATION_EMAIL
      if (webhookUrl && vaEmail) {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "created",
            enquiry_id: capture.id,
            to_email: vaEmail,
            subject: `New VA task from capture: ${excerpt}`,
            body: [
              "New VA Offload task (approved from capture)",
              "",
              transcript,
              "",
              "Link: /admin/actions",
            ].join("\n"),
            actor_name: "Capture",
            source: "capture",
            summary: transcript,
            link: "/admin/actions",
          }),
        })
        if (!response.ok) throw new Error(await response.text())
      } else {
        warning = "Task created, but the VA email isn't configured here."
      }
    } catch {
      warning = "Task created, but the VA email couldn't be sent."
    }
  }

  revalidatePath("/capture")
  revalidatePath("/admin/actions")
  revalidatePath("/admin/quotes-followups")

  return warning ? { ok: true, warning } : { ok: true }
}
