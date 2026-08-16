# Brief — one-click "Create & send invoice" from a completed job

## Goal
Kill the manual Xero step for quoted jobs. When a quoted job is done, one tap in the
app creates the invoice in Xero from the accepted-quote data, emails it to the
customer, and records the Xero invoice number back on the job. No re-typing in Xero.

## Scope (first cut)
- **In scope:** one-off / landscaping **quoted** jobs (`invoice_method = "quoted"`).
  These are the pipeline jobs with an accepted quote — like Emma.
- **Out of scope for now:** maintenance / `charge_up` per-visit invoicing (separate
  existing flow) and subscription jobs. We do quoted jobs first, prove it on Emma,
  then decide if the same button should cover per-visit.

## How it works (mirrors the recurring-calendar button)
1. On the completed job, a **"Create & send invoice"** button.
2. Click → the app builds the invoice payload from the accepted quote and POSTs it to
   a new `INVOICE_WEBHOOK_URL` (Make webhook).
3. Make: **Webhook → Xero "Create Invoice" (Authorised) → Xero "Email Invoice" →
   Supabase "Update a row"** (writes `xero_invoice_number` + `xero_invoice_id` back,
   sets `quoted_invoice_status = "converted"`).
4. The app shows the job as **Invoiced**, with the Xero number.

Human-triggered (the tap is the check). Guarded against double-send: if the job
already has a `xero_invoice_id`/`xero_invoice_number`, the button is disabled and the
action refuses — same stamp trick as the calendar button.

## The payload (grounded in Emma's real data)
The quote's `line_items` are already Xero-shaped, so we pass them through:

```json
{
  "job_id": "8dfbd6a0-...",
  "customer_name": "Emma Quantrill",
  "customer_email": "quantrillemma@hotmail.com",
  "reference": "99-MEADOWBANK-ROAD-MEADO — garden work",
  "line_amount_types": "Inclusive",
  "currency": "NZD",
  "line_items": [
    { "description": "Labour", "quantity": 8.5, "unit_amount": 77.5, "account_code": "10010", "tax_type": "OUTPUT2" },
    { "description": "Greenwaste", "quantity": 3, "unit_amount": 26.5, "account_code": "10114", "tax_type": "OUTPUT2" },
    { "description": "1 x Replacement Pseudopanax (or equivalent ~1m shrub) $59 (inc. delivery)", "quantity": 1, "unit_amount": 59, "account_code": "10115", "tax_type": "OUTPUT2" }
  ],
  "total_incl_gst": 797.25
}
```

- Amounts are **GST-inclusive** (the $77.50, $26.50, $59 the customer saw). Xero gets
  `LineAmountTypes = Inclusive` and back-calculates the GST — total comes to $797.25,
  matching the quote exactly. Pricing stays traceable: the invoice = the quote.
- **Due date:** not sent — Xero applies Pristine's standard payment terms set on the
  contact/account. (If you'd rather force a specific term, e.g. "due in 7 days" or
  "20th of next month", say so and I'll add it to the payload.)

## App changes (I build)
- `lib/invoice-payload.ts` — pure `buildInvoicePayload(job, quote, property)`.
- `app/(app)/admin/actions/invoice-actions.ts` — `createAndSendInvoice(jobId)` server
  action (mirrors `maintenance-calendar-actions.ts`): read job + linked quote
  (`quote_drafts.first_scheduled_job_id = jobId`) + property, guard, POST, write back.
- Button on **`/admin/quoted-jobs`** (replaces the manual "Ready to convert / Mark
  Converted" tick-boxes with the real action). Also add it on the completed-job view.
- `INVOICE_WEBHOOK_URL` env var (Vercel + `.env.local`; blanked in `.env.staging` so
  staging can never invoice a real customer).
- **No migration needed** — `scheduled_jobs` already has `xero_invoice_id`,
  `xero_invoice_number`, `quoted_invoice_status`.

## Make scenario (you build — I give click-by-click steps, ~15 min)
Same shape as the calendar scenario you already built.

## Acceptance tests
1. On staging (webhook blanked), clicking the button returns a clear "not configured"
   message and sends nothing — no invoice, no email.
2. With the webhook live, Emma's button creates a Xero invoice whose **total is
   $797.25** and whose lines match the quote (labour / greenwaste / plant).
3. Xero emails Emma; the app then shows her job as **Invoiced** with the Xero number.
4. Clicking again is refused (no duplicate invoice).
5. A job with no accepted quote / no line items gives a clear error, not a broken
   invoice.

## Risks
- **Sends a real invoice to a real customer.** Emma is the first live test — we do it
  together and check Xero before/after. The button, the guard, and staging-blanking
  are the safety layers.
- Account codes (10010 / 10114 / 10115) are copied straight from the quote — if any
  are wrong in the quote they'd be wrong on the invoice, but that's already true today.
