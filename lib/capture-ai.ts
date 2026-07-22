// OpenAI helpers for the /capture flow. Called only from the server route.
//
// We hit the REST API with fetch rather than pulling in an SDK — no AI provider
// was wired in the app, and Whisper forces OpenAI, so one provider (OpenAI) does
// both transcription and triage. Env: OPENAI_API_KEY.

const OPENAI_BASE = "https://api.openai.com/v1"

export type CaptureType =
  | "commercial_lead"
  | "property_followup"
  | "annoying_task"
  | "unsorted"

export type TriageResult = {
  type: CaptureType
  confidence: "high" | "low"
}

const VALID_TYPES: CaptureType[] = [
  "commercial_lead",
  "property_followup",
  "annoying_task",
  "unsorted",
]

/** Transcribe an audio blob with Whisper. Throws on any failure. */
export async function transcribeAudio(audio: Blob, filename: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured")

  const form = new FormData()
  form.append("file", audio, filename)
  form.append("model", "whisper-1")

  const res = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Whisper failed (${res.status}): ${body.slice(0, 300)}`)
  }

  const data = (await res.json()) as { text?: string }
  const text = (data.text ?? "").trim()
  if (!text) throw new Error("Whisper returned an empty transcript")
  return text
}

const TRIAGE_PROMPT = (transcript: string) => `Classify this voice note from a landscaping business owner into exactly one type:
- commercial_lead: a commercial building/site he wants to approach for garden work
- property_followup: an existing or potential residential property to follow up
- annoying_task: a task to offload to the VA — a small admin/process job to hand off later
- unsorted: genuinely unclear

Return ONLY JSON, no prose: {"type": "...", "confidence": "high" | "low"}
Use "low" confidence if the note is ambiguous or could fit two types.

Voice note: "${transcript}"`

/**
 * Triage a transcript into a capture type. Throws on any failure — the caller is
 * responsible for falling back to unsorted/low so a capture is never lost.
 */
export async function triageTranscript(transcript: string): Promise<TriageResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured")

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: TRIAGE_PROMPT(transcript) }],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Triage failed (${res.status}): ${body.slice(0, 300)}`)
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const raw = data.choices?.[0]?.message?.content
  if (!raw) throw new Error("Triage returned no content")

  const parsed = JSON.parse(raw) as { type?: string; confidence?: string }
  const type = VALID_TYPES.includes(parsed.type as CaptureType)
    ? (parsed.type as CaptureType)
    : "unsorted"
  const confidence = parsed.confidence === "high" ? "high" : "low"

  return { type, confidence }
}
