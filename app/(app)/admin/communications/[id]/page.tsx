"use server"

import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

type Props = {
  params: { id: string }
}

export default async function AdminCommunicationThreadPage({ params }: Props) {
  const { id } = params
  const supabase = await createClient()

  const { data: communication, error } = await supabase.from("communications").select("*").eq("id", id).single()

  if (error || !communication) {
    return (
      <div className="mx-auto max-w-4xl p-4 pb-10">
        <header className="mb-6">
          <h1 className="text-2xl font-bold">Conversation {id}</h1>
          <p className="text-sm text-gray-500">Unable to load communication.</p>
        </header>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl p-4 pb-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Conversation {id}</h1>
        <p className="text-sm text-gray-500">Detail view.</p>
      </header>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="space-y-4 text-sm text-gray-700">
          <div><strong>Channel:</strong> {communication.channel}</div>
          <div><strong>Direction:</strong> {communication.direction}</div>
          <div><strong>Subject:</strong> {communication.subject || ""}</div>
          <div><strong>Body:</strong></div>
          <div className="whitespace-pre-wrap rounded-md border p-3">{communication.body || ""}</div>
          <div><strong>Status:</strong> {communication.status}</div>
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
      </div>
    </div>
  )
}
