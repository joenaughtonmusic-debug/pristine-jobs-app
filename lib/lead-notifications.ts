const JOE_NOTIFICATION_EMAIL = "joenaughtonmusic@gmail.com"

export type LeadNotificationAction = "created" | "accepted"

export type LeadNotificationEnquiry = {
  id: string
  name: string
  suburb?: string | null
  address?: string | null
  job_type?: string | null
  notes?: string | null
  status?: string | null
  source?: string | null
  link_path?: string | null
  joe_new_lead_notified_at?: string | null
  joe_accepted_lead_notified_at?: string | null
}

type SupabaseLikeClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string; email?: string | null } | null }
    }>
  }
  from: (table: string) => any
}

function formatLeadLocation(enquiry: LeadNotificationEnquiry) {
  return [enquiry.address, enquiry.suburb].filter(Boolean).join(", ")
}

function getLeadActionLabel(action: LeadNotificationAction) {
  return action === "accepted" ? "Lead accepted" : "New lead added"
}

async function getCurrentActorName(supabase: SupabaseLikeClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return "Unknown admin"

  const { data: staffMember } = await supabase
    .from("staff_members")
    .select("name, staff_type")
    .eq("auth_user_id", user.id)
    .maybeSingle()

  const staffName = staffMember?.name?.trim()

  if (staffName) return staffName

  return user.email || "Unknown admin"
}

export async function sendLeadNotificationToJoe({
  supabase,
  enquiry,
  action,
}: {
  supabase: SupabaseLikeClient
  enquiry: LeadNotificationEnquiry
  action: LeadNotificationAction
}) {
  const webhookUrl = process.env.NEXT_PUBLIC_LEAD_NOTIFICATION_WEBHOOK_URL

  if (!webhookUrl) {
    throw new Error("Lead notification webhook URL is not configured.")
  }

  const actorName = await getCurrentActorName(supabase)
  const actionLabel = getLeadActionLabel(action)
  const location = formatLeadLocation(enquiry)
  const leadUrl =
    typeof window === "undefined"
      ? enquiry.link_path || `/admin/enquiries#enquiry-${enquiry.id}`
      : `${window.location.origin}${enquiry.link_path || `/admin/enquiries#enquiry-${enquiry.id}`}`
  const subject = `${actionLabel} - ${enquiry.name} - ${enquiry.suburb || "No suburb"}`
  const body = [
    `${actionLabel} by ${actorName}`,
    "",
    `Client: ${enquiry.name}`,
    `Address/Suburb: ${location || "Not supplied"}`,
    `Job type: ${enquiry.job_type || "Not supplied"}`,
    `Source: ${enquiry.source || "manual"}`,
    `Summary: ${enquiry.notes || "No notes supplied"}`,
    `Link: ${leadUrl}`,
  ].join("\n")

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action,
      enquiry_id: enquiry.id,
      to_email: JOE_NOTIFICATION_EMAIL,
      subject,
      body,
      actor_name: actorName,
      client_name: enquiry.name,
      address: enquiry.address || null,
      suburb: enquiry.suburb || null,
      job_type: enquiry.job_type || null,
      source: enquiry.source || "manual",
      summary: enquiry.notes || null,
      link: leadUrl,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || "Lead notification webhook failed.")
  }

  return new Date().toISOString()
}
