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

  if (!Array.isArray(lineItems)) return lines.join("\n")

  for (const raw of lineItems) {
    const item =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}

    const category = inferQuoteLineCategory({
      category: typeof item.category === "string" ? item.category : null,
      account_code:
        typeof item.account_code === "string" ? item.account_code : null,
      item_code: typeof item.item_code === "string" ? item.item_code : null,
    })

    if (!CREW_MATERIAL_CATEGORIES.has(category)) continue

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
