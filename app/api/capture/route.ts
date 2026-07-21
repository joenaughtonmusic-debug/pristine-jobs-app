import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
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
  const db = await createAdminClient()

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

  return NextResponse.json(data, { status: 201 })
}
