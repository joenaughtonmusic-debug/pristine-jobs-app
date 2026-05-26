import { createClient } from "@/lib/supabase/server"
import { AdminCommunicationDetailClient } from "@/components/admin-communication-detail-client"

export const dynamic = "force-dynamic"

type Props = {
  params: { id: string | string[] } | Promise<{ id: string | string[] }>
}

export default async function AdminCommunicationThreadPage({ params }: Props) {
  // Next may pass params as a Promise in some App Router versions; await if needed
  const resolvedParams = (params && typeof (params as any).then === "function") ? await params : params
  const rawId = (resolvedParams as any).id
  const id = Array.isArray(rawId) ? rawId[0] : rawId
  const supabase = await createClient()

  const { data: communication, error } = await supabase
    .from("communications")
    .select(`
      *,
      admin_enquiries (
        id,
        name,
        email,
        phone,
        address,
        suburb,
        job_type,
        status
      )
    `)
    .eq("id", id)
    .single()

  if (error || !communication) {
    return (
      <div className="mx-auto max-w-4xl p-4 pb-10">
        <header className="mb-6">
          <h1 className="text-2xl font-bold">Conversation {id}</h1>
          <p className="text-sm text-gray-500">Unable to load communication.</p>
        </header>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-lg font-semibold">Debug information</h3>
          <div className="text-sm text-red-600">
            {error ? (
              <div>
                <div><strong>Supabase error:</strong> {error.message}</div>
                {error.details && <div><strong>Details:</strong> {String(error.details)}</div>}
              </div>
            ) : (
              <div>No communication found with id {id}.</div>
            )}
          </div>
        </div>
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
        <AdminCommunicationDetailClient communication={communication} />
      </div>
    </div>
  )
}
