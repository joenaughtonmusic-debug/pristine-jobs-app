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
  const [hourlyRate, setHourlyRate] = useState("80")
  const [greenwasteRate, setGreenwasteRate] = useState("26.5")
  const [subscriptionAmount, setSubscriptionAmount] = useState("")
  const [subscriptionConfirmed, setSubscriptionConfirmed] = useState(false)
  const [defaultDuration, setDefaultDuration] = useState("")
  const [timeLimitType, setTimeLimitType] = useState("fixed_time")
  const [isRental, setIsRental] = useState(false)
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

    // Rates apply only when this is a genuine new property. Re-adding an
    // existing property_code hits the onConflict UPDATE path, and must not
    // overwrite a rate someone has already set — so we look first and omit the
    // rate keys entirely when the row already exists.
    const { data: existingProperty } = await supabase
      .from("properties")
      .select("id")
      .eq("property_code", finalCode)
      .maybeSingle()

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
          is_rental: isRental,
          ...(existingProperty
            ? {}
            : {
                hourly_rate: Number(hourlyRate) || 80,
                greenwaste_rate: Number(greenwasteRate) || 26.5,
              }),
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

    // Phase B: seed the property's billing identity line on genuine inserts
    // (mirrors the rate handling — an existing property already has one). The
    // subscription amount + confirmation now live on the line, not the property.
    if (!existingProperty) {
      const nowIso = new Date().toISOString()
      const isSub = billingType === "subscription"
      const { error: lineError } = await supabase
        .from("property_billing_lines")
        .insert({
          property_id: property.id,
          billing_mode: billingType,
          job_type: category,
          subscription_amount:
            isSub && subscriptionAmount ? Number(subscriptionAmount) : null,
          subscription_invoice_confirmed_at:
            isSub && subscriptionConfirmed ? nowIso : null,
          subscription_invoice_confirmed_by:
            isSub && subscriptionConfirmed ? "admin" : null,
          active: true,
        })
      if (lineError) {
        setError(lineError.message)
        setSaving(false)
        return
      }
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
            <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <p>
                Subscription billing is manual: the app never creates the
                recurring invoice, and visits on subscription jobs are not
                invoiced per visit. Set up the repeating invoice in Xero
                (Business → Invoices → Repeating) or this customer will not be
                billed.
              </p>
              <input
                className="mt-2 h-11 w-full rounded-md border px-3"
                type="number"
                step="0.01"
                placeholder="Repeating invoice amount ($ per period)"
                value={subscriptionAmount}
                onChange={(e) => setSubscriptionAmount(e.target.value)}
              />
              <label className="mt-2 flex items-start gap-2 font-medium">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={subscriptionConfirmed}
                  onChange={(e) => setSubscriptionConfirmed(e.target.checked)}
                />
                I&apos;ve confirmed a live Xero repeating invoice exists for this
                customer.
              </label>
            </div>
          )}

          <input className="h-11 w-full rounded-md border px-3" placeholder="Xero contact ID optional" value={xeroContactId} onChange={(e) => setXeroContactId(e.target.value)} />

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={isRental}
              onChange={(e) => setIsRental(e.target.checked)}
            />
            Rental / PM-managed property
          </label>

          <div className="flex gap-3">
            <label className="flex-1 text-sm">
              <span className="mb-1 block text-gray-600">Labour rate $/hr</span>
              <input className="h-11 w-full rounded-md border px-3" type="number" step="0.5" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} />
            </label>
            <label className="flex-1 text-sm">
              <span className="mb-1 block text-gray-600">Greenwaste $/bag</span>
              <input className="h-11 w-full rounded-md border px-3" type="number" step="0.5" value={greenwasteRate} onChange={(e) => setGreenwasteRate(e.target.value)} />
            </label>
          </div>

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