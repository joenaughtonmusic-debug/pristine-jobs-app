import type { SupabaseClient } from "@supabase/supabase-js"

// Customer photo email (Brief_Photo_Email_To_Customer): pure-ish helpers
// shared by the actions-page loader and the server actions, so the pile,
// the preview, and the server-side send gates all use ONE definition of
// "customer-visible photo" and ONE recipient rule.

export const PHOTO_PAGE_BASE = "https://photos.pristinegardens.co.nz/v/"

// The VA's operating standard — rendered verbatim, always visible, in the
// review modal (brief section 5).
export const HIDE_CRITERIA_TEXT =
  "Hide a photo if it's blurry or badly framed; if it shows weeds, dead or " +
  "dying plants, or rubbish; or if it makes the job look half-done. If " +
  "you're unsure, hide it."

export const SKIP_REASONS = [
  "Photos not good enough",
  "Not appropriate to send",
  "Other",
] as const

export type PhotoEmailPhoto = {
  id: string
  public_url: string
  hidden: boolean
}

export type PhotoEmailCard = {
  visitId: string
  visitDate: string
  propertyId: string
  address: string
  clientName: string
  photoCount: number // visible (non-hidden) customer photos
  photos: PhotoEmailPhoto[]
  publicToken: string
  isPmManaged: boolean
  pmName: string | null
  recipientEmail: string | null // resolved per the recipient rule; null = error state
  recipientError: string | null // e.g. PM-managed with no PM email — never fall back
  ageDays: number
  expired: boolean // older than 7 days (still sendable from the Expired list)
}

// Recipient rule (Joe, 2 Aug): PM-managed (a property manager is assigned)
// -> the PM's email; no silent fallback to the property contact — a missing
// PM email is an ERROR STATE on the card. Otherwise the property's contact
// email.
export function resolveRecipient(input: {
  isPmManaged: boolean
  pmEmail: string | null
  clientEmail: string | null
}): { email: string | null; error: string | null } {
  if (input.isPmManaged) {
    const email = input.pmEmail?.trim() || null
    return email
      ? { email, error: null }
      : {
          email: null,
          error:
            "This property's manager has no email — add one on the property before sending.",
        }
  }
  const email = input.clientEmail?.trim() || null
  return email
    ? { email, error: null }
    : { email: null, error: "This property has no contact email — add one before sending." }
}

// Deterministic NZ date (no toLocaleString in SSR text).
export function formatNzDate(value: string | null | undefined): string {
  if (!value) return ""
  const [y, m, d] = value.slice(0, 10).split("-").map(Number)
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"]
  if (!y || !m || !d) return ""
  return `${d} ${months[m - 1]} ${y}`
}

// The email itself. Short, warm, person-shaped. Link only — no attachments,
// no pricing, no staff names, no internal notes (brief section 6).
export function buildPhotoEmail(input: {
  recipientName: string | null
  address: string
  visitDate: string // already formatted
  publicToken: string
}): { subject: string; body: string } {
  const firstName = input.recipientName?.trim().split(/\s+/)[0] || null
  return {
    subject: `Photos from our visit — ${input.address}`,
    body: [
      firstName ? `Hi ${firstName},` : "Hi,",
      "",
      `The team finished up at ${input.address} on ${input.visitDate} and took a few photos of the work. You can see them here:`,
      "",
      `${PHOTO_PAGE_BASE}${input.publicToken}`,
      "",
      "Any questions, just reply to this email — happy to help.",
      "",
      "Thanks,",
      "Pristine Gardens",
    ].join("\n"),
  }
}

// ONE definition of "customer-visible photo", identical to /v/[token]:
// after/completion, has a URL, not hidden; tagged to the visit, or untagged
// on the same job.
export async function loadCustomerPhotos(
  supabase: SupabaseClient,
  visit: { id: string; scheduled_job_id: string | null }
): Promise<{ id: string; public_url: string; hidden: boolean }[]> {
  let query = supabase
    .from("job_photos")
    .select("id, public_url, hidden_from_customer_at, created_at")
    .in("photo_type", ["after", "completion"])
    .not("public_url", "is", null)
    .order("created_at", { ascending: true })

  query = visit.scheduled_job_id
    ? query.or(
        `visit_id.eq.${visit.id},and(visit_id.is.null,scheduled_job_id.eq.${visit.scheduled_job_id})`
      )
    : query.eq("visit_id", visit.id)

  const { data } = await query
  return (data || []).map((p) => ({
    id: p.id as string,
    public_url: p.public_url as string,
    hidden: p.hidden_from_customer_at != null,
  }))
}
