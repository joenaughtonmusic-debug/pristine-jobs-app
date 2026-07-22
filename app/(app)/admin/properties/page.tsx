import { createClient } from "@/lib/supabase/server"
import { PropertiesList } from "@/components/properties-list"
import type { Property } from "@/lib/types"
import { worstSeverity, type WalkAroundSeverity } from "@/lib/walk-around"

export default async function AdminPropertiesPage() {
  const supabase = await createClient()

  const { data: properties } = await supabase
    .from("properties")
    .select("*")
    .order("client_name", { ascending: true })

  // severity non-null distinguishes walk-around issues from generic photos
  // that crew happened to tag "Issue" on the job page (those have no severity).
  const { data: issuePhotos } = await supabase
    .from("job_photos")
    .select("property_id, severity")
    .eq("photo_type", "issue")
    .not("severity", "is", null)
    .not("property_id", "is", null)

  const issueSummaries: Record<
    string,
    { count: number; worst: WalkAroundSeverity | null }
  > = {}
  for (const photo of issuePhotos || []) {
    const key = photo.property_id as string
    const existing = issueSummaries[key] || { count: 0, worst: null }
    issueSummaries[key] = {
      count: existing.count + 1,
      worst: worstSeverity([existing.worst, photo.severity]),
    }
  }

  return (
    <div className="p-4">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Properties</h1>
          <p className="text-muted-foreground text-sm">
            {properties?.length || 0} properties
          </p>
        </div>
      </header>
      <PropertiesList
        properties={(properties as Property[]) || []}
        issueSummaries={issueSummaries}
      />
    </div>
  )
}
