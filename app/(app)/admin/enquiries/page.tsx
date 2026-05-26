import { createClient } from "@/lib/supabase/server"
import { AdminEnquiriesClient } from "@/components/admin-enquiries-client"

export const dynamic = "force-dynamic"

export default async function AdminEnquiriesPage() {
  const supabase = await createClient()

  const { data: enquiries } = await supabase
    .from("admin_enquiries")
    .select("*")
    .neq("status", "archived")
    .order("created_at", { ascending: false })

  const { data: communications } = await supabase
    .from("communications")
    .select("enquiry_id")
    .not("enquiry_id", "is", null)

  const communicationCounts = new Map<string, number>()

  communications?.forEach((communication) => {
    if (!communication.enquiry_id) return

    communicationCounts.set(
      communication.enquiry_id,
      (communicationCounts.get(communication.enquiry_id) || 0) + 1
    )
  })

  const enquiriesWithCounts = (enquiries || []).map((enquiry) => ({
    ...enquiry,
    communication_count: communicationCounts.get(enquiry.id) || 0,
  }))

  return <AdminEnquiriesClient enquiries={enquiriesWithCounts} />
}
