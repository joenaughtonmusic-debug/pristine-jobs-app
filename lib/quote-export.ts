import {
  getQuoteLineCategory,
  inferQuoteLineCategory,
} from "@/lib/quote-line-categories"

// Brief 04 Part 3b: the boring quote as clean text — categories,
// descriptions, quantities, prices, totals — for pasting into a doc, an
// email, or an AI prompt when the owner hand-builds a designed proposal.
// The app still holds the numbers and drives the invoice.

type ExportDraft = {
  quote_title: string
  customer_name: string
  quote_type: string | null
  frequency: string | null
  line_items?: unknown
  subtotal?: number | string | null
  gst?: number | string | null
  total: number | string | null
  monthly_equivalent?: number | string | null
}

function money(value: number | string | null | undefined) {
  return Number(value || 0).toLocaleString("en-NZ", {
    style: "currency",
    currency: "NZD",
  })
}

function typeLabel(draft: ExportDraft) {
  if (draft.quote_type === "maintenance") {
    return `Maintenance${
      draft.frequency ? ` — ${draft.frequency.replaceAll("_", " ")}` : ""
    }`
  }

  if (draft.quote_type === "landscaping") return "Landscaping"

  return "One-off"
}

export function buildQuoteExportText(draft: ExportDraft): string {
  const items = Array.isArray(draft.line_items) ? draft.line_items : []

  const lines = items.map((raw, index) => {
    const item =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
    const category = getQuoteLineCategory(
      inferQuoteLineCategory({
        category: typeof item.category === "string" ? item.category : null,
        account_code:
          typeof item.account_code === "string" ? item.account_code : null,
        item_code: typeof item.item_code === "string" ? item.item_code : null,
      })
    )
    const quantity = Number(item.quantity || 0)
    const unitPrice = Number(item.unit_price || 0)
    const lineTotal = Number(item.line_total ?? quantity * unitPrice)
    const heading = `${index + 1}. ${category.label} — ${quantity} × ${money(
      unitPrice
    )} = ${money(lineTotal)}`
    const description =
      typeof item.description === "string" && item.description.trim()
        ? `\n${item.description.trim()}`
        : ""

    return heading + description
  })

  return [
    draft.quote_title,
    `Customer: ${draft.customer_name}`,
    `Type: ${typeLabel(draft)}`,
    "",
    lines.join("\n\n"),
    "",
    `Subtotal (excl GST): ${money(draft.subtotal)}`,
    `GST: ${money(draft.gst)}`,
    `Total (incl GST): ${money(draft.total)}`,
    ...(draft.quote_type === "maintenance" && draft.monthly_equivalent
      ? [`Monthly equivalent: ${money(draft.monthly_equivalent)}`]
      : []),
  ].join("\n")
}
