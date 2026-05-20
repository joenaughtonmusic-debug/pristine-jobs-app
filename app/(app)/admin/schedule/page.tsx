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
  searchParams: Promise<{ week?: string }>
}) {
  const supabase = await createClient()
  const params = await searchParams

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
  phone
),
    scheduled_job_staff (
      id,
      staff_member_id,
      staff_members (
        id,
        name
      )
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
      client_email
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
        client_name,
        address_line_1,
        suburb
      )
    `)
    .eq("status", "ready_to_schedule")
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
    />
  )
}