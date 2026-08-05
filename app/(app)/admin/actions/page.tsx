import { createClient } from "@/lib/supabase/server"
import { AdminActionsClient } from "@/components/admin-actions-client"
import { PhotoEmailReview } from "@/components/photo-email-review"
import {
  loadCustomerPhotos,
  resolveRecipient,
  type PhotoEmailCard,
} from "@/lib/photo-email"

export const dynamic = "force-dynamic"

// The photo-email review pile (Brief_Photo_Email_To_Customer section 3):
// completed visits at opted-in properties, unsent, unskipped. Driven by photo
// readiness — a visit becomes a card once customer-visible photos exist.
// 7-day main pile; everything older drops to the collapsed Expired list.
// NO upper time bound: the brief forbids silently discarding lapsed visits
// ("Joe needs to see what lapsed, particularly on PM properties"). The
// candidate set is naturally small — send_photos is opt-in and off by default.
async function loadPhotoEmailCards(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<PhotoEmailCard[]> {
  const { data: visits } = await supabase
    .from("visits")
    .select(
      `id, visit_date, property_id, scheduled_job_id, public_token,
       properties!inner (
         id, client_name, client_email, address_line_1, suburb,
         send_photos, property_manager_id
       )`
    )
    .eq("completion_status", "completed")
    .is("photo_email_sent_at", null)
    .is("photo_email_skip_reason", null)
    .eq("properties.send_photos", true)
    .order("visit_date", { ascending: false })

  if (!visits || visits.length === 0) return []

  // PM contacts in one batch.
  const pmIds = Array.from(
    new Set(
      visits
        .map((v) => (v.properties as any)?.property_manager_id)
        .filter(Boolean)
    )
  )
  const pmById = new Map<string, { name: string | null; email: string | null }>()
  if (pmIds.length > 0) {
    const { data: pms } = await supabase
      .from("property_managers")
      .select("id, name, email")
      .in("id", pmIds)
    for (const pm of pms || []) {
      pmById.set(pm.id as string, { name: pm.name, email: pm.email })
    }
  }

  const todayMs = Date.now()
  const cards: PhotoEmailCard[] = []

  for (const visit of visits) {
    const property = visit.properties as any
    if (!property) continue

    const photos = await loadCustomerPhotos(supabase, {
      id: visit.id as string,
      scheduled_job_id: visit.scheduled_job_id as string | null,
    })
    // Photo-readiness gate: no customer-type photos yet -> not a card yet.
    if (photos.length === 0) continue

    const isPmManaged = Boolean(property.property_manager_id)
    const pm = isPmManaged ? pmById.get(property.property_manager_id) : undefined
    const recipient = resolveRecipient({
      isPmManaged,
      pmEmail: pm?.email ?? null,
      clientEmail: property.client_email ?? null,
    })

    const ageDays = Math.max(
      0,
      Math.floor(
        (todayMs - new Date(`${String(visit.visit_date).slice(0, 10)}T00:00:00`).getTime()) /
          (24 * 60 * 60 * 1000)
      )
    )

    cards.push({
      visitId: visit.id as string,
      visitDate: String(visit.visit_date).slice(0, 10),
      propertyId: property.id,
      address: [property.address_line_1, property.suburb].filter(Boolean).join(", "),
      clientName: property.client_name || "",
      photoCount: photos.filter((p) => !p.hidden).length,
      photos,
      publicToken: visit.public_token as string,
      isPmManaged,
      pmName: pm?.name ?? null,
      recipientEmail: recipient.email,
      recipientError: recipient.error,
      ageDays,
      expired: ageDays > 7,
    })
  }

  return cards
}

export default async function AdminActionsPage() {
  const supabase = await createClient()

  const photoEmailCards = await loadPhotoEmailCards(supabase)

  const { data: actions } = await supabase
    .from("admin_actions")
    .select(`
      *,
      properties (
        id,
        client_name,
        address_line_1,
        suburb
      )
    `)
    // Default to open actions only — hide terminal states (done, and
    // dismissed, which is what auto-closed labour-recon clutter uses).
    .not("status", "in", "(done,dismissed)")
    // Quote / follow-up to-dos live on Joe's own Quotes & Follow-ups page,
    // not on this shared board.
    .not("action_type", "in", "(quote,follow_up)")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })

  const { data: properties } = await supabase
    .from("properties")
    .select(`
      id,
      property_code,
      client_name,
      address_line_1,
      suburb,
      is_active
    `)
    .eq("is_active", true)
    .order("client_name", { ascending: true })

  return (
    <>
      <PhotoEmailReview cards={photoEmailCards} />
      <AdminActionsClient
        actions={actions || []}
        properties={properties || []}
      />
    </>
  )
}