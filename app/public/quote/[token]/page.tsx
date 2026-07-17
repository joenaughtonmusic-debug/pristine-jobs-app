import { redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  recordOnlineQuoteAcceptance,
  recordOnlineQuoteDecline,
} from "@/lib/sales-lead-transitions"

// Phase 2: stamp the outcome on the pipeline lead linked to this draft
// (sales_leads.quote_draft_id, migration 043). Stamp only — the board card
// is advanced manually (Phase 1 spec §7). Best-effort: a lead-side failure
// must never break the customer's accept/decline page, and pre-043 the
// lookup just finds nothing.
async function stampLinkedLead(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  quoteId: string,
  outcome: "accepted" | "declined",
  acceptedName?: string
) {
  try {
    const { data: lead } = await supabase
      .from("sales_leads")
      .select("id")
      .eq("quote_draft_id", quoteId)
      .maybeSingle()

    if (!lead) return

    const result =
      outcome === "accepted"
        ? await recordOnlineQuoteAcceptance(supabase, lead.id, acceptedName)
        : await recordOnlineQuoteDecline(supabase, lead.id)

    if ("error" in result) {
      console.error("[public-quote] failed to stamp linked lead", {
        quoteId,
        outcome,
        message: result.error,
      })
    }
  } catch (error) {
    console.error("[public-quote] failed to stamp linked lead", {
      quoteId,
      outcome,
      error,
    })
  }
}

export const dynamic = "force-dynamic"

type LineItem = {
  description?: string
  quantity?: number | string
  unit_price?: number | string
  line_total?: number | string
}

type QuoteDraft = {
  id: string
  customer_name: string
  customer_email: string | null
  quote_title: string
  quote_type: string | null
  customer_scope: string | null
  terms_conditions: string | null
  line_items: unknown
  subtotal: number | string | null
  gst: number | string | null
  total: number | string | null
  monthly_equivalent: number | string | null
  frequency: string | null
  created_at: string | null
  proposal_sent_at: string | null
  status: string
  public_accept_token: string | null
  quote_accepted_at: string | null
  quote_declined_at: string | null
  properties?:
    | {
        address_line_1: string | null
        suburb: string | null
      }
    | {
        address_line_1: string | null
        suburb: string | null
      }[]
    | null
}

type Props = {
  params: Promise<{ token: string }>
  searchParams?: Promise<{ accepted?: string; declined?: string }>
}

function money(value: number | string | null | undefined) {
  return Number(value || 0).toLocaleString("en-NZ", {
    style: "currency",
    currency: "NZD",
  })
}

function formatDate(value: string | null | undefined) {
  if (!value) return "No date"

  return new Date(value).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function formatFrequency(value: string | null | undefined) {
  if (value === "monthly") return "Monthly"
  if (value === "6_weekly") return "6 Weekly"
  if (value === "2_monthly") return "2 Monthly"
  if (value === "3_monthly") return "3 Monthly"
  if (value === "4_monthly") return "4 Monthly"
  if (value === "6_monthly") return "6 Monthly"

  return value ? value.replaceAll("_", " ") : "To be confirmed"
}

function formatQuoteType(value: string | null | undefined) {
  if (value === "maintenance") return "Maintenance"
  if (value === "landscaping") return "Landscaping"
  return "One-off"
}

function firstOrValue<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function parseLineItems(value: unknown): LineItem[] {
  return Array.isArray(value) ? (value as LineItem[]) : []
}

async function acceptQuote(formData: FormData) {
  "use server"

  const quoteId = String(formData.get("quote_id") || "")
  const token = String(formData.get("token") || "")
  const acceptedCustomerName = String(formData.get("accepted_customer_name") || "")
  const acceptedCustomerEmail = String(formData.get("accepted_customer_email") || "")
  const acceptanceNotes = String(formData.get("acceptance_notes") || "")
  const supabase = await createAdminClient()
  const acceptedAt = new Date().toISOString()
  const { data: quote } = await supabase
    .from("quote_drafts")
    .select("frequency")
    .eq("id", quoteId)
    .eq("public_accept_token", token)
    .maybeSingle()

  const { error } = await supabase
    .from("quote_drafts")
    .update({
      status: "accepted",
      xero_quote_status: "ACCEPTED_APP",
      quote_accepted_at: acceptedAt,
      accepted_customer_name: acceptedCustomerName.trim() || null,
      accepted_customer_email: acceptedCustomerEmail.trim() || null,
      acceptance_notes: acceptanceNotes.trim() || null,
      ...(quote?.frequency
        ? {
            recurring_invoice_required: true,
            recurring_invoice_setup_status: "required",
          }
        : {}),
      updated_at: acceptedAt,
    })
    .eq("id", quoteId)
    .eq("public_accept_token", token)

  if (error) {
    redirect(`/public/quote/${token}?error=accept`)
  }

  await stampLinkedLead(supabase, quoteId, "accepted", acceptedCustomerName)

  redirect(`/public/quote/${token}?accepted=1`)
}

async function declineQuote(formData: FormData) {
  "use server"

  const quoteId = String(formData.get("quote_id") || "")
  const token = String(formData.get("token") || "")
  const acceptanceNotes = String(formData.get("acceptance_notes") || "")
  const supabase = await createAdminClient()
  const declinedAt = new Date().toISOString()

  const { error } = await supabase
    .from("quote_drafts")
    .update({
      status: "declined",
      xero_quote_status: "DECLINED_APP",
      quote_declined_at: declinedAt,
      acceptance_notes: acceptanceNotes.trim() || null,
      updated_at: declinedAt,
    })
    .eq("id", quoteId)
    .eq("public_accept_token", token)

  if (error) {
    redirect(`/public/quote/${token}?error=decline`)
  }

  await stampLinkedLead(supabase, quoteId, "declined")

  redirect(`/public/quote/${token}?declined=1`)
}

export default async function PublicQuotePage({ params, searchParams }: Props) {
  const { token } = await params
  const query = await searchParams
  const supabase = await createAdminClient()
  const { data: quote, error } = await supabase
    .from("quote_drafts")
    .select(`
      id,
      customer_name,
      customer_email,
      quote_title,
      quote_type,
      customer_scope,
      terms_conditions,
      line_items,
      subtotal,
      gst,
      total,
      monthly_equivalent,
      frequency,
      created_at,
      proposal_sent_at,
      status,
      public_accept_token,
      quote_accepted_at,
      quote_declined_at,
      properties (
        address_line_1,
        suburb
      )
    `)
    .eq("public_accept_token", token)
    .maybeSingle()

  if (error || !quote) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold">Quote not found</h1>
        <p className="mt-2 text-gray-600">
          This proposal link is invalid or no longer available.
        </p>
      </main>
    )
  }

  const quoteDraft = quote as QuoteDraft
  const lineItems = parseLineItems(quoteDraft.line_items)
  const isAccepted = quoteDraft.status === "accepted" || Boolean(query?.accepted)
  const isDeclined = quoteDraft.status === "declined" || Boolean(query?.declined)
  const property = firstOrValue(quoteDraft.properties)
  const propertyAddress =
    [property?.address_line_1, property?.suburb].filter(Boolean).join(", ") ||
    "To be confirmed"
  const proposalDate = quoteDraft.proposal_sent_at || quoteDraft.created_at

  return (
    <main className="bg-white text-stone-900 print:bg-white">
      <div className="mx-auto max-w-[900px] px-4 py-6 pb-12 sm:px-6 sm:py-8">
        <header className="text-center">
          <img
            src="/images/Pristine Gardens LOGO.jpeg"
            alt="Pristine Gardens"
            className="mx-auto h-auto w-40 max-w-[70vw] sm:w-52"
          />
        </header>

        <section className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-stone-50 shadow-sm print:shadow-none">
          <img
            src="/images/20240207_121259.jpg"
            alt="Established garden maintained by Pristine Gardens"
            className="h-56 w-full object-cover sm:h-72"
          />
          <div className="bg-[#123d2a] px-5 py-7 text-center text-white sm:px-8">
            <h1 className="text-3xl font-semibold sm:text-4xl">
              Garden Maintenance Proposal
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-green-50 sm:text-base">
              Designed to keep your garden looking its best throughout the year.
            </p>
          </div>
        </section>

        {isAccepted && (
          <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-5 text-green-900">
            <h2 className="font-semibold">Welcome to Pristine Gardens.</h2>
            <p className="mt-1 text-sm">
              Your proposal has been accepted. We will follow up with the next
              steps.
            </p>
          </div>
        )}

        {isDeclined && (
          <div className="mt-6 rounded-xl border border-stone-200 bg-stone-50 p-5 text-stone-700">
            Thanks for the update. We have marked this proposal as declined.
          </div>
        )}

        <section className="mt-6 rounded-xl border border-stone-200 bg-white p-5 shadow-sm print:shadow-none">
          <h2 className="text-lg font-semibold text-[#123d2a]">
            Customer Details
          </h2>
          <div className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs font-medium uppercase text-stone-500">
                Customer
              </div>
              <div className="mt-1 font-medium">{quoteDraft.customer_name}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase text-stone-500">
                Property
              </div>
              <div className="mt-1 font-medium">{propertyAddress}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase text-stone-500">
                Proposal Date
              </div>
              <div className="mt-1 font-medium">{formatDate(proposalDate)}</div>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-xl border border-stone-200 bg-[#f7f4ef] p-5 shadow-sm print:shadow-none">
          <h2 className="text-lg font-semibold text-[#123d2a]">
            Service Summary
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-white p-4">
              <div className="text-xs font-medium uppercase text-stone-500">
                Quote Type
              </div>
              <div className="mt-2 text-xl font-semibold text-[#123d2a]">
                {formatQuoteType(quoteDraft.quote_type)}
              </div>
            </div>
            <div className="rounded-lg bg-white p-4">
              <div className="text-xs font-medium uppercase text-stone-500">
                Frequency
              </div>
              <div className="mt-2 text-xl font-semibold capitalize text-[#123d2a]">
                {formatFrequency(quoteDraft.frequency)}
              </div>
            </div>
            <div className="rounded-lg bg-white p-4">
              <div className="text-xs font-medium uppercase text-stone-500">
                Monthly Equivalent
              </div>
              <div className="mt-2 text-xl font-semibold text-[#123d2a]">
                {money(quoteDraft.monthly_equivalent || quoteDraft.total)}
              </div>
            </div>
            <div className="rounded-lg bg-white p-4">
              <div className="text-xs font-medium uppercase text-stone-500">
                Total Investment
              </div>
              <div className="mt-2 text-xl font-semibold text-[#123d2a]">
                {money(quoteDraft.total)}
              </div>
              <div className="mt-1 text-xs text-stone-500">
                GST included: {money(quoteDraft.gst)}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-xl border border-stone-200 bg-white p-5 shadow-sm print:shadow-none">
          <h2 className="text-lg font-semibold text-[#123d2a]">
            Service Overview
          </h2>
          <p className="mt-3 whitespace-pre-wrap leading-7 text-stone-700">
            {quoteDraft.customer_scope || "Scope to be confirmed."}
          </p>
        </section>

        <section className="mt-6 rounded-xl border border-stone-200 bg-white p-5 shadow-sm print:shadow-none">
          <h2 className="text-lg font-semibold text-[#123d2a]">
            Proposal Details
          </h2>
          <div className="mt-4 space-y-3">
            {lineItems.map((item, index) => (
              <div
                key={`${item.description || "item"}-${index}`}
                className="grid gap-3 border-b border-stone-100 pb-3 last:border-0 last:pb-0 sm:grid-cols-[1fr_auto]"
              >
                <div className="whitespace-pre-wrap leading-7 text-stone-700">
                  {item.description || "Quote item"}
                </div>
                <div className="font-semibold text-[#123d2a] sm:text-right">
                  {money(
                    item.line_total ||
                      Number(item.quantity || 0) * Number(item.unit_price || 0)
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-xl border border-stone-200 bg-white p-5 shadow-sm print:shadow-none">
          <h2 className="text-lg font-semibold text-[#123d2a]">
            Terms and Conditions
          </h2>
          <p className="mt-3 whitespace-pre-wrap leading-7 text-stone-700">
            {quoteDraft.terms_conditions || "Terms to be confirmed."}
          </p>
        </section>

        {!isAccepted && !isDeclined && (
          <section className="mt-6 rounded-xl border border-green-200 bg-green-50 p-5 shadow-sm print:hidden">
            <h2 className="text-lg font-semibold text-[#123d2a]">
              Accept Proposal
            </h2>
            <form className="mt-4 space-y-4">
              <input type="hidden" name="quote_id" value={quoteDraft.id} />
              <input type="hidden" name="token" value={token} />

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-stone-700">
                    Your Name
                  </label>
                  <input
                    name="accepted_customer_name"
                    defaultValue={quoteDraft.customer_name}
                    className="h-11 w-full rounded-md border border-green-200 bg-white px-3"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-stone-700">
                    Email
                  </label>
                  <input
                    name="accepted_customer_email"
                    defaultValue={quoteDraft.customer_email || ""}
                    className="h-11 w-full rounded-md border border-green-200 bg-white px-3"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">
                  Notes
                </label>
                <textarea
                  name="acceptance_notes"
                  className="min-h-[90px] w-full rounded-md border border-green-200 bg-white p-3"
                  placeholder="Optional notes or questions..."
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  formAction={acceptQuote}
                  className="h-12 w-full rounded-md bg-[#1f6b45] px-5 text-base font-semibold text-white shadow-sm hover:bg-[#185638] sm:flex-1"
                >
                  Accept Proposal
                </button>
                <button
                  formAction={declineQuote}
                  className="h-12 w-full rounded-md border border-stone-300 bg-white px-5 font-medium text-stone-700 sm:flex-1"
                >
                  Decline
                </button>
              </div>
            </form>
          </section>
        )}
      </div>
    </main>
  )
}
