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
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!property

  useEffect(() => {
    if (property) {
      setClientName(property.client_name)
      setAddress(property.address_line_1 ?? "")
      setAccessNotes(property.access_notes || "")
      setPermanentNotes(property.permanent_notes || "")
      setInvoiceHandlingNote(property.invoice_handling_note || "")
      setServiceType(property.service_type || "")
      setServiceFrequency(property.service_frequency || "")
    } else {
      setClientName("")
      setAddress("")
      setAccessNotes("")
      setPermanentNotes("")
      setInvoiceHandlingNote("")
      setServiceType("")
      setServiceFrequency("")
    }
    setError(null)
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

      onSuccess(data as Property, false)
    } else {
      const { data, error: insertError } = await supabase
        .from("properties")
        .insert({
          ...propertyData,
          user_id: user.id,
        })
        .select()
        .single()

      if (insertError) {
        setError(insertError.message)
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
