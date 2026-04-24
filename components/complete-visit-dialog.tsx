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
  onSuccess: () => void
}

export function CompleteVisitDialog({
  open,
  onOpenChange,
  jobId,
  propertyId,
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

  const [helpers, setHelpers] = useState<
    { staff_member_id: string; staff_name: string; hours: string }[]
  >([])

  const [staffOptions, setStaffOptions] = useState<
    { id: string; name: string }[]
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
    }

    loadStaff()
  }, [])

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

    const { data: createdVisit, error: visitError } = await supabase
      .from("visits")
      .insert({
        scheduled_job_id: jobId,
        property_id: propertyId,
        visit_date: new Date().toISOString().split("T")[0],
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

            <Field>
              <FieldLabel htmlFor="hours">Primary Worker Hours</FieldLabel>
              <Input
                id="hours"
                type="number"
                step="0.25"
                min="0.25"
                value={hoursWorked}
                onChange={(e) => setHoursWorked(e.target.value)}
                required
                className="h-12"
              />
            </Field>

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
                <div key={index} className="mb-2 grid grid-cols-[1fr_96px] gap-2">
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