import { createClient } from "@/lib/supabase/server"
import {
  formatServiceFrequency,
  formatServiceValue,
} from "@/lib/service-frequency"

type PropertyProfitabilityRow = {
  property_id: string
  property_code: string | null
  address_line_1: string | null
  service_type: string | null
  service_frequency: string | null
  service_interval_weeks: number | string | null
  revenue: number | string | null
  billable_hours: number | string | null
  labour_cost: number | string | null
  gross_profit: number | string | null
  gp_per_billable_hour: number | string | null
  revenue_per_hour: number | string | null
}

type ProfitabilitySummaryRow = {
  total_revenue: number | string | null
  total_labour_cost: number | string | null
  gross_profit: number | string | null
  average_gp_per_hour: number | string | null
  active_recurring_clients: number | string | null
  recurring_revenue: number | string | null
  one_off_revenue: number | string | null
}

type PropertyServiceRow = {
  id: string
  service_type: string | null
  service_frequency: string | null
  service_interval_weeks: number | string | null
}

function money(value: number | string | null) {
  const numberValue = Number(value || 0)
  return numberValue.toLocaleString("en-NZ", {
    style: "currency",
    currency: "NZD",
  })
}

function hours(value: number | string | null) {
  return Number(value || 0).toFixed(2)
}

export default async function AdminProfitabilityPage() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("property_profitability")
    .select("*")
    .order("gp_per_billable_hour", { ascending: true })

  const { data: summaryData } = await supabase
    .from("profitability_summary")
    .select("*")
    .limit(1)
    .maybeSingle()

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Profitability</h1>
        <p className="mt-4 text-red-600">{error.message}</p>
      </div>
    )
  }

  const rows = (data || []) as PropertyProfitabilityRow[]
  const summary = summaryData as ProfitabilitySummaryRow | null
  const propertyIds = rows.map((row) => row.property_id).filter(Boolean)
  const { data: propertyServiceData } =
    propertyIds.length > 0
      ? await supabase
          .from("properties")
          .select("id, service_type, service_frequency, service_interval_weeks")
          .in("id", propertyIds)
      : { data: [] }
  const propertyServiceById = new Map(
    ((propertyServiceData || []) as PropertyServiceRow[]).map((property) => [
      property.id,
      property,
    ])
  )

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Customer Profitability</h1>
        <p className="mt-1 text-sm text-gray-500">
          Revenue, labour cost, gross profit, and GP per billable hour by property.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs font-medium uppercase text-gray-500">
            Total Revenue
          </div>
          <div className="mt-2 text-xl font-semibold">
            {money(summary?.total_revenue || null)}
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs font-medium uppercase text-gray-500">
            Total Labour Cost
          </div>
          <div className="mt-2 text-xl font-semibold">
            {money(summary?.total_labour_cost || null)}
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs font-medium uppercase text-gray-500">
            Gross Profit
          </div>
          <div className="mt-2 text-xl font-semibold">
            {money(summary?.gross_profit || null)}
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs font-medium uppercase text-gray-500">
            Average GP/hr
          </div>
          <div className="mt-2 text-xl font-semibold">
            {money(summary?.average_gp_per_hour || null)}
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs font-medium uppercase text-gray-500">
            Active Recurring Clients
          </div>
          <div className="mt-2 text-xl font-semibold">
            {Number(summary?.active_recurring_clients || 0)}
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs font-medium uppercase text-gray-500">
            Recurring Revenue
          </div>
          <div className="mt-2 text-xl font-semibold">
            {money(summary?.recurring_revenue || null)}
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs font-medium uppercase text-gray-500">
            One-Off Revenue
          </div>
          <div className="mt-2 text-xl font-semibold">
            {money(summary?.one_off_revenue || null)}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="border-b px-4 py-3">Property</th>
              <th className="border-b px-4 py-3">Address</th>
              <th className="border-b px-4 py-3">Frequency</th>
              <th className="border-b px-4 py-3 text-right">Revenue</th>
              <th className="border-b px-4 py-3 text-right">Billable Hrs</th>
              <th className="border-b px-4 py-3 text-right">Labour Cost</th>
              <th className="border-b px-4 py-3 text-right">Gross Profit</th>
              <th className="border-b px-4 py-3 text-right">GP / Hr</th>
              <th className="border-b px-4 py-3 text-right">Revenue / Hr</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => {
              const propertyService = propertyServiceById.get(row.property_id)
              const serviceType =
                row.service_type || propertyService?.service_type || null
              const serviceFrequency =
                row.service_frequency ||
                propertyService?.service_frequency ||
                null

              return (
                <tr key={row.property_id} className="hover:bg-gray-50">
                  <td className="border-b px-4 py-3 font-medium">
                    {row.property_code || "No code"}
                  </td>
                  <td className="border-b px-4 py-3">
                    {row.address_line_1 || "No address"}
                  </td>
                  <td className="border-b px-4 py-3">
                    <div className="font-medium capitalize">
                      {formatServiceFrequency(serviceFrequency)}
                    </div>
                    <div className="text-xs text-gray-500 capitalize">
                      {formatServiceValue(serviceType)}
                    </div>
                  </td>
                  <td className="border-b px-4 py-3 text-right">
                    {money(row.revenue)}
                  </td>
                  <td className="border-b px-4 py-3 text-right">
                    {hours(row.billable_hours)}
                  </td>
                  <td className="border-b px-4 py-3 text-right">
                    {money(row.labour_cost)}
                  </td>
                  <td className="border-b px-4 py-3 text-right">
                    {money(row.gross_profit)}
                  </td>
                  <td className="border-b px-4 py-3 text-right font-semibold">
                    {money(row.gp_per_billable_hour)}
                  </td>
                  <td className="border-b px-4 py-3 text-right">
                    {money(row.revenue_per_hour)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
