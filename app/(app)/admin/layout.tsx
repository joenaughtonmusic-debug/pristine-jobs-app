import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { AdminNavigation } from "@/components/admin-navigation"
import {
  adminNavGroups,
  adminTopLevelLinks,
} from "@/lib/admin-navigation-config"
import { getAdminNavBadges } from "@/lib/admin-nav-badges"

// Admin pages are gated on profiles.role via the live is_admin() function —
// the database's source of truth (NOT staff_members.staff_type, which only
// drives nav visibility; see docs/Brief_01). Non-admins are sent to /jobs.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: isAdmin } = await supabase.rpc("is_admin")

  if (!isAdmin) {
    redirect("/jobs")
  }

  const badges = await getAdminNavBadges(supabase)

  return (
    <div>
      <AdminNavigation
        navGroups={adminNavGroups}
        topLevelLinks={adminTopLevelLinks}
        badges={badges}
      />

      {children}
    </div>
  )
}
