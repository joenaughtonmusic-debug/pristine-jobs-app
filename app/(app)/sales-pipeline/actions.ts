"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { buildManualLeadRow, type ManualLeadInput } from "@/lib/sales-lead-manual"

// sales_leads has no user_id column; its RLS policies check
// auth.role() = 'authenticated' (migration 032), so the insert runs
// server-side under the signed-in user's session.
export async function createManualLead(
  input: ManualLeadInput
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to add a lead." }
  }

  const built = buildManualLeadRow(input)

  if ("error" in built) {
    return { error: built.error }
  }

  const { error } = await supabase.from("sales_leads").insert(built.row)

  if (error) {
    console.error("[sales-pipeline] manual lead insert failed", {
      code: error.code,
      message: error.message,
    })
    return { error: "Failed to save the lead. Please try again." }
  }

  revalidatePath("/sales-pipeline")
  return { ok: true }
}
