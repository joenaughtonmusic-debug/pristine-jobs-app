import { createClient } from "@/lib/supabase/server"
import { AdminQuoteBuilderClient } from "@/components/admin-quote-builder-client"
import {
  ensureWorkflowAdminActions,
  getActionDueDate,
} from "@/lib/admin-actions"

export const dynamic = "force-dynamic"

type Props = {
  searchParams?: Promise<{
    estimate?: string | string[]
    lead?: string | string[]
    quote_type?: string | string[]
    template?: string | string[]
  }>
}

function firstParam(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) || null
}

const QUOTE_TYPES = ["maintenance", "one_off", "landscaping"] as const
type QuoteType = (typeof QUOTE_TYPES)[number]

export default async function AdminQuotesPage({ searchParams }: Props) {
  const supabase = await createClient()
  const resolvedSearchParams = await searchParams
  const selectedEstimateId = firstParam(resolvedSearchParams?.estimate)

  // Phase 2: the pipeline board's Create-quote modal opens this page with
  // ?lead=<id> (+ suggested quote_type/template). The builder prefills from
  // the lead and links the saved draft back via linkQuoteDraftAction.
  const selectedLeadId = firstParam(resolvedSearchParams?.lead)
  const quoteTypeParam = firstParam(resolvedSearchParams?.quote_type)
  const initialQuoteType = QUOTE_TYPES.includes(quoteTypeParam as QuoteType)
    ? (quoteTypeParam as QuoteType)
    : null
  const initialTemplateId = firstParam(resolvedSearchParams?.template)

  let selectedLead = null
  let leadError: string | null = null

  if (selectedLeadId) {
    const { data, error } = await supabase
      .from("sales_leads")
      .select(
        "id, name, email, phone, address, suburb, service_needed, message, property_id, quote_draft_id"
      )
      .eq("id", selectedLeadId)
      .maybeSingle()

    selectedLead = data
    if (error || !data) {
      leadError = error?.message || "Pipeline lead not found."
    }
  }

  const { data: properties, error: propertiesError } = await supabase
    .from("properties")
    .select(`
      id,
      property_code,
      client_name,
      client_email,
      address_line_1,
      suburb
    `)
    .eq("is_active", true)
    .order("client_name", { ascending: true })

  const { data: scheduledJobs, error: scheduledJobsError } = await supabase
    .from("scheduled_jobs")
    .select(`
      id,
      property_id,
      scheduled_date,
      job_type,
      quoted_scope,
      properties (
        client_name,
        address_line_1,
        suburb
      )
    `)
    .order("scheduled_date", { ascending: false })
    .limit(300)

  const { data: estimates, error: estimatesError } = await supabase
    .from("estimates")
    .select(`
      id,
      customer_name,
      customer_email,
      customer_phone,
      address_line_1,
      suburb,
      enquiry_details,
      estimate_status,
      estimate_date,
      estimate_notes,
      converted_property_id
    `)
    .order("created_at", { ascending: false })
    .limit(300)

  const { data: templates, error: templatesError } = await supabase
    .from("quote_templates")
    .select(`
      id,
      name,
      category,
      customer_scope,
      internal_notes,
      terms_conditions,
      default_line_items,
      frequency,
      labour_hours,
      labour_rate,
      greenwaste_bags,
      greenwaste_rate,
      sprays_size,
      sprays_price,
      fertiliser_size,
      fertiliser_price,
      stump_paste_size,
      stump_paste_price
    `)
    .eq("is_active", true)
    .order("name", { ascending: true })

  const { data: staff, error: staffError } = await supabase
    .from("staff_members")
    .select("id, name")
    .eq("is_active", true)
    .order("name", { ascending: true })

  const { data: quoteDrafts, error: quoteDraftsError } = await supabase
    .from("quote_drafts")
    .select(`
      id,
      property_id,
      estimate_id,
      customer_name,
      customer_email,
      quote_title,
      quote_type,
      status,
      total,
      monthly_equivalent,
      frequency,
      labour_hours,
      customer_scope,
      first_scheduled_job_id,
      created_at,
      xero_quote_number,
      xero_quote_status,
      xero_quote_error,
      public_accept_token,
      subtotal,
      gst,
      hero_image_url,
      photos,
      line_items,
      quote_sent_at,
      proposal_sent_note,
      proposal_status,
      proposal_ready_to_send_at,
      proposal_sent_at,
      proposal_send_error,
      proposal_email_subject,
      proposal_email_body,
      quote_accepted_at,
      quote_declined_at,
      accepted_customer_name,
      accepted_customer_email,
      acceptance_notes,
      followup_3day_sent_at,
      followup_7day_sent_at,
      followup_14day_sent_at,
      recurring_invoice_required,
      recurring_invoice_setup_status,
      recurring_invoice_setup_note,
      recurring_invoice_setup_completed_at
    `)
    .order("created_at", { ascending: false })
    .limit(100)

  if (!quoteDraftsError && quoteDrafts) {
    await ensureWorkflowAdminActions(
      supabase,
      quoteDrafts
        .filter((draft) => {
          const accepted = Boolean(draft.quote_accepted_at)
          const needsFirstJob = !draft.first_scheduled_job_id
          const needsRecurringInvoice =
            draft.recurring_invoice_required === true &&
            draft.recurring_invoice_setup_status !== "completed"

          return accepted && (needsFirstJob || needsRecurringInvoice)
        })
        .map((draft) => {
          const needsFirstJob = !draft.first_scheduled_job_id
          const needsRecurringInvoice =
            draft.recurring_invoice_required === true &&
            draft.recurring_invoice_setup_status !== "completed"

          return {
            title: `Accepted quote setup: ${
              draft.customer_name || draft.quote_title || "Quote"
            }`,
            actionType: "accepted_quote_setup",
            priority: "high",
            owner: "VA",
            dueDate: getActionDueDate(1),
            propertyId: draft.property_id || null,
            scheduledJobId: draft.first_scheduled_job_id || null,
            sourceRecordType: "quote_draft",
            sourceRecordId: draft.id,
            sourceUrl: "/admin/quotes",
            notes: [
              draft.quote_title ? `Quote: ${draft.quote_title}` : null,
              draft.customer_name ? `Customer: ${draft.customer_name}` : null,
              draft.customer_email ? `Email: ${draft.customer_email}` : null,
              draft.quote_accepted_at
                ? `Accepted: ${new Date(draft.quote_accepted_at).toLocaleDateString("en-NZ")}`
                : null,
              needsFirstJob ? "Create or confirm first scheduled job." : null,
              needsRecurringInvoice
                ? "Set up recurring invoice in Xero/app workflow."
                : null,
            ]
              .filter(Boolean)
              .join("\n"),
          }
        })
    )
  }

  return (
    <AdminQuoteBuilderClient
      properties={properties || []}
      scheduledJobs={scheduledJobs || []}
      estimates={estimates || []}
      selectedEstimateId={selectedEstimateId}
      selectedLead={selectedLead}
      initialQuoteType={initialQuoteType}
      initialTemplateId={initialTemplateId}
      queryErrors={[
        propertiesError?.message,
        scheduledJobsError?.message,
        estimatesError?.message,
        templatesError?.message,
        staffError?.message,
        quoteDraftsError?.message,
        leadError,
      ].flatMap((message) => (message ? [message] : []))}
      templates={templates || []}
      staff={staff || []}
      quoteDrafts={quoteDrafts || []}
    />
  )
}
