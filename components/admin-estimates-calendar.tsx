"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { NewPropertyModal } from "@/components/new-property-modal"
import { sendLeadNotificationToJoe } from "@/lib/lead-notifications"

type Property = {
  id: string
  property_code: string
  client_name: string
  address_line_1: string | null
  suburb: string | null
  property_category: string | null
  is_active: boolean
}

type Estimate = {
  id: string
  property_id: string | null
  scheduled_date: string
  status: string
  planned_duration_hours: number | null
  planned_start_time: string | null
  quoted_scope: string | null
  estimate_outcome?: string | null
  estimate_outcome_notes?: string | null
  properties?: {
    id: string
    client_name: string
    address_line_1: string | null
    suburb: string | null
  } | null
}

type LeadEstimate = {
  id: string
  enquiry_id: string | null
  communication_id: string | null
  customer_name: string
  customer_email: string | null
  customer_phone: string | null
  address_line_1: string | null
  suburb: string | null
  enquiry_details: string | null
  estimate_status: string
  estimate_date: string | null
  estimate_start_time: string | null
  estimate_notes: string | null
  quote_draft_id: string | null
  converted_property_id: string | null
}

type CalendarBlock = {
  id: string
  block_date: string
  start_time: string
  end_time: string
  title: string | null
  notes: string | null
}

type CalendarBlockout = {
  id: string
  google_event_id: string
  title: string | null
  start_time: string
  end_time: string
  location: string | null
  notes: string | null
  source: string | null
}

type Enquiry = {
  id: string
  name: string
  email: string | null
  phone: string | null
  suburb: string | null
  address: string | null
  job_type: string | null
  budget_range: string | null
  notes: string | null
  status: string
  created_at: string
  joe_new_lead_notified_at?: string | null
  joe_accepted_lead_notified_at?: string | null
}

type QuoteRequest = {
  id: string
  channel?: string | null
  source_category?: string | null
  subject: string | null
  body: string | null
  priority: string | null
  risk_level: string | null
  ai_summary: string | null
  suggested_reply: string | null
  metadata: Record<string, any> | string | null
  created_at: string | null
}

type Props = {
  thisWeekStart: string
  nextWeekStart: string
  properties: Property[]
  estimates: Estimate[]
  leadEstimates: LeadEstimate[]
  blocks: CalendarBlock[]
  calendarBlockouts: CalendarBlockout[]
  calendarBlockoutError?: string | null
  enquiries: Enquiry[]
  quoteRequests: QuoteRequest[]
  joeStaffId: string | null
}

function parseLocalDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number)
  return new Date(year, month - 1, day)
}

function toLocalDateString(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function addDays(dateString: string, days: number) {
  const date = parseLocalDate(dateString)
  date.setDate(date.getDate() + days)
  return toLocalDateString(date)
}

function formatDayLabel(dateString: string) {
  return parseLocalDate(dateString).toLocaleDateString("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}

function formatDateTime(dateString: string | null) {
  if (!dateString) return "No date"

  return new Date(dateString).toISOString()
}

function toNzDateString(dateString: string) {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(dateString))

  const year = parts.find((part) => part.type === "year")?.value || "0000"
  const month = parts.find((part) => part.type === "month")?.value || "01"
  const day = parts.find((part) => part.type === "day")?.value || "01"

  return `${year}-${month}-${day}`
}

function formatNzTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString("en-NZ", {
    timeZone: "Pacific/Auckland",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
}

function timeToMinutes(time: string | null | undefined) {
  if (!time) return null

  const [hour, minute] = time.slice(0, 5).split(":").map(Number)

  if (Number.isNaN(hour) || Number.isNaN(minute)) return null

  return hour * 60 + minute
}

function getBlockoutEndDateForGrouping(dateString: string) {
  const end = new Date(dateString).getTime()

  if (Number.isNaN(end)) return toNzDateString(dateString)

  return toNzDateString(new Date(end - 1).toISOString())
}

function blockoutTouchesNzDate(blockout: CalendarBlockout, date: string) {
  const startDate = toNzDateString(blockout.start_time)
  const endDate = getBlockoutEndDateForGrouping(blockout.end_time)

  return startDate <= date && endDate >= date
}

function parseQuoteRequestMetadata(item: QuoteRequest) {
  let metadata = item.metadata

  if (typeof metadata === "string") {
    try {
      metadata = JSON.parse(metadata)
    } catch {
      metadata = null
    }
  }

  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata
    : {}
}

function getQuoteRequestSender(item: QuoteRequest) {
  const metadata = parseQuoteRequestMetadata(item)
  const fromName = metadata.from_name
  const fromEmail = metadata.from_email

  if (typeof fromName === "string" && fromName.trim()) return fromName
  if (typeof fromEmail === "string" && fromEmail.trim()) return fromEmail

  return item.subject || "Quote request"
}

function getQuoteRequestEmail(item: QuoteRequest) {
  const metadata = parseQuoteRequestMetadata(item)
  const fromEmail = metadata.from_email

  return typeof fromEmail === "string" && fromEmail.trim() ? fromEmail : null
}

function getQuoteRequestNotes(item: QuoteRequest) {
  const metadata = parseQuoteRequestMetadata(item)
  const fromName = metadata.from_name
  const fromEmail = metadata.from_email

  return [
    "Source: AI Quote Request",
    item.subject ? `Subject: ${item.subject}` : null,
    typeof fromName === "string" && fromName.trim()
      ? `From name: ${fromName}`
      : null,
    typeof fromEmail === "string" && fromEmail.trim()
      ? `From email: ${fromEmail}`
      : null,
    item.ai_summary ? `AI summary:\n${item.ai_summary}` : null,
    item.body ? `Original body:\n${item.body}` : null,
  ]
    .filter(Boolean)
    .join("\n\n")
}

function getAreaForSuburb(suburb: string | null | undefined) {
  if (!suburb) return "OTHER"

  const normalisedSuburb = suburb.trim().toLowerCase()

  const centralSuburbs = [
    "mt eden",
    "mount eden",
    "epsom",
    "remuera",
    "meadowbank",
    "ellerslie",
    "greenlane",
    "parnell",
    "newmarket",
    "grey lynn",
    "ponsonby",
    "sandringham",
    "st lukes",
    "royal oak",
    "one tree hill",
    "onehunga",
  ]

  const eastSuburbs = [
    "kohimarama",
    "st heliers",
    "glendowie",
    "mission bay",
    "orakei",
    "st johns",
    "stonefields",
    "glen innes",
  ]

  const westSuburbs = [
    "blockhouse bay",
    "new lynn",
    "titirangi",
    "avondale",
    "green bay",
    "lynfield",
    "mt roskill",
    "mount roskill",
  ]

  const shoreSuburbs = [
    "devonport",
    "birkenhead",
    "northcote",
    "takapuna",
    "milford",
    "bayswater",
  ]

  if (centralSuburbs.includes(normalisedSuburb)) return "CENTRAL"
  if (eastSuburbs.includes(normalisedSuburb)) return "EAST"
  if (westSuburbs.includes(normalisedSuburb)) return "WEST"
  if (shoreSuburbs.includes(normalisedSuburb)) return "SHORE"

  return "OTHER"
}

function getAreaBadgeClasses(area: string) {
  if (area === "CENTRAL") return "bg-green-100 text-green-800"
  if (area === "EAST") return "bg-blue-100 text-blue-800"
  if (area === "WEST") return "bg-purple-100 text-purple-800"
  if (area === "SHORE") return "bg-cyan-100 text-cyan-800"

  return "bg-gray-100 text-gray-700"
}

export function AdminEstimatesCalendar({
  thisWeekStart,
  nextWeekStart,
  properties = [],
  estimates = [],
  leadEstimates = [],
  blocks = [],
  calendarBlockouts = [],
  calendarBlockoutError = null,
  enquiries = [],
  quoteRequests = [],
  joeStaffId,
}: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [newPropertyOpen, setNewPropertyOpen] = useState(false)
  const [propertySearch, setPropertySearch] = useState("")

  const [modalOpen, setModalOpen] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)
  const [selectedEstimate, setSelectedEstimate] = useState<Estimate | null>(null)
  const [selectedEnquiry, setSelectedEnquiry] = useState<Enquiry | null>(null)
  const [selectedQuoteRequest, setSelectedQuoteRequest] =
    useState<QuoteRequest | null>(null)
  const [visibleQuoteRequests, setVisibleQuoteRequests] =
    useState(quoteRequests)

  const [estimateDate, setEstimateDate] = useState(thisWeekStart)
  const [estimateStartTime, setEstimateStartTime] = useState("")
  const [estimateDuration, setEstimateDuration] = useState("1")
  const [estimateNotes, setEstimateNotes] = useState("")

  const [saving, setSaving] = useState(false)
const [error, setError] = useState<string | null>(null)

const [blockDate, setBlockDate] = useState(thisWeekStart)
const [blockStartTime, setBlockStartTime] = useState("")
const [blockEndTime, setBlockEndTime] = useState("")
const [blockTitle, setBlockTitle] = useState("")
const [blockNotes, setBlockNotes] = useState("")
const [savingBlock, setSavingBlock] = useState(false)

  const thisWeekDays = [0, 1, 2, 3, 4].map((day) =>
    addDays(thisWeekStart, day)
  )

  const nextWeekDays = [0, 1, 2, 3, 4].map((day) =>
    addDays(nextWeekStart, day)
  )

  const filteredProperties = useMemo(() => {
    const search = propertySearch.trim().toLowerCase()

    if (!search) return []

    return properties.filter((property) => {
      const searchableText = [
        property.property_code,
        property.client_name,
        property.address_line_1,
        property.suburb,
        property.property_category,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      return searchableText.includes(search)
    })
  }, [properties, propertySearch])

  const getEstimatesForDate = (date: string) => {
    return estimates
      .filter((estimate) => estimate.scheduled_date === date)
      .sort((a, b) => {
        const timeA = a.planned_start_time || "99:99"
        const timeB = b.planned_start_time || "99:99"
        return timeA.localeCompare(timeB)
      })
  }

  const getLeadEstimatesForDate = (date: string) => {
    return leadEstimates
      .filter((estimate) => estimate.estimate_date === date)
      .sort((a, b) => {
        const timeA = a.estimate_start_time || "99:99"
        const timeB = b.estimate_start_time || "99:99"
        return timeA.localeCompare(timeB)
      })
  }

  const getBlocksForDate = (date: string) => {
    return blocks
      .filter((block) => block.block_date === date)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
  }

  const getCalendarBlockoutsForDate = (date: string) => {
    return calendarBlockouts
      .filter((blockout) => blockoutTouchesNzDate(blockout, date))
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
  }

  const getBlockoutTimeRange = (blockout: CalendarBlockout, date: string) => {
    if (!blockoutTouchesNzDate(blockout, date)) return null

    const startDate = toNzDateString(blockout.start_time)
    const endDate = getBlockoutEndDateForGrouping(blockout.end_time)
    const start =
      startDate < date ? 0 : timeToMinutes(formatNzTime(blockout.start_time))
    const end =
      endDate > date ? 24 * 60 : timeToMinutes(formatNzTime(blockout.end_time))

    if (start === null || end === null) return null

    return { start, end }
  }

  const estimateOverlapsBlockout = (
    estimate: Estimate,
    blockout: CalendarBlockout,
    date: string
  ) => {
    const start = timeToMinutes(estimate.planned_start_time)

    if (start === null) return false

    const end = start + Number(estimate.planned_duration_hours || 1) * 60
    const blockoutRange = getBlockoutTimeRange(blockout, date)

    if (!blockoutRange) return false

    return start < blockoutRange.end && blockoutRange.start < end
  }

  const leadEstimateOverlapsBlockout = (
    estimate: LeadEstimate,
    blockout: CalendarBlockout,
    date: string
  ) => {
    const start = timeToMinutes(estimate.estimate_start_time)

    if (start === null) return false

    const end = start + 60
    const blockoutRange = getBlockoutTimeRange(blockout, date)

    if (!blockoutRange) return false

    return start < blockoutRange.end && blockoutRange.start < end
  }

  const openAddModal = (property: Property) => {
    setSelectedProperty(property)
    setSelectedEstimate(null)
    setSelectedEnquiry(null)
    setSelectedQuoteRequest(null)
    setEstimateDate(thisWeekStart)
    setEstimateStartTime("")
    setEstimateDuration("1")
    setEstimateNotes("")
    setError(null)
    setModalOpen(true)
  }

  const openEnquiryEstimateModal = (enquiry: Enquiry) => {
  const temporaryProperty: Property = {
    id: "",
    property_code: "NEW",
    client_name: enquiry.name,
    address_line_1: enquiry.address,
    suburb: enquiry.suburb,
    property_category: null,
    is_active: true,
  }

  setSelectedProperty(temporaryProperty)
  setSelectedEstimate(null)
  setSelectedEnquiry(enquiry)
  setSelectedQuoteRequest(null)
  setEstimateDate(thisWeekStart)
  setEstimateStartTime("")
  setEstimateDuration("1")
  setEstimateNotes(
    [
      enquiry.job_type ? `Job type: ${enquiry.job_type}` : null,
      enquiry.budget_range ? `Budget: ${enquiry.budget_range}` : null,
      enquiry.email ? `Email: ${enquiry.email}` : null,
      enquiry.phone ? `Phone: ${enquiry.phone}` : null,
      enquiry.notes,
    ]
      .filter(Boolean)
      .join("\n")
  )
  setError(null)
  setModalOpen(true)
}

  const openQuoteRequestEstimateModal = (quoteRequest: QuoteRequest) => {
    const temporaryProperty: Property = {
      id: "",
      property_code: "NEW",
      client_name: getQuoteRequestSender(quoteRequest),
      address_line_1: null,
      suburb: null,
      property_category: null,
      is_active: true,
    }

    setSelectedProperty(temporaryProperty)
    setSelectedEstimate(null)
    setSelectedEnquiry(null)
    setSelectedQuoteRequest(quoteRequest)
    setEstimateDate(thisWeekStart)
    setEstimateStartTime("")
    setEstimateDuration("1")
    setEstimateNotes(getQuoteRequestNotes(quoteRequest))
    setError(null)
    setModalOpen(true)
  }

  const openEditModal = (estimate: Estimate) => {
    const property = properties.find((item) => item.id === estimate.property_id)

    if (!property) {
      alert("Could not find property for this estimate.")
      return
    }

    setSelectedProperty(property)
    setSelectedEstimate(estimate)
    setSelectedEnquiry(null)
    setSelectedQuoteRequest(null)
    setEstimateDate(estimate.scheduled_date)
    setEstimateStartTime(estimate.planned_start_time || "")
    setEstimateDuration(
      estimate.planned_duration_hours
        ? estimate.planned_duration_hours.toString()
        : "1"
    )
    setEstimateNotes(estimate.quoted_scope || "")
    setError(null)
    setModalOpen(true)
  }

  const resetModal = () => {
    setModalOpen(false)
    setSelectedProperty(null)
    setSelectedEstimate(null)
    setSelectedEnquiry(null)
    setSelectedQuoteRequest(null)
    setEstimateDate(thisWeekStart)
    setEstimateStartTime("")
    setEstimateDuration("1")
    setEstimateNotes("")
    setSaving(false)
    setError(null)
  }

  const handleSaveEstimate = async () => {
  if (!selectedProperty) return

  if (!joeStaffId && !selectedEnquiry && !selectedQuoteRequest) {
    setError("Could not find Estimator in staff_members.")
    return
  }

  setSaving(true)
  setError(null)
  let leadNotificationWarning: string | null = null

  let propertyId = selectedProperty.id

  if ((selectedEnquiry || selectedQuoteRequest) && !propertyId) {
    const { error: estimateError } = await supabase
      .from("estimates")
      .insert({
        enquiry_id: selectedEnquiry?.id || null,
        communication_id: selectedQuoteRequest?.id || null,
        customer_name: selectedEnquiry
          ? selectedEnquiry.name
          : getQuoteRequestSender(selectedQuoteRequest!),
        customer_email: selectedEnquiry
          ? selectedEnquiry.email || null
          : getQuoteRequestEmail(selectedQuoteRequest!),
        customer_phone: selectedEnquiry?.phone || null,
        address_line_1: selectedEnquiry?.address || null,
        suburb: selectedEnquiry?.suburb || null,
        enquiry_details: estimateNotes || null,
        estimate_status: "scheduled",
        estimate_date: estimateDate,
        estimate_start_time: estimateStartTime || null,
        estimate_notes: estimateNotes || null,
      })

    if (estimateError) {
      setError(estimateError.message)
      setSaving(false)
      return
    }
  } else {
    if (!joeStaffId) {
      setError("Could not find Estimator in staff_members.")
      setSaving(false)
      return
    }

    const payload = {
      property_id: propertyId,
      scheduled_date: estimateDate,
      planned_start_time: estimateStartTime || null,
      planned_duration_hours: estimateDuration
        ? parseFloat(estimateDuration)
        : 1,
      assigned_staff_id: joeStaffId,
      status: "scheduled",
      job_type: "estimate",
      invoice_method: "non_billable",
      billing_mode: "non_billable",
      time_limit_type: "fixed_time",
      quoted_scope: estimateNotes || null,
    }

    if (selectedEstimate) {
      const { error } = await supabase
        .from("scheduled_jobs")
        .update(payload)
        .eq("id", selectedEstimate.id)

      if (error) {
        setError(error.message)
        setSaving(false)
        return
      }
    } else {
      const { error } = await supabase
        .from("scheduled_jobs")
        .insert(payload)

      if (error) {
        setError(error.message)
        setSaving(false)
        return
      }
    }
  }

  /*
    Mark enquiry as scheduled
  */

  if (selectedEnquiry) {
    const { error: enquiryUpdateError } = await supabase
      .from("admin_enquiries")
      .update({
        status: "scheduled",
      })
      .eq("id", selectedEnquiry.id)

    if (enquiryUpdateError) {
      setError(enquiryUpdateError.message)
      setSaving(false)
      return
    }

    if (!selectedEnquiry.joe_accepted_lead_notified_at) {
      try {
        const notifiedAt = await sendLeadNotificationToJoe({
          supabase,
          enquiry: selectedEnquiry,
          action: "accepted",
        })

        const { error: notificationUpdateError } = await supabase
          .from("admin_enquiries")
          .update({ joe_accepted_lead_notified_at: notifiedAt })
          .eq("id", selectedEnquiry.id)
          .is("joe_accepted_lead_notified_at", null)

        if (notificationUpdateError) {
          leadNotificationWarning = `Lead was accepted, but notification tracking failed: ${notificationUpdateError.message}`
        }
      } catch (notificationError) {
        leadNotificationWarning =
          notificationError instanceof Error
            ? `Lead was accepted, but Joe was not emailed: ${notificationError.message}`
            : "Lead was accepted, but Joe was not emailed."
      }
    }
  }

  if (selectedQuoteRequest) {
    const quoteRequestMetadata = parseQuoteRequestMetadata(selectedQuoteRequest)
    const metadata: Record<string, any> = {
      ...quoteRequestMetadata,
      estimate_action_completed: true,
      estimate_action_completed_at: new Date().toISOString(),
    }

    if (!quoteRequestMetadata.joe_accepted_lead_notified_at) {
      try {
        const notifiedAt = await sendLeadNotificationToJoe({
          supabase,
          enquiry: {
            id: selectedQuoteRequest.id,
            name: getQuoteRequestSender(selectedQuoteRequest),
            suburb: null,
            address: null,
            job_type: "quote_request",
            notes: getQuoteRequestNotes(selectedQuoteRequest),
            source:
              selectedQuoteRequest.source_category ||
              selectedQuoteRequest.channel ||
              "email",
            link_path: `/admin/communications/${selectedQuoteRequest.id}`,
          },
          action: "accepted",
        })

        metadata.joe_accepted_lead_notified_at = notifiedAt
      } catch (notificationError) {
        leadNotificationWarning =
          notificationError instanceof Error
            ? `Lead was accepted, but Joe was not emailed: ${notificationError.message}`
            : "Lead was accepted, but Joe was not emailed."
      }
    }

    await supabase
      .from("communications")
      .update({ metadata })
      .eq("id", selectedQuoteRequest.id)

    setVisibleQuoteRequests((items) =>
      items.filter((item) => item.id !== selectedQuoteRequest.id)
    )
  }

  resetModal()
  if (leadNotificationWarning) {
    alert(leadNotificationWarning)
  }
  router.refresh()
}

  const handleSaveBlock = async () => {
  if (!blockDate || !blockStartTime || !blockEndTime) {
    alert("Add a date, start time and end time.")
    return
  }

  setSavingBlock(true)

  const { error } = await supabase
    .from("estimate_calendar_blocks")
    .insert({
      block_date: blockDate,
      start_time: blockStartTime,
      end_time: blockEndTime,
      title: blockTitle.trim() || "Blocked",
      notes: blockNotes.trim() || null,
    })

  setSavingBlock(false)

  if (error) {
    alert(error.message)
    return
  }

  setBlockDate(thisWeekStart)
  setBlockStartTime("")
  setBlockEndTime("")
  setBlockTitle("")
  setBlockNotes("")

  router.refresh()
}

const handleReadyToSchedule = async (estimate: Estimate) => {
  const confirmed = window.confirm(
    "Mark this estimate as ready to schedule?"
  )

  if (!confirmed) return

  const area = getAreaForSuburb(estimate.properties?.suburb)

  const { error: queueError } = await supabase
    .from("scheduling_queue")
    .insert({
      property_id: estimate.property_id,
      source_scheduled_job_id: estimate.id,
      job_type: "quoted_work",
      scope_notes: estimate.quoted_scope || null,
      status: "ready_to_schedule",
      estimated_duration_hours: estimate.planned_duration_hours || null,
      suburb: estimate.properties?.suburb || null,
      area,
    })

  if (queueError) {
    alert(queueError.message)
    return
  }

  const { error: estimateError } = await supabase
    .from("scheduled_jobs")
    .update({
      estimate_outcome: "ready_to_schedule",
    })
    .eq("id", estimate.id)

  if (estimateError) {
    alert(estimateError.message)
    return
  }

  router.refresh()
}

  const handleDeleteEstimate = async (estimateId: string) => {
    const confirmed = window.confirm("Delete this estimate appointment?")

    if (!confirmed) return

    const { error } = await supabase
      .from("scheduled_jobs")
      .delete()
      .eq("id", estimateId)

    if (error) {
      alert(error.message)
      return
    }

    router.refresh()
  }

  const handleCompleteLeadEstimate = async (estimateId: string) => {
    const { error } = await supabase
      .from("estimates")
      .update({
        estimate_status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", estimateId)

    if (error) {
      alert(error.message)
      return
    }

    router.refresh()
  }

  const LeadEstimateCard = ({
    estimate,
    hasBlockoutOverlap = false,
  }: {
    estimate: LeadEstimate
    hasBlockoutOverlap?: boolean
  }) => (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">
            {estimate.estimate_start_time
              ? estimate.estimate_start_time.slice(0, 5)
              : "No time"}
          </div>

          <div className="truncate text-sm text-gray-700">
            {estimate.customer_name}
          </div>

          <div className="truncate text-sm text-gray-500">
            {[estimate.address_line_1, estimate.suburb].filter(Boolean).join(", ") ||
              "No address"}
          </div>

          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-white px-2 py-0.5 text-indigo-700">
              Lead estimate
            </span>
            <span className="rounded-full bg-white px-2 py-0.5 text-gray-700">
              {estimate.estimate_status}
            </span>
            {hasBlockoutOverlap && (
              <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                Overlaps busy time
              </span>
            )}
          </div>

          {estimate.estimate_notes && (
            <div className="mt-2 line-clamp-2 text-xs text-gray-600">
              {estimate.estimate_notes}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {estimate.estimate_status !== "completed" &&
            estimate.estimate_status !== "quote_created" &&
            estimate.estimate_status !== "accepted" &&
            estimate.estimate_status !== "converted" && (
              <button
                type="button"
                onClick={() => handleCompleteLeadEstimate(estimate.id)}
                className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-medium text-white"
              >
                Mark Completed
              </button>
            )}

          <a
            href={`/admin/quotes?estimate=${estimate.id}`}
            className="rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white"
          >
            Create Quote
          </a>
        </div>
      </div>
    </div>
  )

    const EstimateCard = ({
      estimate,
      hasBlockoutOverlap = false,
    }: {
      estimate: Estimate
      hasBlockoutOverlap?: boolean
    }) => {
    const suburb = estimate.properties?.suburb || null
    const area = getAreaForSuburb(suburb)

    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold">
              {estimate.planned_start_time
                ? estimate.planned_start_time.slice(0, 5)
                : "No time"}
            </div>

            <div className="truncate text-sm text-gray-600">
              {estimate.properties?.client_name || "No client"}
            </div>

            <div className="truncate text-sm text-gray-500">
              {estimate.properties?.address_line_1 || "No address"}
            </div>

            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {suburb && (
                <span className="rounded-full bg-white px-2 py-0.5 text-gray-700">
                  {suburb}
                </span>
              )}

              <span
                className={`rounded-full px-2 py-0.5 font-medium ${getAreaBadgeClasses(
                  area
                )}`}
              >
                {area}
              </span>

              {hasBlockoutOverlap && (
                <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                  Overlaps busy time
                </span>
              )}
            </div>

            {estimate.planned_duration_hours && (
              <div className="mt-2 text-xs text-gray-500">
                {estimate.planned_duration_hours}h estimate
              </div>
            )}

            {estimate.quoted_scope && (
              <div className="mt-2 line-clamp-2 text-xs text-gray-600">
                {estimate.quoted_scope}
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
  {estimate.estimate_outcome === "ready_to_schedule" ? (
    <div className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
      Ready to Schedule
    </div>
  ) : (
    <button
      type="button"
      onClick={() => handleReadyToSchedule(estimate)}
      className="rounded-md bg-green-600 px-2 py-1 text-xs font-medium text-white"
    >
      Ready to Schedule
    </button>
  )}

  <button
    type="button"
    onClick={() => openEditModal(estimate)}
    className="text-xs text-blue-600 hover:underline"
  >
    Edit
  </button>

  <button
    type="button"
    onClick={() => handleDeleteEstimate(estimate.id)}
    className="text-xs text-red-600 hover:underline"
  >
    Delete
  </button>
</div>
        </div>
      </div>
    )
  }

  const BlockCard = ({ block }: { block: CalendarBlock }) => (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
      <div className="text-sm font-semibold text-amber-800">
        {block.start_time.slice(0, 5)} - {block.end_time.slice(0, 5)}
      </div>

      <div className="text-sm text-amber-700">
        {block.title || "Blocked"}
      </div>

      {block.notes && (
        <div className="mt-1 text-xs text-amber-600">
          {block.notes}
        </div>
      )}
    </div>
  )

  const CalendarBlockoutCard = ({
    blockout,
  }: {
    blockout: CalendarBlockout
  }) => (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-emerald-900">
            {formatNzTime(blockout.start_time)} - {formatNzTime(blockout.end_time)}
          </div>

          <div className="mt-1 text-sm font-medium text-emerald-800">
            {blockout.title || "Busy"}
          </div>
        </div>

        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium uppercase text-emerald-700">
          Google Calendar
        </span>
      </div>

      {blockout.location && (
        <div className="mt-2 text-xs text-emerald-700">
          {blockout.location}
        </div>
      )}

      {blockout.notes && (
        <div className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-emerald-700">
          {blockout.notes}
        </div>
      )}
    </div>
  )

  const WeekSection = ({
    title,
    days,
  }: {
    title: string
    days: string[]
  }) => (
    <section className="mb-8">
      <h2 className="mb-3 text-xl font-semibold">{title}</h2>

      <div className="grid gap-4 md:grid-cols-5">
        {days.map((day) => {
          const dayEstimates = getEstimatesForDate(day)
          const dayLeadEstimates = getLeadEstimatesForDate(day)
          const dayBlocks = getBlocksForDate(day)
          const dayCalendarBlockouts = getCalendarBlockoutsForDate(day)
          const appointmentCount = dayEstimates.length + dayLeadEstimates.length

          return (
            <div key={day} className="rounded-xl border bg-gray-50 p-3">
              <div className="mb-3">
                <div className="font-semibold">{formatDayLabel(day)}</div>

                <div className="text-xs text-gray-500">
                  {appointmentCount} appointments
                  {dayBlocks.length > 0 ? ` · ${dayBlocks.length} blocked` : ""}
                  {dayCalendarBlockouts.length > 0
                    ? ` · ${dayCalendarBlockouts.length} busy`
                    : ""}
                </div>
              </div>

              <div className="space-y-2">
                {dayCalendarBlockouts.map((blockout) => (
                  <CalendarBlockoutCard key={blockout.id} blockout={blockout} />
                ))}

                {dayBlocks.map((block) => (
                  <BlockCard key={block.id} block={block} />
                ))}

                {dayLeadEstimates.map((estimate) => (
                  <LeadEstimateCard
                    key={estimate.id}
                    estimate={estimate}
                    hasBlockoutOverlap={dayCalendarBlockouts.some((blockout) =>
                      leadEstimateOverlapsBlockout(estimate, blockout, day)
                    )}
                  />
                ))}

                {dayEstimates.length > 0 ? (
                  dayEstimates.map((estimate) => (
                    <EstimateCard
                      key={estimate.id}
                      estimate={estimate}
                      hasBlockoutOverlap={dayCalendarBlockouts.some((blockout) =>
                        estimateOverlapsBlockout(estimate, blockout, day)
                      )}
                    />
                  ))
                ) : dayBlocks.length === 0 &&
                  dayCalendarBlockouts.length === 0 &&
                  dayLeadEstimates.length === 0 ? (
                  <p className="rounded-lg border border-dashed bg-white p-3 text-sm text-gray-400">
                    No estimates
                  </p>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )

  return (
    <div className="mx-auto max-w-7xl p-4 pb-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Estimates Calendar</h1>

        <p className="text-sm text-gray-500">
          Site visits, estimates, follow-ups and customer care scheduling.
        </p>

        {calendarBlockoutError && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Google Calendar blockout query error: {calendarBlockoutError}
          </div>
        )}
      </header>

      <WeekSection title="This Week" days={thisWeekDays} />
      <WeekSection title="Next Week" days={nextWeekDays} />

      <section className="mb-8 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">AI Quote Requests</h2>

        <p className="mb-4 text-sm text-gray-500">
          Approved quote request communications ready for estimate scheduling review.
        </p>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {visibleQuoteRequests.length > 0 ? (
            visibleQuoteRequests.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-blue-100 bg-blue-50 p-4"
              >
                <div className="font-semibold text-gray-900">
                  {getQuoteRequestSender(item)}
                </div>

                {(item.ai_summary || item.body) && (
                  <div className="mt-3 line-clamp-3 text-sm text-gray-700">
                    {item.ai_summary || item.body}
                  </div>
                )}

                <div className="mt-3 text-xs text-gray-500">
                  Email · {item.priority || "normal"} · {formatDateTime(item.created_at)}
                  {item.risk_level === "high" ? " · High risk" : ""}
                </div>

                <a
                  href={`/admin/communications/${item.id}`}
                  className="mt-3 inline-flex rounded-md border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
                >
                  Open Communication
                </a>

                <button
                  type="button"
                  onClick={() => openQuoteRequestEstimateModal(item)}
                  className="ml-2 mt-3 inline-flex rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white"
                >
                  Schedule Estimate
                </button>
              </div>
            ))
          ) : (
            <p className="rounded-lg border border-dashed p-3 text-sm text-gray-400">
              No approved AI quote requests waiting for review.
            </p>
          )}
        </div>
      </section>

      <section className="mb-8 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Schedule Quote Requests</h2>

        <p className="mb-4 text-sm text-gray-500">
          New enquiries waiting to be booked into the estimates calendar.
        </p>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {enquiries.length > 0 ? (
            enquiries.map((enquiry) => (
              <div key={enquiry.id} className="rounded-lg border p-3">
                <div className="font-semibold">{enquiry.name}</div>

                <div className="mt-1 text-sm text-gray-500">
                  {enquiry.suburb || "No suburb"}
                </div>

                {enquiry.address && (
                  <div className="text-sm text-gray-500">
                    {enquiry.address}
                  </div>
                )}

                <div className="mt-2 text-xs text-gray-400">
                  {enquiry.job_type || "quote"}
                  {enquiry.budget_range ? ` · ${enquiry.budget_range}` : ""}
                </div>

                {enquiry.notes && (
                  <div className="mt-3 line-clamp-3 rounded-md bg-gray-50 p-2 text-xs text-gray-600">
                    {enquiry.notes}
                  </div>
                )}

                <button
  type="button"
  onClick={() => openEnquiryEstimateModal(enquiry)}
  className="mt-3 h-10 w-full rounded-md bg-blue-600 text-sm font-medium text-white"
>
  Schedule Estimate
</button>
              </div>
            ))
          ) : (
            <p className="rounded-lg border border-dashed p-3 text-sm text-gray-400">
              No quote requests waiting to be scheduled.
            </p>
          )}
        </div>
      </section>

      <section className="mb-8 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Quick Add Estimate</h2>

        <p className="mb-4 text-sm text-gray-500">
          Add a new lead/estimate or search existing customers before booking an
          estimate.
        </p>

        <button
          type="button"
          onClick={() => setNewPropertyOpen(true)}
          className="mb-4 flex h-11 w-full items-center justify-center rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + Add New Lead/Estimate
        </button>

        <input
          className="h-11 w-full rounded-md border px-3"
          placeholder="Search existing property by code, client, address..."
          value={propertySearch}
          onChange={(e) => setPropertySearch(e.target.value)}
        />

        {propertySearch && (
          <div className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {filteredProperties.length > 0 ? (
              filteredProperties.map((property) => (
                <div
                  key={property.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {property.client_name}
                    </div>

                    <div className="truncate text-sm text-gray-500">
                      {property.address_line_1 || "No address"}
                    </div>

                    <div className="mt-1 text-xs text-gray-400">
                      {property.property_code}
                      {property.suburb ? ` · ${property.suburb}` : ""}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openAddModal(property)}
                    className="shrink-0 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white"
                  >
                    Add
                  </button>
                </div>
              ))
            ) : (
              <p className="rounded-lg border border-dashed p-3 text-sm text-gray-400">
                No matching properties found.
              </p>
            )}
          </div>
        )}
      </section>

            <section className="mb-8 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Block Estimate Time</h2>

        <p className="mb-4 text-sm text-gray-500">
          Add unavailable time for lunch, meetings, BNI 1:1s or admin blocks.
        </p>

        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Date</label>

            <input
              type="date"
              className="h-11 w-full rounded-md border px-3"
              value={blockDate}
              onChange={(e) => setBlockDate(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Start Time
            </label>

            <input
              type="time"
              className="h-11 w-full rounded-md border px-3"
              value={blockStartTime}
              onChange={(e) => setBlockStartTime(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              End Time
            </label>

            <input
              type="time"
              className="h-11 w-full rounded-md border px-3"
              value={blockEndTime}
              onChange={(e) => setBlockEndTime(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Title</label>

            <input
              className="h-11 w-full rounded-md border px-3"
              value={blockTitle}
              onChange={(e) => setBlockTitle(e.target.value)}
              placeholder="e.g. Lunch, BNI 1:1"
            />
          </div>

          <div className="md:col-span-4">
            <label className="mb-1 block text-sm font-medium">Notes</label>

            <textarea
              className="min-h-[80px] w-full rounded-md border p-3"
              value={blockNotes}
              onChange={(e) => setBlockNotes(e.target.value)}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleSaveBlock}
          disabled={savingBlock}
          className="mt-4 h-11 w-full rounded-md bg-amber-600 font-medium text-white disabled:bg-gray-300"
        >
          {savingBlock ? "Saving..." : "Block Time"}
        </button>
      </section>

      {modalOpen && selectedProperty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <h2 className="mb-1 text-xl font-semibold">
              {selectedEstimate ? "Edit Estimate" : "Add Estimate"}
            </h2>

            <p className="mb-4 text-sm text-gray-500">
              {selectedProperty.client_name}
            </p>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Date</label>

                <input
                  type="date"
                  className="h-11 w-full rounded-md border px-3"
                  value={estimateDate}
                  onChange={(e) => setEstimateDate(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Start Time
                </label>

                <input
                  type="time"
                  className="h-11 w-full rounded-md border px-3"
                  value={estimateStartTime}
                  onChange={(e) => setEstimateStartTime(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Duration
                </label>

                <input
                  type="number"
                  step="0.25"
                  className="h-11 w-full rounded-md border px-3"
                  value={estimateDuration}
                  onChange={(e) => setEstimateDuration(e.target.value)}
                  placeholder="e.g. 1"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Estimate Notes
                </label>

                <textarea
                  className="min-h-[120px] w-full rounded-md border p-3"
                  value={estimateNotes}
                  onChange={(e) => setEstimateNotes(e.target.value)}
                  placeholder="Notes for site visit, customer requirements, access details..."
                />
              </div>

              {error && (
                <p className="rounded-md bg-red-50 p-2 text-sm text-red-600">
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={resetModal}
                  className="h-11 flex-1 rounded-md border"
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleSaveEstimate}
                  className="h-11 flex-1 rounded-md bg-blue-600 font-medium text-white"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : selectedEstimate
                      ? "Save Changes"
                      : "Create Estimate"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <NewPropertyModal
        open={newPropertyOpen}
        onOpenChange={setNewPropertyOpen}
      />
    </div>
  )
}
