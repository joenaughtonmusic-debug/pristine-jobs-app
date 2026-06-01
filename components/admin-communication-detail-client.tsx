"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type {
  CommunicationAssignee,
  CommunicationCategory,
  CommunicationPriority,
  CommunicationRiskLevel,
  CommunicationStatus,
  CommunicationWithEnquiry,
} from "@/lib/types"

type Props = {
  communication: CommunicationWithEnquiry
}

type RecommendedAction =
  | "create_schedule_note"
  | "create_estimate"
  | "create_enquiry"
  | "invoice_review"
  | "urgent_review"
  | "none"

const statusOptions: { value: CommunicationStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "needs_reply", label: "Needs reply" },
  { value: "needs_scheduling", label: "Needs scheduling" },
  { value: "needs_estimator", label: "Needs estimator" },
  { value: "waiting_customer", label: "Waiting customer" },
  { value: "escalate_to_joe", label: "Escalate to Joe" },
  { value: "closed", label: "Closed" },
]

const categoryOptions: { value: CommunicationCategory; label: string }[] = [
  { value: "quote_request", label: "Quote request" },
  { value: "scheduling", label: "Scheduling" },
  { value: "maintenance_query", label: "Maintenance query" },
  { value: "invoice_payment", label: "Invoice/payment" },
  { value: "complaint", label: "Complaint" },
  { value: "general", label: "General" },
  { value: "internal_note", label: "Internal note" },
]

const priorityOptions: { value: CommunicationPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
]

const riskOptions: { value: CommunicationRiskLevel; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
]

const assigneeOptions: { value: CommunicationAssignee; label: string }[] = [
  { value: "unassigned", label: "Unassigned" },
  { value: "va", label: "VA" },
  { value: "estimator", label: "Estimator" },
  { value: "maintenance_team", label: "Maintenance team" },
  { value: "landscaping_team", label: "Landscaping team" },
  { value: "joe", label: "Joe" },
]

function getLinkedEnquiry(row: CommunicationWithEnquiry) {
  const enquiry = row.admin_enquiries
  return Array.isArray(enquiry) ? enquiry[0] : enquiry
}

function normalizeStatus(value?: string | null): CommunicationStatus {
  if (value === "draft" || value === "failed") return "needs_reply"
  if (value === "sent" || value === "delivered") return "waiting_customer"
  if (value === "archived") return "closed"
  if (value === "received" || value === "queued") return "new"
  if (statusOptions.some((option) => option.value === value)) return value as CommunicationStatus
  return "new"
}

export function getRecommendedAction(metadata: unknown): RecommendedAction {
  if (!metadata) return "none"

  const parsedMetadata = parseMetadata(metadata)

  if (!parsedMetadata) return "none"

  const action = (parsedMetadata as { recommended_action?: unknown }).recommended_action

  if (
    action === "create_schedule_note" ||
    action === "create_estimate" ||
    action === "create_enquiry" ||
    action === "invoice_review" ||
    action === "urgent_review" ||
    action === "none"
  ) {
    return action
  }

  return "none"
}

function parseMetadata(metadata: unknown): Record<string, unknown> | null {
  if (!metadata) return null

  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata)
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null
    } catch {
      return null
    }
  }

  if (typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>
  }

  return null
}

function ensurePristineSignature(text: string) {
  const signature = "Kind regards,\nPristine Gardens"
  const trimmed = text.trim()

  if (!trimmed) return signature
  if (trimmed.endsWith(signature)) return trimmed

  return `${trimmed}\n\n${signature}`
}

function getMetadataFromEmail(metadata: unknown) {
  const parsedMetadata = parseMetadata(metadata)
  const fromEmail = parsedMetadata?.from_email

  return typeof fromEmail === "string" && fromEmail.trim()
    ? fromEmail.trim()
    : null
}

function getSourceCategoryLabel(value?: string | null) {
  if (value === "aggregator_lead") return "Aggregator Lead"
  return value?.replaceAll("_", " ") || "Unset"
}

export function getRecommendedActionLabel(action: RecommendedAction) {
  if (action === "create_schedule_note") return "Create schedule note"
  if (action === "create_estimate") return "Create estimate"
  if (action === "create_enquiry") return "Create enquiry"
  if (action === "invoice_review") return "Open invoice review"
  if (action === "urgent_review") return "Flag management review"
  return "No action recommended"
}

export function AdminCommunicationDetailClient({ communication }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const linkedEnquiry = getLinkedEnquiry(communication)
  const recommendedAction = getRecommendedAction(communication.metadata)
  const isAggregatorLead = communication.source_category === "aggregator_lead"

  const [status, setStatus] = useState<CommunicationStatus>(normalizeStatus(communication.status))
  const [category, setCategory] = useState<CommunicationCategory>(communication.category || "general")
  const [priority, setPriority] = useState<CommunicationPriority>(communication.priority || "normal")
  const [riskLevel, setRiskLevel] = useState<CommunicationRiskLevel>(communication.risk_level || "low")
  const [assignedTo, setAssignedTo] = useState<CommunicationAssignee>(communication.assigned_to || "unassigned")
  const [requiresReview, setRequiresReview] = useState(Boolean(communication.requires_review))
  const [aiSummary, setAiSummary] = useState(communication.ai_summary || "")
  const [suggestedReply, setSuggestedReply] = useState(communication.suggested_reply || "")
  const [replyDraft, setReplyDraft] = useState(() =>
    ensurePristineSignature(communication.suggested_reply || "")
  )
  const [saving, setSaving] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [sendingReply, setSendingReply] = useState(false)
  const [draftMessage, setDraftMessage] = useState<string | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)

  const saveTriage = async () => {
    setSaving(true)

    const { error } = await supabase
      .from("communications")
      .update({
        status,
        category,
        priority,
        risk_level: riskLevel,
        assigned_to: assignedTo,
        requires_review: requiresReview,
        ai_summary: aiSummary.trim() || null,
        suggested_reply: suggestedReply.trim() || null,
      })
      .eq("id", communication.id)

    setSaving(false)

    if (error) {
      alert(error.message)
      return
    }

    router.refresh()
  }

  const saveReplyDraft = async () => {
    const draft = ensurePristineSignature(replyDraft)

    setSavingDraft(true)
    setDraftMessage(null)
    setDraftError(null)

    const { error } = await supabase
      .from("communications")
      .update({ suggested_reply: draft })
      .eq("id", communication.id)

    setSavingDraft(false)

    if (error) {
      setDraftError(error.message)
      return
    }

    setReplyDraft(draft)
    setSuggestedReply(draft)
    setDraftMessage("Draft saved.")
  }

  const sendReply = async () => {
    const webhookUrl = process.env.NEXT_PUBLIC_SEND_COMMUNICATION_REPLY_WEBHOOK_URL
    const toEmail = getMetadataFromEmail(communication.metadata)
    const body = ensurePristineSignature(replyDraft)
    const subject = `Re: ${communication.subject || "Pristine Gardens"}`

    setDraftMessage(null)
    setDraftError(null)

    if (!webhookUrl) {
      setDraftError("Reply webhook URL is not configured.")
      return
    }

    if (!toEmail) {
      setDraftError("Cannot send reply because metadata.from_email is missing.")
      return
    }

    setSendingReply(true)

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          communication_id: communication.id,
          to_email: toEmail,
          subject,
          body,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || "Reply webhook failed.")
      }

      const sentAt = new Date().toISOString()
      const nextMetadata = {
        ...(parseMetadata(communication.metadata) || {}),
        reply_sent: true,
        reply_sent_at: sentAt,
      }

      const { error } = await supabase
        .from("communications")
        .update({
          suggested_reply: body,
          status: "closed",
          delivered_at: sentAt,
          metadata: nextMetadata,
        })
        .eq("id", communication.id)

      if (error) {
        throw new Error(error.message)
      }

      setReplyDraft(body)
      setSuggestedReply(body)
      setDraftMessage("Reply sent.")
      router.refresh()
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : "Failed to send reply.")
    } finally {
      setSendingReply(false)
    }
  }

  const handleCreateScheduleNote = async () => {
    const nextMetadata = {
      ...(parseMetadata(communication.metadata) || {}),
      schedule_action_approved: true,
      schedule_action_approved_at: new Date().toISOString(),
    }

    setSaving(true)

    const { error } = await supabase
      .from("communications")
      .update({ metadata: nextMetadata })
      .eq("id", communication.id)

    setSaving(false)

    if (error) {
      alert(error.message)
      return
    }

    router.refresh()
  }

  const handleCreateEstimate = async () => {
    const nextMetadata = {
      ...(parseMetadata(communication.metadata) || {}),
      estimate_action_approved: true,
      estimate_action_approved_at: new Date().toISOString(),
    }

    setSaving(true)

    const { error } = await supabase
      .from("communications")
      .update({ metadata: nextMetadata })
      .eq("id", communication.id)

    setSaving(false)

    if (error) {
      alert(error.message)
      return
    }

    router.refresh()
  }

  const handleCreateEnquiry = () => {
    // TODO: Wire this to admin_enquiries creation once metadata includes the
    // required enquiry fields such as customer name and contact details.
    alert("Create Enquiry is not wired yet.")
  }

  const handleInvoiceReview = () => {
    // TODO: Wire this to a dedicated invoice review workflow if one is added.
    alert("Open Invoice Review is not wired yet.")
  }

  const handleUrgentReview = async () => {
    setSaving(true)

    const { error } = await supabase
      .from("communications")
      .update({
        status: "escalate_to_joe",
        priority: "urgent",
        risk_level: "high",
        assigned_to: "joe",
        requires_review: true,
      })
      .eq("id", communication.id)

    setSaving(false)

    if (error) {
      alert(error.message)
      return
    }

    setStatus("escalate_to_joe")
    setPriority("urgent")
    setRiskLevel("high")
    setAssignedTo("joe")
    setRequiresReview(true)
    router.refresh()
  }

  const handleRecommendedAction = () => {
    if (recommendedAction === "create_schedule_note") {
      handleCreateScheduleNote()
      return
    }

    if (recommendedAction === "create_estimate") {
      handleCreateEstimate()
      return
    }

    if (recommendedAction === "create_enquiry") {
      handleCreateEnquiry()
      return
    }

    if (recommendedAction === "invoice_review") {
      handleInvoiceReview()
      return
    }

    if (recommendedAction === "urgent_review") {
      handleUrgentReview()
    }
  }

  const updateInboxState = async (ignored: boolean, requiresAction: boolean) => {
    setSaving(true)

    const { error } = await supabase
      .from("communications")
      .update({
        ignored,
        requires_action: requiresAction,
      })
      .eq("id", communication.id)

    setSaving(false)

    if (error) {
      alert(error.message)
      return
    }

    router.refresh()
  }

  return (
    <div className="space-y-4">
      {linkedEnquiry && (
        <div className="rounded-lg border bg-gray-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-semibold text-gray-900">
                {linkedEnquiry.name}
              </div>
              <div className="mt-1 text-gray-600">
                {[linkedEnquiry.address, linkedEnquiry.suburb].filter(Boolean).join(", ") || "No address"}
              </div>
            </div>

            <a
              href={`/admin/enquiries#enquiry-${linkedEnquiry.id}`}
              className="shrink-0 rounded-md border px-3 py-2 text-xs font-medium hover:bg-white"
            >
              Open Enquiry
            </a>
          </div>
        </div>
      )}

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-lg font-semibold">Recommended Action</h2>
        {communication.source_category && (
          <div className="mb-3 inline-flex rounded-full bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-800">
            {getSourceCategoryLabel(communication.source_category)}
          </div>
        )}
        <div className="text-sm text-gray-700">
          {getRecommendedActionLabel(recommendedAction)}
        </div>

        {recommendedAction !== "none" ? (
          <button
            type="button"
            onClick={handleRecommendedAction}
            disabled={saving}
            className="mt-4 h-10 rounded bg-black px-4 text-sm font-medium text-white disabled:bg-gray-300"
          >
            {recommendedAction === "create_schedule_note" && "Approve for Schedule Page"}
            {recommendedAction === "create_estimate" && "Approve for Estimate Scheduling"}
            {recommendedAction === "create_enquiry" && "Create Enquiry"}
            {recommendedAction === "invoice_review" && "Open Invoice Review"}
            {recommendedAction === "urgent_review" && "Flag Management Review"}
          </button>
        ) : (
          <p className="mt-2 text-sm text-gray-500">No action recommended</p>
        )}
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-lg font-semibold">Inbox Visibility</h2>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => updateInboxState(true, false)}
            disabled={saving}
            className="h-10 rounded border px-4 text-sm font-medium disabled:bg-gray-100"
          >
            Mark Ignored
          </button>

          <button
            type="button"
            onClick={() => updateInboxState(false, true)}
            disabled={saving}
            className="h-10 rounded bg-blue-600 px-4 text-sm font-medium text-white disabled:bg-gray-300"
          >
            Move to Inbox
          </button>
        </div>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-4 text-lg font-semibold">Triage Workflow</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Status</label>
            <select
              className="h-11 w-full rounded-md border px-3"
              value={status}
              onChange={(event) => setStatus(event.target.value as CommunicationStatus)}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Category</label>
            <select
              className="h-11 w-full rounded-md border px-3"
              value={category}
              onChange={(event) => setCategory(event.target.value as CommunicationCategory)}
            >
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Priority</label>
            <select
              className="h-11 w-full rounded-md border px-3"
              value={priority}
              onChange={(event) => setPriority(event.target.value as CommunicationPriority)}
            >
              {priorityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Risk Level</label>
            <select
              className="h-11 w-full rounded-md border px-3"
              value={riskLevel}
              onChange={(event) => setRiskLevel(event.target.value as CommunicationRiskLevel)}
            >
              {riskOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Assigned To</label>
            <select
              className="h-11 w-full rounded-md border px-3"
              value={assignedTo}
              onChange={(event) => setAssignedTo(event.target.value as CommunicationAssignee)}
            >
              {assigneeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={requiresReview}
              onChange={(event) => setRequiresReview(event.target.checked)}
            />
            Requires review
          </label>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">AI Summary</label>
            <textarea
              className="min-h-[100px] w-full rounded-md border p-3"
              value={aiSummary}
              onChange={(event) => setAiSummary(event.target.value)}
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Suggested Reply</label>
            <textarea
              className="min-h-[140px] w-full rounded-md border p-3"
              value={suggestedReply}
              onChange={(event) => setSuggestedReply(event.target.value)}
              disabled={isAggregatorLead}
            />
            <p className="mt-1 text-xs text-gray-500">
              Internal draft only. This does not send email or SMS.
            </p>
          </div>

          {isAggregatorLead ? (
            <div className="md:col-span-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Aggregator lead — reply should be handled in Builderscrack/Bark, not by email.
            </div>
          ) : (
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium">Editable Reply Draft</label>
              <textarea
                className="min-h-[140px] w-full rounded-md border p-3"
                value={replyDraft}
                onChange={(event) => setReplyDraft(event.target.value)}
              />
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={saveReplyDraft}
                  disabled={savingDraft || sendingReply}
                  className="h-10 rounded bg-blue-600 px-4 text-sm font-medium text-white disabled:bg-gray-300"
                >
                  {savingDraft ? "Saving..." : "Save Draft"}
                </button>

                <button
                  type="button"
                  onClick={sendReply}
                  disabled={savingDraft || sendingReply}
                  className="h-10 rounded bg-green-600 px-4 text-sm font-medium text-white disabled:bg-gray-300"
                >
                  {sendingReply ? "Sending..." : "Send Reply"}
                </button>

                {draftMessage && (
                  <span className="text-sm text-green-700">{draftMessage}</span>
                )}

                {draftError && (
                  <span className="text-sm text-red-600">{draftError}</span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={saveTriage}
            disabled={saving}
            className="h-11 rounded bg-blue-600 px-4 font-medium text-white disabled:bg-gray-300"
          >
            {saving ? "Saving..." : "Save Triage"}
          </button>
        </div>
      </section>

      <section className="rounded-lg border p-4 text-sm text-gray-700">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Communication</h2>
        <div className="space-y-4">
          <div><strong>Channel:</strong> {communication.channel}</div>
          <div><strong>Direction:</strong> {communication.direction}</div>
          <div><strong>Subject:</strong> {communication.subject || ""}</div>
          <div><strong>Body:</strong></div>
          <div className="whitespace-pre-wrap rounded-md border p-3">{communication.body || ""}</div>
          <div><strong>External ID:</strong> {communication.external_id || ""}</div>
          <div><strong>Sent by:</strong> {communication.sent_by || ""}</div>
          <div><strong>Enquiry ID:</strong> {communication.enquiry_id || ""}</div>
          <div><strong>Property ID:</strong> {communication.property_id || ""}</div>
          <div><strong>Job ID:</strong> {communication.job_id || ""}</div>
          <div><strong>Visit ID:</strong> {communication.visit_id || ""}</div>
          <div><strong>Metadata:</strong></div>
          <pre className="mt-2 rounded-md border p-3 text-xs">{communication.metadata ? JSON.stringify(communication.metadata, null, 2) : "{}"}</pre>
          <div className="mt-2 text-xs text-gray-400">Created at: {communication.created_at}</div>
          <div className="text-xs text-gray-400">Delivered at: {communication.delivered_at || ""}</div>
        </div>
      </section>
    </div>
  )
}
