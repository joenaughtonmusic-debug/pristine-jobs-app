import { createActivity, type SalesLeadActivity } from "@/lib/sales-leads"

// Sources offered when adding a lead by hand from the pipeline board.
export const MANUAL_LEAD_SOURCES = [
  { value: "web", label: "Web" },
  { value: "phone", label: "Phone" },
  { value: "text", label: "Text" },
  { value: "bni", label: "BNI" },
  { value: "bark", label: "Bark" },
  { value: "buildercrack", label: "Buildercrack" },
  { value: "facebook", label: "Facebook" },
  { value: "other", label: "Other" },
] as const

export type ManualLeadInput = {
  name: string
  email?: string
  phone?: string
  suburb?: string
  service_needed?: string
  source?: string
  message?: string
}

export type ManualLeadRow = {
  name: string
  email: string | null
  phone: string | null
  suburb: string | null
  service_needed: string | null
  source: string
  message: string | null
  status: "new"
  notes: SalesLeadActivity[]
}

function trim(value: string | null | undefined) {
  return String(value || "").trim()
}

// Every manually added lead enters the board at Stage 1 (`new`) regardless of
// source — there is no source-based stage routing (supersedes the build
// brief's earlier Bark/Buildercrack → contacted rule). Notes are stored
// verbatim in `message`; paste-extraction is a later slice.
export function buildManualLeadRow(
  input: ManualLeadInput
): { row: ManualLeadRow } | { error: string } {
  const name = trim(input.name)

  if (!name) {
    return { error: "Name is required." }
  }

  const source = MANUAL_LEAD_SOURCES.some(
    (option) => option.value === input.source
  )
    ? (input.source as string)
    : "other"

  return {
    row: {
      name,
      email: trim(input.email) || null,
      phone: trim(input.phone) || null,
      suburb: trim(input.suburb) || null,
      service_needed: trim(input.service_needed) || null,
      source,
      message: trim(input.message) || null,
      status: "new",
      notes: [createActivity("note", "Lead added manually from the pipeline board.")],
    },
  }
}
