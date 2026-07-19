import { inferQuoteLineCategory } from "@/lib/quote-line-categories"

// Crew Brief: the "bring these" list carried from an accepted quote onto the
// scheduled job's quoted_materials field. Joe's category set (19 Jul 2026):
// materials, plants, tool hire, AND sprays/extras — everything the crew
// physically brings or uses on site. Prices are deliberately stripped: this
// is team-facing, and team instructions carry no pricing.
const CREW_MATERIAL_CATEGORIES = new Set([
  "materials",
  "plants",
  "tool_hire",
  "sprays_extras",
])

// Maintenance quotes carry sprays/fertiliser/stump-paste as pricing-panel
// allowances (size fields on the draft), NOT line items — without these the
// crew list would omit consumables the customer is paying for. Sizes only,
// never dollars.
export type QuoteAllowances = {
  sprays_size?: string | null
  fertiliser_size?: string | null
  stump_paste_size?: string | null
}

const ALLOWANCE_LABELS: Array<[keyof QuoteAllowances, string]> = [
  ["sprays_size", "Sprays"],
  ["fertiliser_size", "Fertiliser"],
  ["stump_paste_size", "Stump paste"],
]

// Live rows store line_items in three shapes: a real jsonb array (current
// builder), a JSON-stringified array or single object (legacy rows — seen
// on real quotes). Everything downstream gets a plain array.
export function parseStoredLineItems(value: unknown): Record<string, unknown>[] {
  let parsed = value

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return []
    }
  }

  if (Array.isArray(parsed)) {
    return parsed.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object"
    )
  }

  if (parsed && typeof parsed === "object") {
    return [parsed as Record<string, unknown>]
  }

  return []
}

function categoryOf(item: Record<string, unknown>) {
  return inferQuoteLineCategory({
    category: typeof item.category === "string" ? item.category : null,
    account_code:
      typeof item.account_code === "string" ? item.account_code : null,
    item_code: typeof item.item_code === "string" ? item.item_code : null,
  })
}

export function buildCrewMaterialsList(
  lineItems: unknown,
  allowances?: QuoteAllowances | null
): string {
  const lines: string[] = []

  for (const [key, label] of ALLOWANCE_LABELS) {
    const size = allowances?.[key]

    if (size && size !== "none") {
      lines.push(`• ${label} — ${size} allowance`)
    }
  }

  for (const item of parseStoredLineItems(lineItems)) {
    if (!CREW_MATERIAL_CATEGORIES.has(categoryOf(item))) continue

    const description =
      typeof item.description === "string" ? item.description.trim() : ""

    if (!description) continue

    // Line items can carry long customer-facing text; the crew list wants
    // the headline only.
    const firstLine = description.split("\n")[0].trim()
    const quantity = Number(item.quantity || 0)

    lines.push(quantity > 1 ? `• ${firstLine} (× ${quantity})` : `• ${firstLine}`)
  }

  return lines.join("\n")
}

// Duration prefill (Joe's mapping, 20 Jul 2026): maintenance quotes carry
// hours in the pricing panel (labour_hours, per visit); one-off/landscaping
// quotes carry them as the single labour line's quantity. More than one
// labour line means ambiguity — return null and leave Duration for Joe
// rather than summing incorrectly.
export function getQuoteLabourHours(quote: {
  quote_type?: string | null
  labour_hours?: number | string | null
  line_items?: unknown
}): number | null {
  if (quote.quote_type === "maintenance") {
    const hours = Number(quote.labour_hours || 0)
    return hours > 0 ? hours : null
  }

  const labourLines = parseStoredLineItems(quote.line_items).filter(
    (item) => categoryOf(item) === "labour"
  )

  if (labourLines.length !== 1) return null

  const hours = Number(labourLines[0].quantity || 0)
  return hours > 0 ? hours : null
}
