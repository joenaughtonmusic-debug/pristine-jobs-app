import { createClient } from "@/lib/supabase/server"
import { AdminQuoteBuilderClient } from "@/components/admin-quote-builder-client"

export const dynamic = "force-dynamic"

type Props = {
  searchParams?: Promise<{
    estimate?: string | string[]
  }>
}

export default async function AdminQuotesPage({ searchParams }: Props) {
  const supabase = await createClient()
  const resolvedSearchParams = await searchParams
  const estimateParam = resolvedSearchParams?.estimate
  const selectedEstimateId = Array.isArray(estimateParam)
    ? estimateParam[0] || null
    : estimateParam || null

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
      public_accept_url,
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

  return (
    <AdminQuoteBuilderClient
      properties={properties || []}
      scheduledJobs={scheduledJobs || []}
      estimates={estimates || []}
      selectedEstimateId={selectedEstimateId}
      queryErrors={[
        propertiesError?.message,
        scheduledJobsError?.message,
        estimatesError?.message,
        templatesError?.message,
        staffError?.message,
        quoteDraftsError?.message,
      ].flatMap((message) => (message ? [message] : []))}
      templates={templates || []}
      staff={staff || []}
      quoteDrafts={quoteDrafts || []}
    />
  )
}
