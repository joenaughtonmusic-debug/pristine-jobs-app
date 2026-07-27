// Orchestration for the PM issue report: load a visit's issues -> render the
// PDF -> store it in the private pm-reports bucket -> hand Make a short-lived
// signed URL to attach -> record the send in pm_reports.
//
// Split so the deterministic engine (prepare + generate/store) is testable
// without the Make hop: sendPmReport = prepare -> generateAndStore -> POST -> record.
import type { SupabaseClient } from "@supabase/supabase-js"
import { renderPmReportPdf, type PmReportData } from "@/lib/pm-report"

const REPORT_BUCKET = "pm-reports"
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 4 // 4 hours — Make fetches within seconds; only needs to survive retries

export type PmReportOptions = {
  businessName?: string
  contactLine?: string | null
  webhookUrl?: string | null
}

export type PmReportPrepared = {
  visitId: string
  propertyId: string | null
  propertyManagerId: string | null
  recipientEmail: string // guaranteed by preparePmReport's email guard
  propertyAddress: string
  visitDate: string // formatted
  pmName: string | null
  data: PmReportData
  issueCount: number
  issueIds: string[] // the OPEN issues in the report; stamped after a send
}

export type PmReportResult =
  | { status: "skipped"; reason: string }
  | {
      status: "sent"
      reportId: string
      recipientEmail: string
      issueCount: number
      warning?: string // e.g. the send worked but the reported_to_pm_at stamp failed
    }
  | { status: "failed"; error: string; reportId?: string }

function formatVisitDate(value: string | null | undefined): string {
  if (!value) return "Recent visit"
  // Deterministic NZ-style date without locale surprises: "17 July 2026".
  const [y, m, d] = value.slice(0, 10).split("-").map(Number)
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"]
  if (!y || !m || !d) return value
  return `${d} ${months[m - 1]} ${y}`
}

// Loads everything the report needs. Returns a skip result when there is nothing
// to send (no PM email, or no issues) — the owner's rule: no issues -> no email.
export async function preparePmReport(
  supabase: SupabaseClient,
  visitId: string,
  opts: PmReportOptions = {}
): Promise<{ prepared: PmReportPrepared } | { skip: string }> {
  const { data: visit, error: visitError } = await supabase
    .from("visits")
    .select("id, property_id, visit_date")
    .eq("id", visitId)
    .maybeSingle()

  if (visitError) return { skip: `visit load failed: ${visitError.message}` }
  if (!visit) return { skip: "visit not found" }
  if (!visit.property_id) return { skip: "visit has no property" }

  const { data: property } = await supabase
    .from("properties")
    .select("id, address_line_1, suburb, property_manager_id")
    .eq("id", visit.property_id)
    .maybeSingle()

  if (!property) return { skip: "property not found" }
  if (!property.property_manager_id) return { skip: "property has no property manager" }

  const { data: pm } = await supabase
    .from("property_managers")
    .select("id, name, email")
    .eq("id", property.property_manager_id)
    .maybeSingle()

  if (!pm?.email?.trim()) return { skip: "property manager has no email" }

  // OPEN issues only (piece 3): resolved/dismissed/not-our-job issues never
  // reach a PM — the dialog's status control is the exclusion mechanism.
  const { data: issues } = await supabase
    .from("job_photos")
    .select("id, public_url, caption, severity")
    .eq("visit_id", visitId)
    .eq("photo_type", "issue")
    .eq("issue_status", "open")
    .not("severity", "is", null)

  const issueRows = (issues || []).filter((r) => r.public_url)
  if (issueRows.length === 0) return { skip: "no issues to report" }

  const propertyAddress = [property.address_line_1, property.suburb]
    .filter(Boolean)
    .join(", ") || "Property"
  const visitDate = formatVisitDate(visit.visit_date)

  const data: PmReportData = {
    businessName: opts.businessName || "Pristine Gardens",
    propertyAddress,
    visitDate,
    pmName: pm.name || null,
    contactLine: opts.contactLine ?? null,
    issues: issueRows.map((r) => ({
      photoUrl: r.public_url as string,
      note: r.caption,
      severity: r.severity,
    })),
  }

  return {
    prepared: {
      visitId,
      propertyId: property.id,
      propertyManagerId: pm.id,
      recipientEmail: pm.email.trim(),
      propertyAddress,
      visitDate,
      pmName: pm.name || null,
      data,
      issueCount: issueRows.length,
      issueIds: issueRows.map((r) => r.id as string),
    },
  }
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)
}

// Renders + stores the PDF and returns its path + a signed URL. No Make hop.
export async function generateAndStorePmReport(
  supabase: SupabaseClient,
  prepared: PmReportPrepared
): Promise<{ pdfPath: string; signedUrl: string; filename: string }> {
  const pdf = await renderPmReportPdf(prepared.data)
  const stamp = prepared.visitId.slice(0, 8)
  const pdfPath = `${prepared.propertyId}/${prepared.visitId}.pdf`
  const filename = `visit-report-${slug(prepared.propertyAddress)}-${stamp}.pdf`

  const { error: uploadError } = await supabase.storage
    .from(REPORT_BUCKET)
    .upload(pdfPath, pdf, { contentType: "application/pdf", upsert: true })
  if (uploadError) throw new Error(`report upload failed: ${uploadError.message}`)

  const { data: signed, error: signError } = await supabase.storage
    .from(REPORT_BUCKET)
    .createSignedUrl(pdfPath, SIGNED_URL_TTL_SECONDS)
  if (signError || !signed?.signedUrl) {
    throw new Error(`signed URL failed: ${signError?.message || "no url"}`)
  }

  return { pdfPath, signedUrl: signed.signedUrl, filename }
}

// Full send: prepare -> generate/store -> POST to Make -> record. Records a
// 'failed' row (surfaced, never silent) if the webhook fails.
export async function sendPmReport(
  supabase: SupabaseClient,
  visitId: string,
  opts: PmReportOptions & { sentBy?: string } = {}
): Promise<PmReportResult> {
  const prep = await preparePmReport(supabase, visitId, opts)
  if ("skip" in prep) return { status: "skipped", reason: prep.skip }
  const { prepared } = prep

  const webhookUrl = opts.webhookUrl
  if (!webhookUrl) return { status: "failed", error: "PM report webhook URL not configured" }

  // ONE VISIT = ONE REF, permanently (Joe's rule): a re-send reuses the
  // visit's original ref; only a first send mints. Minting failure blocks the
  // send — a report must never leave without a citable reference.
  let reportRef: string
  const { data: priorRef } = await supabase
    .from("pm_reports")
    .select("report_ref")
    .eq("visit_id", prepared.visitId)
    .not("report_ref", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (priorRef?.report_ref) {
    reportRef = priorRef.report_ref as string
  } else {
    const { data: minted, error: mintError } = await supabase.rpc("next_pm_report_ref")
    if (mintError || !minted) {
      return { status: "failed", error: `report ref mint failed: ${mintError?.message || "no value"}` }
    }
    reportRef = minted as string
  }
  prepared.data.reportRef = reportRef

  const { pdfPath, signedUrl, filename } = await generateAndStorePmReport(supabase, prepared)

  const subject = `Property visit report ${reportRef} — ${prepared.propertyAddress} — ${prepared.visitDate}`
  const body = [
    prepared.pmName ? `Hi ${prepared.pmName},` : "Hi,",
    "",
    `Please find attached our visit report for ${prepared.propertyAddress} (${prepared.visitDate}).`,
    "It lists the items we noticed at the property, each with a photo.",
    "",
    "Kind regards,",
    prepared.data.businessName,
  ].join("\n")

  let sendError: string | null = null
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to_email: prepared.recipientEmail,
        subject,
        body,
        report_ref: reportRef,
        pdf_url: signedUrl,
        pdf_filename: filename,
        property_address: prepared.propertyAddress,
        visit_date: prepared.visitDate,
        pm_name: prepared.pmName,
      }),
    })
    if (!res.ok) sendError = (await res.text()) || `webhook ${res.status}`
  } catch (e) {
    sendError = e instanceof Error ? e.message : "webhook request failed"
  }

  // Stamp reported_to_pm_at on the issues that went out (piece 3). A stamp
  // failure must not masquerade as a send failure — the email already left —
  // but it must be surfaced, never swallowed.
  let stampError: string | null = null
  if (!sendError && prepared.issueIds.length > 0) {
    const { error: stampUpdateError } = await supabase
      .from("job_photos")
      .update({ reported_to_pm_at: new Date().toISOString() })
      .in("id", prepared.issueIds)
    if (stampUpdateError) {
      stampError = `sent, but stamping reported_to_pm_at failed: ${stampUpdateError.message}`
    }
  }

  const { data: record } = await supabase
    .from("pm_reports")
    .insert({
      visit_id: prepared.visitId,
      property_id: prepared.propertyId,
      property_manager_id: prepared.propertyManagerId,
      recipient_email: prepared.recipientEmail,
      report_ref: reportRef,
      pdf_path: pdfPath,
      issue_count: prepared.issueCount,
      status: sendError ? "failed" : "sent",
      error: sendError || stampError,
      sent_at: sendError ? null : new Date().toISOString(),
      sent_by: opts.sentBy || null,
    })
    .select("id")
    .single()

  if (sendError) {
    return { status: "failed", error: sendError, reportId: record?.id }
  }
  return {
    status: "sent",
    reportId: record?.id as string,
    recipientEmail: prepared.recipientEmail,
    issueCount: prepared.issueCount,
    ...(stampError ? { warning: stampError } : {}),
  }
}
