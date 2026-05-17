import { createClient } from "@/lib/supabase/server"
import { AdminEstimatesCalendar } from "@/components/admin-estimates-calendar"
import { toZonedTime } from "date-fns-tz"

export const dynamic = "force-dynamic"

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

export default async function EstimatesCalendarPage() {
  const supabase = await createClient()

  const today = toZonedTime(new Date(), "Pacific/Auckland")
  const thisWeekMonday = getMonday(today)

  const nextWeekMonday = new Date(thisWeekMonday)
  nextWeekMonday.setDate(thisWeekMonday.getDate() + 7)

  const endOfNextWeek = new Date(nextWeekMonday)
  endOfNextWeek.setDate(nextWeekMonday.getDate() + 4)

  const startDate = toDateString(thisWeekMonday)
  const endDate = toDateString(endOfNextWeek)

  const { data: properties } = await supabase
    .from("properties")
    .select(`
      id,
      property_code,
      client_name,
      address_line_1,
      suburb,
      property_category,
      is_active
    `)
    .eq("is_active", true)
    .order("client_name", { ascending: true })

  const { data: joeStaff } = await supabase
    .from("staff_members")
    .select("id, name")
    .eq("name", "Estimator")
    .eq("is_active", true)
    .maybeSingle()

  const { data: estimates } = await supabase
    .from("scheduled_jobs")
    .select(`
      *,
      properties (
        id,
        client_name,
        address_line_1,
        suburb
      )
    `)
    .gte("scheduled_date", startDate)
    .lte("scheduled_date", endDate)
    .eq("job_type", "estimate")
    .order("scheduled_date", { ascending: true })
    .order("planned_start_time", { ascending: true })

  return (
    <AdminEstimatesCalendar
      thisWeekStart={startDate}
      nextWeekStart={toDateString(nextWeekMonday)}
      properties={properties || []}
      estimates={estimates || []}
      joeStaffId={joeStaff?.id || null}
    />
  )
}