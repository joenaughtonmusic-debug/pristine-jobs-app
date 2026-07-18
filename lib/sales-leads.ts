export type SalesLeadStatus =
  | "new"
  | "contacted"
  | "visit_booked"
  | "estimate_done"
  | "quote_sent"
  | "follow_up_due"
  | "won"
  | "lost"
  | "scheduled"
  | "completed"

export type SalesLeadActivityType =
  | "note"
  | "communication"
  | "status_change"
  | "follow_up"

export type SalesLeadActivity = {
  id: string
  type: SalesLeadActivityType
  created_at: string
  content: string
}

export type SalesLead = {
  id: string
  created_at: string
  updated_at: string
  source: string | null
  name: string
  email: string | null
  phone: string | null
  address: string | null
  suburb: string | null
  service_needed: string | null
  message: string | null
  status: SalesLeadStatus
  assigned_to: string | null
  next_follow_up_at: string | null
  site_visit_at: string | null
  quote_accepted_at: string | null
  contact_followup_sent_at: string | null
  followup_3day_sent_at: string | null
  followup_7day_sent_at: string | null
  followup_14day_sent_at: string | null
  quote_value: number | string | null
  lost_reason: string | null
  notes: SalesLeadActivity[] | unknown
  // Phase 2 links (migration 043). Both nullable — a fresh website lead has
  // neither. The job/invoice chain is reached via the quote draft
  // (quote_drafts.first_scheduled_job_id), never a direct job link.
  property_id: string | null
  quote_draft_id: string | null
  // Structured service type (migration 047). Nullable — website leads arrive
  // unset; service_needed stays free text. When set, it replaces the
  // wording guess everywhere a quote type is suggested.
  job_type: "maintenance" | "one_off" | "landscaping" | null
}

export const JOB_TYPE_OPTIONS = [
  { value: "maintenance", label: "Maintenance" },
  { value: "one_off", label: "One-off" },
  { value: "landscaping", label: "Landscaping" },
] as const

export function formatJobType(value: string | null | undefined) {
  return (
    JOB_TYPE_OPTIONS.find((option) => option.value === value)?.label || null
  )
}

export type PipelineStageKey =
  | "new"
  | "contacted"
  | "visit_booked"
  | "estimate_done"
  | "quote_sent"
  | "follow_up_due"
  | "won_lost"

export type PrimaryActionKind =
  | "contact"
  | "book_visit"
  | "estimate_done"
  | "send_quote"
  | "follow_up"
  | "mark_won"
  | "mark_lost"

export type PrimaryActionTone =
  | "neutral"
  | "orange"
  | "red"
  | "green"
  | "grey"

export type PrimaryAction = {
  label: string
  kind: PrimaryActionKind
  tone: PrimaryActionTone
}

export const PIPELINE_STAGES: Array<{ key: PipelineStageKey; label: string }> = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contact" },
  { key: "visit_booked", label: "Book Visit" },
  { key: "estimate_done", label: "Estimate Done" },
  { key: "quote_sent", label: "Quote Sent" },
  { key: "follow_up_due", label: "Follow Up" },
  { key: "won_lost", label: "Won/Lost" },
]

export const STATUS_LABELS: Record<SalesLeadStatus, string> = {
  new: "New",
  contacted: "Contact",
  visit_booked: "Book Visit",
  estimate_done: "Estimate Done",
  quote_sent: "Quote Sent",
  follow_up_due: "Follow Up",
  won: "Won",
  lost: "Lost",
  scheduled: "Job Scheduled",
  completed: "Job Completed",
}

const FOLLOW_UP_STATUSES: SalesLeadStatus[] = ["quote_sent", "follow_up_due"]

export function getLeadColumn(status: SalesLeadStatus): PipelineStageKey {
  // The legacy 7-column view has no job-stage columns; anything past won
  // lands in its final column.
  if (
    status === "won" ||
    status === "lost" ||
    status === "scheduled" ||
    status === "completed"
  ) {
    return "won_lost"
  }

  return status
}

export function getNextAction(status: SalesLeadStatus): string {
  switch (status) {
    case "new":
      return "Contact lead"
    case "contacted":
      return "Book site visit"
    case "visit_booked":
      return "Complete estimate"
    case "estimate_done":
      return "Send quote"
    case "quote_sent":
      return "Monitor follow-up"
    case "follow_up_due":
      return "Follow up now"
    case "won":
      return "Add to schedule"
    case "lost":
      return "Closed"
    default:
      return "Review lead"
  }
}

export function isOverdue(
  lead: Pick<SalesLead, "next_follow_up_at" | "status">
) {
  if (!lead.next_follow_up_at) return false
  if (lead.status === "won" || lead.status === "lost") return false

  return new Date(lead.next_follow_up_at).getTime() < Date.now()
}

export function isFollowUpDue(
  lead: Pick<SalesLead, "next_follow_up_at" | "status">
) {
  if (!lead.next_follow_up_at) return false
  if (!FOLLOW_UP_STATUSES.includes(lead.status)) return false

  const dueAt = new Date(lead.next_follow_up_at).getTime()
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)

  return dueAt <= endOfToday.getTime()
}

export function getFollowUpTone(
  lead: Pick<SalesLead, "next_follow_up_at" | "status">
): "orange" | "red" | null {
  if (!isFollowUpDue(lead)) return null
  return isOverdue(lead) ? "red" : "orange"
}

export function getPrimaryAction(lead: SalesLead): PrimaryAction | null {
  switch (lead.status) {
    case "new":
      return { label: "Contact", kind: "contact", tone: "neutral" }
    case "contacted":
      return { label: "Book Visit", kind: "book_visit", tone: "neutral" }
    case "visit_booked":
      return {
        label: "Mark Estimate Done",
        kind: "estimate_done",
        tone: "neutral",
      }
    case "estimate_done":
      return { label: "Send Quote", kind: "send_quote", tone: "neutral" }
    case "quote_sent": {
      if (!isFollowUpDue(lead)) return null
      const tone = getFollowUpTone(lead) || "orange"
      return { label: "Follow Up", kind: "follow_up", tone }
    }
    case "follow_up_due": {
      const tone = getFollowUpTone(lead) || "orange"
      return { label: "Follow Up", kind: "follow_up", tone }
    }
    case "won":
      return { label: "Add to Schedule", kind: "mark_won", tone: "green" }
    case "lost":
      return null
    default:
      return null
  }
}

export function getCardTone(lead: SalesLead): PrimaryActionTone {
  if (lead.status === "won") return "green"
  if (lead.status === "lost") return "grey"

  const followUpTone = getFollowUpTone(lead)
  if (followUpTone) return followUpTone

  return "neutral"
}

export function addDaysFromNow(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

export function parseNotes(notes: SalesLead["notes"]): SalesLeadActivity[] {
  if (!Array.isArray(notes)) return []

  return notes
    .filter(
      (entry): entry is SalesLeadActivity =>
        Boolean(entry) &&
        typeof entry === "object" &&
        "id" in entry &&
        "type" in entry &&
        "created_at" in entry &&
        "content" in entry
    )
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
}

export function createActivity(
  type: SalesLeadActivityType,
  content: string
): SalesLeadActivity {
  return {
    id: crypto.randomUUID(),
    type,
    created_at: new Date().toISOString(),
    content,
  }
}

export function appendActivities(
  notes: SalesLead["notes"],
  ...entries: SalesLeadActivity[]
): SalesLeadActivity[] {
  return [...parseNotes(notes), ...entries]
}

export function formatActivityType(type: SalesLeadActivityType) {
  switch (type) {
    case "note":
      return "Note"
    case "communication":
      return "Communication"
    case "status_change":
      return "Status change"
    case "follow_up":
      return "Follow-up"
    default:
      return type
  }
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—"

  // Explicit timezone so server (UTC on Vercel) and browser render the same
  // string — this runs during SSR of the board cards (hydration).
  return new Date(value).toLocaleString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Pacific/Auckland",
  })
}

export function toDatetimeLocalValue(value: string | null) {
  if (!value) return ""

  const date = new Date(value)
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60_000)

  return local.toISOString().slice(0, 16)
}

export function fromDatetimeLocalValue(value: string) {
  if (!value.trim()) return null
  return new Date(value).toISOString()
}

// --- Phase 1 six-stage board model -----------------------------------------
// The board (Phase1 spec §2) reshapes the underlying sales_leads.status values
// into six visible stages. Formal status reconciliation (adding job-stage
// statuses like "scheduled"/"completed" via migration) is a later slice; for
// now we map the existing status enum onto these columns for a read-only view.

export type BoardStageKey =
  | "new_lead"
  | "contacted"
  | "visit_booked"
  | "quote"
  | "job_scheduled"
  | "job_completed"

export const BOARD_STAGES: Array<{ key: BoardStageKey; label: string }> = [
  { key: "new_lead", label: "New lead" },
  { key: "contacted", label: "Contacted" },
  { key: "visit_booked", label: "Visit booked" },
  { key: "quote", label: "Quote" },
  { key: "job_scheduled", label: "Job scheduled" },
  { key: "job_completed", label: "Job completed" },
]

// Stage colours (display only): green → orange → blue pairs, left to right,
// each pair progressing lighter → darker. Headings are muted tint pills
// (subtle backgrounds, darker text); the card's `bar` accent strip keeps the
// stronger stage colour since it's small.
export const BOARD_STAGE_COLORS: Record<
  BoardStageKey,
  { header: string; bar: string }
> = {
  new_lead: { header: "bg-green-50 text-green-700", bar: "bg-green-300" },
  contacted: { header: "bg-green-100 text-green-800", bar: "bg-green-700" },
  visit_booked: {
    header: "bg-orange-50 text-orange-700",
    bar: "bg-orange-300",
  },
  quote: { header: "bg-orange-100 text-orange-800", bar: "bg-orange-600" },
  job_scheduled: { header: "bg-blue-50 text-blue-700", bar: "bg-blue-300" },
  job_completed: { header: "bg-blue-100 text-blue-800", bar: "bg-blue-700" },
}

// Index into BOARD_STAGES for a given lead status. Takes a string (not the
// SalesLeadStatus union) so statuses added by a later migration — e.g.
// "scheduled" / "completed" — don't break the board before the mapping is
// formally reconciled.
export function getBoardStageIndex(status: string): number {
  switch (status) {
    case "new":
      return 0
    case "contacted":
      return 1
    case "visit_booked":
      return 2
    case "estimate_done":
    case "quote_sent":
    case "follow_up_due":
      return 3
    case "won":
    case "scheduled":
      return 4
    case "completed":
      return 5
    default:
      return 0
  }
}

// Lost leads drop off the active board (Phase1 spec §2). Won and the future
// job-stage statuses stay, progressing into the job columns.
export function isOnActiveBoard(lead: Pick<SalesLead, "status">): boolean {
  return lead.status !== "lost"
}

// --- Slice 4: follow-up badges ----------------------------------------------
// Contacted stage: one 2-day follow-up (contact_followup_sent_at).
// Quote stage: the 3/7/14-day ladder (followup_*_sent_at).

const CONTACT_FOLLOW_UP_STATUS: SalesLeadStatus = "contacted"
const QUOTE_FOLLOW_UP_STATUSES: SalesLeadStatus[] = [
  "quote_sent",
  "follow_up_due",
]

export type FollowUpBadge = {
  kind: "due" | "sent"
  label: string
}

// Whether the lead's stage still has an unsent follow-up rung available.
export function hasFollowUpRemaining(
  lead: Pick<
    SalesLead,
    | "status"
    | "contact_followup_sent_at"
    | "followup_3day_sent_at"
    | "followup_7day_sent_at"
    | "followup_14day_sent_at"
  >
): boolean {
  if (lead.status === CONTACT_FOLLOW_UP_STATUS) {
    return !lead.contact_followup_sent_at
  }

  if (QUOTE_FOLLOW_UP_STATUSES.includes(lead.status)) {
    return (
      !lead.followup_3day_sent_at ||
      !lead.followup_7day_sent_at ||
      !lead.followup_14day_sent_at
    )
  }

  return false
}

// Badge for the compact card: "Follow-up due" when next_follow_up_at has
// arrived and a rung is still available; "Follow-up sent" between sends.
export function getFollowUpBadge(
  lead: Pick<
    SalesLead,
    | "status"
    | "next_follow_up_at"
    | "contact_followup_sent_at"
    | "followup_3day_sent_at"
    | "followup_7day_sent_at"
    | "followup_14day_sent_at"
  >
): FollowUpBadge | null {
  const inContact = lead.status === CONTACT_FOLLOW_UP_STATUS
  const inQuote = QUOTE_FOLLOW_UP_STATUSES.includes(lead.status)
  if (!inContact && !inQuote) return null

  const anySent = inContact
    ? Boolean(lead.contact_followup_sent_at)
    : Boolean(
        lead.followup_3day_sent_at ||
          lead.followup_7day_sent_at ||
          lead.followup_14day_sent_at
      )

  if (
    lead.next_follow_up_at &&
    hasFollowUpRemaining(lead) &&
    isFollowUpDueAt(lead.next_follow_up_at)
  ) {
    return { kind: "due", label: "Follow-up due" }
  }

  return anySent ? { kind: "sent", label: "Follow-up sent" } : null
}

function isFollowUpDueAt(value: string): boolean {
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)
  return new Date(value).getTime() <= endOfToday.getTime()
}

// --- Phase 2: creating a quote from the board --------------------------------
// The board's Create-quote modal picks a quote type and template, then hands
// off to the quote builder prefilled (?lead=). These are suggestions only —
// a wrong template silently applied is worse than a blank form.

export type QuoteType = "maintenance" | "one_off" | "landscaping"

export type QuoteTemplateOption = {
  id: string
  name: string
  category: string | null
  frequency: string | null
}

// Same rule the quote builder applies when a template is picked: category
// "Maintenance" (or any frequency) → maintenance, "Landscape" → landscaping.
export function getTemplateQuoteType(
  template: Pick<QuoteTemplateOption, "category" | "frequency">
): QuoteType {
  if (template.category === "Maintenance" || Boolean(template.frequency)) {
    return "maintenance"
  }

  if (template.category === "Landscape") return "landscaping"

  return "one_off"
}

export function suggestQuoteTypeFromService(
  service: string | null | undefined
): QuoteType {
  const value = (service || "").toLowerCase()

  if (value.includes("landscap")) return "landscaping"
  if (/mainten|maintain|regular|ongoing|recurring/.test(value)) {
    return "maintenance"
  }

  return "one_off"
}

// Preselect a template only when the quote type narrows it to exactly one —
// e.g. maintenance has six frequency variants, so none is preselected and
// the user picks.
export function suggestTemplateForQuoteType(
  templates: QuoteTemplateOption[],
  quoteType: QuoteType
): string {
  const matches = templates.filter(
    (template) => getTemplateQuoteType(template) === quoteType
  )

  return matches.length === 1 ? matches[0].id : ""
}
