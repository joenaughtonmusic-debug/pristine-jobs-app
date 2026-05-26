import { createClient } from "@/lib/supabase/server"
import AdminCommunicationsClient from "@/components/admin-communications-client"

export const dynamic = "force-dynamic"

type Props = {
  searchParams?: { status?: string; channel?: string }
}

export default async function AdminCommunicationsPage({ searchParams }: Props) {
  const supabase = await createClient()

  let query = supabase.from("communications").select("*")

  if (searchParams?.status) {
    query = query.eq("status", searchParams.status)
  }

  if (searchParams?.channel) {
    query = query.eq("channel", searchParams.channel)
  }

  const { data: communications, error } = await query.order("created_at", { ascending: false }).limit(200)

  if (error) {
    // for now render client with empty array and surface nothing server-side
    return <AdminCommunicationsClient communications={[]} initialStatus={searchParams?.status} initialChannel={searchParams?.channel} />
  }

  return <AdminCommunicationsClient communications={communications || []} initialStatus={searchParams?.status} initialChannel={searchParams?.channel} />
}
