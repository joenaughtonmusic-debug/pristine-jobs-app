// Server-side helpers for the lead-intake tray: duplicate detection and the
// shaping of an approved intake into a manual-lead input. Kept out of the
// server-action file so it's unit-testable without "use server".

import type { SupabaseClient } from "@supabase/supabase-js"
import type { LeadExtraction } from "@/lib/lead-extraction"
import {
  normalisePhone,
  normaliseLoose,
  type DuplicateMatch,
} from "@/lib/lead-intake-flags"

// Flag rule 7 input: does this extraction's phone/email/address match an
// existing lead or property? Read-only; returns the first match or null.
export async function findDuplicateMatch(
  supabase: SupabaseClient,
  x: LeadExtraction
): Promise<DuplicateMatch | null> {
  const phone = normalisePhone(x.contact_phone)
  const email = x.contact_email?.trim().toLowerCase() || null
  const addr = normaliseLoose(x.site_address)
  if (!phone && !email && !addr) return null

  // sales_leads: compare on phone digits / email / loose address+suburb.
  const { data: leads } = await supabase
    .from("sales_leads")
    .select("name, suburb, phone, email, address")
    .is("deleted_at", null)
    .limit(1000)
  for (const l of leads || []) {
    if (email && (l.email || "").trim().toLowerCase() === email) {
      return { name: l.name ?? null, suburb: l.suburb ?? null }
    }
    if (phone && normalisePhone(l.phone) === phone) {
      return { name: l.name ?? null, suburb: l.suburb ?? null }
    }
    if (addr && (normaliseLoose(l.address) === addr)) {
      return { name: l.name ?? null, suburb: l.suburb ?? null }
    }
  }

  // properties: compare on phone / client_email / loose address_line_1.
  const { data: props } = await supabase
    .from("properties")
    .select("client_name, suburb, phone, client_email, address_line_1")
    .limit(2000)
  for (const p of props || []) {
    if (email && (p.client_email || "").trim().toLowerCase() === email) {
      return { name: p.client_name ?? null, suburb: p.suburb ?? null }
    }
    if (phone && normalisePhone(p.phone) === phone) {
      return { name: p.client_name ?? null, suburb: p.suburb ?? null }
    }
    if (addr && normaliseLoose(p.address_line_1) === addr) {
      return { name: p.client_name ?? null, suburb: p.suburb ?? null }
    }
  }

  return null
}

// Map the extraction's job_type_hint to the sales_leads job_type vocabulary
// (maintenance | one_off | landscaping). "tidy" -> one_off; "other"/null -> none.
export function jobTypeFromHint(
  hint: LeadExtraction["job_type_hint"]
): "maintenance" | "one_off" | "landscaping" | "" {
  if (hint === "maintenance") return "maintenance"
  if (hint === "landscaping") return "landscaping"
  if (hint === "tidy") return "one_off"
  return ""
}

// Compose the message stored on the approved lead from the extraction context +
// the raw paste, so the board card keeps the full "what this came from".
export function composeLeadMessage(
  x: LeadExtraction,
  rawSource: string
): string {
  const lines: string[] = []
  if (x.contact_role === "referrer" && x.referrer_name) {
    lines.push(`Referred by ${x.referrer_name}${x.referral_source ? ` (${x.referral_source})` : ""}.`)
  } else if (x.referrer_name) {
    lines.push(`Referrer: ${x.referrer_name}${x.referral_source ? ` (${x.referral_source})` : ""}.`)
  }
  if (x.deadline_reason) lines.push(`Deadline: ${x.deadline_reason}.`)
  if (x.attachments_note) lines.push(x.attachments_note)
  for (const n of x.internal_notes) lines.push(`Note: ${n}`)
  lines.push("", "--- pasted enquiry ---", rawSource.trim())
  return lines.join("\n")
}
