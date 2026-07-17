import type { SupabaseClient } from "@supabase/supabase-js"
import type { AdminNavBadges } from "@/lib/admin-navigation-config"

// Owner-requested (17 Jul 2026): surface real work counts on existing nav
// items instead of building new pages. Add an entry only when the number is
// a genuine to-do count the owner acts on — if this list grows into a
// dashboard, it's the wrong place.
export async function getAdminNavBadges(
  supabase: SupabaseClient
): Promise<AdminNavBadges> {
  const { count, error } = await supabase
    .from("internal_job_notes")
    .select("id", { count: "exact", head: true })
    .eq("status", "open")

  if (error) {
    console.error("[admin-nav] failed to count open team notes", error)
    return {}
  }

  return count ? { "/admin/internal-notes": count } : {}
}
