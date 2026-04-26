import { createClient } from "@/lib/supabase/server"
import { LabourEntryClient } from "@/components/labour-entry-client"

export default async function LabourPage() {
  const supabase = await createClient()

  const { data: staff } = await supabase
    .from("staff_members")
    .select("id, name")
    .eq("is_active", true)
    .order("name", { ascending: true })

  const { data: properties } = await supabase
    .from("properties")
    .select("id, client_name, address_line_1, property_code")
    .eq("is_active", true)
    .order("client_name", { ascending: true })

  const { data: landscapingJobs } = await supabase
    .from("landscaping_jobs")
    .select("id, job_code, job_name, client_name, address_line_1, suburb")
    .eq("status", "active")
    .order("job_name", { ascending: true })

  return (
    <LabourEntryClient
      staff={staff || []}
      properties={properties || []}
      landscapingJobs={landscapingJobs || []}
    />
  )
}