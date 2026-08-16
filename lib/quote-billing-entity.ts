// WeDo partnership quotes: same money as a Pristine quote, presented the way a
// trade counterparty expects — GST-exclusive, labour hours visible, greenwaste
// and treatments on their own lines instead of one collapsed per-visit price.
//
// THE BOUNDARY, and it matters: every price STORED here stays GST-INCLUSIVE.
// quote_drafts.line_items is what invoice_line_items_for_make hands to Xero,
// and the Make scenario marks those invoices tax-inclusive. Storing ex-GST unit
// prices would make Xero read $66.96 as a GST-inclusive $66.96 and every WeDo
// invoice would land ~13% short, silently, with no error anywhere. So the
// ex-GST figures below are DERIVED for display and never written to line_items.
//
// $66.96 ex = $77.00 incl. $18.26 ex = $21.00 incl. Enter the inclusive rate;
// the customer sees the exclusive one.

export const GST_RATE = 0.15
const GST_MULTIPLIER = 1 + GST_RATE

export type BillingEntity = "pristine" | "wedo"

export function isWeDoQuote(entity?: string | null) {
  return entity === "wedo"
}

export function normaliseBillingEntity(value?: string | null): BillingEntity {
  return value === "wedo" ? "wedo" : "pristine"
}

const round2 = (value: number) => Math.round(value * 100) / 100

// GST-inclusive → GST-exclusive, to the cent.
export function toExGst(inclusive: number) {
  return round2(Number(inclusive || 0) / GST_MULTIPLIER)
}

export type QuoteLineInput = {
  labourHours: number
  labourRate: number
  greenwasteAmount: number
  spraysPrice: number
  fertiliserPrice: number
  stumpPastePrice: number
}

export type BuiltQuoteLine = {
  item_code: string
  description: string
  quantity: number
  unit_price: number
  line_total: number
  account_code: string
  tax_type: string
  category: "labour" | "greenwaste" | "materials"
}

// The itemised lines a WeDo quote carries, replacing the single collapsed
// price a Pristine maintenance quote uses. Unit prices are GST-INCLUSIVE (see
// the boundary note above). Zero-value lines are dropped rather than shown at
// $0.00 — a "Treatments $0.00" row invites a question with no useful answer.
export function buildWeDoLines(input: QuoteLineInput): BuiltQuoteLine[] {
  const lines: BuiltQuoteLine[] = []

  const hours = Number(input.labourHours || 0)
  const rate = Number(input.labourRate || 0)

  if (hours > 0 && rate > 0) {
    lines.push({
      item_code: "Labour",
      description: "Labour",
      quantity: hours,
      unit_price: rate,
      line_total: round2(hours * rate),
      account_code: "10010",
      tax_type: "OUTPUT2",
      category: "labour",
    })
  }

  const greenwaste = Number(input.greenwasteAmount || 0)
  if (greenwaste > 0) {
    lines.push({
      item_code: "Greenwaste",
      description: "Greenwaste removal",
      quantity: 1,
      unit_price: round2(greenwaste),
      line_total: round2(greenwaste),
      account_code: "10114",
      tax_type: "OUTPUT2",
      category: "greenwaste",
    })
  }

  const treatments =
    Number(input.spraysPrice || 0) +
    Number(input.fertiliserPrice || 0) +
    Number(input.stumpPastePrice || 0)

  if (treatments > 0) {
    lines.push({
      item_code: "Materials",
      description: "Sprays and fertiliser",
      quantity: 1,
      unit_price: round2(treatments),
      line_total: round2(treatments),
      account_code: "10011",
      tax_type: "OUTPUT2",
      category: "materials",
    })
  }

  return lines
}

export type DisplayLine = {
  description: string
  // Quantity is shown for labour only — Joe's call, 15 Aug. Bags vary visit to
  // visit, so printing a bag count on a charge-up quote invites "you said two
  // bags" on every invoice that differs. Hours are the honest, stable number.
  quantityLabel: string | null
  exGstTotal: number
}

export type ExGstTotals = {
  lines: DisplayLine[]
  subtotalExGst: number
  gst: number
  totalIncGst: number
}

// The proposal's ex-GST view of a quote. Rounding rule: each line converts to
// ex-GST and rounds, the subtotal is their sum, and GST is the remainder up to
// the inclusive total — so subtotal + GST always equals the total the customer
// is actually charged, and the printed figures always add up.
export function buildExGstTotals(
  lines: { description: string; quantity: number; unit_price: number; line_total?: number; category?: string }[],
  totalIncGst: number
): ExGstTotals {
  const displayLines: DisplayLine[] = lines.map((line) => {
    const inclusive =
      line.line_total != null
        ? Number(line.line_total)
        : Number(line.quantity || 0) * Number(line.unit_price || 0)

    const isLabour = line.category === "labour"
    const hours = Number(line.quantity || 0)

    return {
      description: line.description,
      quantityLabel:
        isLabour && hours > 0
          ? `${hours} ${hours === 1 ? "hr" : "hrs"} × ${formatNzd(
              toExGst(Number(line.unit_price || 0))
            )}`
          : null,
      exGstTotal: toExGst(inclusive),
    }
  })

  const subtotalExGst = round2(
    displayLines.reduce((sum, line) => sum + line.exGstTotal, 0)
  )
  const total = round2(Number(totalIncGst || 0))

  return {
    lines: displayLines,
    subtotalExGst,
    gst: round2(total - subtotalExGst),
    totalIncGst: total,
  }
}

export function formatNzd(value: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
  }).format(Number(value || 0))
}
