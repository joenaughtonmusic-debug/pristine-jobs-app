"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export type TodoItem = {
  id: string
  title: string | null
  notes: string | null
  action_type: string
  status: string
  due_date: string | null
  created_at: string
}

const SECTIONS: { type: "quote" | "follow_up"; label: string; blurb: string }[] =
  [
    { type: "quote", label: "Quotes to write / send", blurb: "quote" },
    { type: "follow_up", label: "Follow-ups due", blurb: "follow-up" },
  ]

export function QuotesFollowupsClient({ items }: { items: TodoItem[] }) {
  const router = useRouter()
  const supabase = createClient()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [addType, setAddType] = useState<"quote" | "follow_up">("quote")
  const [title, setTitle] = useState("")
  const [notes, setNotes] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [saving, setSaving] = useState(false)

  const complete = async (id: string) => {
    setBusyId(id)
    const { error } = await supabase
      .from("admin_actions")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", id)
    setBusyId(null)
    if (error) {
      alert(error.message)
      return
    }
    router.refresh()
  }

  const addItem = async () => {
    if (!title.trim()) {
      alert("Add a short title first.")
      return
    }
    setSaving(true)
    const { error } = await supabase.from("admin_actions").insert({
      title: title.trim(),
      action_type: addType,
      priority: "normal",
      status: "open",
      due_date: dueDate || null,
      notes: notes.trim() || null,
      assigned_to: "Joe",
    })
    setSaving(false)
    if (error) {
      alert(error.message)
      return
    }
    setTitle("")
    setNotes("")
    setDueDate("")
    router.refresh()
  }

  return (
    <div className="mx-auto max-w-2xl p-4 pb-16">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Quotes & Follow-ups</h1>
        <p className="mt-1 text-sm text-gray-500">
          Your personal to-do list — quotes to write and follow-ups you owe.
          Tick them off as you go.
        </p>
      </header>

      {/* Add a to-do manually. */}
      <div className="mb-8 rounded-lg border bg-white p-4">
        <p className="mb-2 text-sm font-medium">Add a to-do</p>
        <div className="flex flex-col gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Quote for 12 Onslow — hedge + tidy"
            className="h-10 w-full rounded-md border px-3 text-sm"
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any detail (optional)"
            rows={2}
            className="w-full rounded-md border p-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={addType}
              onChange={(e) =>
                setAddType(e.target.value as "quote" | "follow_up")
              }
              className="h-10 rounded-md border px-2 text-sm"
            >
              <option value="quote">Quote</option>
              <option value="follow_up">Follow-up</option>
            </select>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-10 rounded-md border px-2 text-sm"
            />
            <button
              type="button"
              onClick={addItem}
              disabled={saving}
              className="h-10 rounded-md bg-black px-4 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Adding…" : "Add"}
            </button>
          </div>
        </div>
      </div>

      {SECTIONS.map((section) => {
        const rows = items.filter((i) => i.action_type === section.type)
        return (
          <section key={section.type} className="mb-8">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              {section.label} ({rows.length})
            </h2>
            {rows.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-sm text-gray-400">
                Nothing here — you&apos;re on top of your {section.blurb}s.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {rows.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start gap-3 rounded-lg border bg-white p-3"
                  >
                    <button
                      type="button"
                      onClick={() => complete(item.id)}
                      disabled={busyId === item.id}
                      aria-label="Mark done"
                      className="mt-0.5 h-5 w-5 shrink-0 rounded border border-gray-300 text-transparent hover:border-emerald-500 hover:text-emerald-500 disabled:opacity-50"
                    >
                      ✓
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {item.title}
                      </p>
                      {item.notes && (
                        <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-600">
                          {item.notes}
                        </p>
                      )}
                      {item.due_date && (
                        <p className="mt-1 text-xs text-gray-400">
                          Due {item.due_date}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
