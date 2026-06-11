export type CostCaptureStatus =
  | "complete"
  | "missing_labour"
  | "labour_mismatch"
  | "missing_material_review"
  | "ready_for_invoice_with_warnings"

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
    flags.missingMaterialReview ? "Missing material review" : null,
    flags.readyForInvoiceWithWarnings
      ? "Ready for invoice but incomplete"
      : null,
    flags.invoiceSentWithBackCostWarning
      ? "Invoice sent but missing back-cost data"
      : null,
  ].filter(Boolean) as string[]
}
