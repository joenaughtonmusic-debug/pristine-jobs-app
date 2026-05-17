import { createClient } from "@/lib/supabase/server"
import { AdminActionsClient } from "@/components/admin-actions-client"

export const dynamic = "force-dynamic"

export default async function AdminActionsPage() {
  const supabase = await createClient()

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
    .neq("status", "done")
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
    <AdminActionsClient
      actions={actions || []}
      properties={properties || []}
    />
  )
}