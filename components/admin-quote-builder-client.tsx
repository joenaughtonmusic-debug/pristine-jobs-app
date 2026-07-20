"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  linkQuoteDraftAction,
  markJobScheduledForDraftAction,
  markQuoteSentForDraftAction,
  setLeadPropertyAction,
  setLeadPropertyForDraftAction,
} from "@/app/(app)/sales-pipeline/actions"
import { getTemplateQuoteType } from "@/lib/sales-leads"
import { getPublicQuoteUrl } from "@/lib/public-quote-url"
import {
  buildCrewMaterialsList,
  getQuoteLabourHours,
} from "@/lib/quote-materials"
import {
  QUOTE_LINE_CATEGORIES,
  QUOTE_LINE_TAX_TYPE,
  getQuoteLineCategory,
  inferQuoteLineCategory,
  type QuoteLineCategoryKey,
} from "@/lib/quote-line-categories"
import { buildQuoteExportText } from "@/lib/quote-export"

type PropertyOption = {
  id: string
  property_code: string | null
  client_name: string
  client_email: string | null
  address_line_1: string | null
  suburb: string | null
}

type ScheduledJobOption = {
  id: string
  property_id: string
  scheduled_date: string | null
  job_type: string | null
  quoted_scope: string | null
  properties?: {
    client_name: string | null
    address_line_1: string | null
    suburb: string | null
  } | {
    client_name: string | null
    address_line_1: string | null
    suburb: string | null
  }[] | null
}

type EstimateOption = {
  id: string
  customer_name: string
  customer_email: string | null
  customer_phone: string | null
  address_line_1: string | null
  suburb: string | null
  enquiry_details: string | null
  estimate_status: string
  estimate_date: string | null
  estimate_notes: string | null
  converted_property_id: string | null
}

type QuoteTemplate = {
  id: string
  name: string
  category: string | null
  customer_scope: string | null
  internal_notes: string | null
  terms_conditions: string | null
  default_line_items: unknown
  frequency: string | null
  labour_hours: number | null
  labour_rate: number | null
  greenwaste_bags: number | null
  greenwaste_rate: number | null
  sprays_size: string | null
  sprays_price: number | null
  fertiliser_size: string | null
  fertiliser_price: number | null
  stump_paste_size: string | null
  stump_paste_price: number | null
}

// Phase 2: a pipeline lead handed in via /admin/quotes?lead=<id>. The saved
// draft is linked back to it (sales_leads.quote_draft_id) write-once.
type LeadOption = {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  suburb: string | null
  service_needed: string | null
  message: string | null
  property_id: string | null
  quote_draft_id: string | null
}

type QuoteDraftSummary = {
  id: string
  property_id: string | null
  estimate_id: string | null
  customer_name: string
  customer_email: string | null
  quote_title: string
  quote_type: QuoteType | null
  status: string
  frequency: string | null
  labour_hours: number | null
  labour_rate: number | null
  greenwaste_rate: number | null
  sprays_size: string | null
  fertiliser_size: string | null
  stump_paste_size: string | null
  customer_scope: string | null
  first_scheduled_job_id: string | null
  total: number | null
  subtotal?: number | string | null
  gst?: number | string | null
  monthly_equivalent: number | null
  hero_image_url?: string | null
  photos?: unknown
  line_items?: unknown
  created_at: string
  xero_quote_number: string | null
  xero_quote_status: string | null
  xero_quote_error: string | null
  public_accept_token: string | null
  quote_sent_at?: string | null
  proposal_sent_note?: string | null
  proposal_status?: string | null
  proposal_ready_to_send_at?: string | null
  proposal_sent_at?: string | null
  proposal_send_error?: string | null
  proposal_email_subject?: string | null
  proposal_email_body?: string | null
  quote_accepted_at?: string | null
  quote_declined_at?: string | null
  accepted_customer_name?: string | null
  accepted_customer_email?: string | null
  acceptance_notes?: string | null
  followup_3day_sent_at?: string | null
  followup_7day_sent_at?: string | null
  followup_14day_sent_at?: string | null
  recurring_invoice_required?: boolean | null
  recurring_invoice_setup_status?: string | null
  recurring_invoice_setup_note?: string | null
  recurring_invoice_setup_completed_at?: string | null
}

type LineItem = {
  description: string
  quantity: number
  unit_price: number
  // Brief 04: one of the owner's seven categories — supplies the Xero
  // item_code/account_code at save time (lib/quote-line-categories).
  category: QuoteLineCategoryKey
}

// Brief 04 Part 3a: { url, caption, sort_order } entries in
// quote_drafts.photos.
type QuotePhoto = {
  url: string
  caption: string
  sort_order: number
}

type AllowanceType = "sprays" | "fertiliser" | "stumpPaste"

type StaffMember = {
  id: string
  name: string
}

type FollowUpStage = 3 | 7 | 14
type QuoteType = "maintenance" | "one_off" | "landscaping"

const quoteTypeOptions: { value: QuoteType; label: string }[] = [
  { value: "maintenance", label: "Maintenance" },
  { value: "one_off", label: "One-off" },
  { value: "landscaping", label: "Landscaping" },
]

const frequencyOptions = [
  { value: "", label: "No subscription frequency" },
  { value: "monthly", label: "Monthly" },
  { value: "6_weekly", label: "6 Weekly" },
  { value: "2_monthly", label: "2 Monthly" },
  { value: "3_monthly", label: "3 Monthly" },
  { value: "4_monthly", label: "4 Monthly" },
  { value: "6_monthly", label: "6 Monthly" },
]

const allowancePriceDefaults = {
  sprays: { none: 0, small: 5, large: 10 },
  fertiliser: { none: 0, small: 7.5, large: 20 },
  stumpPaste: { none: 0, small: 7, large: 19 },
}

// Slice 2: the standard maintenance scope, pre-filled (editable) whenever
// Maintenance is selected. The visit list lives HERE, once — the line-item
// description below stays short so the proposal doesn't show it twice.
const maintenanceCustomerScope = `Ongoing garden maintenance to keep the garden tidy and healthy throughout the year.

Each visit can include, but isn't limited to:
• Weed control
• Shrub and hedge trimming
• Pruning
• Removal of self-seeded plants
• Feeding and spraying where required
• General garden tidy
• Blow down of work areas

All greenwaste removed. Greenwaste volumes vary visit to visit and are charged accordingly.`

// The one sentence the app owns in the maintenance line description
// (greenwaste auto-range). Matched loosely so a re-save replaces the previous
// version instead of stacking; everything else in the description is Joe's.
const GREENWASTE_RANGE_PATTERN =
  /\s*Greenwaste removal is approximately [^\n]*? depending on the amount removed\./g

function buildGreenwasteRangeSentence(range: {
  average: number
  min: number
  max: number
}) {
  return `Greenwaste removal is approximately ${money(
    range.average
  )} per visit on average and may fluctuate between ${money(
    range.min
  )} and ${money(range.max)} depending on the amount removed.`
}

const maintenanceLineItemDescription = `Ongoing garden maintenance.

All greenwaste removed.`

type Props = {
  properties: PropertyOption[]
  scheduledJobs: ScheduledJobOption[]
  estimates: EstimateOption[]
  selectedEstimateId: string | null
  selectedLead?: LeadOption | null
  initialQuoteType?: QuoteType | null
  initialTemplateId?: string | null
  queryErrors: string[]
  templates: QuoteTemplate[]
  staff: StaffMember[]
  quoteDrafts: QuoteDraftSummary[]
}

function money(value: number) {
  return value.toLocaleString("en-NZ", {
    style: "currency",
    currency: "NZD",
  })
}

function formatDate(value: string | null) {
  if (!value) return "No date"

  return new Date(value).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function getDaysSince(value: string | null | undefined) {
  if (!value) return 0

  const sentAt = new Date(value).getTime()
  const now = Date.now()

  return Math.max(Math.floor((now - sentAt) / (1000 * 60 * 60 * 24)), 0)
}

function getFollowUpStageLabel(draft: QuoteDraftSummary) {
  const daysSinceSent = getDaysSince(draft.quote_sent_at)

  if (daysSinceSent >= 14 && !draft.followup_14day_sent_at) {
    return "14-day follow-up due"
  }

  if (daysSinceSent >= 7 && !draft.followup_7day_sent_at) {
    return "7-day follow-up due"
  }

  if (daysSinceSent >= 3 && !draft.followup_3day_sent_at) {
    return "3-day follow-up due"
  }

  if (
    draft.followup_3day_sent_at &&
    draft.followup_7day_sent_at &&
    draft.followup_14day_sent_at
  ) {
    return "Follow-ups completed"
  }

  return "Upcoming"
}

function getDueFollowUpStages(draft: QuoteDraftSummary): FollowUpStage[] {
  const daysSinceSent = getDaysSince(draft.quote_sent_at)
  const stages: FollowUpStage[] = []

  if (daysSinceSent >= 3 && !draft.followup_3day_sent_at) stages.push(3)
  if (daysSinceSent >= 7 && !draft.followup_7day_sent_at) stages.push(7)
  if (daysSinceSent >= 14 && !draft.followup_14day_sent_at) stages.push(14)

  return stages
}

function getQuoteStatusLabel(status: string) {
  if (status === "ready_for_xero") return "Ready for Xero"
  if (status === "xero_created") return "Xero Created"
  if (status === "sent") return "Sent"
  if (status === "accepted") return "Accepted"
  if (status === "declined") return "Declined"
  if (status === "error") return "Error"

  return "Draft"
}

function getXeroQuoteStatusLabel(status: string | null) {
  if (!status) return "Not created"

  const normalizedStatus = status.toUpperCase()

  if (normalizedStatus === "DRAFT") return "Draft"
  if (normalizedStatus === "SENT") return "Sent"
  if (normalizedStatus === "SENT_APP") return "Sent by App"
  if (normalizedStatus === "ACCEPTED") return "Accepted"
  if (normalizedStatus === "ACCEPTED_APP") return "Accepted in App"
  if (normalizedStatus === "DECLINED") return "Declined"
  if (normalizedStatus === "DECLINED_APP") return "Declined in App"
  if (status === "ready_for_xero") return "Ready for Xero"

  return status.replaceAll("_", " ")
}

function getXeroQuoteStatusClasses(status: string | null) {
  const normalizedStatus = status?.toUpperCase()

  if (normalizedStatus === "DRAFT") return "bg-slate-100 text-slate-700"
  if (normalizedStatus === "SENT") return "bg-indigo-100 text-indigo-800"
  if (normalizedStatus === "SENT_APP") return "bg-indigo-100 text-indigo-800"
  if (normalizedStatus === "ACCEPTED") return "bg-green-100 text-green-800"
  if (normalizedStatus === "ACCEPTED_APP") return "bg-green-100 text-green-800"
  if (normalizedStatus === "DECLINED") return "bg-gray-100 text-gray-700"
  if (normalizedStatus === "DECLINED_APP") return "bg-gray-100 text-gray-700"
  if (status === "ready_for_xero") return "bg-amber-100 text-amber-800"

  return "bg-gray-100 text-gray-600"
}

function getProposalStatusLabel(status: string | null | undefined) {
  if (status === "ready_to_send") return "Ready to Send"
  if (status === "sent") return "Sent"
  if (status === "error") return "Error"

  return "Not Ready"
}

function getProposalStatusClasses(status: string | null | undefined) {
  if (status === "ready_to_send") return "bg-amber-100 text-amber-800"
  if (status === "sent") return "bg-green-100 text-green-800"
  if (status === "error") return "bg-red-100 text-red-800"

  return "bg-gray-100 text-gray-600"
}

function getQuoteStatusClasses(status: string) {
  if (status === "ready_for_xero") return "bg-amber-100 text-amber-800"
  if (status === "xero_created") return "bg-blue-100 text-blue-800"
  if (status === "sent") return "bg-indigo-100 text-indigo-800"
  if (status === "accepted") return "bg-green-100 text-green-800"
  if (status === "declined") return "bg-gray-100 text-gray-700"
  if (status === "error") return "bg-red-100 text-red-800"

  return "bg-slate-100 text-slate-700"
}

function getQuoteTypeLabel(value?: string | null) {
  return quoteTypeOptions.find((option) => option.value === value)?.label || "One-off"
}

function getNormalisedQuoteType(value?: string | null): QuoteType {
  if (value === "maintenance" || value === "landscaping") return value
  return "one_off"
}

function getQuoteTypeBadgeClasses(value?: string | null) {
  const quoteType = getNormalisedQuoteType(value)

  if (quoteType === "maintenance") return "bg-green-100 text-green-800"
  if (quoteType === "landscaping") return "bg-purple-100 text-purple-800"

  return "bg-blue-100 text-blue-800"
}

function getScheduleActionLabel(value?: string | null) {
  const quoteType = getNormalisedQuoteType(value)

  if (quoteType === "maintenance") return "Create Maintenance Schedule"
  if (quoteType === "landscaping") return "Schedule Landscaping Job"

  return "Schedule One-off Job"
}

// Shared with the pipeline board's Create-quote modal so both derive the
// same quote type from a template (lib/sales-leads.ts).
function getQuoteTypeFromTemplate(template: QuoteTemplate): QuoteType {
  return getTemplateQuoteType(template)
}

type NewCustomerDetails = {
  client_name: string
  client_email: string | null
  phone: string | null
  address_line_1: string | null
  suburb: string | null
}

// The ONE property-creation path in this component (Brief 03: reuse the
// estimate→property conversion's logic, do not invent a second).
// billing_type defaults to charge_up for ALL quote types (Joe's decision,
// 18 Jul 2026) — subscription is the explicit exception, chosen per job in
// the schedule, because it needs a manually-created Xero repeating invoice.
async function createCustomerProperty(
  supabase: ReturnType<typeof createClient>,
  details: NewCustomerDetails,
  quote: {
    quote_type: string | null
    frequency: string | null
    labour_rate?: number | null
    greenwaste_rate?: number | null
  }
) {
  const propertyCode =
    makePropertyCode(
      [details.address_line_1, details.suburb].filter(Boolean).join(" ")
    ) || makePropertyCode(details.client_name)

  // Idempotent by design: these writes aren't transaction-wrapped with their
  // callers, so a retry after a downstream failure must reuse the property it
  // already created rather than duplicate it (the "phantom rows" failure mode
  // Brief 03 exists because of). Same code + same name = same customer.
  const { data: existing, error: existingError } = await supabase
    .from("properties")
    .select("id")
    .eq("property_code", propertyCode)
    .eq("client_name", details.client_name)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  if (existingError) {
    return { data: null, error: existingError }
  }

  if (existing) {
    return { data: existing, error: null }
  }

  return supabase
    .from("properties")
    .insert({
      client_name: details.client_name,
      client_email: details.client_email || null,
      phone: details.phone || null,
      address_line_1: details.address_line_1 || null,
      suburb: details.suburb || null,
      property_code: propertyCode,
      billing_type: "charge_up",
      service_frequency:
        getNormalisedQuoteType(quote.quote_type) === "maintenance"
          ? quote.frequency || null
          : null,
      // Invoicing bills actuals at the PROPERTY's rates (hours ×
      // hourly_rate, bags × greenwaste_rate) — copy the quoted rates on so
      // what was quoted is what Make bills. Every new customer gets the
      // standard $80/$26.50 default; maintenance quotes override with their
      // pricing-panel values. Creation only; existing properties' rates are
      // never touched (idempotent-reuse path above returns before this insert).
      hourly_rate:
        getNormalisedQuoteType(quote.quote_type) === "maintenance"
          ? quote.labour_rate ?? 80
          : 80,
      greenwaste_rate:
        getNormalisedQuoteType(quote.quote_type) === "maintenance"
          ? quote.greenwaste_rate ?? 26.5
          : 26.5,
      is_active: true,
    })
    .select("id")
    .single()
}

function getLeadDetailNotes(lead: LeadOption) {
  return [
    `Customer: ${lead.name}`,
    lead.email ? `Email: ${lead.email}` : null,
    lead.phone ? `Phone: ${lead.phone}` : null,
    [lead.address, lead.suburb].filter(Boolean).length > 0
      ? `Address: ${[lead.address, lead.suburb].filter(Boolean).join(", ")}`
      : null,
    lead.service_needed ? `Service needed: ${lead.service_needed}` : null,
    lead.message ? `Enquiry:\n${lead.message}` : null,
  ]
    .filter(Boolean)
    .join("\n\n")
}

function parseLineItems(value: unknown): LineItem[] {
  if (!Array.isArray(value)) return []

  return value.map((item) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {}

    return {
      description:
        typeof record.description === "string" ? record.description : "",
      quantity: Number(record.quantity || 1),
      unit_price: Number(record.unit_price || 0),
      category: inferQuoteLineCategory({
        category: typeof record.category === "string" ? record.category : null,
        account_code:
          typeof record.account_code === "string" ? record.account_code : null,
        item_code:
          typeof record.item_code === "string" ? record.item_code : null,
      }),
    }
  })
}

function parseQuotePhotos(value: unknown): QuotePhoto[] {
  if (!Array.isArray(value)) return []

  return value
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object"
    )
    .map((item, index) => ({
      url: typeof item.url === "string" ? item.url : "",
      caption: typeof item.caption === "string" ? item.caption : "",
      sort_order: Number(item.sort_order ?? index + 1),
    }))
    .filter((photo) => photo.url)
    .sort((a, b) => a.sort_order - b.sort_order)
}

function generateAcceptToken() {
  const bytes = new Uint8Array(24)
  window.crypto.getRandomValues(bytes)

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

function getPropertyLabel(property: PropertyOption) {
  const location = [property.address_line_1, property.suburb]
    .filter(Boolean)
    .join(", ")

  return location ? `${property.client_name} - ${location}` : property.client_name
}

function makePropertyCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24)
}

function getEstimateLabel(estimate: EstimateOption) {
  const location = [estimate.address_line_1, estimate.suburb]
    .filter(Boolean)
    .join(", ")

  return location
    ? `${estimate.customer_name} - ${location}`
    : estimate.customer_name
}

function getQuoteFrequencyLabel(frequency: string | null) {
  if (!frequency) return "No frequency"

  return (
    frequencyOptions.find((option) => option.value === frequency)?.label ||
    frequency.replaceAll("_", " ")
  )
}

function getEstimateDetailNotes(estimate: EstimateOption) {
  return [
    `Customer: ${estimate.customer_name}`,
    estimate.customer_email ? `Email: ${estimate.customer_email}` : null,
    estimate.customer_phone ? `Phone: ${estimate.customer_phone}` : null,
    [estimate.address_line_1, estimate.suburb].filter(Boolean).length > 0
      ? `Address: ${[estimate.address_line_1, estimate.suburb].filter(Boolean).join(", ")}`
      : null,
    estimate.enquiry_details ? `Enquiry details:\n${estimate.enquiry_details}` : null,
    estimate.estimate_notes ? `Estimate notes:\n${estimate.estimate_notes}` : null,
  ]
    .filter(Boolean)
    .join("\n\n")
}

function calculateMonthlyEquivalent(perVisitPrice: number, frequency: string) {
  if (frequency === "monthly") return perVisitPrice
  if (frequency === "6_weekly") return perVisitPrice * 52 / 12 / 6
  if (frequency === "2_monthly") return perVisitPrice / 2
  if (frequency === "3_monthly") return perVisitPrice / 3
  if (frequency === "4_monthly") return perVisitPrice / 4
  if (frequency === "6_monthly") return perVisitPrice / 6

  return perVisitPrice
}

function getTemplateMonthlyEquivalent(template: QuoteTemplate) {
  const templatePerVisitPrice =
    Number(template.labour_hours || 0) * Number(template.labour_rate || 0) +
    Number(template.greenwaste_bags || 0) * Number(template.greenwaste_rate || 0) +
    Number(template.sprays_price || 0) +
    Number(template.fertiliser_price || 0) +
    Number(template.stump_paste_price || 0)

  return calculateMonthlyEquivalent(
    templatePerVisitPrice,
    template.frequency || ""
  )
}

function parseDecimalInput(value: string) {
  return Number(value || 0)
}

export function AdminQuoteBuilderClient({
  properties,
  scheduledJobs,
  estimates,
  selectedEstimateId,
  selectedLead = null,
  initialQuoteType = null,
  initialTemplateId = null,
  queryErrors,
  templates,
  staff,
  quoteDrafts: initialQuoteDrafts,
}: Props) {
  const supabase = createClient()
  const [propertyId, setPropertyId] = useState("")
  const [estimateId, setEstimateId] = useState("")
  const [scheduledJobId, setScheduledJobId] = useState("")
  // Brief 03: quoting a brand-new customer creates their properties row at
  // save time (via createCustomerProperty — the one shared creation path).
  // New customers are the predominant use, so the builder OPENS on
  // new-customer entry (firm requirement, raised repeatedly — see
  // docs/Backlog_Notes.md "Quote builder redesign"). Selecting an existing
  // property, estimate, or a lead that already has a property flips it off.
  const [newCustomerMode, setNewCustomerMode] = useState(true)
  const [newCustomerName, setNewCustomerName] = useState("")
  const [newCustomerEmail, setNewCustomerEmail] = useState("")
  const [newCustomerPhone, setNewCustomerPhone] = useState("")
  const [newCustomerAddress, setNewCustomerAddress] = useState("")
  const [newCustomerSuburb, setNewCustomerSuburb] = useState("")
  const [templateId, setTemplateId] = useState("")
  const [quoteType, setQuoteType] = useState<QuoteType>("one_off")
  const [quoteTitle, setQuoteTitle] = useState("")
  const [customerScope, setCustomerScope] = useState("")
  const [internalNotes, setInternalNotes] = useState("")
  const [termsConditions, setTermsConditions] = useState("")
  const [customerScopeEdited, setCustomerScopeEdited] = useState(false)
  const [internalNotesEdited, setInternalNotesEdited] = useState(false)
  const [termsEdited, setTermsEdited] = useState(false)
  const [lineItemsEdited, setLineItemsEdited] = useState(false)
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "Labour", quantity: 1, unit_price: 0, category: "labour" },
  ])
  const [frequency, setFrequency] = useState("")
  const [labourHours, setLabourHours] = useState(0)
  const [labourRate, setLabourRate] = useState(80)
  const [greenwasteBags, setGreenwasteBags] = useState(0)
  const [greenwasteRate, setGreenwasteRate] = useState(26.5)
  const [spraysSize, setSpraysSize] = useState("none")
  const [spraysPrice, setSpraysPrice] = useState(0)
  const [fertiliserSize, setFertiliserSize] = useState("none")
  const [fertiliserPrice, setFertiliserPrice] = useState(0)
  const [stumpPasteSize, setStumpPasteSize] = useState("none")
  const [stumpPastePrice, setStumpPastePrice] = useState(0)
  const [quoteDrafts, setQuoteDrafts] = useState(initialQuoteDrafts)
  const [preparingXeroQuoteId, setPreparingXeroQuoteId] = useState<string | null>(null)
  const [manualAcceptingQuoteId, setManualAcceptingQuoteId] =
    useState<string | null>(null)
  const [copyingQuoteId, setCopyingQuoteId] = useState<string | null>(null)
  const [convertingQuoteId, setConvertingQuoteId] = useState<string | null>(null)
  const [markingRecurringInvoiceId, setMarkingRecurringInvoiceId] =
    useState<string | null>(null)
  const [markingFollowUp, setMarkingFollowUp] = useState<string | null>(null)
  const [scheduleDraft, setScheduleDraft] = useState<QuoteDraftSummary | null>(
    null
  )
  const [sendProposalDraft, setSendProposalDraft] =
    useState<QuoteDraftSummary | null>(null)
  const [proposalSubject, setProposalSubject] = useState("")
  const [proposalBody, setProposalBody] = useState("")
  const [proposalLink, setProposalLink] = useState("")
  const [proposalRecipient, setProposalRecipient] = useState("")
  const [firstVisitDate, setFirstVisitDate] = useState("")
  const [firstVisitStartTime, setFirstVisitStartTime] = useState("")
  const [firstVisitStaffId, setFirstVisitStaffId] = useState("")
  const [firstVisitDuration, setFirstVisitDuration] = useState("")
  const [firstVisitNotes, setFirstVisitNotes] = useState("")
  const [creatingMaintenanceSchedule, setCreatingMaintenanceSchedule] =
    useState(false)
  const [sendingProposal, setSendingProposal] = useState(false)
  // Brief 04 Part 3a: per-quote hero + captioned gallery, edited in a modal
  // on the draft row (photos are presentation, not priced content, so they
  // stay editable after the draft is saved).
  const [photosDraft, setPhotosDraft] = useState<QuoteDraftSummary | null>(null)
  const [heroImageUrl, setHeroImageUrl] = useState("")
  const [galleryPhotos, setGalleryPhotos] = useState<QuotePhoto[]>([])
  const [uploadingQuotePhoto, setUploadingQuotePhoto] = useState(false)
  const [savingPhotos, setSavingPhotos] = useState(false)
  const [saving, setSaving] = useState(false)
  // Set after a save links the handed-in lead, so a second save on the same
  // page can't attempt a relink (the link is write-once).
  const [leadLinkedDraftId, setLeadLinkedDraftId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedProperty = properties.find((property) => property.id === propertyId) || null
  const selectedEstimate = estimates.find((estimate) => estimate.id === estimateId) || null
  const selectedTemplate = templates.find((template) => template.id === templateId) || null
  const jobsForProperty = scheduledJobs.filter((job) => job.property_id === propertyId)
  const selectedCustomerName =
    selectedProperty?.client_name ||
    selectedEstimate?.customer_name ||
    selectedLead?.name ||
    "No customer selected"
  const selectedCustomerEmail =
    selectedProperty?.client_email ||
    selectedEstimate?.customer_email ||
    selectedLead?.email ||
    null
  const getPropertyDisplay = (propertyId: string | null) => {
    if (!propertyId) return "No property"

    const property = properties.find((item) => item.id === propertyId)

    if (!property) return propertyId

    return property.property_code
      ? `${property.client_name} (${property.property_code})`
      : property.client_name
  }
  const acceptedQuoteDrafts = quoteDrafts.filter(
    (draft) => draft.status === "accepted"
  )
  const awaitingConversionDrafts = acceptedQuoteDrafts.filter(
    (draft) => !draft.property_id
  )
  const awaitingScheduleDrafts = acceptedQuoteDrafts.filter(
    (draft) => draft.property_id && !draft.first_scheduled_job_id
  )
  const awaitingRecurringInvoiceDrafts = acceptedQuoteDrafts.filter(
    (draft) =>
      draft.recurring_invoice_required &&
      draft.recurring_invoice_setup_status !== "completed"
  )
  const completedOperationsDrafts = acceptedQuoteDrafts.filter(
    (draft) =>
      draft.property_id &&
      draft.first_scheduled_job_id &&
      (!draft.recurring_invoice_required ||
        draft.recurring_invoice_setup_status === "completed")
  )
  const followUpDrafts = quoteDrafts.filter((draft) => {
    return (
      Boolean(draft.quote_sent_at) &&
      !draft.quote_accepted_at &&
      !draft.quote_declined_at
    )
  })
  const dueFollowUps = followUpDrafts.filter(
    (draft) => getDueFollowUpStages(draft).length > 0
  )
  const completedFollowUps = followUpDrafts.filter((draft) => {
    return (
      draft.followup_3day_sent_at &&
      draft.followup_7day_sent_at &&
      draft.followup_14day_sent_at
    )
  })
  const upcomingFollowUps = followUpDrafts.filter((draft) => {
    return (
      getDueFollowUpStages(draft).length === 0 &&
      !(
        draft.followup_3day_sent_at &&
        draft.followup_7day_sent_at &&
        draft.followup_14day_sent_at
      )
    )
  })

  useEffect(() => {
    if (!selectedEstimateId) return

    const estimate = estimates.find((item) => item.id === selectedEstimateId)

    if (!estimate) return

    handleEstimateChange(estimate.id)
  }, [selectedEstimateId, estimates])

  // Phase 2: prefill from a pipeline lead (?lead=). The template is applied
  // first (it may set the quote type); an explicit quote_type param wins only
  // when no template was suggested. The lead's property, if it has one
  // (add-existing-customer), is preselected so the draft carries property_id.
  // Lead details go into internal notes at save time (like estimate details).
  useEffect(() => {
    if (!selectedLead) return

    // Only prefill ids that exist in the option lists — a stale id in the
    // URL (or an inactive property) would leave a controlled select showing
    // nothing while state silently holds a value. The save-time fallback
    // still carries selectedLead.property_id either way.
    if (
      initialTemplateId &&
      templates.some((template) => template.id === initialTemplateId)
    ) {
      handleTemplateChange(initialTemplateId)
    } else if (initialQuoteType) {
      // Through the handler (not setQuoteType) so the type-driven content —
      // maintenance scope boilerplate, blank line item — arrives too.
      handleQuoteTypeChange(initialQuoteType)
    }

    setQuoteTitle((current) => current || `Quote for ${selectedLead.name}`)

    if (selectedLead.property_id) {
      // Never open on new-customer entry for a lead that already has a
      // property — even when that property isn't in the active list,
      // creating a second one would split the customer's history.
      setNewCustomerMode(false)

      if (
        properties.some((property) => property.id === selectedLead.property_id)
      ) {
        setPropertyId(selectedLead.property_id)
      } else {
        setError(
          "This lead's linked property isn't in the active property list — pick it manually or reactivate it before quoting."
        )
      }
    }

    // Brief 03: prefill the new-customer form from the lead. A lead without
    // a property lands straight in new-customer mode (the default), fields
    // ready; saving the draft is still what creates the properties row.
    setNewCustomerName(selectedLead.name || "")
    setNewCustomerEmail(selectedLead.email || "")
    setNewCustomerPhone(selectedLead.phone || "")
    setNewCustomerAddress(selectedLead.address || "")
    setNewCustomerSuburb(selectedLead.suburb || "")
    // Run once for the handed-in lead; the deps it reads are page-load props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLead?.id])

  useEffect(() => {
    const missingTokenDrafts = quoteDrafts.filter(
      (draft) => !draft.public_accept_token
    )

    if (missingTokenDrafts.length === 0) return

    let cancelled = false

    const updateMissingTokens = async () => {
      const updates = await Promise.all(
        missingTokenDrafts.map(async (draft) => {
          const token = generateAcceptToken()
          const { error: updateError } = await supabase
            .from("quote_drafts")
            .update({
              public_accept_token: token,
              updated_at: new Date().toISOString(),
            })
            .eq("id", draft.id)

          if (updateError) return null

          return { id: draft.id, token }
        })
      )

      if (cancelled) return

      const validUpdates = updates.filter(Boolean) as {
        id: string
        token: string
      }[]

      if (validUpdates.length === 0) return

      setQuoteDrafts((currentDrafts) =>
        currentDrafts.map((draft) => {
          const update = validUpdates.find((item) => item.id === draft.id)

          if (!update) return draft

          return {
            ...draft,
            public_accept_token: update.token,
          }
        })
      )
    }

    updateMissingTokens()

    return () => {
      cancelled = true
    }
  }, [quoteDrafts, supabase])

  const lineItemsSubtotal = useMemo(() => {
    return lineItems.reduce((total, item) => {
      return total + Number(item.quantity || 0) * Number(item.unit_price || 0)
    }, 0)
  }, [lineItems])

  // Maintenance pricing needs BOTH the type and a frequency — the type gate
  // keeps a leftover frequency from silently pricing a one-off/landscaping
  // quote off the (now hidden) maintenance inputs.
  const hasMaintenancePricing = quoteType === "maintenance" && Boolean(frequency)
  const perVisitPrice =
    Number(labourHours || 0) * Number(labourRate || 0) +
    Number(greenwasteBags || 0) * Number(greenwasteRate || 0) +
    Number(spraysPrice || 0) +
    Number(fertiliserPrice || 0) +
    Number(stumpPastePrice || 0)
  // Greenwaste auto-range (19 Jul): ONE average input; min/max derived by
  // Joe's rule (avg −1 bag with a half-bag floor / avg +1.5 bags). No
  // min/avg/max UI — that's the over-build the Backlog_Notes guardrail bans.
  const greenwasteRange =
    hasMaintenancePricing &&
    Number(greenwasteBags) > 0 &&
    Number(greenwasteRate) > 0
      ? {
          average: Number(greenwasteBags) * Number(greenwasteRate),
          min:
            Math.max(Number(greenwasteBags) - 1, 0.5) * Number(greenwasteRate),
          max: (Number(greenwasteBags) + 1.5) * Number(greenwasteRate),
        }
      : null
  // Kept stored on the draft for genuinely-subscription customers (their
  // proposal shows it) — but it is NEVER the price. Maintenance is
  // charge_up: the quote is the cost of ONE visit, and frequency is
  // informational only (decision 19 Jul — see Backlog_Notes billing model).
  const monthlyEquivalent = hasMaintenancePricing
    ? calculateMonthlyEquivalent(perVisitPrice, frequency)
    : 0
  const total = hasMaintenancePricing ? perVisitPrice : lineItemsSubtotal
  const gst = total * 3 / 23
  const subtotal = total - gst

  useEffect(() => {
    if (!hasMaintenancePricing) return

    setLineItems((items) => {
      const [firstItem, ...rest] =
        items.length > 0
          ? items
          : [
              {
                description: "Maintenance visit",
                quantity: 1,
                unit_price: 0,
                category: "labour" as const,
              },
            ]

      return [
        {
          ...firstItem,
          quantity: 1,
          unit_price: Number(perVisitPrice.toFixed(2)),
        },
        ...rest,
      ]
    })
  }, [hasMaintenancePricing, perVisitPrice])

  // Type filters the builder (service-aware slice 1): only maintenance shows
  // the recurring pricing machinery, so leaving maintenance must drop the
  // frequency or the hidden inputs would keep pricing the quote.
  const handleQuoteTypeChange = (nextType: QuoteType) => {
    if (nextType === quoteType) return

    setQuoteType(nextType)

    // Slice 2 (smart clear, Joe's call 19 Jul): type drives content, but
    // only for content the app put there — anything hand-edited stays.
    if (
      selectedTemplate &&
      getQuoteTypeFromTemplate(selectedTemplate) !== nextType
    ) {
      setTemplateId("")
    }

    if (!customerScopeEdited) {
      setCustomerScope(
        nextType === "maintenance" ? maintenanceCustomerScope : ""
      )
    }

    if (!termsEdited) {
      setTermsConditions("")
    }

    if (!lineItemsEdited) {
      // Template-sourced line items reset for the new type — this also
      // drops maintenance line wording and any greenwaste range sentence.
      setLineItems([
        {
          description:
            nextType === "maintenance" ? maintenanceLineItemDescription : "Labour",
          quantity: 1,
          unit_price: 0,
          category: "labour",
        },
      ])
    } else if (nextType !== "maintenance" && hasMaintenancePricing) {
      // Hand-edited line items stay, but the auto-effect has overwritten
      // line 1 with a maintenance-derived price — zero it so a stale figure
      // can't ship as a one-off/landscaping total (slice 1).
      setLineItems((items) =>
        items.length > 0
          ? [{ ...items[0], unit_price: 0 }, ...items.slice(1)]
          : items
      )
    }

    if (nextType !== "maintenance") {
      setFrequency("")
    }
  }

  const handlePropertyChange = (nextPropertyId: string) => {
    const property = properties.find((item) => item.id === nextPropertyId) || null

    setPropertyId(nextPropertyId)
    if (nextPropertyId) {
      setEstimateId("")
      setNewCustomerMode(false)
    }
    setScheduledJobId("")

    if (property && !quoteTitle) {
      setQuoteTitle(`Quote for ${property.client_name}`)
    }
  }

  const enableNewCustomerMode = () => {
    setNewCustomerMode(true)
    setPropertyId("")
    setEstimateId("")
    setScheduledJobId("")

    if (newCustomerName.trim()) {
      setQuoteTitle((current) => current || `Quote for ${newCustomerName.trim()}`)
    }
  }

  const handleEstimateChange = (nextEstimateId: string) => {
    const estimate = estimates.find((item) => item.id === nextEstimateId) || null

    setEstimateId(nextEstimateId)

    if (nextEstimateId) {
      setPropertyId("")
      setScheduledJobId("")
      setNewCustomerMode(false)
    }

    if (!estimate) return

    setQuoteTitle(`Quote for ${estimate.customer_name}`)
    setInternalNotes(getEstimateDetailNotes(estimate))
    setInternalNotesEdited(true)
    setCustomerScope("")
    setCustomerScopeEdited(false)
  }

  const handleTemplateChange = (nextTemplateId: string) => {
    const template = templates.find((item) => item.id === nextTemplateId) || null

    setTemplateId(nextTemplateId)

    if (!template) return

    const isMaintenanceTemplate =
      template.category === "Maintenance" || Boolean(template.frequency)
    const nextQuoteType = getQuoteTypeFromTemplate(template)

    setQuoteType(nextQuoteType)

    if (isMaintenanceTemplate) {
      setCustomerScope(maintenanceCustomerScope)
      setCustomerScopeEdited(false)
      setLineItems([
        {
          description: maintenanceLineItemDescription,
          quantity: 1,
          unit_price: Number(getTemplateMonthlyEquivalent(template).toFixed(2)),
          category: "labour",
        },
      ])
      setLineItemsEdited(false)
    } else if (!customerScopeEdited) {
      setCustomerScope(template.customer_scope || "")
    }

    if (!internalNotesEdited) {
      setInternalNotes(template.internal_notes || "")
    }

    if (!termsEdited) {
      setTermsConditions(template.terms_conditions || "")
    }

    const templateItems = parseLineItems(template.default_line_items)
    if (!isMaintenanceTemplate && !lineItemsEdited) {
      setLineItems(
        templateItems.length > 0
          ? templateItems
          : [
              {
                description: "Labour",
                quantity: 1,
                unit_price: 0,
                category: "labour",
              },
            ]
      )
    }

    setFrequency(template.frequency || "")
    setLabourHours(Number(template.labour_hours || 0))
    setLabourRate(Number(template.labour_rate || 80))
    setGreenwasteBags(Number(template.greenwaste_bags || 0))
    setGreenwasteRate(Number(template.greenwaste_rate || 26.5))
    setSpraysSize(template.sprays_size || "none")
    setSpraysPrice(Number(template.sprays_price || 0))
    setFertiliserSize(template.fertiliser_size || "none")
    setFertiliserPrice(Number(template.fertiliser_price || 0))
    setStumpPasteSize(template.stump_paste_size || "none")
    setStumpPastePrice(Number(template.stump_paste_price || 0))
  }

  const handleJobChange = (nextJobId: string) => {
    const job = scheduledJobs.find((item) => item.id === nextJobId) || null

    setScheduledJobId(nextJobId)

    if (job?.quoted_scope) {
      setCustomerScope(job.quoted_scope)
      setCustomerScopeEdited(true)
    }
  }

  const updateLineItem = (
    index: number,
    field: keyof LineItem,
    value: string
  ) => {
    setLineItemsEdited(true)
    setLineItems((items) =>
      items.map((item, itemIndex) => {
        if (itemIndex !== index) return item

        return {
          ...item,
          [field]:
            field === "description" || field === "category"
              ? value
              : Number(value || 0),
        }
      })
    )
  }

  const addLineItem = () => {
    setLineItemsEdited(true)
    setLineItems((items) => [
      ...items,
      { description: "", quantity: 1, unit_price: 0, category: "labour" },
    ])
  }

  const removeLineItem = (index: number) => {
    setLineItemsEdited(true)
    setLineItems((items) => items.filter((_, itemIndex) => itemIndex !== index))
  }

  const loadQuoteDrafts = async () => {
    const { data, error: loadError } = await supabase
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
        frequency,
        labour_hours,
        labour_rate,
        greenwaste_rate,
        sprays_size,
        fertiliser_size,
        stump_paste_size,
        customer_scope,
        first_scheduled_job_id,
        total,
        monthly_equivalent,
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

    if (loadError) {
      setError(loadError.message)
      return
    }

    setQuoteDrafts((data || []) as QuoteDraftSummary[])
  }

  const prepareXeroQuote = async (quoteDraftId: string) => {
    setPreparingXeroQuoteId(quoteDraftId)
    setMessage(null)
    setError(null)

    const { error: updateError } = await supabase
      .from("quote_drafts")
      .update({
        status: "ready_for_xero",
        xero_quote_status: "ready_for_xero",
        xero_quote_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", quoteDraftId)

    setPreparingXeroQuoteId(null)

    if (updateError) {
      setError(updateError.message)
      return
    }

    await loadQuoteDrafts()
    setMessage("Quote draft marked ready for Xero.")
  }

  // The token is the stored fact; the URL is always derived fresh
  // (lib/public-quote-url). Never read or write the legacy
  // public_accept_url column — a stored URL bakes in whatever origin the
  // draft happened to be saved from (the June localhost-link incident).
  const ensureQuoteAcceptLink = async (draft: QuoteDraftSummary) => {
    if (draft.public_accept_token) {
      return {
        token: draft.public_accept_token,
        publicUrl: getPublicQuoteUrl(draft.public_accept_token),
      }
    }

    const token = generateAcceptToken()
    const { error: updateError } = await supabase
      .from("quote_drafts")
      .update({
        public_accept_token: token,
        updated_at: new Date().toISOString(),
      })
      .eq("id", draft.id)

    if (updateError) {
      throw new Error(updateError.message)
    }

    setQuoteDrafts((currentDrafts) =>
      currentDrafts.map((currentDraft) =>
        currentDraft.id === draft.id
          ? {
              ...currentDraft,
              public_accept_token: token,
            }
          : currentDraft
      )
    )

    return { token, publicUrl: getPublicQuoteUrl(token) }
  }

  const copyProposalLink = async (draft: QuoteDraftSummary) => {
    setCopyingQuoteId(draft.id)
    setMessage(null)
    setError(null)

    try {
      const { publicUrl } = await ensureQuoteAcceptLink(draft)
      await navigator.clipboard.writeText(publicUrl)
      setMessage("Proposal link copied.")
    } catch (copyError) {
      setError(
        copyError instanceof Error
          ? copyError.message
          : "Failed to copy proposal link."
      )
    } finally {
      setCopyingQuoteId(null)
    }
  }

  // Brief 03: the public quote page IS the preview — never a second renderer.
  const previewProposal = async (draft: QuoteDraftSummary) => {
    setError(null)

    try {
      const { token } = await ensureQuoteAcceptLink(draft)
      // Safari can silently block window.open from an async continuation —
      // it returns null instead of throwing, so check and say so.
      const opened = window.open(`/public/quote/${token}`, "_blank", "noopener")

      if (!opened) {
        setError(
          "The preview was blocked by the browser's pop-up blocker. Allow pop-ups for this site, or use Copy Proposal Link and open it in a new tab."
        )
      }
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : "Could not open the preview."
      )
    }
  }

  // Brief 04 Part 3b: the boring quote as clean text, for pasting anywhere.
  const copyQuoteDetails = async (draft: QuoteDraftSummary) => {
    setMessage(null)
    setError(null)

    try {
      await navigator.clipboard.writeText(buildQuoteExportText(draft))
      setMessage("Quote details copied to the clipboard.")
    } catch (copyError) {
      setError(
        copyError instanceof Error
          ? copyError.message
          : "Could not copy the quote details."
      )
    }
  }

  // --- Brief 04 Part 3a: quote photos ---------------------------------------

  const openPhotosModal = (draft: QuoteDraftSummary) => {
    setMessage(null)
    setError(null)
    setPhotosDraft(draft)
    setHeroImageUrl(draft.hero_image_url || "")
    setGalleryPhotos(parseQuotePhotos(draft.photos))
  }

  // Same bucket and pattern as job photos (components/job-detail.tsx), under
  // a quote-photos/ prefix — deliberately not a new bucket.
  const uploadQuotePhotoFile = async (draftId: string, file: File) => {
    const safeName = file.name
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
    const objectPath = `quote-photos/${draftId}/${Date.now()}-${
      safeName || "quote-photo"
    }`

    const { error: uploadError } = await supabase.storage
      .from("job-photos")
      .upload(objectPath, file, { cacheControl: "3600", upsert: false })

    if (uploadError) {
      throw new Error(uploadError.message)
    }

    const { data: publicUrlData } = supabase.storage
      .from("job-photos")
      .getPublicUrl(objectPath)

    if (!publicUrlData.publicUrl) {
      throw new Error("Could not get a public URL for the uploaded photo.")
    }

    return publicUrlData.publicUrl
  }

  const handleHeroFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || !photosDraft) return

    setUploadingQuotePhoto(true)
    setError(null)

    try {
      setHeroImageUrl(await uploadQuotePhotoFile(photosDraft.id, file))
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Hero image upload failed."
      )
    } finally {
      setUploadingQuotePhoto(false)
    }
  }

  const handleGalleryFilesChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = [...(event.target.files || [])]
    event.target.value = ""
    if (files.length === 0 || !photosDraft) return

    setUploadingQuotePhoto(true)
    setError(null)

    try {
      for (const file of files) {
        const url = await uploadQuotePhotoFile(photosDraft.id, file)
        setGalleryPhotos((photos) => [
          ...photos,
          { url, caption: "", sort_order: photos.length + 1 },
        ])
      }
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Photo upload failed."
      )
    } finally {
      setUploadingQuotePhoto(false)
    }
  }

  const moveGalleryPhoto = (index: number, direction: -1 | 1) => {
    setGalleryPhotos((photos) => {
      const target = index + direction
      if (target < 0 || target >= photos.length) return photos
      const next = [...photos]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const saveQuotePhotos = async () => {
    if (!photosDraft) return

    setSavingPhotos(true)
    setError(null)

    const { error: updateError } = await supabase
      .from("quote_drafts")
      .update({
        hero_image_url: heroImageUrl || null,
        photos: galleryPhotos.map((photo, index) => ({
          url: photo.url,
          caption: photo.caption.trim(),
          sort_order: index + 1,
        })),
        updated_at: new Date().toISOString(),
      })
      .eq("id", photosDraft.id)

    setSavingPhotos(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setPhotosDraft(null)
    await loadQuoteDrafts()
    setMessage("Quote photos saved.")
  }

  const openSendProposalModal = async (draft: QuoteDraftSummary) => {
    setMessage(null)
    setError(null)

    try {
      const { publicUrl } = await ensureQuoteAcceptLink(draft)
      const copyQuoteType = getNormalisedQuoteType(draft.quote_type)
      const firstName =
        draft.customer_name.trim().split(/\s+/)[0] || draft.customer_name

      setSendProposalDraft(draft)
      setProposalRecipient(draft.customer_email || "")
      setProposalSubject(
        copyQuoteType === "maintenance"
          ? "Your garden maintenance proposal — Pristine Gardens"
          : copyQuoteType === "landscaping"
            ? "Your landscaping quote — Pristine Gardens"
            : "Your garden quote — Pristine Gardens"
      )
      setProposalLink(publicUrl)
      setProposalBody(`Hi ${firstName},

Thanks for the opportunity to quote for your garden${
        copyQuoteType === "maintenance" ? "'s ongoing maintenance" : ""
      }. The full ${
        copyQuoteType === "maintenance" ? "proposal" : "quote"
      }, including scope and pricing, is here:

${publicUrl}

Have a read through, and accept online when you're ready. If anything needs adjusting, reply to this email or give me a call and we'll sort it.

Kind regards,
Joe
Pristine Gardens`)
    } catch (proposalError) {
      setError(
        proposalError instanceof Error
          ? proposalError.message
          : "Could not prepare proposal link."
      )
    }
  }

  const markProposalSent = async () => {
    if (!sendProposalDraft) return

    // Make sends to customer_email — an empty address would queue a send
    // that can never leave, so it's required here.
    const recipient = proposalRecipient.trim()

    if (!recipient || !recipient.includes("@")) {
      setError("Enter the customer's email address before queueing the send.")
      return
    }

    setSendingProposal(true)
    setMessage(null)
    setError(null)

    const readyAt = new Date().toISOString()
    const { error: updateError } = await supabase
      .from("quote_drafts")
      .update({
        customer_email: recipient,
        proposal_status: "ready_to_send",
        proposal_ready_to_send_at: readyAt,
        proposal_email_subject: proposalSubject.trim(),
        proposal_email_body: proposalBody.trim(),
        proposal_send_error: null,
        updated_at: readyAt,
      })
      .eq("id", sendProposalDraft.id)

    if (updateError) {
      setSendingProposal(false)
      setError(updateError.message)
      return
    }

    // Brief 03 (owner decision): queueing the send is the "quote sent" stage
    // action — the linked board card advances without a second click. No
    // linked lead, or already past Quote: quiet no-op.
    const leadResult = await markQuoteSentForDraftAction(sendProposalDraft.id)

    setSendingProposal(false)
    setSendProposalDraft(null)
    await loadQuoteDrafts()

    if ("error" in leadResult) {
      setError(
        `Proposal queued for Make.com, but the pipeline card could not be updated: ${leadResult.error}`
      )
      return
    }

    setMessage("Proposal queued for Make.com to send.")
  }

  const markAcceptedManually = async (draft: QuoteDraftSummary) => {
    setManualAcceptingQuoteId(draft.id)
    setMessage(null)
    setError(null)

    const acceptedAt = new Date().toISOString()
    const { error: updateError } = await supabase
      .from("quote_drafts")
      .update({
        status: "accepted",
        xero_quote_status: "ACCEPTED_APP",
        quote_accepted_at: acceptedAt,
        ...(draft.frequency
          ? {
              recurring_invoice_required: true,
              recurring_invoice_setup_status: "required",
            }
          : {}),
        updated_at: acceptedAt,
      })
      .eq("id", draft.id)

    setManualAcceptingQuoteId(null)

    if (updateError) {
      setError(updateError.message)
      return
    }

    await loadQuoteDrafts()
    setMessage("Quote marked accepted.")
  }

  const convertAcceptedQuoteToProperty = async (draft: QuoteDraftSummary) => {
    setConvertingQuoteId(draft.id)
    setMessage(null)
    setError(null)

    // Estimate-linked drafts convert from the estimate, exactly as before.
    if (draft.estimate_id) {
      const { data: estimate, error: estimateError } = await supabase
        .from("estimates")
        .select(`
          id,
          customer_name,
          customer_email,
          customer_phone,
          address_line_1,
          suburb,
          converted_property_id
        `)
        .eq("id", draft.estimate_id)
        .single()

      if (estimateError || !estimate) {
        setConvertingQuoteId(null)
        setError(estimateError?.message || "Could not load linked estimate.")
        return
      }

      if (estimate.converted_property_id) {
        const { error: quoteUpdateError } = await supabase
          .from("quote_drafts")
          .update({
            property_id: estimate.converted_property_id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", draft.id)

        setConvertingQuoteId(null)

        if (quoteUpdateError) {
          setError(quoteUpdateError.message)
          return
        }

        await loadQuoteDrafts()
        setMessage("Estimate is already converted. Quote linked to property.")
        return
      }

      const { data: property, error: propertyError } = await createCustomerProperty(
        supabase,
        {
          client_name: estimate.customer_name,
          client_email: estimate.customer_email,
          phone: estimate.customer_phone,
          address_line_1: estimate.address_line_1,
          suburb: estimate.suburb,
        },
        draft
      )

      if (propertyError || !property) {
        setConvertingQuoteId(null)
        setError(propertyError?.message || "Could not create property.")
        return
      }

      const now = new Date().toISOString()
      const { error: updateEstimateError } = await supabase
        .from("estimates")
        .update({
          converted_property_id: property.id,
          estimate_status: "converted",
          updated_at: now,
        })
        .eq("id", estimate.id)

      if (updateEstimateError) {
        setConvertingQuoteId(null)
        setError(updateEstimateError.message)
        return
      }

      const { error: updateQuoteError } = await supabase
        .from("quote_drafts")
        .update({
          property_id: property.id,
          updated_at: now,
        })
        .eq("id", draft.id)

      setConvertingQuoteId(null)

      if (updateQuoteError) {
        setError(updateQuoteError.message)
        return
      }

      await loadQuoteDrafts()
      setMessage("Accepted quote converted to property.")
      return
    }

    // Brief 03: no estimate — a board-lead quote (or a draft with neither).
    // Convert from the linked lead's details, falling back to what the draft
    // itself carries. This is where accepted lead-quotes used to dead-end.
    const { data: linkedLead, error: leadError } = await supabase
      .from("sales_leads")
      .select("id, name, email, phone, address, suburb, property_id")
      .eq("quote_draft_id", draft.id)
      .maybeSingle()

    if (leadError) {
      setConvertingQuoteId(null)
      setError(leadError.message)
      return
    }

    if (linkedLead?.property_id) {
      const { error: quoteUpdateError } = await supabase
        .from("quote_drafts")
        .update({
          property_id: linkedLead.property_id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", draft.id)

      setConvertingQuoteId(null)

      if (quoteUpdateError) {
        setError(quoteUpdateError.message)
        return
      }

      await loadQuoteDrafts()
      setMessage("Lead already has a property. Quote linked to it.")
      return
    }

    const { data: property, error: propertyError } = await createCustomerProperty(
      supabase,
      {
        client_name: draft.customer_name,
        client_email: draft.customer_email,
        phone: linkedLead?.phone || null,
        address_line_1: linkedLead?.address || null,
        suburb: linkedLead?.suburb || null,
      },
      draft
    )

    if (propertyError || !property) {
      setConvertingQuoteId(null)
      setError(propertyError?.message || "Could not create property.")
      return
    }

    const { error: updateQuoteError } = await supabase
      .from("quote_drafts")
      .update({
        property_id: property.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", draft.id)

    if (updateQuoteError) {
      setConvertingQuoteId(null)
      setError(updateQuoteError.message)
      return
    }

    if (linkedLead) {
      const linkResult = await setLeadPropertyForDraftAction(draft.id, property.id)

      if ("error" in linkResult) {
        setConvertingQuoteId(null)
        setError(
          `Property created and linked to the quote, but the pipeline lead could not be updated: ${linkResult.error}`
        )
        await loadQuoteDrafts()
        return
      }
    }

    setConvertingQuoteId(null)
    await loadQuoteDrafts()
    setMessage("Accepted quote converted to property.")
  }

  const openMaintenanceScheduleForm = (draft: QuoteDraftSummary) => {
    setScheduleDraft(draft)
    setFirstVisitDate("")
    setFirstVisitStartTime("")
    setFirstVisitStaffId("")
    // Same mapping as the schedule page: maintenance → pricing-panel hours;
    // one-off/landscaping → the single labour line's quantity (blank when
    // ambiguous).
    const quotedHours = getQuoteLabourHours({
      quote_type: getNormalisedQuoteType(draft.quote_type),
      labour_hours: draft.labour_hours,
      line_items: draft.line_items,
    })
    setFirstVisitDuration(quotedHours ? String(quotedHours) : "")
    setFirstVisitNotes(draft.customer_scope || "")
    setMessage(null)
    setError(null)
  }

  const createAcceptedQuoteSchedule = async () => {
    if (!scheduleDraft?.property_id) {
      setError("This accepted quote is not linked to a property.")
      return
    }

    if (scheduleDraft.first_scheduled_job_id) {
      setError("A scheduled job already exists for this quote.")
      return
    }

    if (!firstVisitDate) {
      setError("Choose a first visit date.")
      return
    }

    if (!firstVisitStaffId) {
      setError("Choose assigned staff.")
      return
    }

    if (firstVisitDuration && Number(firstVisitDuration) < 0) {
      setError("Duration can't be negative.")
      return
    }

    setCreatingMaintenanceSchedule(true)
    setMessage(null)
    setError(null)

    const quoteType = getNormalisedQuoteType(scheduleDraft.quote_type)
    const duration = firstVisitDuration ? Number(firstVisitDuration) : null
    const { data: scheduledJob, error: scheduledJobError } = await supabase
      .from("scheduled_jobs")
      .insert({
        property_id: scheduleDraft.property_id,
        job_type:
          quoteType === "maintenance"
            ? "maintenance"
            : quoteType === "landscaping"
              ? "landscaping"
              : "job",
        scheduled_date: firstVisitDate,
        planned_start_time: firstVisitStartTime || null,
        planned_duration_hours: duration,
        assigned_staff_id: firstVisitStaffId,
        invoice_method: quoteType === "maintenance" ? "charge_up" : "quoted",
        billing_mode: quoteType === "maintenance" ? "charge_up" : "quoted",
        quoted_scope: firstVisitNotes.trim() || scheduleDraft.customer_scope || null,
        // Crew Brief: materials-ish line items become the crew's
        // "Included Materials" list (same helper as the schedule page).
        quoted_materials:
          buildCrewMaterialsList(scheduleDraft.line_items, scheduleDraft) || null,
        quoted_amount:
          quoteType === "maintenance" ? null : Number(scheduleDraft.total || 0),
        status: "scheduled",
      })
      .select("id")
      .single()

    if (scheduledJobError || !scheduledJob) {
      setCreatingMaintenanceSchedule(false)
      setError(scheduledJobError?.message || "Could not create scheduled job.")
      return
    }

    // Jobs created here bill per visit (charge_up) or against the quote
    // (quoted) — neither uses a Xero repeating invoice, so clear the
    // recurring-invoice reminder set at acceptance. Leaving it would queue
    // the VA to create a repeating invoice on top of per-visit invoices.
    const { data: stamped, error: quoteUpdateError } = await supabase
      .from("quote_drafts")
      .update({
        first_scheduled_job_id: scheduledJob.id,
        recurring_invoice_required: false,
        // NOT NULL + CHECK ('not_required' | 'required' | 'completed') —
        // 'not_required' is the column's own default and the honest state
        // for a charge_up/quoted job.
        recurring_invoice_setup_status: "not_required",
        updated_at: new Date().toISOString(),
      })
      .eq("id", scheduleDraft.id)
      .is("first_scheduled_job_id", null)
      .select("id")

    setCreatingMaintenanceSchedule(false)

    if (quoteUpdateError) {
      setError(quoteUpdateError.message)
      return
    }

    if (!stamped || stamped.length === 0) {
      // Write-once guard matched nothing: a concurrent schedule linked this
      // quote first, and the job created above may be a duplicate.
      setError(
        "This quote was already linked to a scheduled job — the job just created may be a duplicate. Check the schedule before continuing."
      )
      return
    }

    // Sold→scheduled seam: scheduling advances the pipeline card itself
    // (quiet no-op when no lead is linked) — same as the schedule page.
    const advanceResult = await markJobScheduledForDraftAction(scheduleDraft.id)

    if ("error" in advanceResult) {
      console.error("[quote-builder] pipeline card advance failed", {
        quoteDraftId: scheduleDraft.id,
        message: advanceResult.error,
      })
    }

    setScheduleDraft(null)
    await loadQuoteDrafts()
    setMessage(
      quoteType === "maintenance"
        ? "Maintenance visit scheduled."
        : quoteType === "landscaping"
          ? "Landscaping job scheduled."
          : "One-off job scheduled."
    )
  }

  const markRecurringInvoiceSetUp = async (draft: QuoteDraftSummary) => {
    setMarkingRecurringInvoiceId(draft.id)
    setMessage(null)
    setError(null)

    const completedAt = new Date().toISOString()
    const { error: updateError } = await supabase
      .from("quote_drafts")
      .update({
        recurring_invoice_setup_status: "completed",
        recurring_invoice_setup_completed_at: completedAt,
        updated_at: completedAt,
      })
      .eq("id", draft.id)

    setMarkingRecurringInvoiceId(null)

    if (updateError) {
      setError(updateError.message)
      return
    }

    await loadQuoteDrafts()
    setMessage("Recurring invoice setup marked completed.")
  }

  const markFollowUpSent = async (
    draft: QuoteDraftSummary,
    stage: FollowUpStage
  ) => {
    setMarkingFollowUp(`${draft.id}-${stage}`)
    setMessage(null)
    setError(null)

    const field =
      stage === 3
        ? "followup_3day_sent_at"
        : stage === 7
          ? "followup_7day_sent_at"
          : "followup_14day_sent_at"
    const sentAt = new Date().toISOString()
    const { error: updateError } = await supabase
      .from("quote_drafts")
      .update({
        [field]: sentAt,
        updated_at: sentAt,
      })
      .eq("id", draft.id)

    setMarkingFollowUp(null)

    if (updateError) {
      setError(updateError.message)
      return
    }

    await loadQuoteDrafts()
    setMessage(`${stage}-day follow-up marked sent.`)
  }

  const updateAllowanceSize = (
    type: AllowanceType,
    size: "none" | "small" | "large"
  ) => {
    if (type === "sprays") {
      setSpraysSize(size)
      setSpraysPrice(allowancePriceDefaults.sprays[size])
      return
    }

    if (type === "fertiliser") {
      setFertiliserSize(size)
      setFertiliserPrice(allowancePriceDefaults.fertiliser[size])
      return
    }

    setStumpPasteSize(size)
    setStumpPastePrice(allowancePriceDefaults.stumpPaste[size])
  }

  const saveDraft = async () => {
    setMessage(null)
    setError(null)

    if (!selectedProperty && !selectedEstimate && !selectedLead && !newCustomerMode) {
      setError(
        "Select a property or estimate, or add a new customer, before saving the quote draft."
      )
      return
    }

    if (newCustomerMode && !newCustomerName.trim()) {
      setError("Enter the new customer's name before saving.")
      return
    }

    const customerName = newCustomerMode
      ? newCustomerName.trim()
      : selectedProperty?.client_name ||
        selectedEstimate?.customer_name ||
        selectedLead?.name

    if (!customerName) {
      setError("No customer name available for this quote draft.")
      return
    }

    if (!quoteTitle.trim()) {
      setError("Add a quote title before saving.")
      return
    }

    setSaving(true)

    // Brief 03: a new customer becomes a properties row before the draft is
    // inserted, so the draft (and the linked lead, below) carry property_id
    // from the start.
    let newPropertyId: string | null = null

    if (newCustomerMode) {
      const { data: newProperty, error: newPropertyError } =
        await createCustomerProperty(
          supabase,
          {
            client_name: newCustomerName.trim(),
            client_email: newCustomerEmail.trim() || null,
            phone: newCustomerPhone.trim() || null,
            address_line_1: newCustomerAddress.trim() || null,
            suburb: newCustomerSuburb.trim() || null,
          },
          {
            quote_type: quoteType,
            frequency: frequency || null,
            // Same gate as the quote save: only rates that actually priced
            // this quote flow onto the property — an ad-hoc maintenance
            // quote (no frequency) priced by manual line items must not
            // stamp the decorative panel defaults as the billing rate.
            labour_rate: hasMaintenancePricing ? labourRate : null,
            greenwaste_rate: hasMaintenancePricing ? greenwasteRate : null,
          }
        )

      if (newPropertyError || !newProperty) {
        setSaving(false)
        setError(newPropertyError?.message || "Could not create the new customer.")
        return
      }

      newPropertyId = newProperty.id
    }

    // Brief 04: every saved line carries its Xero identity from the
    // category (item_code / account_code / OUTPUT2 / position), so the
    // invoice view can emit it unchanged for quoted jobs.
    const withXeroFields = (item: LineItem, index: number) => {
      const category = getQuoteLineCategory(item.category)

      return {
        ...item,
        category: category.key,
        item_code: category.item_code,
        account_code: category.account_code,
        tax_type: QUOTE_LINE_TAX_TYPE,
        sort_order: index + 1,
      }
    }

    // The app maintains exactly one greenwaste-range sentence in the
    // maintenance line's description: strip any previous version, then
    // append the current one (or nothing when bags are 0). Joe's other
    // wording is never touched.
    const withGreenwasteRange = (description: string | undefined) => {
      const base = String(description || "")
        .replace(GREENWASTE_RANGE_PATTERN, "")
        .trimEnd()

      if (!greenwasteRange) return base

      const sentence = buildGreenwasteRangeSentence(greenwasteRange)

      return base ? `${base}\n\n${sentence}` : sentence
    }

    const lineItemsToSave = hasMaintenancePricing
      ? lineItems.map((item, index) => ({
          ...withXeroFields(item, index),
          quantity: index === 0 ? 1 : item.quantity,
          unit_price:
            index === 0 ? Number(perVisitPrice.toFixed(2)) : item.unit_price,
          line_total:
            index === 0
              ? Number(perVisitPrice.toFixed(2))
              : Number(item.quantity || 0) * Number(item.unit_price || 0),
          description:
            index === 0
              ? withGreenwasteRange(item.description)
              : item.description,
        }))
      : lineItems.map((item, index) => ({
          ...withXeroFields(item, index),
          line_total: Number(item.quantity || 0) * Number(item.unit_price || 0),
        }))

    const estimateNotesForDraft = selectedEstimate
      ? getEstimateDetailNotes(selectedEstimate)
      : ""
    const leadNotesForDraft =
      selectedLead && !selectedEstimate ? getLeadDetailNotes(selectedLead) : ""
    const internalNotesToSave = [
      internalNotes.trim() || null,
      selectedEstimate && estimateNotesForDraft
        ? `Estimate details:\n${estimateNotesForDraft}`
        : null,
      leadNotesForDraft ? `Lead details:\n${leadNotesForDraft}` : null,
    ]
      .filter(Boolean)
      .join("\n\n")
    const acceptToken = generateAcceptToken()

    const { data: savedDraft, error: saveError } = await supabase
      .from("quote_drafts")
      .insert({
      // A new customer's just-created property wins; otherwise a lead that
      // already knows its property (add-existing-customer) carries it onto
      // the draft — don't make the user re-pick a property we know.
      property_id:
        newPropertyId || selectedProperty?.id || selectedLead?.property_id || null,
      estimate_id: selectedEstimate?.id || null,
      scheduled_job_id: scheduledJobId || null,
      quote_template_id: templateId || null,
      customer_name: customerName,
      customer_email: newCustomerMode
        ? newCustomerEmail.trim() || null
        : selectedProperty?.client_email ||
          selectedEstimate?.customer_email ||
          selectedLead?.email ||
          null,
      quote_title: quoteTitle.trim(),
      quote_type: quoteType,
      customer_scope: customerScope.trim() || null,
      internal_notes: internalNotesToSave || null,
      terms_conditions: termsConditions.trim() || null,
      line_items: lineItemsToSave,
      subtotal,
      gst,
      total,
      // Status is app-driven (send + accept flows), never hand-set — the
      // builder only ever creates drafts.
      status: "draft",
      public_accept_token: acceptToken,
      frequency: frequency || null,
      labour_hours: hasMaintenancePricing ? labourHours : null,
      labour_rate: hasMaintenancePricing ? labourRate : null,
      greenwaste_bags: hasMaintenancePricing ? greenwasteBags : null,
      greenwaste_rate: hasMaintenancePricing ? greenwasteRate : null,
      sprays_size: hasMaintenancePricing ? spraysSize : null,
      sprays_price: hasMaintenancePricing ? spraysPrice : null,
      fertiliser_size: hasMaintenancePricing ? fertiliserSize : null,
      fertiliser_price: hasMaintenancePricing ? fertiliserPrice : null,
      stump_paste_size: hasMaintenancePricing ? stumpPasteSize : null,
      stump_paste_price: hasMaintenancePricing ? stumpPastePrice : null,
      per_visit_price: hasMaintenancePricing ? perVisitPrice : null,
      monthly_equivalent: hasMaintenancePricing ? monthlyEquivalent : null,
      updated_at: new Date().toISOString(),
    })
      .select("id")
      .single()

    // saving stays true until the estimate/lead link steps finish — a Save
    // button that re-enables mid-flight is how a lead ends up with two
    // drafts and only one linked.
    if (saveError) {
      setSaving(false)
      setError(saveError.message)
      return
    }

    if (selectedEstimate && savedDraft?.id) {
      const { error: estimateError } = await supabase
        .from("estimates")
        .update({
          quote_draft_id: savedDraft.id,
          estimate_status: "quote_created",
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedEstimate.id)

      if (estimateError) {
        setSaving(false)
        setError(estimateError.message)
        return
      }
    }

    // Phase 2: link the draft back to the pipeline lead (write-once — skips
    // when the lead already had a draft, or when this page already linked).
    let linkedThisSave = false

    if (
      selectedLead &&
      savedDraft?.id &&
      !selectedLead.quote_draft_id &&
      !leadLinkedDraftId
    ) {
      const linkResult = await linkQuoteDraftAction(selectedLead.id, savedDraft.id)

      if ("error" in linkResult) {
        // The draft itself saved — show it in the list so the failure can't
        // hide a real row.
        await loadQuoteDrafts()
        setSaving(false)
        setError(
          `Quote draft saved, but linking it to the pipeline lead failed: ${linkResult.error}`
        )
        return
      }

      setLeadLinkedDraftId(savedDraft.id)
      linkedThisSave = true
    }

    // Brief 03: a new customer created for a board lead also links the lead
    // to its property (the deferred conversion backfill, done at the source).
    if (selectedLead && newPropertyId) {
      const propertyLink = await setLeadPropertyAction(selectedLead.id, newPropertyId)

      if ("error" in propertyLink) {
        await loadQuoteDrafts()
        setSaving(false)
        setError(
          `Draft and customer saved, but the pipeline lead's property link failed: ${propertyLink.error}`
        )
        return
      }
    }

    await loadQuoteDrafts()
    setSaving(false)
    setMessage(
      newPropertyId && linkedThisSave
        ? "Quote draft saved, new customer created, and linked to the pipeline lead."
        : newPropertyId
          ? "Quote draft saved and new customer created."
          : linkedThisSave
            ? "Quote draft saved and linked to the pipeline lead."
            : "Quote draft saved."
    )
  }

  const renderFollowUpGroup = (
    title: string,
    drafts: QuoteDraftSummary[],
    emptyText: string
  ) => (
    <div className="rounded-lg border bg-white p-4">
      <h3 className="font-semibold">{title}</h3>
      {drafts.length > 0 ? (
        <div className="mt-3 space-y-3">
          {drafts.map((draft) => {
            const dueStages = getDueFollowUpStages(draft)
            const publicUrl = draft.public_accept_token
              ? getPublicQuoteUrl(draft.public_accept_token)
              : null

            return (
              <div key={draft.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-gray-900">
                      {draft.customer_name}
                    </div>
                    <div className="text-sm text-gray-600">
                      {draft.quote_title}
                    </div>
                  </div>
                  <div className="text-right text-sm font-medium">
                    {money(Number(draft.total || 0))}
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                  <span>Sent {formatDate(draft.quote_sent_at || null)}</span>
                  <span>{getDaysSince(draft.quote_sent_at)} days since sent</span>
                  <span>{getFollowUpStageLabel(draft)}</span>
                  {publicUrl && (
                    <a
                      href={publicUrl}
                      className="text-blue-700 hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Proposal link
                    </a>
                  )}
                </div>

                {dueStages.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {dueStages.map((stage) => (
                      <button
                        key={stage}
                        type="button"
                        onClick={() => markFollowUpSent(draft, stage)}
                        disabled={markingFollowUp === `${draft.id}-${stage}`}
                        className="h-9 rounded-md bg-blue-600 px-3 text-xs font-medium text-white disabled:bg-gray-300"
                      >
                        {markingFollowUp === `${draft.id}-${stage}`
                          ? "Marking..."
                          : `Mark ${stage}-day Follow-Up Sent`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-dashed p-3 text-sm text-gray-500">
          {emptyText}
        </div>
      )}
    </div>
  )

  return (
    <div className="mx-auto max-w-7xl p-4 pb-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Quote Builder</h1>
        <p className="text-sm text-gray-500">
          Create a quote for a new customer, or pick an existing property.
        </p>
      </header>

      {queryErrors.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {queryErrors.map((queryError) => (
            <div key={queryError}>{queryError}</div>
          ))}
        </div>
      )}

      {selectedLead && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <div className="font-medium">
            Creating quote for pipeline lead: {selectedLead.name}
            {selectedLead.suburb ? ` — ${selectedLead.suburb}` : ""}
          </div>
          {selectedLead.service_needed && (
            <div className="mt-1">{selectedLead.service_needed}</div>
          )}
          <div className="mt-1 text-xs text-green-800">
            {selectedLead.quote_draft_id || leadLinkedDraftId
              ? "This lead already has a linked quote draft — saving another will NOT relink it."
              : "Saving the draft links it back to this lead on the pipeline board automatically."}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            {/* New-customer entry leads; existing-customer selects are the
                collapse option — the reverse would bury the predominant use. */}
            <div className="md:col-span-2">
              {newCustomerMode ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-emerald-900">
                      New customer
                    </span>
                    <button
                      type="button"
                      onClick={() => setNewCustomerMode(false)}
                      className="text-xs text-emerald-800 underline"
                    >
                      Choose existing customer instead
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-emerald-800">
                    Saving the draft creates this customer as a property and
                    links everything up.
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <input
                      className="h-11 w-full rounded-md border px-3"
                      placeholder="Customer name (required)"
                      value={newCustomerName}
                      onChange={(event) => setNewCustomerName(event.target.value)}
                    />
                    <input
                      className="h-11 w-full rounded-md border px-3"
                      placeholder="Email"
                      value={newCustomerEmail}
                      onChange={(event) => setNewCustomerEmail(event.target.value)}
                    />
                    <input
                      className="h-11 w-full rounded-md border px-3"
                      placeholder="Phone"
                      value={newCustomerPhone}
                      onChange={(event) => setNewCustomerPhone(event.target.value)}
                    />
                    <input
                      className="h-11 w-full rounded-md border px-3"
                      placeholder="Suburb"
                      value={newCustomerSuburb}
                      onChange={(event) => setNewCustomerSuburb(event.target.value)}
                    />
                    <input
                      className="h-11 w-full rounded-md border px-3 md:col-span-2"
                      placeholder="Street address"
                      value={newCustomerAddress}
                      onChange={(event) => setNewCustomerAddress(event.target.value)}
                    />
                  </div>
                </div>
              ) : // A lead that already has a property must not grow a second
              // one — the draft and the lead would then disagree about
              // which property is the customer's.
              selectedLead?.property_id ? null : (
                <button
                  type="button"
                  onClick={enableNewCustomerMode}
                  className="text-sm font-medium text-emerald-700 underline hover:text-emerald-900"
                >
                  + New customer (not in the list)
                </button>
              )}
            </div>

            {!newCustomerMode && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Existing Property
                  </label>
                  <select
                    className="h-11 w-full rounded-md border px-3"
                    value={propertyId}
                    onChange={(event) => handlePropertyChange(event.target.value)}
                  >
                    <option value="">Select property</option>
                    {properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {getPropertyLabel(property)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Estimate
                  </label>
                  <select
                    className="h-11 w-full rounded-md border px-3"
                    value={estimateId}
                    onChange={(event) => handleEstimateChange(event.target.value)}
                  >
                    <option value="">Select estimate</option>
                    {estimates.map((estimate) => (
                      <option key={estimate.id} value={estimate.id}>
                        {getEstimateLabel(estimate)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Scheduled Job
                  </label>
                  <select
                    className="h-11 w-full rounded-md border px-3"
                    value={scheduledJobId}
                    onChange={(event) => handleJobChange(event.target.value)}
                    disabled={!propertyId}
                  >
                    <option value="">No linked job</option>
                    {jobsForProperty.map((job) => (
                      <option key={job.id} value={job.id}>
                        {job.scheduled_date || "No date"} - {job.job_type || "job"}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {selectedEstimate && (
              <div className="rounded-md border bg-indigo-50 p-3 text-sm text-indigo-900 md:col-span-2">
                <div className="font-medium">{selectedEstimate.customer_name}</div>
                <div className="mt-1 text-indigo-800">
                  {[selectedEstimate.address_line_1, selectedEstimate.suburb]
                    .filter(Boolean)
                    .join(", ") || "No address"}
                </div>
                <div className="mt-1 text-xs text-indigo-700">
                  {selectedEstimate.customer_email || "No email"}
                  {selectedEstimate.customer_phone
                    ? ` · ${selectedEstimate.customer_phone}`
                    : ""}
                  {selectedEstimate.estimate_date
                    ? ` · Estimate ${selectedEstimate.estimate_date}`
                    : ""}
                </div>
                {selectedEstimate.estimate_notes && (
                  <div className="mt-2 whitespace-pre-wrap text-xs text-indigo-800">
                    {selectedEstimate.estimate_notes}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium">
                Quote Template
              </label>
              <select
                className="h-11 w-full rounded-md border px-3"
                value={templateId}
                onChange={(event) => handleTemplateChange(event.target.value)}
              >
                <option value="">No template</option>
                {/* Slice 2: only templates for the selected type — a
                    maintenance template has no business on a one-off. */}
                {templates
                  .filter(
                    (template) =>
                      getQuoteTypeFromTemplate(template) === quoteType
                  )
                  .map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                      {template.category ? ` - ${template.category}` : ""}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                Quote Type
              </label>
              <select
                className="h-11 w-full rounded-md border px-3"
                value={quoteType}
                onChange={(event) =>
                  handleQuoteTypeChange(event.target.value as QuoteType)
                }
              >
                {quoteTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium">
                Quote Title
              </label>
              <input
                className="h-11 w-full rounded-md border px-3"
                value={quoteTitle}
                onChange={(event) => setQuoteTitle(event.target.value)}
                placeholder="e.g. Garden tidy and planting quote"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium">
                Customer-Facing Scope
              </label>
              <textarea
                className="min-h-[150px] w-full rounded-md border p-3"
                value={customerScope}
                onChange={(event) => {
                  setCustomerScope(event.target.value)
                  setCustomerScopeEdited(true)
                }}
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium">
                Internal Notes
              </label>
              <textarea
                className="min-h-[100px] w-full rounded-md border p-3"
                value={internalNotes}
                onChange={(event) => {
                  setInternalNotes(event.target.value)
                  setInternalNotesEdited(true)
                }}
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium">
                Terms & Conditions
              </label>
              <textarea
                className="min-h-[100px] w-full rounded-md border p-3"
                value={termsConditions}
                onChange={(event) => {
                  setTermsConditions(event.target.value)
                  setTermsEdited(true)
                }}
              />
            </div>
          </div>

          {/* Service-aware slice 1: the recurring pricing machinery is a
              maintenance concept — one-off and landscaping quotes price off
              line items and never see this block. */}
          {quoteType === "maintenance" && (
          <div className="mt-6 rounded-lg border bg-gray-50 p-4">
            <div className="mb-3">
              <h2 className="text-lg font-semibold">
                Internal Pricing Assumptions
              </h2>
              <p className="text-sm text-gray-500">
                These inputs calculate the maintenance price and are not customer-facing unless written into the line item wording.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Frequency
                </label>
                <select
                  className="h-10 w-full rounded-md border bg-white px-3"
                  value={frequency}
                  onChange={(event) => setFrequency(event.target.value)}
                >
                  {frequencyOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Labour Hours
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="h-10 w-full rounded-md border bg-white px-3"
                  value={labourHours}
                  onChange={(event) => setLabourHours(parseDecimalInput(event.target.value))}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Labour Rate
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="h-10 w-full rounded-md border bg-white px-3"
                  value={labourRate}
                  onChange={(event) => setLabourRate(parseDecimalInput(event.target.value))}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Greenwaste Bags
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="h-10 w-full rounded-md border bg-white px-3"
                  value={greenwasteBags}
                  onChange={(event) => setGreenwasteBags(parseDecimalInput(event.target.value))}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Greenwaste Rate
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="h-10 w-full rounded-md border bg-white px-3"
                  value={greenwasteRate}
                  onChange={(event) => setGreenwasteRate(parseDecimalInput(event.target.value))}
                />
              </div>

              {greenwasteRange && (
                <div className="md:col-span-3 rounded-md bg-white px-3 py-2 text-xs text-gray-600">
                  Greenwaste ≈ {money(greenwasteRange.average)} per visit on
                  average. Saving adds the range line to the quote wording:
                  may fluctuate between {money(greenwasteRange.min)} and{" "}
                  {money(greenwasteRange.max)}.
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-md border bg-white p-3">
                <label className="mb-1 block text-sm font-medium">
                  Sprays / Extras
                </label>
                <select
                  className="h-10 w-full rounded-md border px-3"
                  value={spraysSize}
                  onChange={(event) =>
                    updateAllowanceSize(
                      "sprays",
                      event.target.value as "none" | "small" | "large"
                    )
                  }
                >
                  <option value="none">None</option>
                  <option value="small">Small</option>
                  <option value="large">Large</option>
                </select>
                <input
                  type="text"
                  inputMode="decimal"
                  className="mt-2 h-10 w-full rounded-md border px-3"
                  value={spraysPrice}
                  onChange={(event) => setSpraysPrice(parseDecimalInput(event.target.value))}
                />
              </div>

              <div className="rounded-md border bg-white p-3">
                <label className="mb-1 block text-sm font-medium">
                  Fertiliser
                </label>
                <select
                  className="h-10 w-full rounded-md border px-3"
                  value={fertiliserSize}
                  onChange={(event) =>
                    updateAllowanceSize(
                      "fertiliser",
                      event.target.value as "none" | "small" | "large"
                    )
                  }
                >
                  <option value="none">None</option>
                  <option value="small">Small</option>
                  <option value="large">Large</option>
                </select>
                <input
                  type="text"
                  inputMode="decimal"
                  className="mt-2 h-10 w-full rounded-md border px-3"
                  value={fertiliserPrice}
                  onChange={(event) => setFertiliserPrice(parseDecimalInput(event.target.value))}
                />
              </div>

              <div className="rounded-md border bg-white p-3">
                <label className="mb-1 block text-sm font-medium">
                  Stump Paste
                </label>
                <select
                  className="h-10 w-full rounded-md border px-3"
                  value={stumpPasteSize}
                  onChange={(event) =>
                    updateAllowanceSize(
                      "stumpPaste",
                      event.target.value as "none" | "small" | "large"
                    )
                  }
                >
                  <option value="none">None</option>
                  <option value="small">Small</option>
                  <option value="large">Large</option>
                </select>
                <input
                  type="text"
                  inputMode="decimal"
                  className="mt-2 h-10 w-full rounded-md border px-3"
                  value={stumpPastePrice}
                  onChange={(event) => setStumpPastePrice(parseDecimalInput(event.target.value))}
                />
              </div>
            </div>
          </div>
          )}

          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Line Items</h2>
              <button
                type="button"
                onClick={addLineItem}
                className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-gray-50"
              >
                Add Item
              </button>
            </div>

            <div className="space-y-3">
              {lineItems.map((item, index) => {
                const lineTotal =
                  Number(item.quantity || 0) * Number(item.unit_price || 0)

                return (
                  <div
                    key={index}
                    className="grid gap-3 rounded-lg border p-3 md:grid-cols-[150px_1fr_90px_120px_110px_auto]"
                  >
                    <select
                      className="h-10 rounded-md border bg-white px-2 text-sm"
                      value={item.category}
                      onChange={(event) =>
                        updateLineItem(index, "category", event.target.value)
                      }
                    >
                      {QUOTE_LINE_CATEGORIES.map((category) => (
                        <option key={category.key} value={category.key}>
                          {category.label}
                        </option>
                      ))}
                    </select>

                    {/* Prose lives in the description (Brief 04) — the
                        proposal renders it with paragraphs preserved, so
                        writing it needs more than one line too. */}
                    <textarea
                      className="min-h-[40px] rounded-md border px-3 py-2"
                      rows={Math.min(
                        8,
                        Math.max(1, item.description.split("\n").length)
                      )}
                      value={item.description}
                      onChange={(event) =>
                        updateLineItem(index, "description", event.target.value)
                      }
                      placeholder="Description — scope prose goes here and shows on the proposal"
                    />

                    <input
                      type="number"
                      step="0.01"
                      className="h-10 rounded-md border px-3"
                      value={item.quantity}
                      onChange={(event) =>
                        updateLineItem(index, "quantity", event.target.value)
                      }
                    />

                    <input
                      type="number"
                      step="0.01"
                      className="h-10 rounded-md border px-3"
                      value={item.unit_price}
                      onChange={(event) =>
                        updateLineItem(index, "unit_price", event.target.value)
                      }
                    />

                    <div className="flex h-10 items-center rounded-md bg-gray-50 px-3 text-sm font-medium">
                      {money(lineTotal)}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeLineItem(index)}
                      className="h-10 rounded-md border px-3 text-sm text-red-600 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <aside className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Quote Summary</h2>

          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Customer</span>
              <span className="font-medium">
                {selectedCustomerName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Quote Type</span>
              <span className="font-medium">{getQuoteTypeLabel(quoteType)}</span>
            </div>
            {selectedCustomerEmail && (
              <div className="flex justify-between">
                <span className="text-gray-500">Email</span>
                <span className="font-medium">{selectedCustomerEmail}</span>
              </div>
            )}
            {hasMaintenancePricing && (
              <div className="flex justify-between rounded-md bg-blue-50 px-3 py-2">
                <span className="text-blue-700">Price Per Visit</span>
                <span className="font-semibold text-blue-900">
                  {money(perVisitPrice)}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal excl. GST</span>
              <span className="font-medium">{money(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">GST Included</span>
              <span className="font-medium">{money(gst)}</span>
            </div>
            <div className="border-t pt-3">
              <div className="flex justify-between text-lg font-semibold">
                <span>Total incl. GST</span>
                <span>{money(total)}</span>
              </div>
            </div>
          </div>

          {hasMaintenancePricing && (
            <div className="mt-5 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
              Maintenance is priced per visit — the frequency is when visits
              happen, not a divisor. Each visit invoices on actual hours and
              greenwaste.
            </div>
          )}

          {message && (
            <div className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-700">
              {message}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={saveDraft}
            disabled={saving}
            className="mt-5 h-11 w-full rounded-md bg-blue-600 font-medium text-white disabled:bg-gray-300"
          >
            {saving ? "Saving..." : "Save Draft"}
          </button>

          {/* Brief 03 (owner decision): the disabled "Create Xero Quote"
              button is gone — quotes originate in the app, invoicing stays
              in Xero. Saved drafts are previewed and sent from the Recent
              Quote Drafts list below. */}
        </aside>
      </div>

      <section className="mt-8 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Quote Operations</h2>
        <p className="mb-4 text-sm text-gray-500">
          Accepted quote actions still required before work is fully onboarded.
        </p>

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <a
            href="#quote-ops-conversion"
            className="rounded-lg border bg-gray-50 p-4 hover:bg-gray-100"
          >
            <div className="text-xs font-medium uppercase text-gray-500">
              Awaiting Conversion
            </div>
            <div className="mt-2 text-2xl font-semibold">
              {awaitingConversionDrafts.length}
            </div>
          </a>
          <a
            href="#quote-ops-schedule"
            className="rounded-lg border bg-gray-50 p-4 hover:bg-gray-100"
          >
            <div className="text-xs font-medium uppercase text-gray-500">
              Awaiting Schedule
            </div>
            <div className="mt-2 text-2xl font-semibold">
              {awaitingScheduleDrafts.length}
            </div>
          </a>
          <a
            href="#quote-ops-invoices"
            className="rounded-lg border bg-gray-50 p-4 hover:bg-gray-100"
          >
            <div className="text-xs font-medium uppercase text-gray-500">
              Awaiting Invoice Setup
            </div>
            <div className="mt-2 text-2xl font-semibold">
              {awaitingRecurringInvoiceDrafts.length}
            </div>
          </a>
        </div>

        <div className="space-y-5">
          <div id="quote-ops-conversion" className="rounded-lg border p-4">
            <h3 className="font-semibold">
              Accepted Quotes Awaiting Property Conversion
            </h3>
            {awaitingConversionDrafts.length > 0 ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-gray-500">
                    <tr>
                      <th className="py-2 pr-3">Customer</th>
                      <th className="py-2 pr-3">Quote Title</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3">Accepted Date</th>
                      <th className="py-2 pr-3 text-right">Total</th>
                      <th className="py-2 pl-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {awaitingConversionDrafts.map((draft) => (
                      <tr key={draft.id} className="border-t">
                        <td className="py-3 pr-3 font-medium">
                          {draft.customer_name}
                        </td>
                        <td className="py-3 pr-3">{draft.quote_title}</td>
                        <td className="py-3 pr-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getQuoteTypeBadgeClasses(
                              draft.quote_type
                            )}`}
                          >
                            {getQuoteTypeLabel(draft.quote_type)}
                          </span>
                        </td>
                        <td className="py-3 pr-3">
                          {formatDate(draft.quote_accepted_at || null)}
                        </td>
                        <td className="py-3 pr-3 text-right">
                          {money(Number(draft.total || 0))}
                        </td>
                        <td className="py-3 pl-3 text-right">
                          <button
                            type="button"
                            onClick={() => convertAcceptedQuoteToProperty(draft)}
                            disabled={convertingQuoteId === draft.id}
                            className="h-9 rounded-md bg-emerald-700 px-3 text-xs font-medium text-white disabled:bg-gray-300"
                          >
                            {convertingQuoteId === draft.id
                              ? "Converting..."
                              : "Convert to Property"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-3 rounded-md border border-dashed p-3 text-sm text-gray-500">
                No accepted quotes are awaiting property conversion.
              </div>
            )}
          </div>

          <div id="quote-ops-schedule" className="rounded-lg border p-4">
            <h3 className="font-semibold">
              Accepted Quotes Awaiting First Schedule
            </h3>
            {awaitingScheduleDrafts.length > 0 ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-gray-500">
                    <tr>
                      <th className="py-2 pr-3">Customer</th>
                      <th className="py-2 pr-3">Property</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3">Frequency</th>
                      <th className="py-2 pr-3">Accepted Date</th>
                      <th className="py-2 pl-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {awaitingScheduleDrafts.map((draft) => (
                      <tr key={draft.id} className="border-t">
                        <td className="py-3 pr-3 font-medium">
                          {draft.customer_name}
                        </td>
                        <td className="py-3 pr-3">
                          {getPropertyDisplay(draft.property_id)}
                        </td>
                        <td className="py-3 pr-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getQuoteTypeBadgeClasses(
                              draft.quote_type
                            )}`}
                          >
                            {getQuoteTypeLabel(draft.quote_type)}
                          </span>
                        </td>
                        <td className="py-3 pr-3">
                          {getQuoteFrequencyLabel(draft.frequency)}
                        </td>
                        <td className="py-3 pr-3">
                          {formatDate(draft.quote_accepted_at || null)}
                        </td>
                        <td className="py-3 pl-3 text-right">
                          <button
                            type="button"
                            onClick={() => openMaintenanceScheduleForm(draft)}
                            className="h-9 rounded-md bg-emerald-700 px-3 text-xs font-medium text-white"
                          >
                            {getScheduleActionLabel(draft.quote_type)}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-3 rounded-md border border-dashed p-3 text-sm text-gray-500">
                No accepted quotes are awaiting first schedule.
              </div>
            )}
          </div>

          <div id="quote-ops-invoices" className="rounded-lg border p-4">
            <h3 className="font-semibold">
              Accepted Quotes Awaiting Recurring Invoice Setup
            </h3>
            {awaitingRecurringInvoiceDrafts.length > 0 ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-gray-500">
                    <tr>
                      <th className="py-2 pr-3">Customer</th>
                      <th className="py-2 pr-3">Property</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3">Frequency</th>
                      <th className="py-2 pr-3 text-right">Monthly Equivalent</th>
                      <th className="py-2 pr-3">Invoice Setup Status</th>
                      <th className="py-2 pl-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {awaitingRecurringInvoiceDrafts.map((draft) => (
                      <tr key={draft.id} className="border-t">
                        <td className="py-3 pr-3 font-medium">
                          {draft.customer_name}
                        </td>
                        <td className="py-3 pr-3">
                          {getPropertyDisplay(draft.property_id)}
                        </td>
                        <td className="py-3 pr-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getQuoteTypeBadgeClasses(
                              draft.quote_type
                            )}`}
                          >
                            {getQuoteTypeLabel(draft.quote_type)}
                          </span>
                        </td>
                        <td className="py-3 pr-3">
                          {getQuoteFrequencyLabel(draft.frequency)}
                        </td>
                        <td className="py-3 pr-3 text-right">
                          {money(Number(draft.monthly_equivalent || 0))}
                        </td>
                        <td className="py-3 pr-3 capitalize">
                          {draft.recurring_invoice_setup_status || "required"}
                        </td>
                        <td className="py-3 pl-3 text-right">
                          <button
                            type="button"
                            onClick={() => markRecurringInvoiceSetUp(draft)}
                            disabled={markingRecurringInvoiceId === draft.id}
                            className="h-9 rounded-md bg-amber-600 px-3 text-xs font-medium text-white disabled:bg-gray-300"
                          >
                            {markingRecurringInvoiceId === draft.id
                              ? "Marking..."
                              : "Mark Complete"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-3 rounded-md border border-dashed p-3 text-sm text-gray-500">
                No accepted quotes are awaiting recurring invoice setup.
              </div>
            )}
          </div>

          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <h3 className="font-semibold text-green-900">Completed</h3>
            {completedOperationsDrafts.length > 0 ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-green-800">
                    <tr>
                      <th className="py-2 pr-3">Customer</th>
                      <th className="py-2 pr-3">Property</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3">Accepted Date</th>
                      <th className="py-2 pr-3">Quote Number</th>
                      <th className="py-2 pr-3">Frequency</th>
                      <th className="py-2 pr-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedOperationsDrafts.map((draft) => (
                      <tr key={draft.id} className="border-t border-green-200">
                        <td className="py-3 pr-3 font-medium">
                          {draft.customer_name}
                        </td>
                        <td className="py-3 pr-3">
                          {getPropertyDisplay(draft.property_id)}
                        </td>
                        <td className="py-3 pr-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getQuoteTypeBadgeClasses(
                              draft.quote_type
                            )}`}
                          >
                            {getQuoteTypeLabel(draft.quote_type)}
                          </span>
                        </td>
                        <td className="py-3 pr-3">
                          {formatDate(draft.quote_accepted_at || null)}
                        </td>
                        <td className="py-3 pr-3">
                          {draft.xero_quote_number || "No quote number"}
                        </td>
                        <td className="py-3 pr-3">
                          {getQuoteFrequencyLabel(draft.frequency)}
                        </td>
                        <td className="py-3 pr-3 text-right">
                          {money(Number(draft.total || 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-3 rounded-md border border-dashed border-green-300 p-3 text-sm text-green-800">
                No accepted quotes have completed all operations yet.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-xl border bg-gray-50 p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Follow-Ups</h2>
        <p className="mb-4 text-sm text-gray-500">
          Track quotes that have been sent but not accepted or declined.
        </p>

        <div className="grid gap-4 lg:grid-cols-3">
          {renderFollowUpGroup(
            "Due now",
            dueFollowUps,
            "No follow-ups are due right now."
          )}
          {renderFollowUpGroup(
            "Upcoming",
            upcomingFollowUps,
            "No upcoming follow-ups."
          )}
          {renderFollowUpGroup(
            "Completed",
            completedFollowUps,
            "No completed follow-up sequences."
          )}
        </div>
      </section>

      <section className="mt-8 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Recent Quote Drafts</h2>
        <p className="mb-4 text-sm text-gray-500">
          Preview each quote exactly as the customer sees it, then send it
          from here — Make.com delivers the email.
        </p>

        {quoteDrafts.length > 0 ? (
          <div className="space-y-3">
            {quoteDrafts.map((draft) => {
              const linkedEstimate = estimates.find(
                (estimate) => estimate.id === draft.estimate_id
              )
              const convertedPropertyId =
                linkedEstimate?.converted_property_id || draft.property_id
              // Brief 03: estimate no longer required — lead-linked (and even
              // bare) drafts convert from their own details.
              const canConvertToProperty =
                draft.status === "accepted" && !convertedPropertyId
              const canCreateSchedule =
                draft.status === "accepted" &&
                Boolean(draft.property_id) &&
                !draft.first_scheduled_job_id
              const recurringInvoiceRequired =
                Boolean(draft.recurring_invoice_required) &&
                draft.recurring_invoice_setup_status !== "completed"
              const canSendProposal =
                (draft.status === "xero_created" ||
                  draft.status === "draft" ||
                  draft.status === "ready_for_xero") &&
                Boolean(draft.public_accept_token) &&
                !draft.quote_sent_at &&
                draft.proposal_status !== "ready_to_send" &&
                draft.proposal_status !== "sent"

              return (
                <div
                  key={draft.id}
                  className="grid gap-3 rounded-lg border p-4 xl:grid-cols-[1.3fr_1fr_1fr_1fr_0.8fr_auto]"
                >
                <div className="min-w-0">
                  <div className="text-xs font-medium uppercase text-gray-500">
                    Customer
                  </div>
                  <div className="mt-1 font-semibold text-gray-900">
                    {draft.customer_name}
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm text-gray-600">
                    {draft.quote_title}
                  </div>
                  <div
                    className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-medium ${getQuoteTypeBadgeClasses(
                      draft.quote_type
                    )}`}
                  >
                    {getQuoteTypeLabel(draft.quote_type)}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium uppercase text-gray-500">
                    App Status
                  </div>
                  <span
                    className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-medium ${getQuoteStatusClasses(
                      draft.status
                    )}`}
                  >
                    {getQuoteStatusLabel(draft.status)}
                  </span>
                </div>

                <div>
                  <div className="text-xs font-medium uppercase text-gray-500">
                    Xero Status
                  </div>
                  <span
                    className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-medium ${getXeroQuoteStatusClasses(
                      draft.xero_quote_status
                    )}`}
                  >
                    {getXeroQuoteStatusLabel(draft.xero_quote_status)}
                  </span>
                  {draft.xero_quote_error && (
                    <div className="mt-1 text-xs text-red-600">
                      {draft.xero_quote_error}
                    </div>
                  )}
                  <div className="mt-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getProposalStatusClasses(
                        draft.proposal_status
                      )}`}
                    >
                      {getProposalStatusLabel(draft.proposal_status)}
                    </span>
                  </div>
                  {draft.proposal_status === "ready_to_send" && (
                    <div className="mt-1 text-xs text-amber-700">
                      Waiting for Make.com to send proposal.
                    </div>
                  )}
                  {draft.proposal_status === "error" && (
                    <div className="mt-1 text-xs text-red-600">
                      {draft.proposal_send_error || "Proposal send failed."}
                    </div>
                  )}
                  {draft.status === "accepted" && !convertedPropertyId && (
                    <div className="mt-2 rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-800">
                      Ready to Convert to Property
                    </div>
                  )}
                  {draft.status === "accepted" &&
                    convertedPropertyId &&
                    !draft.first_scheduled_job_id && (
                      <div className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                        Needs scheduling
                      </div>
                    )}
                  {convertedPropertyId && (
                    <a
                      href="/admin/properties"
                      className="mt-2 block rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 hover:underline"
                    >
                      Converted property: {convertedPropertyId}
                    </a>
                  )}
                  {draft.first_scheduled_job_id && (
                    <a
                      href={`/jobs/${draft.first_scheduled_job_id}`}
                      className="mt-2 block rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-800 hover:underline"
                    >
                      Scheduled
                    </a>
                  )}
                  {recurringInvoiceRequired && (
                    <div className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                      Recurring Invoice Required
                    </div>
                  )}
                  {draft.recurring_invoice_setup_status === "completed" && (
                    <div className="mt-2 rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-800">
                      Recurring Invoice Set Up
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-xs font-medium uppercase text-gray-500">
                    Xero Quote Number
                  </div>
                  <div className="mt-1 text-sm font-medium text-gray-900">
                    {draft.xero_quote_number || "Not created"}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium uppercase text-gray-500">
                    Total
                  </div>
                  <div className="mt-1 text-sm font-medium text-gray-900">
                    {money(Number(draft.total || 0))}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {formatDate(draft.created_at)}
                  </div>
                </div>

                <div className="flex flex-col gap-2 xl:items-end">
                  {/* A plain link when the token exists (always, for saved
                      drafts) — immune to pop-up blockers. The button fallback
                      backfills a token for any legacy draft missing one. */}
                  {draft.public_accept_token ? (
                    <a
                      href={`/public/quote/${draft.public_accept_token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-10 items-center justify-center rounded-md border px-3 text-sm font-medium hover:bg-gray-50"
                    >
                      Preview
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => previewProposal(draft)}
                      className="h-10 rounded-md border px-3 text-sm font-medium hover:bg-gray-50"
                    >
                      Preview
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => copyProposalLink(draft)}
                    disabled={copyingQuoteId === draft.id}
                    className="h-10 rounded-md border px-3 text-sm font-medium hover:bg-gray-50 disabled:bg-gray-100"
                  >
                    {copyingQuoteId === draft.id
                      ? "Copying..."
                      : "Copy Proposal Link"}
                  </button>

                  <button
                    type="button"
                    onClick={() => openPhotosModal(draft)}
                    className="h-10 rounded-md border px-3 text-sm font-medium hover:bg-gray-50"
                  >
                    Photos
                  </button>

                  <button
                    type="button"
                    onClick={() => copyQuoteDetails(draft)}
                    className="h-10 rounded-md border px-3 text-sm font-medium hover:bg-gray-50"
                  >
                    Copy Quote Details
                  </button>

                  {/* Brief 03 (owner decision): Create Xero Quote is hidden —
                      quotes originate in the app now. prepareXeroQuote stays
                      in the code in case it's ever wanted back. */}
                  {draft.status !== "draft" && (
                    <span className="text-xs text-gray-500">
                      {getQuoteStatusLabel(draft.status)}
                    </span>
                  )}

                  {draft.status !== "accepted" && (
                    <button
                      type="button"
                      onClick={() => markAcceptedManually(draft)}
                      disabled={manualAcceptingQuoteId === draft.id}
                      className="h-10 rounded-md bg-green-600 px-3 text-sm font-medium text-white disabled:bg-gray-300"
                    >
                      {manualAcceptingQuoteId === draft.id
                        ? "Marking..."
                        : "Mark Accepted Manually"}
                    </button>
                  )}

                  {canConvertToProperty && (
                    <button
                      type="button"
                      onClick={() => convertAcceptedQuoteToProperty(draft)}
                      disabled={convertingQuoteId === draft.id}
                      className="h-10 rounded-md bg-emerald-700 px-3 text-sm font-medium text-white disabled:bg-gray-300"
                    >
                      {convertingQuoteId === draft.id
                        ? "Converting..."
                        : "Convert to Property"}
                    </button>
                  )}

                  {canCreateSchedule && (
                    <button
                      type="button"
                      onClick={() => openMaintenanceScheduleForm(draft)}
                      className="h-10 rounded-md bg-emerald-700 px-3 text-sm font-medium text-white"
                    >
                      {getScheduleActionLabel(draft.quote_type)}
                    </button>
                  )}

                  {recurringInvoiceRequired && (
                    <button
                      type="button"
                      onClick={() => markRecurringInvoiceSetUp(draft)}
                      disabled={markingRecurringInvoiceId === draft.id}
                      className="h-10 rounded-md bg-amber-600 px-3 text-sm font-medium text-white disabled:bg-gray-300"
                    >
                      {markingRecurringInvoiceId === draft.id
                        ? "Marking..."
                        : "Mark Recurring Invoice Set Up"}
                    </button>
                  )}

                  {canSendProposal && (
                    <button
                      type="button"
                      onClick={() => openSendProposalModal(draft)}
                      className="h-10 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white"
                    >
                      Send Proposal
                    </button>
                  )}
                  {draft.proposal_status === "ready_to_send" &&
                    !draft.quote_sent_at && (
                      <div className="max-w-[190px] rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 xl:text-right">
                        Queued — Make.com sends it on its next run.
                      </div>
                    )}
                  {draft.proposal_status === "error" && (
                    <div className="max-w-[190px] text-xs text-red-600 xl:text-right">
                      Send failed
                      {draft.proposal_send_error
                        ? `: ${draft.proposal_send_error}`
                        : ""}{" "}
                      — use Send Proposal to try again.
                    </div>
                  )}
                  {draft.quote_sent_at && (
                    <div className="text-xs font-medium text-green-700">
                      Proposal sent {formatDate(draft.quote_sent_at)}
                    </div>
                  )}
                </div>
              </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-sm text-gray-500">
            No quote drafts yet.
          </div>
        )}
      </section>

      {scheduleDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-xl font-semibold">
              {getScheduleActionLabel(scheduleDraft.quote_type)}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Create the first scheduled{" "}
              {getNormalisedQuoteType(scheduleDraft.quote_type) === "maintenance"
                ? "maintenance visit"
                : getNormalisedQuoteType(scheduleDraft.quote_type) === "landscaping"
                  ? "landscaping job"
                  : "one-off job"}{" "}
              for {scheduleDraft.customer_name}.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  First Visit Date
                </label>
                <input
                  type="date"
                  className="h-11 w-full rounded-md border px-3"
                  value={firstVisitDate}
                  onChange={(event) => setFirstVisitDate(event.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Start Time
                </label>
                <input
                  type="time"
                  className="h-11 w-full rounded-md border px-3"
                  value={firstVisitStartTime}
                  onChange={(event) =>
                    setFirstVisitStartTime(event.target.value)
                  }
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Assigned Staff
                </label>
                <select
                  className="h-11 w-full rounded-md border px-3"
                  value={firstVisitStaffId}
                  onChange={(event) => setFirstVisitStaffId(event.target.value)}
                >
                  <option value="">Select staff</option>
                  {staff.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Estimated Duration Hours
                </label>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  className="h-11 w-full rounded-md border px-3"
                  value={firstVisitDuration}
                  onChange={(event) =>
                    setFirstVisitDuration(event.target.value)
                  }
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Job Notes
                </label>
                <textarea
                  className="min-h-[120px] w-full rounded-md border p-3"
                  value={firstVisitNotes}
                  onChange={(event) => setFirstVisitNotes(event.target.value)}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setScheduleDraft(null)}
                  disabled={creatingMaintenanceSchedule}
                  className="h-11 flex-1 rounded-md border"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={createAcceptedQuoteSchedule}
                  disabled={creatingMaintenanceSchedule}
                  className="h-11 flex-1 rounded-md bg-emerald-700 font-medium text-white disabled:bg-gray-300"
                >
                  {creatingMaintenanceSchedule
                    ? "Creating..."
                    : getScheduleActionLabel(scheduleDraft.quote_type)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {photosDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-xl font-semibold">
              Photos — {photosDraft.quote_title}
            </h2>

            <div className="mt-4">
              <div className="text-sm font-medium">Hero image</div>
              <p className="text-xs text-gray-500">
                Shown at the top of the proposal. Leave empty to use the
                standard garden photo.
              </p>
              {heroImageUrl ? (
                <div className="mt-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={heroImageUrl}
                    alt="Proposal hero"
                    className="h-36 w-full rounded-md object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setHeroImageUrl("")}
                    className="mt-2 text-xs text-gray-600 underline"
                  >
                    Remove — use the default
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-xs text-gray-500">
                  Using the default hero.
                </p>
              )}
              <input
                type="file"
                accept="image/*"
                disabled={uploadingQuotePhoto}
                onChange={handleHeroFileChange}
                className="mt-2 block text-sm"
              />
            </div>

            <div className="mt-6">
              <div className="text-sm font-medium">Gallery</div>
              <p className="text-xs text-gray-500">
                Optional photos with captions, shown after the scope on the
                proposal. Any quote can use them.
              </p>

              {galleryPhotos.length > 0 ? (
                <div className="mt-3 space-y-3">
                  {galleryPhotos.map((photo, index) => (
                    <div
                      key={`${photo.url}-${index}`}
                      className="flex items-start gap-3 rounded-md border p-2"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.url}
                        alt={photo.caption || `Photo ${index + 1}`}
                        className="h-16 w-24 shrink-0 rounded object-cover"
                      />
                      <input
                        className="h-10 flex-1 rounded-md border px-3 text-sm"
                        placeholder="Caption (optional)"
                        value={photo.caption}
                        onChange={(event) =>
                          setGalleryPhotos((photos) =>
                            photos.map((p, i) =>
                              i === index
                                ? { ...p, caption: event.target.value }
                                : p
                            )
                          )
                        }
                      />
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => moveGalleryPhoto(index, -1)}
                          className="rounded border px-2 text-xs"
                          aria-label="Move photo up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveGalleryPhoto(index, 1)}
                          className="rounded border px-2 text-xs"
                          aria-label="Move photo down"
                        >
                          ↓
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setGalleryPhotos((photos) =>
                            photos.filter((_, i) => i !== index)
                          )
                        }
                        className="rounded-md border px-2 py-1 text-xs text-red-600"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-gray-500">No photos yet.</p>
              )}

              <input
                type="file"
                accept="image/*"
                multiple
                disabled={uploadingQuotePhoto}
                onChange={handleGalleryFilesChange}
                className="mt-3 block text-sm"
              />
              {uploadingQuotePhoto && (
                <p className="mt-1 text-xs text-gray-500">Uploading…</p>
              )}
            </div>

            {error && (
              <p className="mt-3 text-sm text-red-600">{error}</p>
            )}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setPhotosDraft(null)}
                disabled={savingPhotos}
                className="h-11 flex-1 rounded-md border"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveQuotePhotos}
                disabled={savingPhotos || uploadingQuotePhoto}
                className="h-11 flex-1 rounded-md bg-emerald-700 font-medium text-white disabled:bg-gray-300"
              >
                {savingPhotos ? "Saving…" : "Save Photos"}
              </button>
            </div>
          </div>
        </div>
      )}

      {sendProposalDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-xl font-semibold">Send Proposal</h2>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <span className="text-gray-500">Customer</span>
                <div className="font-medium">{sendProposalDraft.customer_name}</div>
              </div>
              <div>
                <span className="text-gray-500">Quote Title</span>
                <div className="font-medium">{sendProposalDraft.quote_title}</div>
              </div>
              <div>
                <span className="text-gray-500">Send To (required)</span>
                <input
                  className="mt-1 h-10 w-full rounded-md border px-3"
                  type="email"
                  placeholder="customer@email.co.nz"
                  value={proposalRecipient}
                  onChange={(event) => setProposalRecipient(event.target.value)}
                />
              </div>
              <div className="min-w-0">
                <span className="text-gray-500">Proposal Link</span>
                <input
                  className="mt-1 h-10 w-full rounded-md border px-3 text-blue-700"
                  value={proposalLink}
                  onChange={(event) => {
                    const nextLink = event.target.value
                    setProposalBody((currentBody) =>
                      currentBody.replace(proposalLink, nextLink)
                    )
                    setProposalLink(nextLink)
                  }}
                />
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Email Subject
                </label>
                <input
                  className="h-11 w-full rounded-md border px-3"
                  value={proposalSubject}
                  onChange={(event) => setProposalSubject(event.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Email Body
                </label>
                <textarea
                  className="min-h-[220px] w-full rounded-md border p-3"
                  value={proposalBody}
                  onChange={(event) => setProposalBody(event.target.value)}
                />
              </div>

              <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                This will queue the proposal for Make.com. The proposal is not
                marked sent until Make.com updates the quote.
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSendProposalDraft(null)}
                  disabled={sendingProposal}
                  className="h-11 flex-1 rounded-md border"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={markProposalSent}
                  disabled={sendingProposal}
                  className="h-11 flex-1 rounded-md bg-indigo-600 font-medium text-white disabled:bg-gray-300"
                >
                  {sendingProposal ? "Queueing..." : "Send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
