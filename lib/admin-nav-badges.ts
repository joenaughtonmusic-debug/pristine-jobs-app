import type { SupabaseClient } from "@supabase/supabase-js"
import type { AdminNavBadges } from "@/lib/admin-navigation-config"

// Owner-requested (17 Jul 2026): surface real work counts on existing nav
// items instead of building new pages. Add an entry only when the number is
// a genuine to-do count the owner acts on — if this list grows into a
// dashboard, it's the wrong place.
export async function getAdminNavBadges(
  supabase: SupabaseClient
): Promise<AdminNavBadges> {
  const badges: AdminNavBadges = {}

  const { count: openNotes, error: notesError } = await supabase
    .from("internal_job_notes")
    .select("id", { count: "exact", head: true })
    .eq("status", "open")
  if (notesError) {
    console.error("[admin-nav] failed to count open team notes", notesError)
  } else if (openNotes) {
    badges["/admin/internal-notes"] = openNotes
  }

  // Pending lead-intake cards awaiting approval — a genuine to-do count.
  const { count: pendingIntake, error: intakeError } = await supabase
    .from("lead_intake")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending_approval")
  if (intakeError) {
    console.error("[admin-nav] failed to count pending lead intake", intakeError)
  } else if (pendingIntake) {
    badges["/sales-pipeline"] = pendingIntake
  }

  return badges
}
