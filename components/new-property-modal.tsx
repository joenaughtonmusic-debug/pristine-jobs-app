"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function makePropertyCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 20)
}

export function NewPropertyModal({ open, onOpenChange }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [clientName, setClientName] = useState("")
  const [clientEmail, setClientEmail] = useState("")
  const [address, setAddress] = useState("")
  const [suburb, setSuburb] = useState("")
  const [propertyCode, setPropertyCode] = useState("")
  const [category, setCategory] = useState("maintenance")
  const [billingType, setBillingType] = useState("charge_up")
  const [xeroContactId, setXeroContactId] = useState("")
  const [defaultDuration, setDefaultDuration] = useState("")
  const [timeLimitType, setTimeLimitType] = useState("fixed_time")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const handleAddressBlur = () => {
    if (!propertyCode && address) {
      setPropertyCode(makePropertyCode(address))
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    const finalCode = propertyCode.trim() || makePropertyCode(address)

    if (!clientName.trim() || !address.trim() || !finalCode) {
      setError("Client name, address, and property code are required.")
      setSaving(false)
      return
    }

    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .upsert(
        {
          client_name: clientName.trim(),
          client_email: clientEmail.trim() || null,
          address_line_1: address.trim(),
          suburb: suburb.trim() || null,
          property_code: finalCode,
          property_category: category,
          billing_type: billingType,
          xero_contact_id: xeroContactId.trim() || null,
          is_active: true,
        },
        {
          onConflict: "property_code",
        }
      )
      .select("id")
      .single()

    if (propertyError) {
      setError(propertyError.message)
      setSaving(false)
      return
    }

    const { error: templateError } = await supabase
      .from("property_service_templates")
      .insert({
        property_id: property.id,
        template_name: category,
        default_duration_hours: defaultDuration
          ? parseFloat(defaultDuration)
          : null,
        billing_mode: billingType,
        time_limit_type: timeLimitType,
        is_active: true,
      })

    if (templateError) {
      setError(templateError.message)
      setSaving(false)
      return
    }

    setSaving(false)
    onOpenChange(false)
    router.refresh()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <h2 className="mb-4 text-xl font-semibold">Add New Property</h2>

        <div className="space-y-3">
          <input className="h-11 w-full rounded-md border px-3" placeholder="Client / property name" value={clientName} onChange={(e) => setClientName(e.target.value)} />
          <input className="h-11 w-full rounded-md border px-3" placeholder="Client email optional" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
          <input className="h-11 w-full rounded-md border px-3" placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} onBlur={handleAddressBlur} />
          <input className="h-11 w-full rounded-md border px-3" placeholder="Suburb" value={suburb} onChange={(e) => setSuburb(e.target.value)} />
          <input className="h-11 w-full rounded-md border px-3" placeholder="Property code e.g. 22ONSLOW" value={propertyCode} onChange={(e) => setPropertyCode(e.target.value.toUpperCase())} />

          <select className="h-11 w-full rounded-md border px-3" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="maintenance">Maintenance</option>
            <option value="one_off">One Off</option>
            <option value="landscaping">Landscaping</option>
            <option value="commercial">Commercial</option>
          </select>

          <select className="h-11 w-full rounded-md border px-3" value={billingType} onChange={(e) => setBillingType(e.target.value)}>
            <option value="charge_up">Charge Up</option>
            <option value="subscription">Subscription</option>
          </select>

          {billingType === "subscription" && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Subscription billing is manual: the app never creates the
              recurring invoice, and visits on subscription jobs are not
              invoiced per visit. Set up the repeating invoice in Xero
              (Business → Invoices → Repeating) or this customer will not be
              billed.
            </p>
          )}

          <input className="h-11 w-full rounded-md border px-3" placeholder="Xero contact ID optional" value={xeroContactId} onChange={(e) => setXeroContactId(e.target.value)} />

          <input className="h-11 w-full rounded-md border px-3" type="number" step="0.25" placeholder="Default duration e.g. 2.5" value={defaultDuration} onChange={(e) => setDefaultDuration(e.target.value)} />

          <select className="h-11 w-full rounded-md border px-3" value={timeLimitType} onChange={(e) => setTimeLimitType(e.target.value)}>
            <option value="fixed_time">Fixed Time</option>
            <option value="flexible">Flexible</option>
          </select>

          {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" className="h-11 flex-1 rounded-md border" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </button>

            <button type="button" className="h-11 flex-1 rounded-md bg-green-600 font-medium text-white" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Property"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}