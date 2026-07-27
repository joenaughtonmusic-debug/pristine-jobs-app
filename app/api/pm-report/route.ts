import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { sendPmReport } from "@/lib/pm-report-send"

// react-pdf renders in Node (not edge); keep it out of the bundler.
export const runtime = "nodejs"

// PM-facing address — contact@, not the VA's admin@ (Joe, 27 July).
const CONTACT_LINE = "Pristine Gardens · contact@pristinegardens.co.nz"

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Sending a report to a property manager is an admin action.
  const { data: isAdmin } = await supabase.rpc("is_admin")
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let visitId = ""
  try {
    const body = await request.json()
    visitId = String(body?.visitId || "")
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }
  if (!visitId) {
    return NextResponse.json({ error: "visitId is required" }, { status: 400 })
  }

  // Resolve a human name for the record.
  const { data: staff } = await supabase
    .from("staff_members")
    .select("name")
    .eq("auth_user_id", user.id)
    .maybeSingle()
  const sentBy = staff?.name?.trim() || user.email || "admin"

  // Privileged: generate + upload + sign + record run as service-role so they
  // don't depend on the authenticated role's table/bucket grants.
  const service = createServiceClient()
  const result = await sendPmReport(service, visitId, {
    contactLine: CONTACT_LINE,
    webhookUrl: process.env.PM_REPORT_WEBHOOK_URL,
    sentBy,
  })

  if (result.status === "failed") {
    return NextResponse.json(result, { status: 502 })
  }
  return NextResponse.json(result)
}
