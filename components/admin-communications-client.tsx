"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import type {
  CommunicationAssignee,
  CommunicationCategory,
  CommunicationEnquirySummary,
  CommunicationPriority,
  CommunicationStatus,
  CommunicationWithEnquiry,
} from "@/lib/types"

type EnquiryOption = CommunicationEnquirySummary & {
  status?: string | null
}

type Props = {
  communications?: CommunicationWithEnquiry[]
  enquiries?: EnquiryOption[]
  initialStatus?: string | undefined
  initialChannel?: string | undefined
  initialEnquiryId?: string | undefined
  initialCategory?: string | undefined
  initialPriority?: string | undefined
  initialAssignedTo?: string | undefined
  initialTab?: "inbox" | "ignored" | "all"
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

function getOptionLabel<T extends string>(options: { value: T; label: string }[], value?: T | null) {
  return options.find((option) => option.value === value)?.label || value?.replaceAll("_", " ") || "Unset"
}

function normalizeStatus(value?: string | null): CommunicationStatus {
  if (value === "draft" || value === "failed") return "needs_reply"
  if (value === "sent" || value === "delivered") return "waiting_customer"
  if (value === "archived") return "closed"
  if (value === "received" || value === "queued") return "new"
  if (statusOptions.some((option) => option.value === value)) return value as CommunicationStatus
  return "new"
}

function formatEnquiryLabel(enquiry: CommunicationEnquirySummary) {
  const location = [enquiry.address, enquiry.suburb].filter(Boolean).join(", ")
  return location ? `${enquiry.name} - ${location}` : enquiry.name
}

function priorityClasses(value?: CommunicationPriority | null) {
  if (value === "urgent") return "bg-red-100 text-red-800"
  if (value === "high") return "bg-orange-100 text-orange-800"
  if (value === "low") return "bg-gray-100 text-gray-700"
  return "bg-blue-100 text-blue-800"
}

function statusClasses(value?: CommunicationStatus | null) {
  if (value === "escalate_to_joe") return "bg-red-100 text-red-800"
  if (value === "needs_reply") return "bg-amber-100 text-amber-800"
  if (value === "needs_scheduling" || value === "needs_estimator") return "bg-purple-100 text-purple-800"
  if (value === "waiting_customer") return "bg-sky-100 text-sky-800"
  if (value === "closed") return "bg-gray-100 text-gray-600"
  return "bg-green-100 text-green-800"
}

export default function AdminCommunicationsClient({
  communications = [],
  enquiries = [],
  initialStatus,
  initialChannel,
  initialEnquiryId,
  initialCategory,
  initialPriority,
  initialAssignedTo,
  initialTab = "inbox",
}: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<CommunicationWithEnquiry[]>(communications)
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string | undefined>(initialStatus)
  const [channelFilter, setChannelFilter] = useState<string | undefined>(initialChannel)
  const [enquiryFilter, setEnquiryFilter] = useState<string | undefined>(initialEnquiryId)
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(initialCategory)
  const [priorityFilter, setPriorityFilter] = useState<string | undefined>(initialPriority)
  const [assignedToFilter, setAssignedToFilter] = useState<string | undefined>(initialAssignedTo)
  const [activeTab, setActiveTab] = useState<"inbox" | "ignored" | "all">(initialTab)

  const fetchRows = async () => {
    setLoading(true)
    let q = supabase
      .from("communications")
      .select(`
        *,
        admin_enquiries (
          id,
          name,
          address,
          suburb
        )
      `)
      .order("created_at", { ascending: false })
      .limit(200)

    if (statusFilter) q = q.eq("status", statusFilter)
    if (channelFilter) q = q.eq("channel", channelFilter)
    if (enquiryFilter) q = q.eq("enquiry_id", enquiryFilter)
    if (categoryFilter) q = q.eq("category", categoryFilter)
    if (priorityFilter) q = q.eq("priority", priorityFilter)
    if (assignedToFilter) q = q.eq("assigned_to", assignedToFilter)
    if (activeTab === "inbox") {
      q = q
        .eq("ignored", false)
        .eq("requires_action", true)
        .neq("status", "closed")
    }
    if (activeTab === "ignored") q = q.eq("ignored", true)

    const { data, error } = await q
    setLoading(false)

    if (error) {
      alert(error.message)
      return
    }

    setRows(data || [])
  }

  useEffect(() => {
    // don't re-fetch if initial server data present and filters not set
    if (
      !initialStatus &&
      !initialChannel &&
      !initialEnquiryId &&
      !initialCategory &&
      !initialPriority &&
      !initialAssignedTo &&
      communications.length > 0
    ) return
    fetchRows()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchRows()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, channelFilter, enquiryFilter, categoryFilter, priorityFilter, assignedToFilter, activeTab])

  // Manual create form
  const [channel, setChannel] = useState("email")
  const [direction, setDirection] = useState("outbound")
  const [selectedEnquiryId, setSelectedEnquiryId] = useState(initialEnquiryId || "")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!body && !subject) {
      alert("Add subject or body")
      return
    }

    setCreating(true)
    // ensure we have the authenticated user's id to satisfy RLS and NOT NULL user_id
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setCreating(false)
      alert("You must be signed in to create communications.")
      return
    }

    const { error } = await supabase.from("communications").insert({
      user_id: user.id,
      enquiry_id: selectedEnquiryId || null,
      channel,
      direction,
      subject: subject || null,
      body: body || null,
      status: "new",
      category: "general",
      priority: "normal",
      risk_level: "low",
      assigned_to: "unassigned",
      requires_review: false,
    })
    setCreating(false)

    if (error) {
      alert(error.message)
      return
    }

    setSubject("")
    setBody("")
    if (!initialEnquiryId) setSelectedEnquiryId("")
    fetchRows()
  }

  return (
    <div className="mx-auto max-w-7xl p-4 pb-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Communications Hub</h1>
        <p className="text-sm text-gray-500">Live data from Supabase (read-only + create record).</p>
      </header>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="col-span-1 rounded-xl border bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Conversations</h2>
          </div>

          <div className="mb-4 grid grid-cols-3 rounded-lg border bg-gray-50 p-1 text-sm">
            {[
              { value: "inbox", label: "Inbox" },
              { value: "ignored", label: "Ignored" },
              { value: "all", label: "All" },
            ].map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value as "inbox" | "ignored" | "all")}
                className={`h-9 rounded-md font-medium ${
                  activeTab === tab.value
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mb-4 flex flex-col gap-2">
            <select value={statusFilter || ""} onChange={(e) => setStatusFilter(e.target.value || undefined)} className="h-10 rounded-md border px-3">
              <option value="">All statuses</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select value={channelFilter || ""} onChange={(e) => setChannelFilter(e.target.value || undefined)} className="h-10 rounded-md border px-3">
              <option value="">All channels</option>
              <option value="email">email</option>
              <option value="sms">sms</option>
              <option value="phone">phone</option>
              <option value="internal">internal</option>
            </select>

            <select value={enquiryFilter || ""} onChange={(e) => setEnquiryFilter(e.target.value || undefined)} className="h-10 rounded-md border px-3">
              <option value="">All enquiries</option>
              {enquiries.map((enquiry) => (
                <option key={enquiry.id} value={enquiry.id}>
                  {formatEnquiryLabel(enquiry)}
                </option>
              ))}
            </select>

            <select value={categoryFilter || ""} onChange={(e) => setCategoryFilter(e.target.value || undefined)} className="h-10 rounded-md border px-3">
              <option value="">All categories</option>
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select value={priorityFilter || ""} onChange={(e) => setPriorityFilter(e.target.value || undefined)} className="h-10 rounded-md border px-3">
              <option value="">All priorities</option>
              {priorityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select value={assignedToFilter || ""} onChange={(e) => setAssignedToFilter(e.target.value || undefined)} className="h-10 rounded-md border px-3">
              <option value="">All assignments</option>
              {assigneeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <ul className="space-y-3">
            {loading ? (
              <li>Loading...</li>
            ) : rows.length === 0 ? (
              <li className="text-sm text-gray-500">No communications found.</li>
            ) : (
              rows.map((t, idx) => {
                const id = (t as any)?.id
                const linkedEnquiry = getLinkedEnquiry(t)
                const workflowStatus = normalizeStatus(t.status)
                const priority = t.priority || "normal"
                const category = t.category || "general"
                const assignedTo = t.assigned_to || "unassigned"
                if (!id) {
                  // don't create a broken link — surface a clear warning
                  console.warn("Communication row missing id:", t)
                  return (
                    <li key={`missing-id-${idx}`} className="rounded border p-3 bg-yellow-50">
                      <div className="font-semibold text-sm text-yellow-800">Missing ID — cannot open detail</div>
                      <div className="mt-1 text-xs text-gray-500">Subject: {t.subject || '(no subject)'}</div>
                    </li>
                  )
                }

                return (
                  <li key={id} className="rounded">
                    <Link href={`/admin/communications/${id}`} className="block cursor-pointer rounded border p-3 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="font-semibold">{t.subject || `(${t.channel} ${t.direction})`}</div>
                          <div className="mt-1 text-sm text-gray-500">{t.body ? t.body.slice(0, 120) : ""}</div>
                          {linkedEnquiry && (
                            <div className="mt-2 text-sm text-gray-600">
                              Enquiry: {formatEnquiryLabel(linkedEnquiry)}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">{t.created_at ? new Date(t.created_at).toISOString() : ""}</div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span className={`rounded-full px-2 py-0.5 ${statusClasses(workflowStatus)}`}>
                          {getOptionLabel(statusOptions, workflowStatus)}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 ${priorityClasses(priority)}`}>
                          {getOptionLabel(priorityOptions, priority)}
                        </span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">
                          {getOptionLabel(categoryOptions, category)}
                        </span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">
                          {getOptionLabel(assigneeOptions, assignedTo)}
                        </span>
                        {t.requires_review && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-800">
                            Review
                          </span>
                        )}
                        {t.source_category && (
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-800">
                            {t.source_category}
                          </span>
                        )}
                      </div>
                      {t.ignore_reason && (
                        <div className="mt-2 text-xs text-gray-500">
                          Ignore reason: {t.ignore_reason}
                        </div>
                      )}
                      <div className="mt-2 flex gap-2 text-xs text-gray-500">
                        <div>{t.channel}</div>
                        <div>{t.direction}</div>
                      </div>
                    </Link>
                  </li>
                )
              })
            )}
          </ul>
        </div>

        <div className="col-span-2 rounded-xl border bg-white p-4 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold">Create Communication</h3>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Channel</label>
              <select value={channel} onChange={(e) => setChannel(e.target.value)} className="h-11 w-full rounded-md border px-3">
                <option value="email">email</option>
                <option value="sms">sms</option>
                <option value="phone">phone</option>
                <option value="internal">internal</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Direction</label>
              <select value={direction} onChange={(e) => setDirection(e.target.value)} className="h-11 w-full rounded-md border px-3">
                <option value="outbound">outbound</option>
                <option value="inbound">inbound</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium">Linked Enquiry</label>
              <select value={selectedEnquiryId} onChange={(e) => setSelectedEnquiryId(e.target.value)} className="h-11 w-full rounded-md border px-3">
                <option value="">No linked enquiry</option>
                {enquiries.map((enquiry) => (
                  <option key={enquiry.id} value={enquiry.id}>
                    {formatEnquiryLabel(enquiry)}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium">Subject</label>
              <input className="h-11 w-full rounded-md border px-3" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium">Body</label>
              <textarea className="min-h-[140px] w-full rounded-md border p-3" value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <button onClick={handleCreate} disabled={creating} className="h-11 rounded bg-blue-600 px-4 font-medium text-white disabled:bg-gray-300">
              {creating ? "Creating..." : "Create Communication"}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
