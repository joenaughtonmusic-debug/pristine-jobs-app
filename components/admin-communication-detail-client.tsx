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

export function AdminCommunicationDetailClient({ communication }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const linkedEnquiry = getLinkedEnquiry(communication)

  const [status, setStatus] = useState<CommunicationStatus>(normalizeStatus(communication.status))
  const [category, setCategory] = useState<CommunicationCategory>(communication.category || "general")
  const [priority, setPriority] = useState<CommunicationPriority>(communication.priority || "normal")
  const [riskLevel, setRiskLevel] = useState<CommunicationRiskLevel>(communication.risk_level || "low")
  const [assignedTo, setAssignedTo] = useState<CommunicationAssignee>(communication.assigned_to || "unassigned")
  const [requiresReview, setRequiresReview] = useState(Boolean(communication.requires_review))
  const [aiSummary, setAiSummary] = useState(communication.ai_summary || "")
  const [suggestedReply, setSuggestedReply] = useState(communication.suggested_reply || "")
  const [saving, setSaving] = useState(false)

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
            />
            <p className="mt-1 text-xs text-gray-500">
              Internal draft only. This does not send email or SMS.
            </p>
          </div>
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
