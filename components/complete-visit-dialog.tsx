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
import { Switch } from "@/components/ui/switch"
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"

interface CompleteVisitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  jobId: string
  propertyId: string
  assignedStaffId: string | null
  onSuccess: () => void
}

export function CompleteVisitDialog({
  open,
  onOpenChange,
  jobId,
  propertyId,
  assignedStaffId,
  onSuccess,
}: CompleteVisitDialogProps) {
  const [loading, setLoading] = useState(false)
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")
  const [hoursWorked, setHoursWorked] = useState("")
  const [greenwasteBags, setGreenwasteBags] = useState("0")
  const [workNotes, setWorkNotes] = useState("")
  const [nextVisitNotes, setNextVisitNotes] = useState("")
  const [readyForInvoice, setReadyForInvoice] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [primaryStaffId, setPrimaryStaffId] = useState(assignedStaffId || "")

const [extraChargeItems, setExtraChargeItems] = useState<
  {
    id: string
    item_code: string
    staff_label: string
    invoice_description: string
    unit_price: number
  }[]
>([])

const [selectedExtras, setSelectedExtras] = useState<
  {
    extra_charge_item_id: string
    quantity: string
  }[]
>([])

const [miscProductNote, setMiscProductNote] = useState("")

  const [helpers, setHelpers] = useState<
    { staff_member_id: string; staff_name: string; hours: string }[]
  >([])

  const [staffOptions, setStaffOptions] = useState<
    { id: string; name: string }[]
  >([])

const [assignedJobStaff, setAssignedJobStaff] = useState<
  { staff_member_id: string; staff_name: string }[]
>([])

  const timeOptions = (() => {
    const times: string[] = []

    for (let hour = 8; hour <= 17; hour++) {
      for (const minute of [0, 15, 30, 45]) {
        if (hour === 17 && minute > 0) continue

        const h = hour.toString().padStart(2, "0")
        const m = minute.toString().padStart(2, "0")
        times.push(`${h}:${m}`)
      }
    }

    return times
  })()

  useEffect(() => {
    const loadStaff = async () => {
      const supabase = createClient()

      const { data, error } = await supabase
        .from("staff_members")
        .select("id, name")
        .eq("is_active", true)
        .order("name", { ascending: true })

      if (error) {
        console.error("Error loading staff:", error)
        setError(error.message)
        return
      }

      setStaffOptions(data || [])
      const { data: assignedRows, error: assignedError } = await supabase
  .from("scheduled_job_staff")
  .select(`
    staff_member_id,
    staff_members (
      id,
      name
    )
  `)
  .eq("scheduled_job_id", jobId)

if (assignedError) {
  console.error("Error loading assigned job staff:", assignedError)
} else {
  const assigned =
    assignedRows?.map((row: any) => ({
      staff_member_id: row.staff_member_id,
      staff_name: row.staff_members?.name || "",
    })) || []

  setAssignedJobStaff(assigned)

  const helperRows = assigned
    .filter((row) => row.staff_member_id !== assignedStaffId)
    .map((row) => ({
      staff_member_id: row.staff_member_id,
      staff_name: row.staff_name,
      hours: "",
    }))

  setHelpers(helperRows)
}
      const { data: extraItems, error: extraError } = await supabase
  .from("extra_charge_items")
  .select(`
    id,
    item_code,
    staff_label,
    invoice_description,
    unit_price
  `)
  .eq("is_active", true)
  .order("staff_label", { ascending: true })

if (extraError) {
  console.error("Error loading extra items:", extraError)
} else {
  setExtraChargeItems(extraItems || [])
}
    }

    loadStaff()
  }, [jobId, assignedStaffId])

  useEffect(() => {
    if (assignedStaffId) {
      setPrimaryStaffId(assignedStaffId)
    }
  }, [assignedStaffId])

  const calculateHoursFromTime = () => {
    if (!startTime || !endTime) return null

    const start = new Date(`1970-01-01T${startTime}:00`)
    const end = new Date(`1970-01-01T${endTime}:00`)

    const diffMs = end.getTime() - start.getTime()
    const diffHours = diffMs / (1000 * 60 * 60)

    if (diffHours <= 0) return null

    return Math.round(diffHours * 4) / 4
  }

  useEffect(() => {
    const calculated = calculateHoursFromTime()

    if (calculated) {
      setHoursWorked(calculated.toString())
    }
  }, [startTime, endTime])

  const helperHoursTotal = helpers.reduce((total, helper) => {
    const helperHours = parseFloat(helper.hours)
    return total + (isNaN(helperHours) ? 0 : helperHours)
  }, 0)

  const primaryHours = parseFloat(hoursWorked) || 0
  const totalHours = primaryHours + helperHoursTotal

  const todayString = () => {
    const d = new Date()
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()

    if (isNaN(primaryHours) || primaryHours <= 0) {
      setError("Please enter valid primary hours worked")
      setLoading(false)
      return
    }

    const primaryStaff = staffOptions.find((staff) => staff.id === primaryStaffId)

    if (!primaryStaff) {
      setError("Please select the primary worker")
      setLoading(false)
      return
    }

    const visitDate = todayString()

const { data: existingVisit } = await supabase
  .from("visits")
  .select("id")
  .eq("scheduled_job_id", jobId)
  .limit(1)
  .maybeSingle()

if (existingVisit) {
  setError("This job has already been completed.")
  setLoading(false)
  return
}

    const { data: createdVisit, error: visitError } = await supabase
      .from("visits")
      .insert({
        scheduled_job_id: jobId,
        property_id: propertyId,
        visit_date: visitDate,
        hours_worked: totalHours,
        greenwaste_bags: parseInt(greenwasteBags) || 0,
        work_notes: workNotes.trim() || null,
        next_visit_notes: nextVisitNotes.trim() || null,
        completion_status: "completed",
        ready_for_invoice: readyForInvoice,
        invoice_status: readyForInvoice ? "ready" : "not_ready",
      })
      .select("id")
      .single()

    if (visitError) {
      setError(visitError.message)
      setLoading(false)
      return
    }

    if (createdVisit) {
      const { error: primaryLabourError } = await supabase
        .from("job_labour_entries")
        .insert({
          job_type: "maintenance",
          scheduled_job_id: jobId,
          property_id: propertyId,
          job_name: null,
          job_code: null,
          staff_member_id: primaryStaff.id,
          staff_name: primaryStaff.name,
          work_date: visitDate,
          hours_worked: primaryHours,
          billable: true,
          notes: workNotes.trim() || null,
        })

      if (primaryLabourError) {
        setError(primaryLabourError.message)
        setLoading(false)
        return
      }

      for (const helper of helpers) {
  const helperHours = parseFloat(helper.hours)

  if (!helper.staff_member_id || isNaN(helperHours) || helperHours <= 0) {
    continue
  }

  const { error: helperError } = await supabase
    .from("visit_labour_entries")
    .insert({
      visit_id: createdVisit.id,
      scheduled_job_id: jobId,
      property_id: propertyId,
      staff_member_id: helper.staff_member_id,
      staff_name: helper.staff_name,
      hours_worked: helperHours,
    })

  if (helperError) {
    setError(helperError.message)
    setLoading(false)
    return
  }

  const { error: helperLabourError } = await supabase
    .from("job_labour_entries")
    .insert({
      job_type: "maintenance",
      scheduled_job_id: jobId,
      property_id: propertyId,
      job_name: null,
      job_code: null,
      staff_member_id: helper.staff_member_id,
      staff_name: helper.staff_name,
      work_date: visitDate,
      hours_worked: helperHours,
      billable: true,
      notes: workNotes.trim() || null,
    })

  if (helperLabourError) {
    setError(helperLabourError.message)
    setLoading(false)
    return
  }
}

for (const extra of selectedExtras) {
  if (!extra.extra_charge_item_id) continue

  const selectedItem = extraChargeItems.find(
    (item) => item.id === extra.extra_charge_item_id
  )

  if (!selectedItem) continue

  const quantity = parseFloat(extra.quantity)

  if (isNaN(quantity) || quantity <= 0) continue

  const { error: extraChargeError } = await supabase
    .from("visit_extra_charges")
    .insert({
      visit_id: createdVisit.id,
      scheduled_job_id: jobId,
      property_id: propertyId,
      extra_charge_item_id: selectedItem.id,
      item_code: selectedItem.item_code,
      staff_label: selectedItem.staff_label,
      invoice_description: selectedItem.invoice_description,
      quantity,
      unit_price: selectedItem.unit_price,
      invoice_status: "ready",
    })

  if (extraChargeError) {
    setError(extraChargeError.message)
    setLoading(false)
    return
  }
}

if (miscProductNote.trim()) {
  const { error: miscError } = await supabase
    .from("visit_extra_charges")
    .insert({
      visit_id: createdVisit.id,
      scheduled_job_id: jobId,
      property_id: propertyId,
      item_code: "MISC-REVIEW",
      staff_label: "Misc Product Review",
      invoice_description: "Misc Product Review",
      quantity: 1,
      unit_price: 0,
      notes: miscProductNote.trim(),
      invoice_status: "review",
    })

  if (miscError) {
    setError(miscError.message)
    setLoading(false)
    return
  }
      }
    }

    const { error: jobError } = await supabase
      .from("scheduled_jobs")
      .update({
        status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)

    if (jobError) {
      setError(jobError.message)
      setLoading(false)
      return
    }

    setLoading(false)
    onSuccess()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Complete Visit</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel>Time Worked (optional)</FieldLabel>

              <div className="grid grid-cols-2 gap-2">
                <select
                  className="h-12 w-full min-w-0 rounded-md border bg-background px-2 text-sm"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                >
                  <option value="">Start</option>
                  {timeOptions.map((time) => (
                    <option key={`start-${time}`} value={time}>
                      {time}
                    </option>
                  ))}
                </select>

                <select
                  className="h-12 w-full min-w-0 rounded-md border bg-background px-2 text-sm"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                >
                  <option value="">End</option>
                  {timeOptions.map((time) => (
                    <option key={`end-${time}`} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </div>

              <p className="mt-1 text-xs text-muted-foreground">
                Optional. Selecting start and end time will auto-calculate hours.
              </p>
            </Field>

            <FieldLabel htmlFor="hours">Hours Worked</FieldLabel>
<Input
  id="hours"
  type="number"
  step="0.25"
  min="0.25"
  placeholder="e.g. 4"
  value={hoursWorked}
  onChange={(e) => setHoursWorked(e.target.value)}
  required
  className="h-12"
/>

            <Field>
              <FieldLabel htmlFor="greenwaste">Greenwaste Bags</FieldLabel>
              <Input
                id="greenwaste"
                type="number"
                min="0"
                value={greenwasteBags}
                onChange={(e) => setGreenwasteBags(e.target.value)}
                className="h-12"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="workNotes">Work Notes</FieldLabel>
              <Textarea
                id="workNotes"
                value={workNotes}
                onChange={(e) => setWorkNotes(e.target.value)}
                rows={3}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="nextVisitNotes">Next Visit Notes</FieldLabel>
              <Textarea
                id="nextVisitNotes"
                value={nextVisitNotes}
                onChange={(e) => setNextVisitNotes(e.target.value)}
                rows={3}
              />
            </Field>

            <div className="mt-4">
              <p className="mb-2 font-medium">Additional Labour</p>

              {helpers.map((helper, index) => (
                <div
                  key={index}
                  className="mb-2 grid grid-cols-[1fr_96px] gap-2"
                >
                  <select
                    className="h-12 w-full min-w-0 rounded-md border bg-background px-2 text-sm"
                    value={helper.staff_member_id}
                    onChange={(e) => {
                      const updated = [...helpers]
                      const selected = staffOptions.find(
                        (s) => s.id === e.target.value
                      )

                      updated[index] = {
                        ...updated[index],
                        staff_member_id: e.target.value,
                        staff_name: selected?.name || "",
                      }

                      setHelpers(updated)
                    }}
                  >
                    <option value="">Worker</option>
                    {staffOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>

                  <Input
                    type="number"
                    step="0.25"
                    min="0"
                    placeholder="Hours"
                    value={helper.hours}
                    onChange={(e) => {
                      const updated = [...helpers]
                      updated[index].hours = e.target.value
                      setHelpers(updated)
                    }}
                    className="h-12 min-w-0"
                  />
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setHelpers([
                    ...helpers,
                    {
                      staff_member_id: "",
                      staff_name: "",
                      hours: "",
                    },
                  ])
                }
              >
                + Add helper
              </Button>
            </div>

<div className="mt-4">
  <p className="mb-2 font-medium">Extra Charges (e.g. weedkiller)</p>

  {selectedExtras.map((extra, index) => (
    <div
      key={index}
      className="mb-2 grid grid-cols-[1fr_90px] gap-2"
    >
      <select
        className="h-12 w-full rounded-md border bg-background px-2 text-sm"
        value={extra.extra_charge_item_id}
        onChange={(e) => {
          const updated = [...selectedExtras]
          updated[index].extra_charge_item_id = e.target.value
          setSelectedExtras(updated)
        }}
      >
        <option value="">Select item</option>

        {extraChargeItems.map((item) => (
          <option key={item.id} value={item.id}>
            {item.staff_label}
          </option>
        ))}
      </select>

      <Input
        type="number"
        min="1"
        step="1"
        value={extra.quantity}
        onChange={(e) => {
          const updated = [...selectedExtras]
          updated[index].quantity = e.target.value
          setSelectedExtras(updated)
        }}
        className="h-12"
      />
    </div>
  ))}

  <Button
    type="button"
    variant="outline"
    onClick={() =>
      setSelectedExtras([
        ...selectedExtras,
        {
          extra_charge_item_id: "",
          quantity: "1",
        },
      ])
    }
  >
    + Add Extra Charge
  </Button>
</div>

<Field>
  <FieldLabel htmlFor="miscProductNote">
    Misc Product Note
  </FieldLabel>

  <Textarea
    id="miscProductNote"
    value={miscProductNote}
    onChange={(e) => setMiscProductNote(e.target.value)}
    rows={2}
    placeholder="Example: Had to buy 5 timber stakes"
  />
</Field>

            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium">Total billable hours</p>
              <p className="text-muted-foreground">{totalHours} hours</p>
            </div>

            <div className="flex items-center justify-between py-2">
              <FieldLabel htmlFor="readyForInvoice" className="mb-0">
                Ready for Invoice
              </FieldLabel>
              <Switch
                id="readyForInvoice"
                checked={readyForInvoice}
                onCheckedChange={setReadyForInvoice}
              />
            </div>
          </FieldGroup>

          {error && (
            <p className="mt-4 text-center text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="mt-6 flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-12 flex-1"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>

            <Button type="submit" className="h-12 flex-1" disabled={loading}>
              {loading ? <Spinner className="mr-2" /> : null}
              {loading ? "Saving..." : "Complete"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}