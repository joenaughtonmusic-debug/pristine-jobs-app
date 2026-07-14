export type SalesLeadStatus =
  | "new"
  | "contacted"
  | "visit_booked"
  | "estimate_done"
  | "quote_sent"
  | "follow_up_due"
  | "won"
  | "lost"

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
  quote_value: number | string | null
  lost_reason: string | null
  notes: SalesLeadActivity[] | unknown
}

export type PipelineStageKey =
  | "new"
  | "contacted"
  | "visit_booked"
  | "estimate_done"
  | "quote_sent"
  | "follow_up_due"
  | "won_lost"

export const PIPELINE_STAGES: Array<{ key: PipelineStageKey; label: string }> = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "visit_booked", label: "Visit Booked" },
  { key: "estimate_done", label: "Estimate Done" },
  { key: "quote_sent", label: "Quote Sent" },
  { key: "follow_up_due", label: "Follow Up" },
  { key: "won_lost", label: "Won / Lost" },
]

export const STATUS_LABELS: Record<SalesLeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  visit_booked: "Visit Booked",
  estimate_done: "Estimate Done",
  quote_sent: "Quote Sent",
  follow_up_due: "Follow Up",
  won: "Won",
  lost: "Lost",
}

export function getLeadColumn(status: SalesLeadStatus): PipelineStageKey {
  if (status === "won" || status === "lost") {
    return "won_lost"
  }

  return status
}

export function getNextAction(status: SalesLeadStatus): string {
  switch (status) {
    case "new":
      return "Make first contact"
    case "contacted":
      return "Book site visit"
    case "visit_booked":
      return "Complete estimate"
    case "estimate_done":
      return "Send quote"
    case "quote_sent":
      return "Schedule follow-up"
    case "follow_up_due":
      return "Follow up now"
    case "won":
      return "Convert to job"
    case "lost":
      return "Closed"
    default:
      return "Review lead"
  }
}

export function isOverdue(lead: Pick<SalesLead, "next_follow_up_at" | "status">) {
  if (!lead.next_follow_up_at) return false
  if (lead.status === "won" || lead.status === "lost") return false

  return new Date(lead.next_follow_up_at).getTime() < Date.now()
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

  return new Date(value).toLocaleString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
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
