import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { LabourEntryClient } from "@/components/labour-entry-client"

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

export default async function LabourPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/")
  }

  const { data: staffMember } = await supabase
    .from("staff_members")
    .select("id, name")
    .eq("auth_user_id", user.id)
    .maybeSingle()

  if (!staffMember) {
    return (
      <div className="p-4">
        <h1 className="text-xl font-bold">No staff profile linked</h1>
        <p className="text-muted-foreground">
          Your login is working, but this account is not linked to a staff member.
        </p>
      </div>
    )
  }

  const today = new Date()
  const monday = getMonday(today)
  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)

  const weekStart = toDateString(monday)
  const weekEnd = toDateString(friday)

  const { data: landscapingJobs } = await supabase
    .from("landscaping_jobs")
    .select("id, job_code, job_name, client_name, address_line_1, suburb")
    .eq("status", "active")
    .order("job_name", { ascending: true })

  const { data: landscapingProperties } = await supabase
    .from("properties")
    .select("id, property_code, client_name, address_line_1, suburb")
    .eq("is_active", true)
    .order("client_name", { ascending: true })

  const propertyIds = (landscapingProperties || []).map((property) => property.id)
  const { data: scheduledLandscapingJobs } =
    propertyIds.length > 0
      ? await supabase
          .from("scheduled_jobs")
          .select("id, property_id, scheduled_date")
          .in("property_id", propertyIds)
          .eq("job_type", "landscaping")
          .gte("scheduled_date", weekStart)
          .lte("scheduled_date", weekEnd)
      : { data: [] }

  const linkedLandscapingJobs = (landscapingJobs || []).map((job) => {
    const normaliseLocationPart = (value?: string | null) =>
      value?.trim().toLowerCase() || ""
    const matchingProperties = (landscapingProperties || []).filter(
      (property) =>
        normaliseLocationPart(property.address_line_1) ===
          normaliseLocationPart(job.address_line_1) &&
        normaliseLocationPart(property.suburb) ===
          normaliseLocationPart(job.suburb)
    )
    const propertyId =
      matchingProperties.length === 1 ? matchingProperties[0].id : null

    return {
      ...job,
      property_id: propertyId,
      scheduled_jobs: propertyId
        ? (scheduledLandscapingJobs || []).filter(
            (scheduledJob) => scheduledJob.property_id === propertyId
          )
        : [],
    }
  })

  const { data: labourEntries } = await supabase
    .from("job_labour_entries")
    .select(`
      *,
      properties (
        address_line_1,
        suburb
      )
    `)
    .eq("staff_member_id", staffMember.id)
    .gte("work_date", weekStart)
    .lte("work_date", weekEnd)
    .order("work_date", { ascending: true })

  const { data: timesheets } = await supabase
    .from("staff_daily_timesheets")
    .select("*")
    .eq("staff_member_id", staffMember.id)
    .gte("work_date", weekStart)
    .lte("work_date", weekEnd)

  return (
  <LabourEntryClient
    staffMember={staffMember}
    properties={landscapingProperties || []}
    landscapingJobs={linkedLandscapingJobs}
    labourEntries={labourEntries || []}
    timesheets={timesheets || []}
    weekStart={weekStart}
  />
)
}
