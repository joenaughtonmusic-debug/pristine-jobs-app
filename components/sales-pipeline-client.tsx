"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  PIPELINE_STAGES,
  STATUS_LABELS,
  appendActivities,
  createActivity,
  formatActivityType,
  formatDateTime,
  getLeadColumn,
  getNextAction,
  isOverdue,
  parseNotes,
  type SalesLead,
  type SalesLeadStatus,
} from "@/lib/sales-leads"

type Props = {
  leads: SalesLead[]
}

type EditDraft = {
  source: string
  name: string
  email: string
  phone: string
  address: string
  suburb: string
  service_needed: string
  message: string
  assigned_to: string
  next_follow_up_at: string
  quote_value: string
  lost_reason: string
  status: SalesLeadStatus
}

const ACTIVE_STATUSES: SalesLeadStatus[] = [
  "new",
  "contacted",
  "visit_booked",
  "estimate_done",
  "quote_sent",
  "follow_up_due",
]

function toDatetimeLocalValue(value: string | null) {
  if (!value) return ""

  const date = new Date(value)
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60_000)

  return local.toISOString().slice(0, 16)
}

function fromDatetimeLocalValue(value: string) {
  if (!value.trim()) return null
  return new Date(value).toISOString()
}

function getLeadSortValue(lead: SalesLead) {
  const overdue = isOverdue(lead) ? 0 : 1
  const active = ACTIVE_STATUSES.includes(lead.status) ? 0 : 1

  return `${active}-${overdue}-${lead.created_at}`
}

function getChipClasses(lead: SalesLead, expanded: boolean) {
  if (lead.status === "won") {
    return expanded
      ? "border-green-600 bg-green-50 text-green-900"
      : "border-green-200 bg-green-50 text-green-900 hover:bg-green-100"
  }

  if (lead.status === "lost") {
    return expanded
      ? "border-gray-400 bg-gray-100 text-gray-700"
      : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
  }

  if (isOverdue(lead)) {
    return expanded
      ? "border-red-500 bg-red-50 text-red-900"
      : "border-red-300 bg-red-50 text-red-900 hover:bg-red-100"
  }

  return expanded
    ? "border-gray-900 bg-white text-gray-900"
    : "border-gray-200 bg-white text-gray-900 hover:bg-gray-50"
}

function leadToDraft(lead: SalesLead): EditDraft {
  return {
    source: lead.source || "",
    name: lead.name,
    email: lead.email || "",
    phone: lead.phone || "",
    address: lead.address || "",
    suburb: lead.suburb || "",
    service_needed: lead.service_needed || "",
    message: lead.message || "",
    assigned_to: lead.assigned_to || "",
    next_follow_up_at: toDatetimeLocalValue(lead.next_follow_up_at),
    quote_value: lead.quote_value != null ? String(lead.quote_value) : "",
    lost_reason: lead.lost_reason || "",
    status: lead.status,
  }
}

export function SalesPipelineClient({ leads = [] }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)
  const [noteDraft, setNoteDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newLead, setNewLead] = useState({
    source: "",
    name: "",
    email: "",
    phone: "",
    suburb: "",
    service_needed: "",
    message: "",
  })

  const sortedLeads = useMemo(
    () =>
      [...leads].sort((a, b) =>
        getLeadSortValue(a).localeCompare(getLeadSortValue(b))
      ),
    [leads]
  )

  const updateLead = async (
    lead: SalesLead,
    patch: Partial<SalesLead> & { notes?: SalesLead["notes"] },
    activityContent?: string
  ) => {
    setSaving(true)

    const activities = activityContent
      ? appendActivities(
          lead.notes,
          createActivity("status_change", activityContent)
        )
      : parseNotes(lead.notes)

    const { error } = await supabase
      .from("sales_leads")
      .update({
        ...patch,
        notes: activities,
      })
      .eq("id", lead.id)

    setSaving(false)

    if (error) {
      alert(error.message)
      return
    }

    router.refresh()
  }

  const handleStatusChange = async (
    lead: SalesLead,
    status: SalesLeadStatus,
    label: string
  ) => {
    await updateLead(
      lead,
      { status },
      `${label}: ${STATUS_LABELS[lead.status]} → ${STATUS_LABELS[status]}`
    )
  }

  const handleAddNote = async (lead: SalesLead) => {
    const content = noteDraft.trim()
    if (!content) return

    setSaving(true)

    const notes = appendActivities(
      lead.notes,
      createActivity("note", content)
    )

    const { error } = await supabase
      .from("sales_leads")
      .update({ notes })
      .eq("id", lead.id)

    setSaving(false)

    if (error) {
      alert(error.message)
      return
    }

    setNoteDraft("")
    router.refresh()
  }

  const handleSaveEdit = async (lead: SalesLead) => {
    if (!editDraft || !editDraft.name.trim()) {
      alert("Lead name is required.")
      return
    }

    setSaving(true)

    const nextFollowUp = fromDatetimeLocalValue(editDraft.next_follow_up_at)
    const quoteValue = editDraft.quote_value.trim()
      ? Number(editDraft.quote_value)
      : null

    const patch = {
      source: editDraft.source.trim() || null,
      name: editDraft.name.trim(),
      email: editDraft.email.trim() || null,
      phone: editDraft.phone.trim() || null,
      address: editDraft.address.trim() || null,
      suburb: editDraft.suburb.trim() || null,
      service_needed: editDraft.service_needed.trim() || null,
      message: editDraft.message.trim() || null,
      assigned_to: editDraft.assigned_to.trim() || null,
      next_follow_up_at: nextFollowUp,
      quote_value: quoteValue,
      lost_reason: editDraft.lost_reason.trim() || null,
      status: editDraft.status,
    }

    const activities = [...parseNotes(lead.notes)]

    if (editDraft.status !== lead.status) {
      activities.unshift(
        createActivity(
          "status_change",
          `Edited: ${STATUS_LABELS[lead.status]} → ${STATUS_LABELS[editDraft.status]}`
        )
      )
    }

    const { error } = await supabase
      .from("sales_leads")
      .update({
        ...patch,
        notes: activities,
      })
      .eq("id", lead.id)

    setSaving(false)

    if (error) {
      alert(error.message)
      return
    }

    setEditingId(null)
    setEditDraft(null)
    router.refresh()
  }

  const handleCreateLead = async () => {
    if (!newLead.name.trim()) {
      alert("Lead name is required.")
      return
    }

    setSaving(true)

    const { error } = await supabase.from("sales_leads").insert({
      source: newLead.source.trim() || null,
      name: newLead.name.trim(),
      email: newLead.email.trim() || null,
      phone: newLead.phone.trim() || null,
      suburb: newLead.suburb.trim() || null,
      service_needed: newLead.service_needed.trim() || null,
      message: newLead.message.trim() || null,
      status: "new",
      notes: [
        createActivity("note", "Lead created manually in Sales Pipeline."),
      ],
    })

    setSaving(false)

    if (error) {
      alert(error.message)
      return
    }

    setNewLead({
      source: "",
      name: "",
      email: "",
      phone: "",
      suburb: "",
      service_needed: "",
      message: "",
    })
    setShowAddForm(false)
    router.refresh()
  }

  const toggleExpanded = (lead: SalesLead) => {
    if (expandedId === lead.id) {
      setExpandedId(null)
      setEditingId(null)
      setEditDraft(null)
      setNoteDraft("")
      return
    }

    setExpandedId(lead.id)
    setEditingId(null)
    setEditDraft(null)
    setNoteDraft("")
  }

  return (
    <div className="mx-auto max-w-7xl p-4 pb-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">
            <Link href="/admin" className="hover:text-gray-800">
              Admin
            </Link>
          </p>
          <h1 className="text-2xl font-bold text-gray-900">Sales Pipeline</h1>
          <p className="mt-1 text-sm text-gray-500">
            Lead journey view — each name moves left to right as the lead
            progresses.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => setShowAddForm((current) => !current)}
        >
          {showAddForm ? "Close" : "Add lead"}
        </Button>
      </header>

      {showAddForm && (
        <section className="mb-6 rounded-lg border bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">New lead</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              placeholder="Name"
              value={newLead.name}
              onChange={(event) =>
                setNewLead((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
            <Input
              placeholder="Source"
              value={newLead.source}
              onChange={(event) =>
                setNewLead((current) => ({
                  ...current,
                  source: event.target.value,
                }))
              }
            />
            <Input
              placeholder="Phone"
              value={newLead.phone}
              onChange={(event) =>
                setNewLead((current) => ({
                  ...current,
                  phone: event.target.value,
                }))
              }
            />
            <Input
              placeholder="Email"
              value={newLead.email}
              onChange={(event) =>
                setNewLead((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
            />
            <Input
              placeholder="Suburb"
              value={newLead.suburb}
              onChange={(event) =>
                setNewLead((current) => ({
                  ...current,
                  suburb: event.target.value,
                }))
              }
            />
            <Input
              placeholder="Service needed"
              value={newLead.service_needed}
              onChange={(event) =>
                setNewLead((current) => ({
                  ...current,
                  service_needed: event.target.value,
                }))
              }
            />
          </div>
          <Textarea
            className="mt-3"
            placeholder="Message / notes"
            value={newLead.message}
            onChange={(event) =>
              setNewLead((current) => ({
                ...current,
                message: event.target.value,
              }))
            }
          />
          <div className="mt-3">
            <Button type="button" disabled={saving} onClick={handleCreateLead}>
              Save lead
            </Button>
          </div>
        </section>
      )}

      <div className="overflow-x-auto rounded-lg border bg-white">
        <div className="min-w-[960px]">
          <div className="grid grid-cols-7 border-b bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
            {PIPELINE_STAGES.map((stage) => (
              <div key={stage.key} className="px-3 py-3 text-center">
                {stage.label}
              </div>
            ))}
          </div>

          {sortedLeads.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-500">
              No leads yet. Add one to start the pipeline.
            </div>
          ) : (
            sortedLeads.map((lead) => {
              const column = getLeadColumn(lead.status)
              const expanded = expandedId === lead.id
              const editing = editingId === lead.id
              const activities = parseNotes(lead.notes)
              const overdue = isOverdue(lead)

              return (
                <div key={lead.id} className="border-b last:border-b-0">
                  <button
                    type="button"
                    className="grid w-full grid-cols-7 text-left"
                    onClick={() => toggleExpanded(lead)}
                  >
                    {PIPELINE_STAGES.map((stage) => (
                      <div
                        key={stage.key}
                        className="flex min-h-[52px] items-center justify-center px-2 py-2"
                      >
                        {column === stage.key ? (
                          <span
                            className={cn(
                              "inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                              getChipClasses(lead, expanded)
                            )}
                          >
                            <span className="truncate">{lead.name}</span>
                            {overdue ? (
                              <span
                                className="h-2 w-2 shrink-0 rounded-full bg-red-500"
                                title="Overdue follow-up"
                              />
                            ) : null}
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </button>

                  {expanded ? (
                    <div className="border-t bg-gray-50 px-4 py-4">
                      {editing && editDraft ? (
                        <div className="space-y-3">
                          <div className="grid gap-3 md:grid-cols-2">
                            <Input
                              value={editDraft.name}
                              onChange={(event) =>
                                setEditDraft((current) =>
                                  current
                                    ? { ...current, name: event.target.value }
                                    : current
                                )
                              }
                            />
                            <Input
                              placeholder="Source"
                              value={editDraft.source}
                              onChange={(event) =>
                                setEditDraft((current) =>
                                  current
                                    ? { ...current, source: event.target.value }
                                    : current
                                )
                              }
                            />
                            <Input
                              placeholder="Suburb"
                              value={editDraft.suburb}
                              onChange={(event) =>
                                setEditDraft((current) =>
                                  current
                                    ? { ...current, suburb: event.target.value }
                                    : current
                                )
                              }
                            />
                            <Input
                              placeholder="Service needed"
                              value={editDraft.service_needed}
                              onChange={(event) =>
                                setEditDraft((current) =>
                                  current
                                    ? {
                                        ...current,
                                        service_needed: event.target.value,
                                      }
                                    : current
                                )
                              }
                            />
                            <Input
                              placeholder="Phone"
                              value={editDraft.phone}
                              onChange={(event) =>
                                setEditDraft((current) =>
                                  current
                                    ? { ...current, phone: event.target.value }
                                    : current
                                )
                              }
                            />
                            <Input
                              placeholder="Email"
                              value={editDraft.email}
                              onChange={(event) =>
                                setEditDraft((current) =>
                                  current
                                    ? { ...current, email: event.target.value }
                                    : current
                                )
                              }
                            />
                            <Input
                              placeholder="Address"
                              value={editDraft.address}
                              onChange={(event) =>
                                setEditDraft((current) =>
                                  current
                                    ? {
                                        ...current,
                                        address: event.target.value,
                                      }
                                    : current
                                )
                              }
                            />
                            <Input
                              placeholder="Assigned to"
                              value={editDraft.assigned_to}
                              onChange={(event) =>
                                setEditDraft((current) =>
                                  current
                                    ? {
                                        ...current,
                                        assigned_to: event.target.value,
                                      }
                                    : current
                                )
                              }
                            />
                            <Input
                              type="datetime-local"
                              value={editDraft.next_follow_up_at}
                              onChange={(event) =>
                                setEditDraft((current) =>
                                  current
                                    ? {
                                        ...current,
                                        next_follow_up_at: event.target.value,
                                      }
                                    : current
                                )
                              }
                            />
                            <Input
                              placeholder="Quote value"
                              value={editDraft.quote_value}
                              onChange={(event) =>
                                setEditDraft((current) =>
                                  current
                                    ? {
                                        ...current,
                                        quote_value: event.target.value,
                                      }
                                    : current
                                )
                              }
                            />
                            <select
                              className="h-9 rounded-md border bg-white px-3 text-sm"
                              value={editDraft.status}
                              onChange={(event) =>
                                setEditDraft((current) =>
                                  current
                                    ? {
                                        ...current,
                                        status: event.target
                                          .value as SalesLeadStatus,
                                      }
                                    : current
                                )
                              }
                            >
                              {Object.entries(STATUS_LABELS).map(
                                ([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                )
                              )}
                            </select>
                            <Input
                              placeholder="Lost reason"
                              value={editDraft.lost_reason}
                              onChange={(event) =>
                                setEditDraft((current) =>
                                  current
                                    ? {
                                        ...current,
                                        lost_reason: event.target.value,
                                      }
                                    : current
                                )
                              }
                            />
                          </div>
                          <Textarea
                            placeholder="Message"
                            value={editDraft.message}
                            onChange={(event) =>
                              setEditDraft((current) =>
                                current
                                  ? { ...current, message: event.target.value }
                                  : current
                              )
                            }
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              disabled={saving}
                              onClick={() => handleSaveEdit(lead)}
                            >
                              Save changes
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setEditingId(null)
                                setEditDraft(null)
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <DetailItem label="Source" value={lead.source} />
                            <DetailItem label="Suburb" value={lead.suburb} />
                            <DetailItem
                              label="Service needed"
                              value={lead.service_needed}
                            />
                            <DetailItem
                              label="Next action"
                              value={getNextAction(lead.status)}
                            />
                            <DetailItem label="Phone" value={lead.phone} />
                            <DetailItem label="Email" value={lead.email} />
                          </div>

                          {lead.message ? (
                            <p className="mt-4 text-sm text-gray-700">
                              <span className="font-medium text-gray-900">
                                Message:{" "}
                              </span>
                              {lead.message}
                            </p>
                          ) : null}

                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={saving || lead.status !== "new"}
                              onClick={() =>
                                handleStatusChange(
                                  lead,
                                  "contacted",
                                  "Mark Contacted"
                                )
                              }
                            >
                              Mark Contacted
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={
                                saving ||
                                !["new", "contacted"].includes(lead.status)
                              }
                              onClick={() =>
                                handleStatusChange(
                                  lead,
                                  "visit_booked",
                                  "Book Visit"
                                )
                              }
                            >
                              Book Visit
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={
                                saving ||
                                ![
                                  "visit_booked",
                                  "estimate_done",
                                  "quote_sent",
                                  "follow_up_due",
                                ].includes(lead.status)
                              }
                              onClick={() =>
                                handleStatusChange(
                                  lead,
                                  "quote_sent",
                                  "Send Quote"
                                )
                              }
                            >
                              Send Quote
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={
                                saving ||
                                lead.status === "won" ||
                                lead.status === "lost"
                              }
                              onClick={() =>
                                handleStatusChange(lead, "won", "Mark Won")
                              }
                            >
                              Mark Won
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={
                                saving ||
                                lead.status === "won" ||
                                lead.status === "lost"
                              }
                              onClick={() =>
                                handleStatusChange(lead, "lost", "Mark Lost")
                              }
                            >
                              Mark Lost
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingId(lead.id)
                                setEditDraft(leadToDraft(lead))
                              }}
                            >
                              Edit
                            </Button>
                          </div>

                          <details className="mt-5 rounded-md border bg-white">
                            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-900">
                              Notes &amp; history
                            </summary>
                            <div className="space-y-4 border-t px-4 py-4">
                              <div className="space-y-3">
                                {activities.length === 0 ? (
                                  <p className="text-sm text-gray-500">
                                    No notes or history yet.
                                  </p>
                                ) : (
                                  activities.map((entry) => (
                                    <div
                                      key={entry.id}
                                      className="border-l-2 border-gray-200 pl-3"
                                    >
                                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                        <span className="font-medium text-gray-700">
                                          {formatActivityType(entry.type)}
                                        </span>
                                        <span>{formatDateTime(entry.created_at)}</span>
                                      </div>
                                      <p className="mt-1 text-sm text-gray-700">
                                        {entry.content}
                                      </p>
                                    </div>
                                  ))
                                )}
                              </div>

                              <div className="flex flex-col gap-2 sm:flex-row">
                                <Input
                                  placeholder="Add a note"
                                  value={noteDraft}
                                  onChange={(event) =>
                                    setNoteDraft(event.target.value)
                                  }
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={saving || !noteDraft.trim()}
                                  onClick={() => handleAddNote(lead)}
                                >
                                  Add note
                                </Button>
                              </div>
                            </div>
                          </details>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

function DetailItem({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-sm text-gray-900">{value?.trim() || "—"}</p>
    </div>
  )
}
