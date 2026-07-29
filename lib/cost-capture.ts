export type CostCaptureStatus =
  | "complete"
  | "missing_labour"
  | "labour_mismatch"
  | "missing_material_review"
  | "ready_for_invoice_with_warnings"

export type StaffCostRate = {
  staff_name: string
  hourly_cost: number | string | null
  active?: boolean | null
}

// Labour COST is sourced from the staff_cost_rates table — the single source of
// truth, the same one property_profitability joins. Do NOT reintroduce hardcoded
// per-name rates: they drifted (Fletcher was hardcoded $43 vs the table's $38,
// James defaulted to $39 vs the table's $44) and gave cost-capture different
// margins from the profitability view.
//
// Matching mirrors the view (scr.staff_name = jle.staff_name): an unmatched
// staff name resolves to 0, exactly as the view's LEFT JOIN contributes nothing
// for a missing rate — so the two surfaces always agree. A staff member missing
// from staff_cost_rates is a table-maintenance signal, not a cost-capture bug.
export function buildLabourRateLookup(rows: StaffCostRate[]) {
  const map = new Map<string, number>()

  for (const row of rows) {
    if (row.active === false) continue
    const name = String(row.staff_name || "").trim()
    if (name) map.set(name, Number(row.hourly_cost || 0))
  }

  return (staffName?: string | null) =>
    map.get(String(staffName || "").trim()) ?? 0
}

type CostCaptureInput = {
  readyForInvoice?: boolean | null
  visitHours: number
  labourCount: number
  labourHours: number
  materialReviewRequired?: boolean
  materialReviewed: boolean
  hasWorkNotes: boolean
  invoiceStatus?: string | null
  hasXeroInvoice?: boolean
}

export function getCostCaptureFlags({
  readyForInvoice,
  visitHours,
  labourCount,
  labourHours,
  materialReviewRequired,
  materialReviewed,
  hasWorkNotes,
  invoiceStatus,
  hasXeroInvoice,
}: CostCaptureInput) {
  const missingTotalHours = visitHours <= 0
  const missingLabour = labourCount === 0
  const labourMismatch =
    labourCount > 0 && Math.abs(labourHours - visitHours) > 0.01
  const missingMaterialReview = Boolean(materialReviewRequired && !materialReviewed)
  const missingWorkNotes = !hasWorkNotes
  const readyForInvoiceWithWarnings = Boolean(
    readyForInvoice &&
      (missingTotalHours ||
        missingLabour ||
        labourMismatch ||
        missingMaterialReview ||
        missingWorkNotes)
  )
  const invoiceSentWithBackCostWarning = Boolean(
    (invoiceStatus === "sent" ||
      invoiceStatus === "paid" ||
      invoiceStatus === "invoiced" ||
      hasXeroInvoice) &&
      (missingLabour || labourMismatch || missingMaterialReview || missingWorkNotes)
  )

  return {
    missingTotalHours,
    missingLabour,
    labourMismatch,
    missingMaterialReview,
    missingWorkNotes,
    readyForInvoiceWithWarnings,
    invoiceSentWithBackCostWarning,
  }
}

export function getCostCaptureStatus(
  input: CostCaptureInput
): CostCaptureStatus {
  const flags = getCostCaptureFlags(input)

  if (flags.readyForInvoiceWithWarnings) {
    return "ready_for_invoice_with_warnings"
  }

  if (flags.missingLabour) return "missing_labour"
  if (flags.labourMismatch) return "labour_mismatch"
  if (flags.missingMaterialReview) return "missing_material_review"
  return "complete"
}

export function getCostCaptureIssueLabels(input: CostCaptureInput) {
  const flags = getCostCaptureFlags(input)

  return [
    flags.missingTotalHours ? "Missing total visit hours" : null,
    flags.missingLabour ? "Missing visit labour entries" : null,
    flags.labourMismatch ? "Labour entries do not match total hours" : null,
    flags.missingWorkNotes ? "Missing work notes" : null,
    // Non-blocking by decision 29 Jul: a freeform materials note flags the
    // visit for a billing check but never holds it out of the invoice queue.
    flags.missingMaterialReview ? "Materials note — check billing" : null,
    flags.readyForInvoiceWithWarnings
      ? "Ready for invoice but incomplete"
      : null,
    flags.invoiceSentWithBackCostWarning
      ? "Invoice sent but missing back-cost data"
      : null,
  ].filter(Boolean) as string[]
}
