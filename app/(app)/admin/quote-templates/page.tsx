import { createClient } from "@/lib/supabase/server"
import { AdminQuoteTemplatesClient } from "@/components/admin-quote-templates-client"

export const dynamic = "force-dynamic"

export default async function AdminQuoteTemplatesPage() {
  const supabase = await createClient()

  const { data: templates, error } = await supabase
    .from("quote_templates")
    .select(`
      id,
      name,
      category,
      customer_scope,
      internal_notes,
      terms_conditions,
      frequency,
      labour_hours,
      labour_rate,
      greenwaste_bags,
      greenwaste_rate,
      sprays_size,
      sprays_price,
      fertiliser_size,
      fertiliser_price,
      stump_paste_size,
      stump_paste_price,
      is_active
    `)
    .order("name", { ascending: true })

  return (
    <AdminQuoteTemplatesClient
      queryError={error?.message || null}
      templates={templates || []}
    />
  )
}
