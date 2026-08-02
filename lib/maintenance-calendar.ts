// Recurring maintenance calendar event: pure helpers that turn a property's
// maintenance frequency into a "every N weeks, on a Monday" Google Calendar
// recurrence. The app can't reach Google Calendar directly — it POSTs this
// payload to a Make webhook and Make creates the event.
//
// Every maintenance frequency is already stored as an interval in WEEKS
// (service-frequency.ts getServiceIntervalWeeks), so all of them map to the
// same weekly rule on Monday — "monthly" becomes "every 4 weeks on Monday",
// etc. That keeps every visit on a work Monday with no month/date ambiguity.

import { getServiceIntervalWeeks } from "@/lib/service-frequency"

// The next Monday strictly after `from` (never today, even if today is Monday —
// a freshly accepted quote's first visit shouldn't be "in a few hours").
export function nextMonday(from: Date): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  // getDay(): 0=Sun..6=Sat. Days until the next Monday (1), always 1..7.
  const delta = ((8 - d.getDay()) % 7) || 7
  d.setDate(d.getDate() + delta)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export type MaintenanceEventPayload = {
  property_id: string
  property_name: string
  location: string
  start_date: string // YYYY-MM-DD, a Monday
  start_time: string // HH:mm, local
  duration_hours: number
  interval_weeks: number
  frequency_label: string
  rrule: string // Google Calendar recurrence
}

const DEFAULT_START_TIME = "09:00"
const DEFAULT_DURATION_HOURS = 4

// Returns null when the property isn't eligible for a recurring event
// (no frequency, one-off, or a frequency with no week interval).
export function buildMaintenanceEventPayload(
  property: {
    id: string
    client_name?: string | null
    address_line_1?: string | null
    suburb?: string | null
    service_frequency?: string | null
    default_duration_hours?: number | null
  },
  from: Date,
): MaintenanceEventPayload | null {
  const weeks = getServiceIntervalWeeks(property.service_frequency)
  if (!weeks) return null

  const location = [property.address_line_1, property.suburb]
    .filter(Boolean)
    .join(", ")

  return {
    property_id: property.id,
    property_name: property.client_name || location || "Maintenance visit",
    location,
    start_date: nextMonday(from),
    start_time: DEFAULT_START_TIME,
    duration_hours: property.default_duration_hours || DEFAULT_DURATION_HOURS,
    interval_weeks: weeks,
    frequency_label: property.service_frequency || "",
    rrule: `RRULE:FREQ=WEEKLY;INTERVAL=${weeks};BYDAY=MO`,
  }
}
