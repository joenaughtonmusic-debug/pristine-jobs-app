"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import type { Property } from "@/lib/types"
import { isSubscriptionUnconfirmed } from "@/lib/subscription-billing"
import {
  getServiceIntervalWeeks,
  serviceFrequencyOptions,
} from "@/lib/service-frequency"

interface PropertyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  property: Property | null
  onSuccess: (property: Property, isNew: boolean) => void
}

function makePropertyCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 20)
}

export function PropertyDialog({
  open,
  onOpenChange,
  property,
  onSuccess,
}: PropertyDialogProps) {
  const [loading, setLoading] = useState(false)
  const [clientName, setClientName] = useState("")
  const [address, setAddress] = useState("")
  const [accessNotes, setAccessNotes] = useState("")
  const [permanentNotes, setPermanentNotes] = useState("")
  const [invoiceHandlingNote, setInvoiceHandlingNote] = useState("")
  const [serviceType, setServiceType] = useState("")
  const [serviceFrequency, setServiceFrequency] = useState("")
  const [hourlyRate, setHourlyRate] = useState("80")
  const [greenwasteRate, setGreenwasteRate] = useState("26.5")
  // Phase B: confirmation + amount are per subscription billing LINE, so a
  // property can hold several, each confirmed independently.
  const [subscriptionLines, setSubscriptionLines] = useState<
    { id: string; amount: string; confirmed: boolean }[]
  >([])
  const [isRental, setIsRental] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!property

  const updateLine = (
    id: string,
    patch: Partial<{ amount: string; confirmed: boolean }>
  ) =>
    setSubscriptionLines((prev) =>
      prev.map((line) => (line.id === id ? { ...line, ...patch } : line))
    )

  useEffect(() => {
    if (property) {
      setClientName(property.client_name)
      setAddress(property.address_line_1 ?? "")
      setAccessNotes(property.access_notes || "")
      setPermanentNotes(property.permanent_notes || "")
      setInvoiceHandlingNote(property.invoice_handling_note || "")
      setServiceType(property.service_type || "")
      setServiceFrequency(property.service_frequency || "")
      setIsRental(property.is_rental ?? false)
      setError(null)

      // Phase B: load the property's active subscription lines so each can be
      // confirmed independently. A line is ticked only when it's currently,
      // validly confirmed — a stale/unconfirmed line starts unticked so it
      // requires an active re-confirmation.
      let cancelled = false
      const supabase = createClient()
      supabase
        .from("property_billing_lines")
        .select("id, subscription_amount, subscription_invoice_confirmed_at")
        .eq("property_id", property.id)
        .eq("active", true)
        .eq("billing_mode", "subscription")
        .order("created_at", { ascending: true })
        .then(({ data }) => {
          if (cancelled) return
          setSubscriptionLines(
            (data || []).map((line) => ({
              id: line.id as string,
              amount:
                line.subscription_amount != null
                  ? String(line.subscription_amount)
                  : "",
              confirmed: !isSubscriptionUnconfirmed({
                billing_mode: "subscription",
                subscription_invoice_confirmed_at:
                  line.subscription_invoice_confirmed_at,
              }),
            }))
          )
        })
      return () => {
        cancelled = true
      }
    } else {
      setClientName("")
      setAddress("")
      setAccessNotes("")
      setPermanentNotes("")
      setInvoiceHandlingNote("")
      setServiceType("")
      setServiceFrequency("")
      setSubscriptionLines([])
      setIsRental(false)
      setError(null)
    }
  }, [property, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setError("You must be logged in")
      setLoading(false)
      return
    }

    const propertyData = {
  client_name: clientName.trim(),
  address_line_1: address.trim(),
  access_notes: accessNotes.trim() || null,
  permanent_notes: permanentNotes.trim() || null,
  invoice_handling_note: invoiceHandlingNote.trim() || null,
  service_type: serviceType.trim() || null,
  service_frequency: serviceFrequency || null,
  service_interval_weeks: getServiceIntervalWeeks(serviceFrequency),
  is_rental: isRental,
  updated_at: new Date().toISOString(),
}

    if (isEditing) {
      const { data, error: updateError } = await supabase
        .from("properties")
        .update(propertyData)
        .eq("id", property.id)
        .select()
        .single()

      if (updateError) {
        setError(updateError.message)
        setLoading(false)
        return
      }

      // Phase B: confirmation + amount write to each subscription LINE, not the
      // property. Ticking stamps a fresh confirmed_at on that line (clearing its
      // staleness and only its own VA action); unticking un-confirms that line.
      const nowIso = new Date().toISOString()
      for (const line of subscriptionLines) {
        const { error: lineError } = await supabase
          .from("property_billing_lines")
          .update({
            subscription_amount: line.amount ? Number(line.amount) : null,
            subscription_invoice_confirmed_at: line.confirmed ? nowIso : null,
            subscription_invoice_confirmed_by: line.confirmed
              ? user.email || "admin"
              : null,
            updated_at: nowIso,
          })
          .eq("id", line.id)
        if (lineError) {
          setError(lineError.message)
          setLoading(false)
          return
        }
      }

      onSuccess(data as Property, false)
    } else {
      // Add path: generate the required property_code (NOT NULL, no default)
      // and default this new customer to the standard $80/$26.50 charge_up
      // rates. `user_id` is intentionally NOT written — no such column exists
      // on properties, and including it made every add fail.
      const { data, error: insertError } = await supabase
        .from("properties")
        .insert({
          ...propertyData,
          property_code: makePropertyCode(address),
          hourly_rate: Number(hourlyRate) || 80,
          greenwaste_rate: Number(greenwasteRate) || 26.5,
        })
        .select()
        .single()

      if (insertError) {
        setError(insertError.message)
        setLoading(false)
        return
      }

      // Phase B: every property carries its billing identity as a line. The add
      // form creates a charge_up property, so seed a matching charge_up line.
      const { error: lineError } = await supabase
        .from("property_billing_lines")
        .insert({
          property_id: data.id,
          billing_mode: "charge_up",
          job_type: serviceType.trim() || null,
          active: true,
        })
      if (lineError) {
        setError(lineError.message)
        setLoading(false)
        return
      }

      onSuccess(data as Property, true)
    }

    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Property" : "Add Property"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="clientName">Client Name</FieldLabel>
              <Input
                id="clientName"
                placeholder="e.g. John Smith"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                required
                className="h-12"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="address">Address</FieldLabel>
              <Input
                id="address"
                placeholder="e.g. 123 Garden Street"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
                className="h-12"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="accessNotes">Access Notes</FieldLabel>
              <Textarea
                id="accessNotes"
                placeholder="Gate code, key location..."
                value={accessNotes}
                onChange={(e) => setAccessNotes(e.target.value)}
                rows={3}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="permanentNotes">Permanent Notes</FieldLabel>
              <Textarea
                id="permanentNotes"
                placeholder="Special instructions, preferences..."
                value={permanentNotes}
                onChange={(e) => setPermanentNotes(e.target.value)}
                rows={3}
              />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isRental}
                onChange={(e) => setIsRental(e.target.checked)}
              />
              Rental / PM-managed property
            </label>

            {!isEditing && (
              <div className="flex gap-3">
                <Field className="flex-1">
                  <FieldLabel htmlFor="hourlyRate">Labour rate $/hr</FieldLabel>
                  <Input
                    id="hourlyRate"
                    type="number"
                    step="0.5"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                    className="h-12"
                  />
                </Field>
                <Field className="flex-1">
                  <FieldLabel htmlFor="greenwasteRate">
                    Greenwaste $/bag
                  </FieldLabel>
                  <Input
                    id="greenwasteRate"
                    type="number"
                    step="0.5"
                    value={greenwasteRate}
                    onChange={(e) => setGreenwasteRate(e.target.value)}
                    className="h-12"
                  />
                </Field>
              </div>
            )}

            <Field>
              <FieldLabel htmlFor="serviceType">Service Type</FieldLabel>
              <Input
                id="serviceType"
                placeholder="e.g. maintenance, commercial, one-off"
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value)}
                className="h-12"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="serviceFrequency">
                Service Frequency
              </FieldLabel>
              <select
                id="serviceFrequency"
                className="h-12 w-full rounded-md border bg-background px-3 text-sm"
                value={serviceFrequency}
                onChange={(e) => setServiceFrequency(e.target.value)}
              >
                {serviceFrequencyOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field>
              <FieldLabel htmlFor="invoiceHandlingNote">
                Invoice Handling Note
              </FieldLabel>
              <Textarea
                id="invoiceHandlingNote"
                placeholder="Invoice exclusions, special billing instructions..."
                value={invoiceHandlingNote}
                onChange={(e) => setInvoiceHandlingNote(e.target.value)}
                rows={3}
              />
            </Field>

            {subscriptionLines.length > 0 && (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
                <p className="mb-2 text-sm font-medium text-blue-900">
                  Subscription billing (Xero repeating invoice)
                </p>
                {subscriptionLines.map((line, index) => (
                  <div
                    key={line.id}
                    className={
                      index > 0
                        ? "mt-3 border-t border-blue-200 pt-3"
                        : undefined
                    }
                  >
                    {subscriptionLines.length > 1 && (
                      <p className="mb-1 text-xs font-medium text-blue-800">
                        Subscription line {index + 1}
                      </p>
                    )}
                    <Field>
                      <FieldLabel htmlFor={`subscriptionAmount-${line.id}`}>
                        Repeating invoice amount ($ per period)
                      </FieldLabel>
                      <Input
                        id={`subscriptionAmount-${line.id}`}
                        type="number"
                        step="0.01"
                        placeholder="e.g. 544"
                        value={line.amount}
                        onChange={(e) =>
                          updateLine(line.id, { amount: e.target.value })
                        }
                        className="h-12"
                      />
                    </Field>
                    <label className="mt-2 flex items-start gap-2 text-sm text-blue-900">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={line.confirmed}
                        onChange={(e) =>
                          updateLine(line.id, { confirmed: e.target.checked })
                        }
                      />
                      I&apos;ve confirmed a live Xero repeating invoice exists for
                      this line.
                    </label>
                  </div>
                ))}
              </div>
            )}
          </FieldGroup>

          {error && (
            <p className="text-destructive text-sm mt-4 text-center">{error}</p>
          )}

          <div className="flex gap-3 mt-6">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-12"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1 h-12" disabled={loading}>
              {loading ? <Spinner className="mr-2" /> : null}
              {loading ? "Saving..." : isEditing ? "Save" : "Add"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
