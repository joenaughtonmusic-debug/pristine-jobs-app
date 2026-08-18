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
