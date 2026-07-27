// Lead extraction: one structured-output AI call turns a pasted enquiry (a
// Messenger thread, a forwarded Bark email, etc.) into the LeadExtraction
// schema. AI interprets language; deterministic code (lib/lead-intake-flags)
// makes the decisions. The model NEVER invents a name, number, address, or
// date — null always beats a guess (LEAD_CAPTURE_SPEC + CLAUDE.md AI rule).
//
// Follows the app's established OpenAI-via-raw-fetch pattern (lib/capture-ai.ts):
// one provider, gpt-4o-mini, OPENAI_API_KEY. We use structured outputs
// (response_format json_schema, strict) so the shape can't drift.

const OPENAI_BASE = "https://api.openai.com/v1"

export type ContactRole = "customer" | "referrer" | "unknown"
export type ReferralSource =
  | "bni"
  | "word_of_mouth"
  | "web_form"
  | "google"
  | "other"
  | null
export type JobTypeHint = "maintenance" | "tidy" | "landscaping" | "other" | null

export type LeadExtraction = {
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  contact_role: ContactRole
  referrer_name: string | null
  referral_source: ReferralSource
  site_address: string | null
  service_summary: string | null
  job_type_hint: JobTypeHint
  deadline_date: string | null // ISO date, only if explicitly stated
  deadline_reason: string | null
  warmth: number | null // 1–5, only if stated
  attachments_note: string | null
  internal_notes: string[]
}

// A blank extraction — used when the AI call fails or returns garbage so the
// card still appears (blank + flagged), never silently dropped.
export const BLANK_EXTRACTION: LeadExtraction = {
  contact_name: null,
  contact_phone: null,
  contact_email: null,
  contact_role: "unknown",
  referrer_name: null,
  referral_source: null,
  site_address: null,
  service_summary: null,
  job_type_hint: null,
  deadline_date: null,
  deadline_reason: null,
  warmth: null,
  attachments_note: null,
  internal_notes: [],
}

// JSON Schema for OpenAI structured outputs. strict:true forces every key to be
// present; nullable fields are unioned with null so the model can decline.
const LEAD_EXTRACTION_JSON_SCHEMA = {
  name: "LeadExtraction",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "contact_name", "contact_phone", "contact_email", "contact_role",
      "referrer_name", "referral_source", "site_address", "service_summary",
      "job_type_hint", "deadline_date", "deadline_reason", "warmth",
      "attachments_note", "internal_notes",
    ],
    properties: {
      contact_name: { type: ["string", "null"] },
      contact_phone: { type: ["string", "null"] },
      contact_email: { type: ["string", "null"] },
      contact_role: { type: "string", enum: ["customer", "referrer", "unknown"] },
      referrer_name: { type: ["string", "null"] },
      referral_source: {
        type: ["string", "null"],
        enum: ["bni", "word_of_mouth", "web_form", "google", "other", null],
      },
      site_address: { type: ["string", "null"] },
      service_summary: { type: ["string", "null"] },
      job_type_hint: {
        type: ["string", "null"],
        enum: ["maintenance", "tidy", "landscaping", "other", null],
      },
      deadline_date: { type: ["string", "null"] },
      deadline_reason: { type: ["string", "null"] },
      warmth: { type: ["integer", "null"] },
      attachments_note: { type: ["string", "null"] },
      internal_notes: { type: "array", items: { type: "string" } },
    },
  },
} as const

const SYSTEM_PROMPT = `You extract structured lead details from a pasted enquiry for an Auckland gardening/landscaping business. The text may be a Messenger thread, a forwarded Bark or BNI referral email, or a copy-pasted message.

Extract ONLY what is written. Rules — follow exactly:
- Never infer a name from an email address, never guess a suburb from context, never invent a phone number. If a field is not stated, return null.
- If the only contact details in the message belong to the person who PASSED THE LEAD ON (a referrer — the BNI/word-of-mouth pattern), set contact_role to "referrer" and put THEIR details in the contact fields. Do NOT promote the referrer to the customer. Set contact_role "customer" only when the contact details clearly belong to the person who wants the work. Use "unknown" when it cannot be determined.
- An address appearing without a stated owner (e.g. alone in a comments field) goes to site_address; it does NOT imply the contact is the customer.
- referrer_name: the person who referred, if named (e.g. "Shane the Pool Guru").
- referral_source: only when evidenced — "bni" for BNI Connect referrals, "word_of_mouth" when someone passed it on informally, else the best-evidenced value or null.
- site_address: exactly as written; never complete or correct it.
- service_summary: short, close to the customer's own wording. Null if no service is stated.
- job_type_hint: your best hint only; the human confirms. Null if unclear.
- deadline_date: ISO (YYYY-MM-DD) ONLY if a date is explicitly stated or unambiguously resolvable against the received date. If it cannot be resolved unambiguously, set deadline_date null and keep the phrase in deadline_reason.
- warmth: integer 1–5 only if a temperature/rating is stated (BNI), else null.
- attachments_note: e.g. "3 photos attached", if mentioned.
- internal_notes: scheduling/access/hazard-flavoured fragments only — never customer-facing copy.`

function userPrompt(rawSource: string, receivedDateISO: string): string {
  return `Received date: ${receivedDateISO}\n\nEnquiry text:\n"""\n${rawSource}\n"""`
}

function coerce(parsed: Partial<LeadExtraction>): LeadExtraction {
  // Structured outputs already guarantees the shape; this is belt-and-braces so
  // a surprise value can never produce a partial object downstream.
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
  const role: ContactRole =
    parsed.contact_role === "customer" || parsed.contact_role === "referrer"
      ? parsed.contact_role
      : "unknown"
  return {
    contact_name: s(parsed.contact_name),
    contact_phone: s(parsed.contact_phone),
    contact_email: s(parsed.contact_email),
    contact_role: role,
    referrer_name: s(parsed.referrer_name),
    referral_source: (parsed.referral_source ?? null) as ReferralSource,
    site_address: s(parsed.site_address),
    service_summary: s(parsed.service_summary),
    job_type_hint: (parsed.job_type_hint ?? null) as JobTypeHint,
    deadline_date: s(parsed.deadline_date),
    deadline_reason: s(parsed.deadline_reason),
    warmth:
      typeof parsed.warmth === "number" && parsed.warmth >= 1 && parsed.warmth <= 5
        ? Math.round(parsed.warmth)
        : null,
    attachments_note: s(parsed.attachments_note),
    internal_notes: Array.isArray(parsed.internal_notes)
      ? parsed.internal_notes.filter((n): n is string => typeof n === "string" && n.trim() !== "")
      : [],
  }
}

export type ExtractionOutcome =
  | { ok: true; extraction: LeadExtraction }
  | { ok: false; error: string }

// Runs the one AI call. NEVER throws — on any failure returns {ok:false} so the
// caller stores a blank+flagged card instead of losing the paste.
export async function extractLead(
  rawSource: string,
  receivedDateISO: string
): Promise<ExtractionOutcome> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY is not configured" }
  if (!rawSource.trim()) return { ok: false, error: "Nothing to extract (empty paste)" }

  try {
    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_schema", json_schema: LEAD_EXTRACTION_JSON_SCHEMA },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt(rawSource, receivedDateISO) },
        ],
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      return { ok: false, error: `extraction failed (${res.status}): ${body.slice(0, 200)}` }
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string; refusal?: string | null } }[]
    }
    const msg = data.choices?.[0]?.message
    if (msg?.refusal) return { ok: false, error: `model refused: ${msg.refusal.slice(0, 200)}` }
    const raw = msg?.content
    if (!raw) return { ok: false, error: "extraction returned no content" }

    const parsed = JSON.parse(raw) as Partial<LeadExtraction>
    return { ok: true, extraction: coerce(parsed) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "extraction request failed" }
  }
}
