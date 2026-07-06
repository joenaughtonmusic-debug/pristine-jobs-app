import { createActivity, type SalesLeadActivity } from "@/lib/sales-leads"

export type SalesLeadWebhookPayload = {
  name?: string
  email?: string | null
  phone?: string | null
  address?: string | null
  suburb?: string | null
  service_needed?: string | null
  message?: string | null
  source?: string | null
  page_url?: string | null
  outcome?: string | null
  garden_size?: string | null
}

function trim(value: string | null | undefined) {
  return String(value || "").trim()
}

export function buildLeadMessage(payload: SalesLeadWebhookPayload): string | null {
  const message = trim(payload.message)

  if (message) {
    return message
  }

  const structuredLines = [
    payload.outcome ? `Outcome: ${trim(payload.outcome)}` : "",
    payload.garden_size ? `Garden size: ${trim(payload.garden_size)}` : "",
    payload.page_url ? `Page: ${trim(payload.page_url)}` : "",
  ].filter(Boolean)

  return structuredLines.length > 0 ? structuredLines.join("\n") : null
}

export function buildLeadNotes(
  payload: SalesLeadWebhookPayload
): SalesLeadActivity[] {
  const activities: SalesLeadActivity[] = [
    createActivity("communication", "Website enquiry received via webhook."),
  ]

  const detailLines = [
    payload.page_url ? `Page URL: ${trim(payload.page_url)}` : "",
    payload.outcome ? `Outcome: ${trim(payload.outcome)}` : "",
    payload.garden_size ? `Garden size: ${trim(payload.garden_size)}` : "",
  ].filter(Boolean)

  if (detailLines.length > 0) {
    activities.push(createActivity("note", detailLines.join("\n")))
  }

  return activities
}

export function normalizeSalesLeadWebhookPayload(
  payload: SalesLeadWebhookPayload
) {
  const name = trim(payload.name)

  if (!name) {
    return { error: "name is required" as const }
  }

  return {
    row: {
      name,
      email: trim(payload.email) || null,
      phone: trim(payload.phone) || null,
      address: trim(payload.address) || null,
      suburb: trim(payload.suburb) || null,
      service_needed: trim(payload.service_needed) || null,
      message: buildLeadMessage(payload),
      source: trim(payload.source) || "website",
      status: "new" as const,
      notes: buildLeadNotes(payload),
    },
  }
}
