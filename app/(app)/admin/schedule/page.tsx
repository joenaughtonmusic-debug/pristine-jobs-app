import { createClient } from "@/lib/supabase/server"
import { AdminScheduleClient } from "@/components/admin-schedule-client"
import { toZonedTime } from "date-fns-tz"

function toDateString(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function getMonday(date: Date) {
  const d = new Date(date)
  const day = d.getDay()
  const mondayOffset = (day + 6) % 7
  d.setDate(d.getDate() - mondayOffset)
  return d
}

export default async function AdminSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; quote?: string }>
}) {
  const supabase = await createClient()
  const params = await searchParams

  // Sold→scheduled seam: ?quote=<draft id> arrives from an accepted quote's
  // pipeline card. The client pre-fills the Quick Add modal from this draft
  // and, on create, stamps the draft + advances the lead's card.
  let quotePrefill = null
  if (params?.quote) {
    const { data: quoteDraft } = await supabase
      .from("quote_drafts")
      .select(
        "id, customer_name, property_id, quote_type, customer_scope, total, first_scheduled_job_id"
      )
      .eq("id", params.quote)
      .maybeSingle()

    quotePrefill = quoteDraft || null
  }

  const today = toZonedTime(new Date(), "Pacific/Auckland")

  const selectedWeek = params?.week

  const selectedWeekDate = selectedWeek
    ? toZonedTime(new Date(`${selectedWeek}T12:00:00`), "Pacific/Auckland")
    : today

  const thisWeekMonday = getMonday(selectedWeekDate)

  const nextWeekMonday = new Date(thisWeekMonday)
  nextWeekMonday.setDate(thisWeekMonday.getDate() + 7)

  const endOfNextWeek = new Date(nextWeekMonday)
  endOfNextWeek.setDate(nextWeekMonday.getDate() + 4)

  const startDate = toDateString(thisWeekMonday)
  const endDate = toDateString(endOfNextWeek)

  const { data: jobs } = await supabase
  .from("scheduled_jobs")
  .select(`
    *,
    properties (
  id,
  property_code,
  client_name,
  address_line_1,
  suburb,
  property_category,
  client_email,
  phone,
  scheduling_notes,
  service_type,
  service_frequency,
  service_interval_weeks
),
    scheduled_job_staff (
      id,
      staff_member_id,
      staff_members (
        id,
        name
      )
    ),
    visits (
      id,
      ready_for_invoice,
      invoice_status,
      xero_invoice_number,
      invoice_amount
    ),
    internal_job_notes (
      id,
      note,
      submitted_by_staff_name,
      created_at,
      status,
      completed_at,
      completed_by,
      email_status
    )
  `)
  .gte("scheduled_date", startDate)
  .lte("scheduled_date", endDate)
  .order("scheduled_date", { ascending: true })
  .order("job_order", { ascending: true })

  const { data: properties } = await supabase
    .from("properties")
    .select(`
      id,
      property_code,
      client_name,
      address_line_1,
      suburb,
      property_category,
      default_staff_id,
      default_job_order,
      default_duration_hours,
      default_start_time,
      is_active,
      billing_type,
      client_email,
      service_type,
      service_frequency,
      service_interval_weeks
    `)
    .eq("is_active", true)
    .order("suburb", { ascending: true })
    .order("client_name", { ascending: true })

  const { data: staff } = await supabase
    .from("staff_members")
    .select("id, name")
    .eq("is_active", true)
    .order("name", { ascending: true })

  const { data: serviceTemplates } = await supabase
  .from("property_service_templates")
  .select(`
    id,
    property_id,
    template_name,
    default_duration_hours,
    default_staff_id,
    default_job_notes,
    colour_label,
    billing_mode,
    time_limit_type,
    is_active
  `)
  .eq("is_active", true)
  .order("template_name", { ascending: true })

  const { data: schedulingQueue } = await supabase
    .from("scheduling_queue")
    .select(`
      *,
      properties (
        id,
        property_code,
        client_name,
        address_line_1,
        suburb,
        property_category,
        client_email,
        phone,
        scheduling_notes,
        service_type,
        service_frequency,
        service_interval_weeks
      )
    `)
    .eq("status", "ready_to_schedule")
    .order("created_at", { ascending: false })

  const { data: clientAdjustments } = await supabase
    .from("communications")
    .select(`
      id,
      subject,
      body,
      status,
      category,
      priority,
      risk_level,
      ai_summary,
      suggested_reply,
      metadata,
      created_at
    `)
    .eq("category", "scheduling")
    .eq("metadata->>schedule_action_approved", "true")
    .or("metadata->>schedule_action_completed.is.null,metadata->>schedule_action_completed.neq.true")
    .neq("status", "closed")
    .neq("status", "archived")
    .neq("status", "resolved")
    .order("created_at", { ascending: false })

    return (
    <AdminScheduleClient
  thisWeekStart={startDate}
  nextWeekStart={toDateString(nextWeekMonday)}
      jobs={jobs || []}
      properties={properties || []}
      staff={staff || []}
      serviceTemplates={serviceTemplates || []}
      schedulingQueue={schedulingQueue || []}
      clientAdjustments={clientAdjustments || []}
      quotePrefill={quotePrefill}
    />
  )
}
