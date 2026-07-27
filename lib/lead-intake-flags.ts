// Deterministic flag rules for a pending lead-intake card. Code, not AI: the
// model never writes flag copy, so wording is fixed and testable
// (LEAD_CAPTURE_SPEC). Flags render in this fixed order. Only rule 1 blocks the
// move to the board; everything else is visible friction, never a wall.

import type { LeadExtraction } from "@/lib/lead-extraction"

export type FlagSeverity = "blocking" | "warn" | "info" | "highlight"

export type IntakeFlag = {
  rule: number
  severity: FlagSeverity
  message: string
}

// A possible duplicate the caller found by matching phone/email/address against
// existing sales_leads and properties.
export type DuplicateMatch = {
  name: string | null
  suburb: string | null
}

export function computeIntakeFlags(
  x: LeadExtraction,
  duplicate: DuplicateMatch | null
): IntakeFlag[] {
  const flags: IntakeFlag[] = []

  // 1 — blocking: no way to contact.
  if (!x.contact_phone && !x.contact_email) {
    flags.push({
      rule: 1,
      severity: "blocking",
      message: "No way to contact this lead — add a phone or email",
    })
  }

  // 2 — warn: the contact details are the referrer's.
  if (x.contact_role === "referrer") {
    const who = x.referrer_name ? x.referrer_name : "unknown"
    flags.push({
      rule: 2,
      severity: "warn",
      message: `Contact details are the referrer's (${who}) — confirm who the customer is`,
    })
  }

  // 3 — warn: couldn't tell whose details these are.
  if (x.contact_role === "unknown") {
    flags.push({
      rule: 3,
      severity: "warn",
      message: "Couldn't tell whose contact details these are — check before contacting",
    })
  }

  // 4 — warn: the CUSTOMER's name isn't known. Fires when contact_name is null,
  // OR when contact_role is "referrer" (contact_name then holds the referrer,
  // not the customer). The spec's flag table says "contact_name null" but its
  // answer key 2 (JP Tomas, a referrer whose name fills contact_name) expects
  // #4 to fire — the answer key is authoritative, so the real condition is
  // "customer name not known".
  if (!x.contact_name || x.contact_role === "referrer") {
    flags.push({ rule: 4, severity: "warn", message: "Customer name not stated" })
  }

  // 5 — info: no site address.
  if (!x.site_address) {
    flags.push({ rule: 5, severity: "info", message: "No site address yet" })
  }

  // 6 — highlight: a stated deadline.
  if (x.deadline_date) {
    const reason = x.deadline_reason ? x.deadline_reason : "stated deadline"
    flags.push({
      rule: 6,
      severity: "highlight",
      message: `Deadline: ${reason} — suggest visit before ${x.deadline_date}`,
    })
  }

  // 7 — warn: possible duplicate of an existing customer/lead.
  if (duplicate) {
    const label = [duplicate.name, duplicate.suburb].filter(Boolean).join(", ") || "existing record"
    flags.push({
      rule: 7,
      severity: "warn",
      message: `Possible match: ${label} — open existing instead?`,
    })
  }

  // 8 — info: no service stated.
  if (!x.service_summary) {
    flags.push({
      rule: 8,
      severity: "info",
      message: "Service not stated — will need clarifying on first contact",
    })
  }

  return flags
}

export function hasBlockingFlag(flags: IntakeFlag[]): boolean {
  return flags.some((f) => f.severity === "blocking")
}

// True when the card can be approved in one tap (no warn/blocking flags).
export function isOneTapApprovable(flags: IntakeFlag[]): boolean {
  return !flags.some((f) => f.severity === "blocking" || f.severity === "warn")
}

// Normalises a phone/email/address for duplicate matching. Phones compare on
// digits only; emails and addresses on lowercased alphanumerics.
export function normalisePhone(v: string | null | undefined): string | null {
  if (!v) return null
  const digits = v.replace(/\D/g, "")
  return digits.length >= 6 ? digits : null
}

export function normaliseLoose(v: string | null | undefined): string | null {
  if (!v) return null
  const s = v.toLowerCase().replace(/[^a-z0-9]/g, "")
  return s.length >= 3 ? s : null
}
