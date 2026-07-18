// Brief 04 Part 1 — the owner's seven quote-line categories, confirmed 18
// July 2026. This is the whole list: every category is an account decision
// and the owner has made all of them. Do not add categories; edge cases like
// organic spray belong under Sprays / extras, distinguished by description.
//
// item_code must match an existing Xero item or Xero rejects the line.
// Confirmed in use: Labour, Materials, Greenwaste, Toolhire. Plants has no
// verified Xero item yet, so it ships with item_code Materials (account
// 10115 still separates it in the ledger) — swap to 'Plants' if the owner's
// Xero item check finds one. General waste's 200 account is a legacy
// catch-all; carried through, not redesigned.

export type QuoteLineCategoryKey =
  | "labour"
  | "materials"
  | "plants"
  | "greenwaste"
  | "sprays_extras"
  | "tool_hire"
  | "general_waste"

export type QuoteLineCategory = {
  key: QuoteLineCategoryKey
  label: string
  item_code: string
  account_code: string
}

export const QUOTE_LINE_TAX_TYPE = "OUTPUT2"

export const QUOTE_LINE_CATEGORIES: QuoteLineCategory[] = [
  { key: "labour", label: "Labour", item_code: "Labour", account_code: "10010" },
  { key: "materials", label: "Materials", item_code: "Materials", account_code: "10011" },
  { key: "plants", label: "Plants", item_code: "Materials", account_code: "10115" },
  { key: "greenwaste", label: "Greenwaste", item_code: "Greenwaste", account_code: "10114" },
  { key: "sprays_extras", label: "Sprays / extras", item_code: "Materials", account_code: "10011" },
  { key: "tool_hire", label: "Tool hire", item_code: "Toolhire", account_code: "200" },
  { key: "general_waste", label: "General waste", item_code: "Materials", account_code: "200" },
]

export function getQuoteLineCategory(
  key: string | null | undefined
): QuoteLineCategory {
  return (
    QUOTE_LINE_CATEGORIES.find((category) => category.key === key) ||
    QUOTE_LINE_CATEGORIES[0]
  )
}

// Recover a category for stored line items (including pre-045 rows and
// template defaults) from whatever fields they carry. account_code is the
// strongest signal; sprays_extras and materials share 10011, so the stored
// category key wins when present.
export function inferQuoteLineCategory(item: {
  category?: string | null
  account_code?: string | null
  item_code?: string | null
}): QuoteLineCategoryKey {
  const byKey = QUOTE_LINE_CATEGORIES.find((c) => c.key === item.category)
  if (byKey) return byKey.key

  const byAccount = QUOTE_LINE_CATEGORIES.find(
    (c) =>
      c.account_code === item.account_code &&
      (!item.item_code || c.item_code === item.item_code)
  )
  if (byAccount) return byAccount.key

  return "labour"
}
