import {
  createActivity,
  JOB_TYPE_OPTIONS,
  type SalesLeadActivity,
} from "@/lib/sales-leads"

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
  job_type?: string
  source?: string
  message?: string
}

export type ManualLeadRow = {
  name: string
  email: string | null
  phone: string | null
  suburb: string | null
  service_needed: string | null
  // Optional and OMITTED when unset (never written as null): rows without it
  // keep inserting fine even if migration 047 hasn't been pasted yet — only
  // an actual job-type selection needs the column to exist.
  job_type?: "maintenance" | "one_off" | "landscaping"
  source: string
  message: string | null
  status: "new"
  notes: SalesLeadActivity[]
}

// Same three values as the migration-047 CHECK constraint, derived from the
// one JOB_TYPE_OPTIONS list — anything else means "not set".
function normaliseJobType(value: string | null | undefined) {
  return JOB_TYPE_OPTIONS.some((option) => option.value === value)
    ? (value as ManualLeadRow["job_type"])
    : undefined
}

function trim(value: string | null | undefined) {
  return String(value || "").trim()
}

// Slice 6: existing/repeat customers enter at Visit booked, skipping the
// New lead → Contacted courtship (Phase1 spec §6). Phase 2 links the lead to
// its property via sales_leads.property_id (migration 043); the activity note
// keeps the human-readable record.
export type ExistingCustomerProperty = {
  id: string
  client_name: string | null
  client_email: string | null
  phone: string | null
  suburb: string | null
  address_line_1: string | null
  property_code: string | null
}

export type ExistingCustomerLeadInput = {
  service_needed?: string
  message?: string
  site_visit_at?: string | null
}

export type ExistingCustomerLeadRow = Omit<ManualLeadRow, "status"> & {
  address: string | null
  status: "visit_booked"
  site_visit_at: string | null
  property_id: string
}

export function buildExistingCustomerLeadRow(
  property: ExistingCustomerProperty,
  input: ExistingCustomerLeadInput
): { row: ExistingCustomerLeadRow } | { error: string } {
  const name = trim(property.client_name)

  if (!name) {
    return { error: "This property has no client name." }
  }

  const service = trim(input.service_needed)

  if (!service) {
    return { error: "Enter what they want." }
  }

  return {
    row: {
      name,
      email: trim(property.client_email) || null,
      phone: trim(property.phone) || null,
      suburb: trim(property.suburb) || null,
      address: trim(property.address_line_1) || null,
      service_needed: service,
      message: trim(input.message) || null,
      source: "existing_customer",
      status: "visit_booked",
      site_visit_at: input.site_visit_at || null,
      property_id: property.id,
      notes: [
        createActivity(
          "note",
          `Existing customer added from property ${
            property.property_code || property.id
          } — entered at Visit booked.`
        ),
      ],
    },
  }
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
      ...(normaliseJobType(input.job_type)
        ? { job_type: normaliseJobType(input.job_type) }
        : {}),
      source,
      message: trim(input.message) || null,
      status: "new",
      notes: [createActivity("note", "Lead added manually from the pipeline board.")],
    },
  }
}
