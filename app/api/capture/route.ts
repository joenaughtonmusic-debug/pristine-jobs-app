import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import {
  transcribeAudio,
  triageTranscript,
  type CaptureType,
} from "@/lib/capture-ai"

export const dynamic = "force-dynamic"

const CAPTURES_BUCKET = "captures"

function parseCoord(
  value: FormDataEntryValue | number | null | undefined
): number | null {
  if (value == null || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export async function POST(request: Request) {
  const supabase = await createClient()

  // Internal page — require a signed-in user (same gate as the (app) layout).
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Privileged server-side ops (storage upload + insert) run as service-role so
  // they don't depend on table/bucket grants for the authenticated role. The
  // user check above is what actually gates access.
  //
  // Fail loud, don't fall back: if the key is missing the insert would silently
  // run as `authenticated` and be denied by RLS (looks like a permissions bug,
  // is really a config bug). Surface it as a clear 500 instead.
  let db
  try {
    db = createServiceClient()
  } catch (err) {
    console.error("[capture] service-role client unavailable", {
      hasServiceKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      hasUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      message: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: "Server not configured for captures" },
      { status: 500 }
    )
  }

  let transcript = ""
  let audioUrl: string | null = null
  let lat: number | null = null
  let lng: number | null = null

  const contentType = request.headers.get("content-type") ?? ""

  try {
    if (contentType.includes("multipart/form-data")) {
      // Audio path: upload (best-effort) then transcribe.
      const form = await request.formData()
      const audio = form.get("audio")
      lat = parseCoord(form.get("lat"))
      lng = parseCoord(form.get("lng"))

      if (!(audio instanceof Blob) || audio.size === 0) {
        return NextResponse.json(
          { error: "No audio provided" },
          { status: 400 }
        )
      }

      const ext = (audio.type.split("/")[1] || "webm").split(";")[0]
      const filename = `${user.id}/${Date.now()}.${ext}`

      // Upload is best-effort — never fail a capture because storage did.
      try {
        const { data: uploaded, error: uploadError } = await db.storage
          .from(CAPTURES_BUCKET)
          .upload(filename, audio, {
            contentType: audio.type || "audio/webm",
            upsert: false,
          })
        if (uploadError) throw uploadError
        audioUrl = uploaded?.path ?? null
      } catch (err) {
        console.error("[capture] audio upload failed (continuing)", err)
      }

      transcript = await transcribeAudio(audio, filename.split("/").pop()!)
    } else {
      // Typed fallback: raw transcript in JSON.
      const body = (await request.json().catch(() => ({}))) as {
        transcript?: string
        lat?: number | string
        lng?: number | string
      }
      transcript = (body.transcript ?? "").trim()
      lat = parseCoord(body.lat)
      lng = parseCoord(body.lng)

      if (!transcript) {
        return NextResponse.json(
          { error: "No transcript provided" },
          { status: 400 }
        )
      }
    }
  } catch (err) {
    // Transcription itself failed — nothing worth saving.
    console.error("[capture] transcription failed", err)
    return NextResponse.json(
      { error: "Could not transcribe audio" },
      { status: 502 }
    )
  }

  // Triage. If it errors, still save — as unsorted/low. Never lose a capture.
  let type: CaptureType = "unsorted"
  let confidence: "high" | "low" = "low"
  try {
    const triage = await triageTranscript(transcript)
    type = triage.type
    confidence = triage.confidence
  } catch (err) {
    console.error("[capture] triage failed, saving as unsorted", err)
  }

  const { data, error } = await db
    .from("captures")
    .insert({
      type,
      transcript,
      audio_url: audioUrl,
      lat,
      lng,
      triage_confidence: confidence,
    })
    .select("*")
    .single()

  if (error) {
    console.error("[capture] insert failed", {
      code: error.code,
      message: error.message,
      details: error.details,
    })
    return NextResponse.json({ error: "Failed to save capture" }, { status: 500 })
  }

  // Tier 1 item 3: a VA Offload capture becomes a VA action on the board and
  // notifies the VA by email. Both steps are wrapped — a failure here must
  // never fail the capture save (which is already committed above).
  if (data.type === "annoying_task") {
    const excerpt =
      transcript.length > 70 ? `${transcript.slice(0, 70)}…` : transcript

    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 1)

    const { error: actionError } = await db.from("admin_actions").insert({
      title: `VA Offload: ${excerpt}`,
      action_type: "va_offload",
      priority: "normal",
      status: "open",
      due_date: dueDate.toISOString().slice(0, 10),
      assigned_to: "VA",
      notes: transcript,
      // Distinct source type: generated-not-manual stays visible, the board
      // card links back to the capture, and the partial unique index
      // (idx_admin_actions_open_source) dedupes retries at the DB level.
      source_record_type: "capture",
      source_record_id: data.id,
      source_url: "/capture",
    })

    // 23505 = unique violation: the action already exists (request retry) —
    // that's the dedupe index doing its job, not a failure.
    if (actionError && actionError.code !== "23505") {
      console.error(
        `CAPTURE_ACTION_FAILED capture=${data.id} error=${actionError.message}`
      )
    }

    try {
      const webhookUrl = process.env.NEXT_PUBLIC_LEAD_NOTIFICATION_WEBHOOK_URL
      const vaEmail = process.env.VA_NOTIFICATION_EMAIL

      if (!webhookUrl || !vaEmail) {
        throw new Error(
          !webhookUrl
            ? "notification webhook URL is not configured"
            : "VA_NOTIFICATION_EMAIL is not configured"
        )
      }

      // Same payload shape as lead notifications, so the one Make/Zoho
      // scenario ({{1.to_email}}, {{1.subject}}, {{1.body}}) serves both.
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "created",
          enquiry_id: data.id,
          to_email: vaEmail,
          subject: `New VA task from capture: ${excerpt}`,
          body: [
            "New VA Offload capture",
            "",
            transcript,
            "",
            "Link: /admin/actions",
          ].join("\n"),
          actor_name: "Capture",
          client_name: null,
          address: null,
          suburb: null,
          job_type: null,
          source: "capture",
          summary: transcript,
          link: "/admin/actions",
        }),
      })

      if (!response.ok) {
        throw new Error((await response.text()) || "notification webhook failed")
      }
    } catch (err) {
      console.error(
        `CAPTURE_NOTIFY_FAILED capture=${data.id} error=${
          err instanceof Error ? err.message : String(err)
        }`
      )
    }
  }

  return NextResponse.json(data, { status: 201 })
}
