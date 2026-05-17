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

  return <AdminEnquiriesClient enquiries={enquiries || []} />
}