import React from "react"

export const dynamic = "force-dynamic"

type Props = {
  params: { id: string }
}

export default function AdminCommunicationThreadPage({ params }: Props) {
  const { id } = params

  // Placeholder/mock message list for Milestone 1
  const mockMessages = [
    { id: "m-1", author: "Client", body: "Hi, I'd like an estimate.", created_at: "2026-05-20T10:12:00Z" },
    { id: "m-2", author: "Staff", body: "Thanks — we'll arrange an estimate.", created_at: "2026-05-20T11:00:00Z" },
  ]

  return (
    <div className="mx-auto max-w-4xl p-4 pb-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Conversation {id}</h1>
        <p className="text-sm text-gray-500">Thread view (mock data).</p>
      </header>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="space-y-4">
          {mockMessages.map((m) => (
            <div key={m.id} className="rounded-md border p-3">
              <div className="mb-1 text-sm font-medium">{m.author}</div>
              <div className="text-sm text-gray-700">{m.body}</div>
              <div className="mt-2 text-xs text-gray-400">{new Date(m.created_at).toLocaleString()}</div>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <label className="mb-1 block text-sm font-medium">Compose (mock)</label>
          <textarea className="min-h-[120px] w-full rounded-md border p-3" placeholder="Compose message..." />
          <div className="mt-3 flex justify-end">
            <button className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white">Send (mock)</button>
          </div>
        </div>
      </div>
    </div>
  )
}
