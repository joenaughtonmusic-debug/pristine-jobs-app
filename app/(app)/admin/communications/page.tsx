import { createClient } from "@/lib/supabase/server"
import AdminCommunicationsClient from "@/components/admin-communications-client"

export const dynamic = "force-dynamic"

type Props = {
  searchParams?:
    | {
        status?: string
        channel?: string
        enquiry?: string
        category?: string
        priority?: string
        assigned_to?: string
      }
    | Promise<{
        status?: string
        channel?: string
        enquiry?: string
        category?: string
        priority?: string
        assigned_to?: string
      }>
}

export default async function AdminCommunicationsPage({ searchParams }: Props) {
  const resolvedSearchParams = await Promise.resolve(searchParams || {})
  const supabase = await createClient()

  let query = supabase.from("communications").select(`
    *,
    admin_enquiries (
      id,
      name,
      address,
      suburb
    )
  `)

  if (resolvedSearchParams?.status) {
    query = query.eq("status", resolvedSearchParams.status)
  }

  if (resolvedSearchParams?.channel) {
    query = query.eq("channel", resolvedSearchParams.channel)
  }

  if (resolvedSearchParams?.enquiry) {
    query = query.eq("enquiry_id", resolvedSearchParams.enquiry)
  }

  if (resolvedSearchParams?.category) {
    query = query.eq("category", resolvedSearchParams.category)
  }

  if (resolvedSearchParams?.priority) {
    query = query.eq("priority", resolvedSearchParams.priority)
  }

  if (resolvedSearchParams?.assigned_to) {
    query = query.eq("assigned_to", resolvedSearchParams.assigned_to)
  }

  const { data: communications, error } = await query.order("created_at", { ascending: false }).limit(200)

  const { data: enquiries } = await supabase
    .from("admin_enquiries")
    .select("id, name, address, suburb, status")
    .neq("status", "archived")
    .order("created_at", { ascending: false })

  if (error) {
    // for now render client with empty array and surface nothing server-side
    return (
      <AdminCommunicationsClient
        communications={[]}
        enquiries={enquiries || []}
        initialStatus={resolvedSearchParams?.status}
        initialChannel={resolvedSearchParams?.channel}
        initialEnquiryId={resolvedSearchParams?.enquiry}
        initialCategory={resolvedSearchParams?.category}
        initialPriority={resolvedSearchParams?.priority}
        initialAssignedTo={resolvedSearchParams?.assigned_to}
      />
    )
  }

  return (
    <AdminCommunicationsClient
      communications={communications || []}
      enquiries={enquiries || []}
      initialStatus={resolvedSearchParams?.status}
      initialChannel={resolvedSearchParams?.channel}
      initialEnquiryId={resolvedSearchParams?.enquiry}
      initialCategory={resolvedSearchParams?.category}
      initialPriority={resolvedSearchParams?.priority}
      initialAssignedTo={resolvedSearchParams?.assigned_to}
    />
  )
}
