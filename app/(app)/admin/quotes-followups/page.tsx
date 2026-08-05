import { createClient } from "@/lib/supabase/server"
import {
  QuotesFollowupsClient,
  type TodoItem,
} from "@/components/quotes-followups-client"

export const dynamic = "force-dynamic"

// Joe's personal to-do list: quotes to write/send and follow-ups he owes.
// Backed by admin_actions (action_type quote/follow_up), but shown here on its
// own page — deliberately independent of the sales pipeline.
export default async function QuotesFollowupsPage() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("admin_actions")
    .select("id, title, notes, action_type, status, due_date, created_at")
    .in("action_type", ["quote", "follow_up"])
    .not("status", "in", "(done,dismissed)")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Couldn&apos;t load your list. {error.message}
        </div>
      </div>
    )
  }

  return <QuotesFollowupsClient items={(data || []) as TodoItem[]} />
}
