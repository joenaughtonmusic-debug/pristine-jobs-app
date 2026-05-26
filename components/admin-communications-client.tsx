"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Communication } from "@/lib/types"

type Props = {
  communications?: Communication[]
  initialStatus?: string | undefined
  initialChannel?: string | undefined
}

export default function AdminCommunicationsClient({ communications = [], initialStatus, initialChannel }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<Communication[]>(communications)
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string | undefined>(initialStatus)
  const [channelFilter, setChannelFilter] = useState<string | undefined>(initialChannel)

  const fetchRows = async () => {
    setLoading(true)
    let q = supabase.from("communications").select("*").order("created_at", { ascending: false }).limit(200)

    if (statusFilter) q = q.eq("status", statusFilter)
    if (channelFilter) q = q.eq("channel", channelFilter)

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
    if (!initialStatus && !initialChannel && communications.length > 0) return
    fetchRows()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchRows()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, channelFilter])

  // Manual create form
  const [channel, setChannel] = useState("email")
  const [direction, setDirection] = useState("outbound")
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

    const { error } = await supabase.from("communications").insert({ user_id: user.id, channel, direction, subject: subject || null, body: body || null, status: "queued" })
    setCreating(false)

    if (error) {
      alert(error.message)
      return
    }

    setSubject("")
    setBody("")
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

          <div className="mb-4 flex flex-col gap-2">
            <select value={statusFilter || ""} onChange={(e) => setStatusFilter(e.target.value || undefined)} className="h-10 rounded-md border px-3">
              <option value="">All statuses</option>
              <option value="queued">queued</option>
              <option value="sent">sent</option>
              <option value="failed">failed</option>
              <option value="delivered">delivered</option>
              <option value="received">received</option>
              <option value="draft">draft</option>
              <option value="archived">archived</option>
            </select>

            <select value={channelFilter || ""} onChange={(e) => setChannelFilter(e.target.value || undefined)} className="h-10 rounded-md border px-3">
              <option value="">All channels</option>
              <option value="email">email</option>
              <option value="sms">sms</option>
              <option value="phone">phone</option>
              <option value="internal">internal</option>
            </select>
          </div>

          <ul className="space-y-3">
            {loading ? (
              <li>Loading...</li>
            ) : rows.length === 0 ? (
              <li className="text-sm text-gray-500">No communications found.</li>
            ) : (
              rows.map((t) => (
                <li key={t.id} className="cursor-pointer rounded border p-3 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{t.subject || `(${t.channel} ${t.direction})`}</div>
                      <div className="mt-1 text-sm text-gray-500">{t.body ? t.body.slice(0, 120) : ""}</div>
                    </div>
                    <div className="text-xs text-gray-400">{t.created_at ? new Date(t.created_at).toLocaleString() : ""}</div>
                  </div>
                  <div className="mt-2 flex gap-2 text-xs text-gray-600">
                    <div>Channel: {t.channel}</div>
                    <div>Direction: {t.direction}</div>
                    <div>Status: {t.status}</div>
                  </div>
                </li>
              ))
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
