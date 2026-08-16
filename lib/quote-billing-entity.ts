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
  // GST-INCLUSIVE. This is the field the Xero views read.
  unit_price: number
  line_total: number
  // The ex-GST figures exactly as they were typed. Carried so the proposal can
  // print them without dividing the rounded inclusive price back down, which
  // drifts by a cent or two. Ignored by the Xero views (they select named
  // fields), so these are display-only baggage on the JSON.
  unit_price_ex: number
  line_total_ex: number
  account_code: string
  tax_type: string
  category: "labour" | "greenwaste" | "materials"
}

// Rates on a WeDo quote are entered GST-EXCLUSIVE (Joe's call, 16 Aug): he
// types 66.96 and 19.50 and the customer sees those. Xero still needs
// GST-inclusive unit prices because Make marks invoices tax-inclusive, so the
// conversion happens here and nowhere else.
export function toIncGst(exclusive: number) {
  return round2(Number(exclusive || 0) * GST_MULTIPLIER)
}

// The itemised lines a WeDo quote carries, replacing the single collapsed
// price a Pristine maintenance quote uses.
//
// EVERY AMOUNT IN `input` IS GST-EXCLUSIVE — that's what Joe types. Each line
// carries the ex-GST figures verbatim for the proposal, plus a GST-inclusive
// unit price for Xero. Zero-value lines are dropped rather than shown at
// $0.00 — a "Treatments $0.00" row invites a question with no useful answer.
export function buildWeDoLines(input: QuoteLineInput): BuiltQuoteLine[] {
  const lines: BuiltQuoteLine[] = []

  const line = (
    item_code: string,
    description: string,
    quantity: number,
    unitEx: number,
    account_code: string,
    category: BuiltQuoteLine["category"]
  ): BuiltQuoteLine => {
    const unitInc = toIncGst(unitEx)
    return {
      item_code,
      description,
      quantity,
      unit_price: unitInc,
      line_total: round2(quantity * unitInc),
      unit_price_ex: round2(unitEx),
      line_total_ex: round2(quantity * unitEx),
      account_code,
      tax_type: "OUTPUT2",
      category,
    }
  }

  const hours = Number(input.labourHours || 0)
  const rate = Number(input.labourRate || 0)
  if (hours > 0 && rate > 0) {
    lines.push(line("Labour", "Labour", hours, rate, "10010", "labour"))
  }

  const greenwaste = Number(input.greenwasteAmount || 0)
  if (greenwaste > 0) {
    lines.push(
      line("Greenwaste", "Greenwaste removal", 1, greenwaste, "10114", "greenwaste")
    )
  }

  const treatments =
    Number(input.spraysPrice || 0) +
    Number(input.fertiliserPrice || 0) +
    Number(input.stumpPastePrice || 0)

  if (treatments > 0) {
    lines.push(
      line("Materials", "Sprays and fertiliser", 1, treatments, "10011", "materials")
    )
  }

  return lines
}

// What a WeDo quote is worth, from GST-exclusive inputs. The ex-GST subtotal is
// the authored figure; GST and the inclusive total are derived from it, so the
// customer's total always equals what they were quoted plus 15%.
export function weDoTotals(lines: BuiltQuoteLine[]) {
  const subtotalExGst = round2(
    lines.reduce((sum, l) => sum + l.line_total_ex, 0)
  )
  const totalIncGst = round2(subtotalExGst * GST_MULTIPLIER)
  return {
    subtotalExGst,
    gst: round2(totalIncGst - subtotalExGst),
    totalIncGst,
  }
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
  lines: {
    description: string
    quantity: number
    unit_price: number
    line_total?: number
    unit_price_ex?: number
    line_total_ex?: number
    category?: string
  }[],
  totalIncGst: number
): ExGstTotals {
  const displayLines: DisplayLine[] = lines.map((line) => {
    // Prefer the ex-GST figures stored on the line — they are what was typed.
    // Falling back to dividing the inclusive price covers WeDo quotes saved
    // before the ex-GST fields existed, at the cost of a cent of drift.
    const exTotal =
      line.line_total_ex != null
        ? round2(Number(line.line_total_ex))
        : toExGst(
            line.line_total != null
              ? Number(line.line_total)
              : Number(line.quantity || 0) * Number(line.unit_price || 0)
          )

    const exUnit =
      line.unit_price_ex != null
        ? round2(Number(line.unit_price_ex))
        : toExGst(Number(line.unit_price || 0))

    const isLabour = line.category === "labour"
    const hours = Number(line.quantity || 0)

    return {
      description: line.description,
      quantityLabel:
        isLabour && hours > 0
          ? `${hours} ${hours === 1 ? "hr" : "hrs"} × ${formatNzd(exUnit)}`
          : null,
      exGstTotal: exTotal,
    }
  })

  const subtotalExGst = round2(
    displayLines.reduce((sum, line) => sum + line.exGstTotal, 0)
  )
  // GST is the remainder up to the inclusive total, so subtotal + GST always
  // reconstructs exactly what the customer is charged.
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
