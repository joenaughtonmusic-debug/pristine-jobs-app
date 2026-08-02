"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { buildMaintenanceEventPayload } from "@/lib/maintenance-calendar"

export type MaintenanceCalendarResult =
  | { ok: true; message: string }
  | { ok: false; error: string }

// Fire the recurring maintenance calendar event for a property. The app can't
// talk to Google Calendar directly — it POSTs the payload to a Make webhook and
// Make creates the recurring event. Guarded against double-creation by the
// gcal_recurring_event_created_at stamp. Human-triggered (a button), never
// silent.
export async function createMaintenanceCalendarEvent(
  propertyId: string,
): Promise<MaintenanceCalendarResult> {
  if (!propertyId) return { ok: false, error: "No property given." }

  const supabase = await createClient()

  const { data: property, error: readError } = await supabase
    .from("properties")
    .select(
      "id, client_name, address_line_1, suburb, service_frequency, default_duration_hours, gcal_recurring_event_created_at",
    )
    .eq("id", propertyId)
    .single()

  if (readError || !property) {
    return { ok: false, error: readError?.message || "Property not found." }
  }

  if (property.gcal_recurring_event_created_at) {
    return {
      ok: false,
      error: "A recurring visit was already added to the calendar for this property.",
    }
  }

  const payload = buildMaintenanceEventPayload(property, new Date())
  if (!payload) {
    return {
      ok: false,
      error:
        "This property has no maintenance frequency set, so there's no recurring visit to add.",
    }
  }

  const webhookUrl = process.env.MAINTENANCE_CALENDAR_WEBHOOK_URL
  if (!webhookUrl) {
    return {
      ok: false,
      error:
        "The calendar automation isn't configured in this environment, so nothing was sent.",
    }
  }

  let response: Response
  try {
    response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    return {
      ok: false,
      error: `Couldn't reach the calendar automation: ${
        e instanceof Error ? e.message : "network error"
      }`,
    }
  }

  if (!response.ok) {
    return {
      ok: false,
      error: `The calendar automation rejected the request (${response.status}).`,
    }
  }

  // Stamp only after a successful send, so a failure leaves the button live.
  const { error: stampError } = await supabase
    .from("properties")
    .update({ gcal_recurring_event_created_at: new Date().toISOString() })
    .eq("id", propertyId)

  if (stampError) {
    return {
      ok: false,
      error: `The event was sent, but recording it failed: ${stampError.message}. Don't click again — check the calendar first.`,
    }
  }

  revalidatePath("/admin/properties")

  return {
    ok: true,
    message: `Recurring maintenance visit added: first visit ${payload.start_date}, every ${payload.interval_weeks} weeks (${payload.duration_hours}h from ${payload.start_time}).`,
  }
}
