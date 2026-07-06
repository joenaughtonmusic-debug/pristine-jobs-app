import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  normalizeSalesLeadWebhookPayload,
  type SalesLeadWebhookPayload,
} from "@/lib/sales-lead-webhook"

export const dynamic = "force-dynamic"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-pristine-leads-secret",
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: CORS_HEADERS,
  })
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  })
}

export async function POST(request: Request) {
  const secret = process.env.SALES_LEADS_WEBHOOK_SECRET

  if (!secret) {
    console.error("[sales-leads] SALES_LEADS_WEBHOOK_SECRET is not configured")
    return json({ error: "Service unavailable" }, 503)
  }

  const providedSecret = request.headers.get("x-pristine-leads-secret")

  if (!providedSecret || providedSecret !== secret) {
    return json({ error: "Unauthorized" }, 401)
  }

  let payload: SalesLeadWebhookPayload

  try {
    payload = (await request.json()) as SalesLeadWebhookPayload
  } catch {
    return json({ error: "Invalid JSON" }, 400)
  }

  const normalized = normalizeSalesLeadWebhookPayload(payload)

  if ("error" in normalized) {
    return json({ error: normalized.error }, 400)
  }

  const supabase = await createAdminClient()

  const { data, error } = await supabase
    .from("sales_leads")
    .insert(normalized.row)
    .select("id, status, created_at")
    .single()

  if (error) {
    console.error("[sales-leads] insert failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    })

    return json({ error: "Failed to create lead" }, 500)
  }

  console.info("[sales-leads] lead created", {
    id: data.id,
    source: normalized.row.source,
    suburb: normalized.row.suburb,
  })

  return json(
    {
      ok: true,
      id: data.id,
      status: data.status,
      created_at: data.created_at,
    },
    201
  )
}
