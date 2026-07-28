import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { PipelineBoard } from "@/components/pipeline-board"
import {
  LeadIntakeTray,
  type IntakeCard,
  type DismissedCard,
} from "@/components/lead-intake-tray"
import type { InvoicedJob } from "@/components/invoiced-jobs-section"
import type { QuoteTemplateOption, SalesLead } from "@/lib/sales-leads"
import { BLANK_EXTRACTION, type LeadExtraction } from "@/lib/lead-extraction"
import { computeIntakeFlags, hasBlockingFlag } from "@/lib/lead-intake-flags"
import { findDuplicateMatch, jobTypeFromHint, composeLeadMessage } from "@/lib/lead-intake"

export const dynamic = "force-dynamic"

function formatIntakeDate(value: string): string {
  const d = new Date(value)
  return Number.isNaN(d.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-NZ", {
        timeZone: "Pacific/Auckland",
        day: "numeric",
        month: "short",
      }).format(d)
}

export default async function SalesPipelinePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/")
  }

  const { data: leads, error } = await supabase
    .from("sales_leads")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[sales-pipeline] failed to load leads", error)

    // Fail honestly: a leads-query error (e.g. code deployed before its
    // migration) must show AS an error, never as an empty board.
    return (
      <div className="mx-auto max-w-xl p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">The pipeline couldn&apos;t load leads.</p>
          <p className="mt-1">
            Nothing is lost — this is a loading error, not an empty pipeline.
            Error: {error.message}
          </p>
        </div>
      </div>
    )
  }

  // Slice 5: invoiced jobs (Make writes xero_invoice_number back onto
  // scheduled_jobs). Archived rows have been cleared off the page.
  const { data: invoicedJobs, error: invoicedError } = await supabase
    .from("scheduled_jobs")
    .select(
      "id, xero_invoice_number, quoted_amount, invoice_paid_in_app_at, properties(client_name, suburb)"
    )
    .not("xero_invoice_number", "is", null)
    .is("invoice_archived_at", null)
    .order("scheduled_date", { ascending: false })

  if (invoicedError) {
    console.error("[sales-pipeline] failed to load invoiced jobs", invoicedError)
  }

  // Phase 2: the Create-quote modal offers the active quote templates
  // (suggestion only — the quote itself is built in /admin/quotes).
  const { data: templates, error: templatesError } = await supabase
    .from("quote_templates")
    .select("id, name, category, frequency")
    .eq("is_active", true)
    .order("name", { ascending: true })

  if (templatesError) {
    console.error("[sales-pipeline] failed to load quote templates", templatesError)
  }

  // Lead-intake tray: pending cards (with computed flags) + dismissed (30-day).
  const { data: pendingIntakes } = await supabase
    .from("lead_intake")
    .select("id, source, created_at, extraction, extraction_error, raw_source")
    .eq("status", "pending_approval")
    .order("created_at", { ascending: false })

  const { data: dismissedIntakes } = await supabase
    .from("lead_intake")
    .select("id, source, created_at, extraction")
    .eq("status", "dismissed")
    .gte("dismissed_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order("dismissed_at", { ascending: false })

  const intakeCards: IntakeCard[] = []
  for (const row of pendingIntakes || []) {
    const x = (row.extraction as LeadExtraction | null) || BLANK_EXTRACTION
    const duplicate = await findDuplicateMatch(supabase, x)
    const flags = computeIntakeFlags(x, duplicate)
    intakeCards.push({
      id: row.id as string,
      source: (row.source as string | null) ?? null,
      createdAt: formatIntakeDate(row.created_at as string),
      extractionError: (row.extraction_error as string | null) ?? null,
      flags,
      blocking: hasBlockingFlag(flags),
      name: x.contact_name ?? "",
      phone: x.contact_phone ?? "",
      email: x.contact_email ?? "",
      address: x.site_address ?? "",
      suburb: "",
      service_needed: x.service_summary ?? "",
      job_type: jobTypeFromHint(x.job_type_hint),
      message: composeLeadMessage(x, (row.raw_source as string) || ""),
      rawSource: (row.raw_source as string) || "",
    })
  }

  const dismissedCards: DismissedCard[] = (dismissedIntakes || []).map((row) => {
    const x = (row.extraction as LeadExtraction | null) || BLANK_EXTRACTION
    return {
      id: row.id as string,
      source: (row.source as string | null) ?? null,
      name: x.contact_name ?? "",
      createdAt: formatIntakeDate(row.created_at as string),
    }
  })

  return (
    <PipelineBoard
      leads={(leads || []) as SalesLead[]}
      invoicedJobs={(invoicedJobs || []) as unknown as InvoicedJob[]}
      templates={(templates || []) as QuoteTemplateOption[]}
      intakeTray={<LeadIntakeTray cards={intakeCards} dismissed={dismissedCards} />}
    />
  )
}
