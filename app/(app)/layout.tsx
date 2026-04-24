import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { MobileNav } from "@/components/mobile-nav"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // TEMP: bypass login during local development
// if (!user) {
//   redirect("/")
// }

  return (
    <div className="min-h-screen flex flex-col pb-16">
      <main className="flex-1">{children}</main>
      <MobileNav />
    </div>
  )
}
