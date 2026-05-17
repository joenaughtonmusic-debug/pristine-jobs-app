"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

type Property = {
  id: string
  property_code: string
  client_name: string
  address_line_1: string | null
  suburb: string | null
  is_active: boolean
}

type AdminAction = {
  id: string
  title: string
  action_type: string | null
  priority: string | null
  status: string | null
  property_id: string | null
  scheduled_job_id: string | null
  due_date: string | null
  notes: string | null
  assigned_to: string | null
  created_at: string
  completed_at: string | null
  properties?: {
    id: string
    client_name: string
    address_line_1: string | null
    suburb: string | null
  } | null
}

type Props = {
  actions: AdminAction[]
  properties: Property[]
}

function todayString() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatDate(dateString: string | null) {
  if (!dateString) return "No due date"

  const [year, month, day] = dateString.split("-").map(Number)
  return new Date(year, month - 1, day).toLocaleDateString("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}

export function AdminActionsClient({ actions, properties }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [title, setTitle] = useState("")
  const [actionType, setActionType] = useState("general")
  const [priority, setPriority] = useState("normal")
  const [status, setStatus] = useState("open")
  const [propertyId, setPropertyId] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  const today = todayString()

  const sortedActions = useMemo(() => {
    return [...actions].sort((a, b) => {
      const priorityRank: Record<string, number> = {
        urgent: 1,
        high: 2,
        normal: 3,
        low: 4,
      }

      const aPriority = priorityRank[a.priority || "normal"] || 3
      const bPriority = priorityRank[b.priority || "normal"] || 3

      if (aPriority !== bPriority) return aPriority - bPriority

      const aDate = a.due_date || "9999-12-31"
      const bDate = b.due_date || "9999-12-31"

      return aDate.localeCompare(bDate)
    })
  }, [actions])

  const createAction = async () => {
    if (!title.trim()) {
      alert("Add a title first.")
      return
    }

    setSaving(true)

    const { error } = await supabase.from("admin_actions").insert({
      title: title.trim(),
      action_type: actionType,
      priority,
      status,
      property_id: propertyId || null,
      notes: notes.trim() || null,
      assigned_to: "VA",
    })

    setSaving(false)

    if (error) {
      alert(error.message)
      return
    }

    setTitle("")
    setActionType("general")
    setPriority("normal")
    setStatus("open")
    setPropertyId("")
    setNotes("")

    router.refresh()
  }

  const updateActionStatus = async (actionId: string, nextStatus: string) => {
    const payload =
      nextStatus === "done"
        ? { status: nextStatus, completed_at: new Date().toISOString() }
        : { status: nextStatus, completed_at: null }

    const { error } = await supabase
      .from("admin_actions")
      .update(payload)
      .eq("id", actionId)

    if (error) {
      alert(error.message)
      return
    }

    router.refresh()
  }

  const priorityClasses = (value: string | null) => {
    if (value === "urgent") return "bg-red-100 text-red-800"
    if (value === "high") return "bg-orange-100 text-orange-800"
    if (value === "low") return "bg-gray-100 text-gray-700"
    return "bg-blue-100 text-blue-800"
  }

  const statusClasses = (value: string | null) => {
    if (value === "waiting_on_client") return "bg-amber-100 text-amber-800"
    if (value === "in_progress") return "bg-purple-100 text-purple-800"
    return "bg-gray-100 text-gray-700"
  }

  const ActionCard = ({ action }: { action: AdminAction }) => (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{action.title}</div>

          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 ${priorityClasses(action.priority)}`}>
              {action.priority || "normal"}
            </span>

            <span className={`rounded-full px-2 py-0.5 ${statusClasses(action.status)}`}>
              {action.status?.replaceAll("_", " ") || "open"}
            </span>

            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">
              {action.action_type?.replaceAll("_", " ") || "general"}
            </span>
          </div>

          <div className="mt-2 text-sm text-gray-500">
            Due: {formatDate(action.due_date)}
          </div>

          {action.properties && (
            <div className="mt-1 text-sm text-gray-500">
              {action.properties.client_name} —{" "}
              {action.properties.address_line_1 || "No address"}
              {action.properties.suburb ? `, ${action.properties.suburb}` : ""}
            </div>
          )}

          {action.notes && (
            <div className="mt-3 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
              {action.notes}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          <button
            type="button"
            onClick={() => updateActionStatus(action.id, "in_progress")}
            className="rounded-md border px-3 py-2 text-xs"
          >
            Start
          </button>

          <button
            type="button"
            onClick={() => updateActionStatus(action.id, "waiting_on_client")}
            className="rounded-md border px-3 py-2 text-xs"
          >
            Waiting
          </button>

          <button
            type="button"
            onClick={() => updateActionStatus(action.id, "done")}
            className="rounded-md bg-green-600 px-3 py-2 text-xs font-medium text-white"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )

  const ActionSection = ({
    title,
    items,
  }: {
    title: string
    items: AdminAction[]
  }) => (
    <section className="mb-8">
      <h2 className="mb-3 text-xl font-semibold">
        {title}{" "}
        <span className="text-sm font-normal text-gray-400">
          ({items.length})
        </span>
      </h2>

      <div className="space-y-3">
        {items.length > 0 ? (
          items.map((action) => <ActionCard key={action.id} action={action} />)
        ) : (
          <p className="rounded-xl border border-dashed bg-white p-4 text-sm text-gray-400">
            No actions here.
          </p>
        )}
      </div>
    </section>
  )

  return (
    <div className="mx-auto max-w-5xl p-4 pb-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">VA Action List</h1>

        <p className="text-sm text-gray-500">
          Daily admin tasks, client follow-ups, quote chasing and small jobs to organise.
        </p>
      </header>

      <section className="mb-8 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Add Action</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Title</label>
            <input
              className="h-11 w-full rounded-md border px-3"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Follow up Remuera quote"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Action Type</label>
            <select
              className="h-11 w-full rounded-md border px-3"
              value={actionType}
              onChange={(e) => setActionType(e.target.value)}
            >
              <option value="general">General</option>
<option value="quote">Quote</option>
<option value="client_contact">Client contact</option>
<option value="quote_follow_up">Quote follow-up</option>
<option value="scheduling">Scheduling</option>
<option value="small_job">Small job</option>
<option value="admin">Admin</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Priority</label>
            <select
              className="h-11 w-full rounded-md border px-3"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Status</label>
            <select
              className="h-11 w-full rounded-md border px-3"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="waiting_on_client">Waiting on client</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Property</label>
            <select
              className="h-11 w-full rounded-md border px-3"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
            >
              <option value="">New lead / property not yet added</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.client_name} — {property.address_line_1 || "No address"}
                  {property.suburb ? `, ${property.suburb}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Notes</label>
            <textarea
              className="min-h-[100px] w-full rounded-md border p-3"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={createAction}
          disabled={saving}
          className="mt-4 h-11 w-full rounded-md bg-black font-medium text-white disabled:bg-gray-300"
        >
          {saving ? "Saving..." : "Add Action"}
        </button>
      </section>

      <ActionSection title="Open Actions" items={sortedActions} />
    </div>
  )
}