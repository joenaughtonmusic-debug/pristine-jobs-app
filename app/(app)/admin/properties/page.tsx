import { createClient } from "@/lib/supabase/server"
import { PropertiesList } from "@/components/properties-list"
import type { Property } from "@/lib/types"

export default async function AdminPropertiesPage() {
  const supabase = await createClient()

  const { data: properties } = await supabase
    .from("properties")
    .select("*")
    .order("client_name", { ascending: true })

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
      <PropertiesList properties={(properties as Property[]) || []} />
    </div>
  )
}
