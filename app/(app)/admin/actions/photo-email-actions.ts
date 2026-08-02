"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import {
  SKIP_REASONS,
  buildPhotoEmail,
  formatNzDate,
  loadCustomerPhotos,
  resolveRecipient,
} from "@/lib/photo-email"

// Copies of PM sends go to Joe (brief section 6). Same hardcoded address as
// lib/lead-notifications (moves server-side with the Tier 5 proxy item).
const JOE_COPY_EMAIL = "joenaughtonmusic@gmail.com"

export type PhotoEmailActionResult =
  | { ok: true; warning?: string }
  | { error: string }

// Hide/unhide a photo from the customer view. Saves immediately (brief
// section 5); the public page reads live, so the change is instant there.
export async function setPhotoHiddenAction(
  photoId: string,
  hidden: boolean
): Promise<PhotoEmailActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("job_photos")
    .update({ hidden_from_customer_at: hidden ? new Date().toISOString() : null })
    .eq("id", photoId)

  if (error) return { error: error.message }
  revalidatePath("/admin/actions")
  return { ok: true }
}

// Send the photo email. EVERY gate re-checked server-side (brief guardrail:
// the send_photos gate is enforced here, not by UI visibility).
export async function sendPhotoEmailAction(
  visitId: string
): Promise<PhotoEmailActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "You must be signed in." }

  const { data: visit, error: visitError } = await supabase
    .from("visits")
    .select("id, visit_date, property_id, scheduled_job_id, public_token, photo_email_sent_at")
    .eq("id", visitId)
    .maybeSingle()
  if (visitError || !visit) return { error: visitError?.message || "Visit not found." }
  if (visit.photo_email_sent_at) {
    return { error: "A photo email has already been sent for this visit." }
  }

  const { data: property } = await supabase
    .from("properties")
    .select("id, client_name, client_email, address_line_1, suburb, send_photos, property_manager_id")
    .eq("id", visit.property_id)
    .maybeSingle()
  if (!property) return { error: "Property not found." }
  if (!property.send_photos) {
    return { error: "This property is not opted in to photo emails." }
  }

  let pmName: string | null = null
  let pmEmail: string | null = null
  if (property.property_manager_id) {
    const { data: pm } = await supabase
      .from("property_managers")
      .select("name, email")
      .eq("id", property.property_manager_id)
      .maybeSingle()
    pmName = pm?.name || null
    pmEmail = pm?.email || null
  }

  const recipient = resolveRecipient({
    isPmManaged: Boolean(property.property_manager_id),
    pmEmail,
    clientEmail: property.client_email,
  })
  if (!recipient.email) return { error: recipient.error || "No recipient email." }

  const photos = await loadCustomerPhotos(supabase, visit)
  const visibleCount = photos.filter((p) => !p.hidden).length
  if (visibleCount === 0) {
    return { error: "All photos are hidden — unhide at least one before sending." }
  }

  const address = [property.address_line_1, property.suburb].filter(Boolean).join(", ")
  const email = buildPhotoEmail({
    recipientName: property.property_manager_id ? pmName : property.client_name,
    address,
    visitDate: formatNzDate(visit.visit_date),
    publicToken: visit.public_token as string,
  })

  // Atomic claim: stamp sent_at ONLY if still null. This both prevents a
  // double-send race (two tabs/admins) and reserves the visit before we queue
  // anything. If it claims nothing, someone already sent.
  const { data: claimed, error: claimError } = await supabase
    .from("visits")
    .update({ photo_email_sent_at: new Date().toISOString() })
    .eq("id", visitId)
    .is("photo_email_sent_at", null)
    .select("id")
    .maybeSingle()
  if (claimError) return { error: `Could not reserve the visit: ${claimError.message}` }
  if (!claimed) return { error: "A photo email has already been sent for this visit." }

  // Queue the customer email. If THIS fails, release the claim so the card is
  // actionable again (Joe, 2 Aug: customer-queue failure -> sent_at back to null).
  const { error: queueError } = await supabase.from("client_contact_messages").insert({
    scheduled_job_id: visit.scheduled_job_id,
    property_id: property.id,
    recipient_email: recipient.email,
    subject: email.subject,
    body: email.body,
    status: "ready_to_send",
  })
  if (queueError) {
    await supabase.from("visits").update({ photo_email_sent_at: null }).eq("id", visitId)
    return { error: `Could not queue the email: ${queueError.message}` }
  }

  // Customer email is away — the claim stands from here no matter what (A4).
  let warning: string | undefined

  // PM sends copy Joe; residential sends do not. The queue table has no BCC,
  // so this is a second message. A failure must NOT roll back the send — but
  // it also must not vanish into a toast (Joe stays informed on PM accounts):
  // record it as a durable admin action.
  if (property.property_manager_id) {
    const { error: copyError } = await supabase.from("client_contact_messages").insert({
      scheduled_job_id: visit.scheduled_job_id,
      property_id: property.id,
      recipient_email: JOE_COPY_EMAIL,
      subject: `[PM copy] ${email.subject}`,
      body: `Copy of the photo email sent to ${pmName || "the property manager"} (${recipient.email}).\n\n---\n\n${email.body}`,
      status: "ready_to_send",
    })
    if (copyError) {
      warning = `Sent to the PM, but Joe's copy failed to queue (${copyError.message}). Logged as an admin action.`
      await supabase.from("admin_actions").insert({
        title: `PM photo-email copy to Joe failed — ${address}`,
        action_type: "photo_email_pm_copy_failed",
        priority: "high",
        status: "open",
        assigned_to: "Joe",
        property_id: property.id,
        notes: `The customer photo email was sent to the PM (${recipient.email}) but Joe's [PM copy] did not queue: ${copyError.message}`,
      })
    }
  }

  revalidatePath("/admin/actions")
  return warning ? { ok: true, warning } : { ok: true }
}

// Skip: clears the card out of the pile. Reason REQUIRED (brief section 5).
export async function skipPhotoEmailAction(
  visitId: string,
  reason: string,
  note: string
): Promise<PhotoEmailActionResult> {
  const supabase = await createClient()

  if (!(SKIP_REASONS as readonly string[]).includes(reason)) {
    return { error: "Pick a skip reason first." }
  }
  if (reason === "Other" && !note.trim()) {
    return { error: "Add a short note for 'Other'." }
  }

  const stored = note.trim() ? `${reason} — ${note.trim()}` : reason
  const { error } = await supabase
    .from("visits")
    .update({ photo_email_skip_reason: stored })
    .eq("id", visitId)
    .is("photo_email_sent_at", null)

  if (error) return { error: error.message }
  revalidatePath("/admin/actions")
  return { ok: true }
}
