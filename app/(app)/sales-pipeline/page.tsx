import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { PipelineBoard } from "@/components/pipeline-board"
import type { SalesLead } from "@/lib/sales-leads"

export const dynamic = "force-dynamic"

export default async function SalesPipelinePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/")
  }

  const { data: leads, error } = await supabase
    .from("sales_leads")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[sales-pipeline] failed to load leads", error)
  }

  return <PipelineBoard leads={(leads || []) as SalesLead[]} />
}
