import { AdminNavigation } from "@/components/admin-navigation"
import {
  adminNavGroups,
  adminTopLevelLinks,
} from "@/lib/admin-navigation-config"

export default function SalesPipelineLayout({
  children,
}: {
  children: React.ReactNode
}) {
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
