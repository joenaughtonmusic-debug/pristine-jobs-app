// Invoice-from-quote: pure helpers that turn a completed quoted job + its
// accepted quote into the payload Make needs to create + email a Xero invoice.
// The app can't reach Xero directly — it POSTs this payload to a Make webhook
// and Make creates the invoice, emails the customer, and writes the Xero
// invoice number back onto the scheduled job.
//
// Amounts are GST-INCLUSIVE (the unit prices the customer saw on the quote),
// so Xero gets LineAmountTypes = "Inclusive" and back-calculates the GST. That
// keeps the invoice identical to the accepted quote — pricing stays traceable.

// Line-item keys use Xero's own API field names so the Make Xero module can
// bind the whole array in one step (no per-line remapping). UnitAmount is
// GST-inclusive (invoice-level LineAmountTypes = "Inclusive").
export type InvoiceLineItem = {
  Description: string
  Quantity: number
  UnitAmount: number // GST-inclusive
  AccountCode?: string | null
  TaxType?: string | null
}

export type InvoicePayload = {
  job_id: string
  quote_id: string | null
  property_id: string | null
  customer_name: string
  customer_email: string
  reference: string
  invoice_date: string // YYYY-MM-DD
  due_date: string // YYYY-MM-DD (invoice_date + due-in days)
  line_amount_types: "Inclusive"
  currency: "NZD"
  // Drives the Make router → which Xero branding theme to use.
  branding: "pristine" | "partnership"
  line_items: InvoiceLineItem[]
  total_incl_gst: number
}

export type BuildInvoiceResult =
  | { ok: true; payload: InvoicePayload }
  | { ok: false; error: string }

// A quote line item as stored on quote_drafts.line_items — loosely typed
// because it's JSON, and legacy rows may be missing fields.
type QuoteLineItem = {
  description?: string | null
  quantity?: number | string | null
  unit_price?: number | string | null
  account_code?: string | null
  tax_type?: string | null
  // Used only to spot the labour row when hours are hidden. `category` is what
  // the builder writes today; item_code and account_code cover rows saved
  // before it existed, so an older quote still collapses correctly.
  category?: string | null
  item_code?: string | null
}

const round2 = (value: number) => Math.round(value * 100) / 100

function isLabourLine(li: QuoteLineItem): boolean {
  if (li.category) return li.category === "labour"
  if (li.item_code) return li.item_code === "Labour"
  return li.account_code === "10010"
}

function ymd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

// Build the invoice payload from the job, its accepted quote, and the property.
// Returns an error (never a half-built invoice) when the quote has no usable
// line items or the customer has no email — we never invent pricing.
export function buildInvoicePayload(args: {
  job: { id: string; property_id?: string | null }
  quote: {
    id: string
    customer_name?: string | null
    customer_email?: string | null
    line_items?: QuoteLineItem[] | null
    total?: number | string | null
    logo_variant?: string | null
    show_labour_hours?: boolean | null
  }
  property: {
    property_code?: string | null
    client_name?: string | null
    client_email?: string | null
  }
  now: Date
  dueInDays: number
}): BuildInvoiceResult {
  const { job, quote, property, now, dueInDays } = args

  const customerEmail =
    (quote.customer_email || property.client_email || "").trim()
  if (!customerEmail) {
    return {
      ok: false,
      error:
        "No customer email on the quote or property, so the invoice can't be emailed. Add an email first.",
    }
  }

  const customerName =
    (quote.customer_name || property.client_name || "").trim() || "Customer"

  // 086: a quote that hides its hours must hide them on the invoice too, or
  // the proposal says "Labour $2,464.00" and the Xero invoice that follows
  // says "32 x $77.00" and reopens the conversation the quote closed.
  const showLabourHours = quote.show_labour_hours === true

  const rawLines = Array.isArray(quote.line_items) ? quote.line_items : []
  const line_items: InvoiceLineItem[] = rawLines
    .map((li) => {
      const quantity = Number(li.quantity ?? 0)
      const unitAmount = Number(li.unit_price ?? 0)
      // One row at the full line value instead of hours x rate. Same money
      // against the same account code — only the breakdown goes away. Lines
      // already at quantity 1 are left exactly as they are, and a zero-hour
      // line is left alone so the filter below can still drop it.
      const collapse =
        !showLabourHours && isLabourLine(li) && quantity > 0 && quantity !== 1

      return {
        Description: (li.description || "").toString().trim(),
        Quantity: collapse ? 1 : quantity,
        UnitAmount: collapse ? round2(quantity * unitAmount) : unitAmount,
        AccountCode: li.account_code ?? null,
        TaxType: li.tax_type ?? null,
      }
    })
    .filter((li) => li.Description && li.Quantity > 0)

  if (line_items.length === 0) {
    return {
      ok: false,
      error:
        "This quote has no line items to invoice. Open the quote and check its pricing before invoicing.",
    }
  }

  const total = Number(quote.total ?? 0)
  if (!(total > 0)) {
    return {
      ok: false,
      error: "This quote has no total, so there's nothing to invoice.",
    }
  }

  const reference =
    `${property.property_code ? `${property.property_code} — ` : ""}garden work`.trim()

  const invoiceDate = ymd(now)
  const dueDate = ymd(addDays(now, dueInDays))

  return {
    ok: true,
    payload: {
      job_id: job.id,
      quote_id: quote.id,
      property_id: job.property_id ?? null,
      customer_name: customerName,
      customer_email: customerEmail,
      reference,
      invoice_date: invoiceDate,
      due_date: dueDate,
      line_amount_types: "Inclusive",
      currency: "NZD",
      branding: quote.logo_variant === "partnership" ? "partnership" : "pristine",
      line_items,
      total_incl_gst: total,
    },
  }
}
