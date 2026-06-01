"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"

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
  customer_scope: string | null
  first_scheduled_job_id: string | null
  total: number | null
  monthly_equivalent: number | null
  created_at: string
  xero_quote_number: string | null
  xero_quote_status: string | null
  xero_quote_error: string | null
  public_accept_token: string | null
  public_accept_url: string | null
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

const maintenanceCustomerScope = "On going maintenance"

const maintenanceLineItemDescription = `Ongoing garden maintenance.

Main focus on weed control, trimming, pruning and keeping the garden tidy throughout the year.

Each visit may include:
• Weed control
• Shrub trimming
• Removal of self-seeded plants
• Feeding and spraying where required
• General garden tidy
• Blow down of work areas

All greenwaste removed.`

type Props = {
  properties: PropertyOption[]
  scheduledJobs: ScheduledJobOption[]
  estimates: EstimateOption[]
  selectedEstimateId: string | null
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

function getQuoteTypeFromTemplate(template: QuoteTemplate): QuoteType {
  if (template.category === "Maintenance" || Boolean(template.frequency)) {
    return "maintenance"
  }

  if (template.category === "Landscape") return "landscaping"

  return "one_off"
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
    }
  })
}

function generateAcceptToken() {
  const bytes = new Uint8Array(24)
  window.crypto.getRandomValues(bytes)

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

function getPublicQuoteUrl(token: string) {
  return `${window.location.origin}/public/quote/${token}`
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
  queryErrors,
  templates,
  staff,
  quoteDrafts: initialQuoteDrafts,
}: Props) {
  const supabase = createClient()
  const [propertyId, setPropertyId] = useState("")
  const [estimateId, setEstimateId] = useState("")
  const [scheduledJobId, setScheduledJobId] = useState("")
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
    { description: "Labour", quantity: 1, unit_price: 0 },
  ])
  const [frequency, setFrequency] = useState("")
  const [labourHours, setLabourHours] = useState(0)
  const [labourRate, setLabourRate] = useState(90)
  const [greenwasteBags, setGreenwasteBags] = useState(0)
  const [greenwasteRate, setGreenwasteRate] = useState(26.5)
  const [spraysSize, setSpraysSize] = useState("none")
  const [spraysPrice, setSpraysPrice] = useState(0)
  const [fertiliserSize, setFertiliserSize] = useState("none")
  const [fertiliserPrice, setFertiliserPrice] = useState(0)
  const [stumpPasteSize, setStumpPasteSize] = useState("none")
  const [stumpPastePrice, setStumpPastePrice] = useState(0)
  const [status, setStatus] = useState("draft")
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
  const [firstVisitDate, setFirstVisitDate] = useState("")
  const [firstVisitStartTime, setFirstVisitStartTime] = useState("")
  const [firstVisitStaffId, setFirstVisitStaffId] = useState("")
  const [firstVisitDuration, setFirstVisitDuration] = useState("")
  const [firstVisitNotes, setFirstVisitNotes] = useState("")
  const [creatingMaintenanceSchedule, setCreatingMaintenanceSchedule] =
    useState(false)
  const [sendingProposal, setSendingProposal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedProperty = properties.find((property) => property.id === propertyId) || null
  const selectedEstimate = estimates.find((estimate) => estimate.id === estimateId) || null
  const selectedTemplate = templates.find((template) => template.id === templateId) || null
  const jobsForProperty = scheduledJobs.filter((job) => job.property_id === propertyId)
  const selectedCustomerName =
    selectedProperty?.client_name || selectedEstimate?.customer_name || "No customer selected"
  const selectedCustomerEmail =
    selectedProperty?.client_email || selectedEstimate?.customer_email || null
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
      (getNormalisedQuoteType(draft.quote_type) !== "maintenance" ||
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
          const publicUrl = getPublicQuoteUrl(token)
          const { error: updateError } = await supabase
            .from("quote_drafts")
            .update({
              public_accept_token: token,
              public_accept_url: publicUrl,
              updated_at: new Date().toISOString(),
            })
            .eq("id", draft.id)

          if (updateError) return null

          return { id: draft.id, token, publicUrl }
        })
      )

      if (cancelled) return

      const validUpdates = updates.filter(Boolean) as {
        id: string
        token: string
        publicUrl: string
      }[]

      if (validUpdates.length === 0) return

      setQuoteDrafts((currentDrafts) =>
        currentDrafts.map((draft) => {
          const update = validUpdates.find((item) => item.id === draft.id)

          if (!update) return draft

          return {
            ...draft,
            public_accept_token: update.token,
            public_accept_url: update.publicUrl,
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

  const hasMaintenancePricing = Boolean(frequency)
  const perVisitPrice =
    Number(labourHours || 0) * Number(labourRate || 0) +
    Number(greenwasteBags || 0) * Number(greenwasteRate || 0) +
    Number(spraysPrice || 0) +
    Number(fertiliserPrice || 0) +
    Number(stumpPastePrice || 0)
  const monthlyEquivalent = hasMaintenancePricing
    ? calculateMonthlyEquivalent(perVisitPrice, frequency)
    : 0
  const total = hasMaintenancePricing ? monthlyEquivalent : lineItemsSubtotal
  const gst = total * 3 / 23
  const subtotal = total - gst

  useEffect(() => {
    if (!hasMaintenancePricing) return

    setLineItems((items) => {
      const [firstItem, ...rest] = items.length > 0
        ? items
        : [{ description: "Maintenance subscription", quantity: 1, unit_price: 0 }]

      return [
        {
          ...firstItem,
          quantity: 1,
          unit_price: Number(monthlyEquivalent.toFixed(2)),
        },
        ...rest,
      ]
    })
  }, [hasMaintenancePricing, monthlyEquivalent])

  const handlePropertyChange = (nextPropertyId: string) => {
    const property = properties.find((item) => item.id === nextPropertyId) || null

    setPropertyId(nextPropertyId)
    if (nextPropertyId) {
      setEstimateId("")
    }
    setScheduledJobId("")

    if (property && !quoteTitle) {
      setQuoteTitle(`Quote for ${property.client_name}`)
    }
  }

  const handleEstimateChange = (nextEstimateId: string) => {
    const estimate = estimates.find((item) => item.id === nextEstimateId) || null

    setEstimateId(nextEstimateId)

    if (nextEstimateId) {
      setPropertyId("")
      setScheduledJobId("")
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
          : [{ description: "Labour", quantity: 1, unit_price: 0 }]
      )
    }

    setFrequency(template.frequency || "")
    setLabourHours(Number(template.labour_hours || 0))
    setLabourRate(Number(template.labour_rate || 90))
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
            field === "description"
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
      { description: "", quantity: 1, unit_price: 0 },
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
        customer_scope,
        first_scheduled_job_id,
        total,
        monthly_equivalent,
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

  const ensureQuoteAcceptLink = async (draft: QuoteDraftSummary) => {
    if (draft.public_accept_token) {
      return {
        token: draft.public_accept_token,
        publicUrl:
          draft.public_accept_url || getPublicQuoteUrl(draft.public_accept_token),
      }
    }

    const token = generateAcceptToken()
    const publicUrl = getPublicQuoteUrl(token)
    const { error: updateError } = await supabase
      .from("quote_drafts")
      .update({
        public_accept_token: token,
        public_accept_url: publicUrl,
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
              public_accept_url: publicUrl,
            }
          : currentDraft
      )
    )

    return { token, publicUrl }
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

  const openSendProposalModal = async (draft: QuoteDraftSummary) => {
    setMessage(null)
    setError(null)

    try {
      const { publicUrl } = await ensureQuoteAcceptLink(draft)
      setSendProposalDraft({
        ...draft,
        public_accept_url: publicUrl,
      })
      setProposalSubject("Your Pristine Gardens maintenance proposal")
      setProposalLink(publicUrl)
      setProposalBody(`Hi ${draft.customer_name},

Thanks for meeting with us.

You can view and accept your garden maintenance proposal here:

${publicUrl}

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

    setSendingProposal(true)
    setMessage(null)
    setError(null)

    const readyAt = new Date().toISOString()
    const { error: updateError } = await supabase
      .from("quote_drafts")
      .update({
        proposal_status: "ready_to_send",
        proposal_ready_to_send_at: readyAt,
        proposal_email_subject: proposalSubject.trim(),
        proposal_email_body: proposalBody.trim(),
        proposal_send_error: null,
        updated_at: readyAt,
      })
      .eq("id", sendProposalDraft.id)

    setSendingProposal(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setSendProposalDraft(null)
    await loadQuoteDrafts()
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
    if (!draft.estimate_id) {
      setError("This quote is not linked to an estimate.")
      return
    }

    setConvertingQuoteId(draft.id)
    setMessage(null)
    setError(null)

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

    const propertyCode =
      makePropertyCode(
        [estimate.address_line_1, estimate.suburb]
          .filter(Boolean)
          .join(" ")
      ) || makePropertyCode(estimate.customer_name)

    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .insert({
        client_name: estimate.customer_name,
        client_email: estimate.customer_email || null,
        phone: estimate.customer_phone || null,
        address_line_1: estimate.address_line_1 || null,
        suburb: estimate.suburb || null,
        property_code: propertyCode,
        billing_type:
          getNormalisedQuoteType(draft.quote_type) === "maintenance"
            ? "subscription"
            : "charge_up",
        service_frequency:
          getNormalisedQuoteType(draft.quote_type) === "maintenance"
            ? draft.frequency || null
            : null,
        is_active: true,
      })
      .select("id")
      .single()

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
  }

  const openMaintenanceScheduleForm = (draft: QuoteDraftSummary) => {
    setScheduleDraft(draft)
    setFirstVisitDate("")
    setFirstVisitStartTime("")
    setFirstVisitStaffId("")
    setFirstVisitDuration(
      getNormalisedQuoteType(draft.quote_type) === "maintenance" &&
        typeof draft.labour_hours === "number"
        ? String(draft.labour_hours)
        : ""
    )
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
        invoice_method: quoteType === "maintenance" ? "subscription" : "quoted",
        billing_mode: quoteType === "maintenance" ? "subscription" : "quoted",
        quoted_scope: firstVisitNotes.trim() || scheduleDraft.customer_scope || null,
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

    const { error: quoteUpdateError } = await supabase
      .from("quote_drafts")
      .update({
        first_scheduled_job_id: scheduledJob.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", scheduleDraft.id)
      .is("first_scheduled_job_id", null)

    setCreatingMaintenanceSchedule(false)

    if (quoteUpdateError) {
      setError(quoteUpdateError.message)
      return
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

    if (!selectedProperty && !selectedEstimate) {
      setError("Select a property or estimate before saving the quote draft.")
      return
    }

    if (!quoteTitle.trim()) {
      setError("Add a quote title before saving.")
      return
    }

    setSaving(true)

    const lineItemsToSave = hasMaintenancePricing
      ? lineItems.map((item, index) => ({
          ...item,
          quantity: index === 0 ? 1 : item.quantity,
          unit_price:
            index === 0 ? Number(monthlyEquivalent.toFixed(2)) : item.unit_price,
          line_total:
            index === 0
              ? Number(monthlyEquivalent.toFixed(2))
              : Number(item.quantity || 0) * Number(item.unit_price || 0),
        }))
      : lineItems.map((item) => ({
          ...item,
          line_total: Number(item.quantity || 0) * Number(item.unit_price || 0),
        }))

    const estimateNotesForDraft = selectedEstimate
      ? getEstimateDetailNotes(selectedEstimate)
      : ""
    const internalNotesToSave = [
      internalNotes.trim() || null,
      selectedEstimate && estimateNotesForDraft
        ? `Estimate details:\n${estimateNotesForDraft}`
        : null,
    ]
      .filter(Boolean)
      .join("\n\n")
    const acceptToken = generateAcceptToken()
    const publicAcceptUrl = getPublicQuoteUrl(acceptToken)

    const { data: savedDraft, error: saveError } = await supabase
      .from("quote_drafts")
      .insert({
      property_id: selectedProperty?.id || null,
      estimate_id: selectedEstimate?.id || null,
      scheduled_job_id: scheduledJobId || null,
      quote_template_id: templateId || null,
      customer_name: selectedProperty?.client_name || selectedEstimate!.customer_name,
      customer_email: selectedProperty?.client_email || selectedEstimate?.customer_email || null,
      quote_title: quoteTitle.trim(),
      quote_type: quoteType,
      customer_scope: customerScope.trim() || null,
      internal_notes: internalNotesToSave || null,
      terms_conditions: termsConditions.trim() || null,
      line_items: lineItemsToSave,
      subtotal,
      gst,
      total,
      status,
      public_accept_token: acceptToken,
      public_accept_url: publicAcceptUrl,
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

    setSaving(false)

    if (saveError) {
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
        setError(estimateError.message)
        return
      }
    }

    await loadQuoteDrafts()
    setMessage("Quote draft saved.")
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
            const publicUrl =
              draft.public_accept_url ||
              (draft.public_accept_token
                ? getPublicQuoteUrl(draft.public_accept_token)
                : null)

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
          Create a draft quote from an existing property, job, and template.
        </p>
      </header>

      {queryErrors.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {queryErrors.map((queryError) => (
            <div key={queryError}>{queryError}</div>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
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
              <label className="mb-1 block text-sm font-medium">Estimate</label>
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
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                    {template.category ? ` - ${template.category}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Status</label>
              <select
                className="h-11 w-full rounded-md border px-3"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="ready_for_xero">Ready for Xero</option>
                <option value="xero_created">Xero Created</option>
                <option value="sent">Sent</option>
                <option value="accepted">Accepted</option>
                <option value="declined">Declined</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                Quote Type
              </label>
              <select
                className="h-11 w-full rounded-md border px-3"
                value={quoteType}
                onChange={(event) => setQuoteType(event.target.value as QuoteType)}
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

          <div className="mt-6 rounded-lg border bg-gray-50 p-4">
            <div className="mb-3">
              <h2 className="text-lg font-semibold">
                Internal Pricing Assumptions
              </h2>
              <p className="text-sm text-gray-500">
                These inputs calculate the maintenance subscription price and are not customer-facing unless written into the line item wording.
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
                    className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_100px_130px_120px_auto]"
                  >
                    <input
                      className="h-10 rounded-md border px-3"
                      value={item.description}
                      onChange={(event) =>
                        updateLineItem(index, "description", event.target.value)
                      }
                      placeholder="Description"
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
              <>
                <div className="flex justify-between">
                  <span className="text-gray-500">Per Visit Price</span>
                  <span className="font-medium">{money(perVisitPrice)}</span>
                </div>
                <div className="flex justify-between rounded-md bg-blue-50 px-3 py-2">
                  <span className="text-blue-700">Monthly Equivalent</span>
                  <span className="font-semibold text-blue-900">
                    {money(monthlyEquivalent)}
                  </span>
                </div>
              </>
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
              Monthly Equivalent is the recommended customer billing amount for this maintenance subscription. Per Visit Price stays internal.
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

          <button
            type="button"
            disabled
            className="mt-3 h-11 w-full rounded-md bg-gray-200 font-medium text-gray-500"
          >
            Create Xero Quote
          </button>

          <p className="mt-2 text-xs text-gray-500">
            Xero quote creation to be wired next.
          </p>
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
                            disabled={
                              !draft.estimate_id ||
                              convertingQuoteId === draft.id
                            }
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
                      <th className="py-2 pr-3 text-right">Monthly Equivalent</th>
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
                          {money(Number(draft.monthly_equivalent || 0))}
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
          Mark saved drafts as ready for Make.com to create the Xero quote.
        </p>

        {quoteDrafts.length > 0 ? (
          <div className="space-y-3">
            {quoteDrafts.map((draft) => {
              const linkedEstimate = estimates.find(
                (estimate) => estimate.id === draft.estimate_id
              )
              const convertedPropertyId =
                linkedEstimate?.converted_property_id || draft.property_id
              const canConvertToProperty =
                draft.status === "accepted" &&
                Boolean(draft.estimate_id) &&
                !convertedPropertyId
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
                Boolean(draft.public_accept_url) &&
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

                  {draft.status === "draft" ? (
                    <button
                      type="button"
                      onClick={() => prepareXeroQuote(draft.id)}
                      disabled={preparingXeroQuoteId === draft.id}
                      className="h-10 rounded-md bg-blue-600 px-3 text-sm font-medium text-white disabled:bg-gray-300"
                    >
                      {preparingXeroQuoteId === draft.id
                        ? "Preparing..."
                        : "Create Xero Quote"}
                    </button>
                  ) : (
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
                  {!canSendProposal && !draft.quote_sent_at && (
                    <>
                      <button
                        type="button"
                        disabled
                        className="h-10 rounded-md bg-gray-200 px-3 text-sm font-medium text-gray-500"
                      >
                        Send Quote from App
                      </button>
                      <div className="max-w-[180px] text-xs text-gray-500 xl:text-right">
                        Send quote workflow to be wired next.
                      </div>
                    </>
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
                <span className="text-gray-500">Customer Email</span>
                <div className="font-medium">
                  {sendProposalDraft.customer_email || "No email on quote"}
                </div>
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
