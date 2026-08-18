// What the customer-facing document calls itself. Some work — WeDo partnership
// jobs especially — should read as an ESTIMATE rather than a proposal: same
// document, same numbers, one different noun.
//
// Presentation only. Nothing here touches pricing, billing or the Xero path.

export type DocumentLabel = "proposal" | "estimate"

export function normaliseDocumentLabel(value?: string | null): DocumentLabel {
  return value === "estimate" ? "estimate" : "proposal"
}

export function isEstimate(value?: string | null) {
  return normaliseDocumentLabel(value) === "estimate"
}

type Wording = {
  // Sentence-case noun, for running text: "Your estimate has been accepted."
  noun: string
  // Title-case noun, for headings and labels: "Accept Estimate".
  Noun: string
  // Document titles per quote type, e.g. "Garden Maintenance Estimate".
  titles: { maintenance: string; one_off: string; landscaping: string }
}

const WORDING: Record<DocumentLabel, Wording> = {
  proposal: {
    noun: "proposal",
    Noun: "Proposal",
    titles: {
      maintenance: "Garden Maintenance Proposal",
      one_off: "Garden Tidy Proposal",
      landscaping: "Landscaping Proposal",
    },
  },
  estimate: {
    noun: "estimate",
    Noun: "Estimate",
    titles: {
      maintenance: "Garden Maintenance Estimate",
      one_off: "Garden Tidy Estimate",
      landscaping: "Landscaping Estimate",
    },
  },
}

export function documentWording(value?: string | null): Wording {
  return WORDING[normaliseDocumentLabel(value)]
}

// The standing note that appears on every estimate. Held here rather than typed
// into each quote's terms so it cannot be forgotten, and so changing the
// wording changes it everywhere at once.
//
// Joe's words, tidied: the typo fixed, "outside of" -> "outside", and the third
// sentence reopened so the paragraph doesn't run If/If/If.
export const ESTIMATE_TERMS_NOTE =
  "Due to the variable nature of the work, this is an estimate rather than a " +
  "fixed price. If we finish below the estimated hours, the invoice is reduced " +
  "accordingly. Should more hours be needed, we will contact you as soon as " +
  "possible. If this estimate falls outside your budget, we can look at options " +
  "such as reducing the scope of the job."

// Matches the note however it was worded before — enough of the opening phrase
// to catch a copy typed in by hand, including the original with its typo. Same
// strip-then-append idiom the quote builder uses for the greenwaste range
// sentence, so the note can never appear twice.
const ESTIMATE_NOTE_PATTERN =
  /Due to the variable nature of the work[\s\S]*?scope of the job\.?/gi

// The terms a customer should see: their own terms, with the estimate note
// appended exactly once when the document is an estimate. A proposal is
// untouched.
export function termsWithEstimateNote(
  terms: string | null | undefined,
  documentLabel?: string | null
) {
  const base = String(terms || "")
    .replace(ESTIMATE_NOTE_PATTERN, "")
    .trimEnd()

  if (!isEstimate(documentLabel)) return base || ""

  return base ? `${base}\n\n${ESTIMATE_TERMS_NOTE}` : ESTIMATE_TERMS_NOTE
}
