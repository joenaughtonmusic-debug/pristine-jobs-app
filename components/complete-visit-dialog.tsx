"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  readyInvoiceStatusForJob,
  zeroLineRefusalForVisit,
} from "@/lib/quoted-invoicing"
import {
  SEVERITY_LABELS,
  WALK_AROUND_SEVERITIES,
  type WalkAroundSeverity,
} from "@/lib/walk-around"
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

interface CompleteVisitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  jobId: string
  propertyId: string
  assignedStaffId: string | null
  propertyIsRental?: boolean
  onSuccess: () => void
  // Called instead of blocking when the visit completed but walk-around
  // issues failed to save — the parent surfaces it, completion stands.
  onIssueSaveWarning?: (message: string) => void
}

export function CompleteVisitDialog({
  open,
  onOpenChange,
  jobId,
  propertyId,
  assignedStaffId,
  propertyIsRental = false,
  onSuccess,
  onIssueSaveWarning,
}: CompleteVisitDialogProps) {
  const [loading, setLoading] = useState(false)
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")
  const [hoursWorked, setHoursWorked] = useState("")
  const [greenwasteBags, setGreenwasteBags] = useState("0")
  const [workNotes, setWorkNotes] = useState("")
  const [nextVisitNotes, setNextVisitNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [primaryStaffId, setPrimaryStaffId] = useState(assignedStaffId || "")
  const [extraMaterialsState, setExtraMaterialsState] = useState<
    "none" | "needs_admin_review"
  >("none")
  const [extraMaterialsNote, setExtraMaterialsNote] = useState("")

  const [helpers, setHelpers] = useState<
    { staff_member_id: string; staff_name: string; hours: string }[]
  >([])

  // Walk-around report (rental jobs): zero or more optional issues, each a
  // photo + severity + short note. A clean walk-around (no rows) is valid.
  const [walkAroundIssues, setWalkAroundIssues] = useState<
    { file: File | null; severity: "" | WalkAroundSeverity; note: string }[]
  >([])

  // Reset on reopen: the native file inputs lose their files when Radix
  // unmounts the dialog DOM, so carrying the old File objects in state would
  // silently upload photos the crew can no longer see.
  useEffect(() => {
    if (open) setWalkAroundIssues([])
  }, [open])

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

  const helperRows = assigned
    .filter((row) => row.staff_member_id !== assignedStaffId)
    .map((row) => ({
      staff_member_id: row.staff_member_id,
      staff_name: row.staff_name,
      hours: "",
    }))

  setHelpers(helperRows)
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
  const validHelperRows = helpers
    .map((helper) => ({
      ...helper,
      parsedHours: parseFloat(helper.hours),
    }))
    .filter(
      (helper) =>
        helper.staff_member_id &&
        helper.staff_name &&
        !isNaN(helper.parsedHours) &&
        helper.parsedHours > 0
    )
  const labourEntryTotal = primaryHours + validHelperRows.reduce(
    (total, helper) => total + helper.parsedHours,
    0
  )
  const materialReviewComplete = extraMaterialsState === "none"
  const readyForInvoice = materialReviewComplete
  const costCaptureWarnings = [
    !workNotes.trim() ? "Work notes are required for back-costing context." : null,
    Math.abs(totalHours - labourEntryTotal) > 0.01
      ? "Staff labour entry hours do not match total visit hours."
      : null,
    !materialReviewComplete
      ? "Materials/extras need admin review."
      : null,
  ].filter(Boolean)

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

    if (!workNotes.trim()) {
      setError("Please add work notes before completing the visit.")
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

    // Rental properties require photo proof of the work. Checked against the
    // DB at submit time, not just the UI state, so the gate can't be beaten
    // by a stale page.
    if (propertyIsRental) {
      const { data: gatePhotos, error: gatePhotoError } = await supabase
        .from("job_photos")
        .select("id")
        .eq("scheduled_job_id", jobId)
        .neq("photo_type", "client_instruction")
        .limit(1)

      if (gatePhotoError) {
        setError(
          "Couldn't confirm this rental job's photos. Check your connection and try again."
        )
        setLoading(false)
        return
      }

      if (!gatePhotos || gatePhotos.length === 0) {
        setError(
          "This is a rental property. Upload at least one photo of the work before completing the visit — any photo type counts except Client instruction."
        )
        setLoading(false)
        return
      }
    }

    // Walk-around issues: ignore fully empty rows; a partially filled row
    // blocks with a clear message rather than silently dropping crew input.
    const filledIssues = walkAroundIssues.filter(
      (issue) => issue.file || issue.severity || issue.note.trim()
    )

    if (filledIssues.some((issue) => !issue.file || !issue.severity)) {
      setError(
        "Each walk-around issue needs a photo and a severity. Fill them in or remove the row."
      )
      setLoading(false)
      return
    }

    // Upload issue photos BEFORE any visit rows are written, so an upload
    // failure blocks cleanly with nothing half-saved.
    const uploadedIssues: {
      objectPath: string
      storagePath: string
      publicUrl: string | null
      severity: WalkAroundSeverity
      note: string
    }[] = []

    if (filledIssues.length > 0) {
      const issueTimestamp = Date.now()

      for (const [index, issue] of filledIssues.entries()) {
        const file = issue.file as File
        const safeName = file.name
          .toLowerCase()
          .replace(/[^a-z0-9._-]+/g, "-")
          .replace(/^-+|-+$/g, "")
        const objectPath = `${jobId}/${issueTimestamp}-issue-${index}-${
          safeName || "walk-around"
        }`

        const { error: uploadError } = await supabase.storage
          .from("job-photos")
          .upload(objectPath, file, { cacheControl: "3600", upsert: false })

        if (uploadError) {
          if (uploadedIssues.length > 0) {
            await supabase.storage
              .from("job-photos")
              .remove(uploadedIssues.map((uploaded) => uploaded.objectPath))
          }
          setError(
            "A walk-around photo failed to upload — nothing has been saved. Check your connection and try again."
          )
          setLoading(false)
          return
        }

        const { data: publicUrlData } = supabase.storage
          .from("job-photos")
          .getPublicUrl(objectPath)

        uploadedIssues.push({
          objectPath,
          storagePath: `job-photos/${objectPath}`,
          publicUrl: publicUrlData.publicUrl || null,
          severity: issue.severity as WalkAroundSeverity,
          note: issue.note.trim(),
        })
      }
    }

    // If the submit fails after this point, the uploaded issue photos are
    // unreferenced — remove them so they don't become storage orphans.
    const removeIssueUploads = async () => {
      if (uploadedIssues.length > 0) {
        await supabase.storage
          .from("job-photos")
          .remove(uploadedIssues.map((uploaded) => uploaded.objectPath))
      }
    }

    const materialsReviewNote =
      extraMaterialsState === "needs_admin_review"
        ? extraMaterialsNote.trim() || "Extras/materials used - needs admin review"
        : extraMaterialsNote.trim() || null

    // Quoted jobs are invoiced once from the quote, never per visit — exclude
    // a ready visit so it can't become its own per-visit invoice.
    const readyInvoiceStatus = await readyInvoiceStatusForJob(supabase, jobId)

    const visitPayload = {
      scheduled_job_id: jobId,
      property_id: propertyId,
      visit_date: visitDate,
      hours_worked: labourEntryTotal,
      greenwaste_bags: parseInt(greenwasteBags) || 0,
      work_notes: workNotes.trim() || null,
      next_visit_notes: nextVisitNotes.trim() || null,
      completion_status: "completed",
      // Guard 2 (crew path): always insert unqueued — the ready stamp happens
      // after the zero-line check below, so a visit Make can't price never
      // becomes 'ready', not even for an instant.
      ready_for_invoice: false,
      invoice_status: "not_ready",
      cost_capture_reviewed_at: materialReviewComplete
        ? new Date().toISOString()
        : null,
      materials_review_note: materialsReviewNote,
    }

    let { data: createdVisit, error: visitError } = await supabase
      .from("visits")
      .insert(visitPayload)
      .select("id")
      .single()

    if (visitError && visitError.message.includes("materials_review_note")) {
      const fallbackWorkNotes = [
        workNotes.trim(),
        materialsReviewNote
          ? `Extra materials / admin note: ${materialsReviewNote}`
          : null,
      ]
        .filter(Boolean)
        .join("\n\n")

      const { materials_review_note: _materialsReviewNote, ...fallbackPayload } =
        visitPayload

      const retry = await supabase
        .from("visits")
        .insert({
          ...fallbackPayload,
          work_notes: fallbackWorkNotes || null,
        })
        .select("id")
        .single()

      createdVisit = retry.data
      visitError = retry.error
    }

    if (visitError) {
      await removeIssueUploads()
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
          notes: workNotes.trim() || null,
        })

      if (primaryLabourError) {
        await removeIssueUploads()
        setError(primaryLabourError.message)
        setLoading(false)
        return
      }

      const visitLabourRows = [
        {
          visit_id: createdVisit.id,
          scheduled_job_id: jobId,
          property_id: propertyId,
          staff_member_id: primaryStaff.id,
          staff_name: primaryStaff.name,
          hours_worked: primaryHours,
          labour_type: "primary",
          notes: workNotes.trim() || null,
        },
        ...validHelperRows.map((helper) => ({
          visit_id: createdVisit.id,
          scheduled_job_id: jobId,
          property_id: propertyId,
          staff_member_id: helper.staff_member_id,
          staff_name: helper.staff_name,
          hours_worked: helper.parsedHours,
          labour_type: "helper",
          notes: workNotes.trim() || null,
        })),
      ]

      const { error: visitLabourError } = await supabase
        .from("visit_labour_entries")
        .insert(visitLabourRows)

      if (visitLabourError) {
        await removeIssueUploads()
        setError(visitLabourError.message)
        setLoading(false)
        return
      }

      const derivedVisitHours = visitLabourRows.reduce(
        (total, row) => total + Number(row.hours_worked || 0),
        0
      )

      const { error: hoursSyncError } = await supabase
        .from("visits")
        .update({ hours_worked: derivedVisitHours })
        .eq("id", createdVisit.id)

      if (hoursSyncError) {
        await removeIssueUploads()
        setError(hoursSyncError.message)
        setLoading(false)
        return
      }

      for (const helper of helpers) {
  const helperHours = parseFloat(helper.hours)

  if (!helper.staff_member_id || isNaN(helperHours) || helperHours <= 0) {
    continue
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
      notes: workNotes.trim() || null,
    })

  if (helperLabourError) {
    await removeIssueUploads()
    setError(helperLabourError.message)
    setLoading(false)
    return
  }
}

    }

    // Guard 2 (crew path): stamp the invoice queue state last. A refusal keeps
    // the completed work recorded but leaves the visit in the error state the
    // admin errors tab already surfaces — never a 'ready' visit with 0 lines.
    if (readyForInvoice && createdVisit) {
      const refusal =
        readyInvoiceStatus === "ready"
          ? await zeroLineRefusalForVisit(supabase, createdVisit.id)
          : null

      const { error: queueStampError } = await supabase
        .from("visits")
        .update(
          refusal
            ? {
                ready_for_invoice: false,
                invoice_status: "error",
                invoice_error: refusal,
              }
            : {
                ready_for_invoice: true,
                invoice_status: readyInvoiceStatus,
                invoice_error: null,
              }
        )
        .eq("id", createdVisit.id)

      if (queueStampError) {
        await removeIssueUploads()
        setError(queueStampError.message)
        setLoading(false)
        return
      }
    }

    // Record walk-around issues against the visit. A failure here must not
    // block completion (the visit is already recorded) — but it must be
    // reported, never swallowed.
    let issueSaveError: string | null = null

    if (uploadedIssues.length > 0) {
      const { data: userData } = await supabase.auth.getUser()

      const { error: issueInsertError } = await supabase
        .from("job_photos")
        .insert(
          uploadedIssues.map((issue) => ({
            scheduled_job_id: jobId,
            property_id: propertyId,
            visit_id: createdVisit?.id || null,
            uploaded_by: userData?.user?.id || null,
            storage_path: issue.storagePath,
            public_url: issue.publicUrl,
            caption: issue.note || null,
            photo_type: "issue",
            severity: issue.severity,
          }))
        )

      if (issueInsertError) {
        issueSaveError = issueInsertError.message
        // The rows never landed, so the uploaded objects are unreferenced.
        await removeIssueUploads()
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

    if (issueSaveError) {
      // Completion stands (the visit and status are already recorded) — close
      // normally so the page reflects reality, and surface the warning there.
      onIssueSaveWarning?.(
        `The visit was completed, but the walk-around issues could not be saved (${issueSaveError}). Add the photos from the job page instead.`
      )
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
              <FieldLabel>Primary worker</FieldLabel>
              <select
                className="h-12 w-full rounded-md border bg-background px-3 text-sm"
                value={primaryStaffId}
                onChange={(event) => setPrimaryStaffId(event.target.value)}
                required
              >
                <option value="">Select staff member</option>
                {staffOptions.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Primary worker hours are the hours above. Add other staff below.
              </p>
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
                required
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

            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium">Total visit hours</p>
              <p className="text-muted-foreground">{totalHours} hours</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Staff labour entries: {labourEntryTotal.toFixed(2)} hours
              </p>
            </div>

            <Field>
              <FieldLabel>Extra materials / admin note</FieldLabel>
              <div className="grid gap-2">
                <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
                  <input
                    type="radio"
                    className="mt-1"
                    name="extraMaterialsState"
                    checked={extraMaterialsState === "none"}
                    onChange={() => setExtraMaterialsState("none")}
                  />
                  <span>
                    No extras/materials used
                    <span className="block text-xs text-muted-foreground">
                      Green waste bags are recorded separately above.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
                  <input
                    type="radio"
                    className="mt-1"
                    name="extraMaterialsState"
                    checked={extraMaterialsState === "needs_admin_review"}
                    onChange={() => setExtraMaterialsState("needs_admin_review")}
                  />
                  <span>
                    Extras/materials used - needs admin review
                    <span className="block text-xs text-muted-foreground">
                      Add a short note below. Admin will cost or invoice it later.
                    </span>
                  </span>
                </label>
              </div>
              <Textarea
                className="mt-3"
                value={extraMaterialsNote}
                onChange={(event) => setExtraMaterialsNote(event.target.value)}
                rows={2}
                placeholder="Example: used 6 stakes and ties, half bag fertiliser, extra spray, etc."
              />
            </Field>

            {propertyIsRental && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-sm font-medium">Walk-around report</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Any issues to report? A clean walk-around is fine — just
                  complete the visit. Each issue needs a photo and a severity.
                </p>

                {walkAroundIssues.map((issue, index) => (
                  <div
                    key={index}
                    className="mt-3 grid gap-2 rounded-md border bg-background p-2"
                  >
                    <input
                      type="file"
                      accept="image/*"
                      className="block w-full rounded-md border bg-background p-2 text-sm"
                      onChange={(event) => {
                        const updated = [...walkAroundIssues]
                        updated[index].file = event.target.files?.[0] || null
                        setWalkAroundIssues(updated)
                      }}
                    />

                    <select
                      className="h-11 rounded-md border bg-background px-3 text-sm"
                      value={issue.severity}
                      onChange={(event) => {
                        const updated = [...walkAroundIssues]
                        updated[index].severity = event.target.value as
                          | ""
                          | WalkAroundSeverity
                        setWalkAroundIssues(updated)
                      }}
                    >
                      <option value="">Select severity...</option>
                      {WALK_AROUND_SEVERITIES.map((severity) => (
                        <option key={severity} value={severity}>
                          {SEVERITY_LABELS[severity]}
                        </option>
                      ))}
                    </select>

                    <Input
                      value={issue.note}
                      onChange={(event) => {
                        const updated = [...walkAroundIssues]
                        updated[index].note = event.target.value
                        setWalkAroundIssues(updated)
                      }}
                      placeholder="Short note, e.g. broken fence paling by gate"
                    />

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="justify-self-end"
                      onClick={() =>
                        setWalkAroundIssues(
                          walkAroundIssues.filter((_, i) => i !== index)
                        )
                      }
                    >
                      Remove issue
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 h-11 w-full"
                  onClick={() =>
                    setWalkAroundIssues([
                      ...walkAroundIssues,
                      { file: null, severity: "", note: "" },
                    ])
                  }
                >
                  + Add issue
                </Button>
              </div>
            )}

            {costCaptureWarnings.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-medium">Admin review warnings</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {costCaptureWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

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
