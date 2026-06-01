import type { CommunicationWithEnquiry } from "@/lib/types"

type CommunicationClassificationInput = {
  ignored?: boolean | null
  requires_action?: boolean | null
  status?: string | null
  direction?: string | null
  source_category?: string | null
  category?: string | null
  subject?: string | null
  body?: string | null
  metadata?: unknown
}

export type CommunicationTab =
  | "action"
  | "organic"
  | "customer"
  | "aggregator"
  | "admin"
  | "ignored"
  | "all"

export type CommunicationClassification =
  | "organic_lead"
  | "customer_message"
  | "aggregator_lead"
  | "admin_receipt"
  | "marketing_system"
  | "outbound_internal"
  | "ignored"

export const communicationTabs: { value: CommunicationTab; label: string }[] = [
  { value: "action", label: "Action Inbox" },
  { value: "organic", label: "Organic Leads" },
  { value: "customer", label: "Customer Messages" },
  { value: "aggregator", label: "Aggregator Leads" },
  { value: "admin", label: "Receipts/Admin" },
  { value: "ignored", label: "Ignored" },
  { value: "all", label: "All" },
]

export const adminSourceCategories = [
  "marketing",
  "receipt",
  "system_alert",
  "banking",
  "supplier_auto",
  "spam",
]

const internalSenderFragments = [
  "contact@pristinegardens.co.nz",
  "joe@pristinegardens.co.nz",
  "pristinegardens.co.nz",
]

const aggregatorFragments = ["bark", "builderscrack", "builders crack"]

function parseMetadata(metadata: unknown): Record<string, unknown> | null {
  if (!metadata) return null

  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata)
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null
    } catch {
      return null
    }
  }

  return typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : null
}

function getMetadataString(
  row: Pick<CommunicationClassificationInput, "metadata">,
  keys: string[]
) {
  const metadata = parseMetadata(row.metadata)
  if (!metadata) return ""

  return keys
    .map((key) => metadata[key])
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase()
}

function rowText(row: Pick<CommunicationClassificationInput, "subject" | "body" | "metadata">) {
  return [
    row.subject,
    row.body,
    getMetadataString(row, [
      "from_email",
      "from",
      "from_name",
      "sender",
      "sender_email",
      "source",
      "provider",
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

export function isClosedCommunication(
  row: Pick<CommunicationClassificationInput, "status">
) {
  const status = String(row.status || "")
  return status === "closed" || status === "archived"
}

export function isOutboundOrInternalCommunication(
  row: Pick<CommunicationClassificationInput, "direction" | "metadata" | "subject" | "body">
) {
  if (row.direction === "outbound") return true

  const sender = getMetadataString(row, [
    "from_email",
    "from",
    "sender",
    "sender_email",
    "reply_from",
  ])

  return internalSenderFragments.some((fragment) => sender.includes(fragment))
}

export function isAggregatorCommunication(
  row: Pick<CommunicationClassificationInput, "source_category" | "subject" | "body" | "metadata">
) {
  if (row.source_category === "aggregator_lead") return true

  const text = rowText(row)
  return aggregatorFragments.some((fragment) => text.includes(fragment))
}

export function isAdminCommunication(
  row: Pick<CommunicationClassificationInput, "source_category" | "category" | "subject" | "body" | "metadata">
) {
  if (row.category === "internal_note") return true
  if (row.source_category && adminSourceCategories.includes(row.source_category)) {
    return true
  }

  const text = rowText(row)
  return (
    text.includes("newsletter") ||
    text.includes("receipt") ||
    text.includes("invoice attached") ||
    text.includes("bank statement")
  )
}

export function classifyCommunication(
  row: CommunicationClassificationInput
): CommunicationClassification {
  if (row.ignored === true) return "ignored"
  if (isOutboundOrInternalCommunication(row)) return "outbound_internal"
  if (isAggregatorCommunication(row)) return "aggregator_lead"

  if (
    row.source_category === "receipt" ||
    row.source_category === "banking" ||
    row.source_category === "supplier_auto"
  ) {
    return "admin_receipt"
  }

  if (
    row.category === "internal_note" ||
    row.source_category === "marketing" ||
    row.source_category === "system_alert" ||
    row.source_category === "spam"
  ) {
    return "marketing_system"
  }

  const text = rowText(row)
  if (
    text.includes("newsletter") ||
    text.includes("receipt") ||
    text.includes("invoice attached") ||
    text.includes("bank statement")
  ) {
    return "admin_receipt"
  }

  if (
    row.category === "quote_request" ||
    row.source_category === "customer_enquiry"
  ) {
    return "organic_lead"
  }

  return "customer_message"
}

export function isActiveActionableCommunication(
  row: CommunicationClassificationInput
) {
  return (
    row.ignored !== true &&
    row.requires_action === true &&
    !isClosedCommunication(row) &&
    !isOutboundOrInternalCommunication(row) &&
    !isAggregatorCommunication(row) &&
    !isAdminCommunication(row)
  )
}

export function isOrganicLeadCommunication(
  row: CommunicationClassificationInput
) {
  if (!isActiveActionableCommunication(row)) return false

  return (
    row.category === "quote_request" ||
    row.source_category === "customer_enquiry" ||
    row.source_category === "existing_client"
  )
}

export function isCustomerMessageCommunication(
  row: CommunicationClassificationInput
) {
  return isActiveActionableCommunication(row) && !isOrganicLeadCommunication(row)
}

export function filterCommunicationsForTab<T extends CommunicationWithEnquiry>(
  rows: T[],
  tab: CommunicationTab
) {
  return rows.filter((row) => {
    if (tab === "all") return true
    if (tab === "ignored") return row.ignored === true
    if (tab === "aggregator") {
      return row.ignored !== true && isAggregatorCommunication(row)
    }
    if (tab === "admin") {
      return row.ignored !== true && isAdminCommunication(row)
    }
    if (tab === "organic") return isOrganicLeadCommunication(row)
    if (tab === "customer") return isCustomerMessageCommunication(row)

    return isActiveActionableCommunication(row)
  })
}
