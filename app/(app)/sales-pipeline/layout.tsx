import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { AdminNavigation } from "@/components/admin-navigation"
import {
  adminNavGroups,
  adminTopLevelLinks,
} from "@/lib/admin-navigation-config"

// The sales pipeline is an admin surface — same is_admin() gate as
// app/(app)/admin/layout.tsx (profiles.role is the source of truth).
export default async function SalesPipelineLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: isAdmin } = await supabase.rpc("is_admin")

  if (!isAdmin) {
    redirect("/jobs")
  }

  return (
    <div>
      <AdminNavigation
        navGroups={adminNavGroups}
        topLevelLinks={adminTopLevelLinks}
      />

      {children}
    </div>
  )
}
