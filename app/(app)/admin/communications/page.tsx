import React from "react"

export const dynamic = "force-dynamic"

export default function AdminCommunicationsPage() {
  // Placeholder mock data for Milestone 1
  const mockThreads = [
    {
      id: "1",
      subject: "Estimate request",
      snippet: "Hi, I'd like a quote for ongoing maintenance...",
      channel: "email",
      direction: "inbound",
      created_at: "2026-05-20T10:12:00Z",
      linked_entity: { type: "enquiry", id: "e-1" },
    },
    {
      id: "2",
      subject: "Job reminder",
      snippet: "Reminder: your job is scheduled for tomorrow",
      channel: "sms",
      direction: "outbound",
      created_at: "2026-05-25T08:00:00Z",
      linked_entity: { type: "job", id: "j-83" },
    },
  ]

  return (
    <div className="mx-auto max-w-7xl p-4 pb-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Communications Hub</h1>
        <p className="text-sm text-gray-500">Placeholder UI showing mock threads.</p>
      </header>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="col-span-1 rounded-xl border bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Conversations</h2>
            <button className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white">Compose</button>
          </div>

          <ul className="space-y-3">
            {mockThreads.map((t) => (
              <li key={t.id} className="cursor-pointer rounded border p-3 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{t.subject}</div>
                    <div className="mt-1 text-sm text-gray-500">{t.snippet}</div>
                  </div>
                  <div className="text-xs text-gray-400">{new Date(t.created_at).toLocaleString()}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="col-span-2 rounded-xl border bg-white p-4 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold">Selected Thread (placeholder)</h3>
          <div className="min-h-[300px] rounded-md border p-4 text-sm text-gray-700">Select a conversation to view messages. This is mock data for Milestone 1.</div>
        </div>
      </section>
    </div>
  )
}
