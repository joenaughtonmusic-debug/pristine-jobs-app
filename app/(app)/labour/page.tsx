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

  const { data: labourEntries } = await supabase
    .from("job_labour_entries")
    .select("*")
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
    landscapingJobs={landscapingJobs || []}
    labourEntries={labourEntries || []}
    timesheets={timesheets || []}
    weekStart={weekStart}
  />
)
}