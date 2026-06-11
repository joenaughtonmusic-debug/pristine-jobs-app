import { createClient } from "@/lib/supabase/server"
import AdminCommunicationsClient from "@/components/admin-communications-client"
import {
  isActiveActionableCommunication,
  type CommunicationTab,
} from "@/lib/communication-classification"
import {
  ensureWorkflowAdminActions,
  getActionDueDate,
} from "@/lib/admin-actions"

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
        source_category?: string
        tab?: string
      }
    | Promise<{
        status?: string
        channel?: string
        enquiry?: string
        category?: string
        priority?: string
        assigned_to?: string
        source_category?: string
        tab?: string
      }>
}

export default async function AdminCommunicationsPage({ searchParams }: Props) {
  const resolvedSearchParams = await Promise.resolve(searchParams || {})
  const supabase = await createClient()
  const allowedTabs: CommunicationTab[] = [
    "action",
    "organic",
    "customer",
    "aggregator",
    "admin",
    "ignored",
    "all",
  ]
  const initialTab = allowedTabs.includes(
    resolvedSearchParams?.tab as CommunicationTab
  )
    ? (resolvedSearchParams?.tab as CommunicationTab)
    : "action"

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

  if (resolvedSearchParams?.source_category) {
    query = query.eq("source_category", resolvedSearchParams.source_category)
  }

  const { data: communications, error } = await query.order("created_at", { ascending: false }).limit(200)

  const { data: enquiries } = await supabase
    .from("admin_enquiries")
    .select("id, name, address, suburb, status")
    .neq("status", "archived")
    .order("created_at", { ascending: false })

  if (!error && communications) {
    await ensureWorkflowAdminActions(
      supabase,
      communications
        .filter((communication) => isActiveActionableCommunication(communication))
        .map((communication) => ({
          title: `Follow up communication: ${
            communication.subject || communication.customer_name || "Customer message"
          }`,
          actionType: "communication_follow_up",
          priority:
            communication.priority === "urgent" || communication.priority === "high"
              ? "high"
              : "normal",
          owner: communication.assigned_to === "joe" ? "Joe" : "VA",
          dueDate: getActionDueDate(1),
          sourceRecordType: "communication",
          sourceRecordId: communication.id,
          sourceUrl: `/admin/communications/${communication.id}`,
          notes: [
            communication.customer_name ? `Customer: ${communication.customer_name}` : null,
            communication.customer_email ? `Email: ${communication.customer_email}` : null,
            communication.customer_phone ? `Phone: ${communication.customer_phone}` : null,
            communication.subject ? `Subject: ${communication.subject}` : null,
            communication.body ? communication.body.slice(0, 400) : null,
          ]
            .filter(Boolean)
            .join("\n"),
        }))
    )
  }

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
        initialSourceCategory={resolvedSearchParams?.source_category}
        initialTab={initialTab}
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
      initialSourceCategory={resolvedSearchParams?.source_category}
      initialTab={initialTab}
    />
  )
}
