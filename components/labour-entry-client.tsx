"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { toZonedTime } from "date-fns-tz"

type StaffMember = {
  id: string
  name: string
}

type LandscapingJob = {
  id: string
  job_code: string
  job_name: string
  client_name: string | null
  address_line_1: string | null
  suburb: string | null
  property_id?: string | null
  scheduled_jobs?: {
    id: string
    property_id: string
    scheduled_date: string
  }[]
}

type PropertyOption = {
  id: string
  property_code?: string | null
  client_name?: string | null
  address_line_1?: string | null
  suburb?: string | null
}

type LabourEntry = {
  id: string
  job_type: string
  job_name: string | null
  job_code: string | null
  work_type?: string | null
  scheduled_job_id?: string | null
  property_id?: string | null
  staff_member_id: string
  staff_name: string
  work_date: string
  hours_worked: number
  billable: boolean
  billable_status?: "billable" | "non_billable" | "needs_review" | null
  notes: string | null
  properties?: {
    address_line_1?: string | null
    suburb?: string | null
  } | {
    address_line_1?: string | null
    suburb?: string | null
  }[] | null
}

type Timesheet = {
  id: string
  staff_member_id: string
  staff_name: string
  work_date: string
  hours_entered?: number | null
  start_time?: string | null
  finish_time?: string | null
  total_hours: number
  day_status: string | null
  status_notes: string | null
  notes?: string | null
}

type Props = {
  staffMember: StaffMember
  properties: PropertyOption[]
  landscapingJobs: LandscapingJob[]
  labourEntries: LabourEntry[]
  timesheets: Timesheet[]
  weekStart: string
}

function parseLocalDate(dateString?: string) {
  if (!dateString) return new Date()
  const [year, month, day] = dateString.split("-").map(Number)
  return new Date(year, month - 1, day)
}

function toLocalDateString(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function isExpectedWorkDay(staffName: string, day: string) {
  const date = parseLocalDate(day)
  const dayNumber = date.getDay()
  const name = staffName.trim().toLowerCase()

  // Sunday = 0, Monday = 1, Tuesday = 2, Wednesday = 3, Thursday = 4, Friday = 5

  if (name.includes("graham")) {
    return false
  }

  if (name.includes("charles")) {
    return [2, 3, 4, 5].includes(dayNumber)
  }

  if (name.includes("fletch") || name.includes("fletcher")) {
    return [2, 3, 4].includes(dayNumber)
  }

  return [1, 2, 3, 4, 5].includes(dayNumber)
}

function addDays(dateString: string, days: number) {
  const date = parseLocalDate(dateString)
  date.setDate(date.getDate() + days)
  return toLocalDateString(date)

  
}

function isPastWorkDay(day: string) {
  const today = toZonedTime(new Date(), "Pacific/Auckland")
  today.setHours(0, 0, 0, 0)

  const date = parseLocalDate(day)
  date.setHours(0, 0, 0, 0)

  return date < today
}

function formatDayLabel(dateString: string) {
  return parseLocalDate(dateString).toLocaleDateString("en-NZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
}

function formatLandscapingJobLabel(job: LandscapingJob) {
  const location = [job.address_line_1, job.suburb].filter(Boolean).join(", ")
  return [job.job_code, job.job_name, location].filter(Boolean).join(" — ")
}

const miscWorkTypeOptions = [
  { value: "tip_run", label: "Tip run" },
  { value: "extra_property_work", label: "Extra property work" },
  { value: "travel", label: "Travel" },
  { value: "pickup_delivery", label: "Pickup / delivery" },
  { value: "admin", label: "Admin" },
  { value: "yard_equipment", label: "Yard / equipment" },
  { value: "estimator_work", label: "Estimator work" },
  { value: "other", label: "Other" },
] as const

function formatPropertyOption(property: PropertyOption) {
  return [
    property.property_code,
    property.client_name,
    [property.address_line_1, property.suburb].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(" — ")
}

function getWorkTypeLabel(value?: string | null) {
  return (
    miscWorkTypeOptions.find((option) => option.value === value)?.label ||
    value?.replaceAll("_", " ") ||
    "Misc work"
  )
}

function getBillableStatusLabel(value?: string | null, billable?: boolean | null) {
  if (value === "needs_review") return "Needs review"
  if (value === "non_billable") return "Non-billable"
  if (value === "billable") return "Billable"
  return billable ? "Billable" : "Non-billable"
}

function firstOrValue<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function formatLabourEntryLabel(entry: LabourEntry) {
  const property = firstOrValue(entry.properties)
  const propertyAddress = [property?.address_line_1, property?.suburb]
    .filter(Boolean)
    .join(", ")

  if (entry.job_type === "misc") {
    return [
      "Unscheduled / Misc Work",
      getWorkTypeLabel(entry.work_type || entry.job_code),
      propertyAddress || entry.job_name,
    ]
      .filter(Boolean)
      .join(" — ")
  }

  return (
    propertyAddress ||
    entry.job_name ||
    entry.job_code ||
    (entry.job_type === "landscaping" ? "Landscaping job" : entry.job_type)
  )
}

function formatDayStatus(status?: string | null) {
  if (!status) return "Worked"

  return status
    .split("_")
    .map((part, index) =>
      index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part
    )
    .join(" ")
}

function formatTime(value?: string | null) {
  return value ? value.slice(0, 5) : null
}

export function LabourEntryClient({
  staffMember,
  properties,
  landscapingJobs,
  labourEntries,
  timesheets,
  weekStart,
}: Props) {
  const router = useRouter()
  const supabase = createClient()

  const weekDays = [0, 1, 2, 3, 4].map((offset) =>
    addDays(weekStart, offset)
  )

  const [selectedJobByDay, setSelectedJobByDay] = useState<Record<string, string>>({})
  const [hoursByDay, setHoursByDay] = useState<Record<string, string>>({})
  const [notesByDay, setNotesByDay] = useState<Record<string, string>>({})
  const [billableByDay, setBillableByDay] = useState<Record<string, boolean>>({})
  const [miscWorkTypeByDay, setMiscWorkTypeByDay] = useState<Record<string, string>>({})
  const [miscPropertyIdByDay, setMiscPropertyIdByDay] = useState<Record<string, string>>({})
  const [miscFreeTextByDay, setMiscFreeTextByDay] = useState<Record<string, string>>({})
  const [miscHoursByDay, setMiscHoursByDay] = useState<Record<string, string>>({})
  const [miscBillableStatusByDay, setMiscBillableStatusByDay] = useState<Record<string, string>>({})
  const [miscNotesByDay, setMiscNotesByDay] = useState<Record<string, string>>({})

  const [totalHoursByDay, setTotalHoursByDay] = useState<Record<string, string>>({})
  const [deductLunchFromTotalByDay, setDeductLunchFromTotalByDay] = useState<Record<string, boolean>>({})
  const [timesheetStatusByDay, setTimesheetStatusByDay] = useState<Record<string, string>>({})
  const [timesheetNotesByDay, setTimesheetNotesByDay] = useState<Record<string, string>>({})
  const [editingTimesheetByDay, setEditingTimesheetByDay] = useState<Record<string, boolean>>({})
  const [manualWorkDayByDay, setManualWorkDayByDay] = useState<Record<string, boolean>>({})
const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
const [editEntryHours, setEditEntryHours] = useState("")
const [editEntryNotes, setEditEntryNotes] = useState("")

  const [savingDay, setSavingDay] = useState<string | null>(null)
  const [messageByDay, setMessageByDay] = useState<Record<string, string>>({})
  const [errorByDay, setErrorByDay] = useState<Record<string, string>>({})

  const weeklyTotalHours =
    timesheets?.reduce((total, timesheet) => {
      return total + Number(timesheet.total_hours || 0)
    }, 0) || 0
  const weeklyJobHours = labourEntries.reduce((total, entry) => {
    return total + Number(entry.hours_worked || 0)
  }, 0)

  const getCalculatedHours = (day: string) => {
    const parsed = parseFloat(hoursByDay[day] || "")
    if (isNaN(parsed) || parsed <= 0) return ""
    return parsed.toFixed(2)
  }

  const getEntriesForDay = (day: string) => {
    return labourEntries.filter((entry) => entry.work_date === day)
  }

  const getDayTotalFromEntries = (day: string) => {
    return getEntriesForDay(day).reduce((total, entry) => {
      return total + Number(entry.hours_worked || 0)
    }, 0)
  }

  const getTimesheetForDay = (day: string) => {
    return timesheets.find((timesheet) => timesheet.work_date === day)
  }

  const copyJobToRemainingDays = (fromDay: string) => {
    const selectedJobId = selectedJobByDay[fromDay]
    if (!selectedJobId) return

    const fromIndex = weekDays.indexOf(fromDay)
    if (fromIndex === -1) return

    const updated = { ...selectedJobByDay }

    weekDays.slice(fromIndex + 1).forEach((day) => {
      updated[day] = selectedJobId
    })

    setSelectedJobByDay(updated)
  }

  const handleSaveDay = async (day: string) => {
    setSavingDay(day)
    setMessageByDay((prev) => ({ ...prev, [day]: "" }))
    setErrorByDay((prev) => ({ ...prev, [day]: "" }))

    const selectedJobId = selectedJobByDay[day]
    const selectedJob = landscapingJobs.find((job) => job.id === selectedJobId)
    const calculatedHours = parseFloat(getCalculatedHours(day))

    if (!selectedJob) {
      setErrorByDay((prev) => ({
        ...prev,
        [day]: "Please select a landscaping job.",
      }))
      setSavingDay(null)
      return
    }

    if (isNaN(calculatedHours) || calculatedHours <= 0) {
      setErrorByDay((prev) => ({
        ...prev,
        [day]: "Please enter valid hours.",
      }))
      setSavingDay(null)
      return
    }

    const billable = billableByDay[day] ?? true
    const notes = notesByDay[day]?.trim() || null
    const scheduledJobsForDay =
      selectedJob.scheduled_jobs?.filter(
        (scheduledJob) => scheduledJob.scheduled_date === day
      ) || []
    const scheduledJobId =
      scheduledJobsForDay.length === 1 ? scheduledJobsForDay[0].id : null

    const { error: labourError } = await supabase
      .from("job_labour_entries")
      .insert({
        job_type: "landscaping",
        scheduled_job_id: scheduledJobId,
        property_id: selectedJob.property_id || null,
        job_name: selectedJob.job_name,
        job_code: selectedJob.job_code,
        staff_member_id: staffMember.id,
        staff_name: staffMember.name,
        work_date: day,
        hours_worked: calculatedHours,
        billable,
        notes,
      })

    if (labourError) {
      setErrorByDay((prev) => ({ ...prev, [day]: labourError.message }))
      setSavingDay(null)
      return
    }

    setMessageByDay((prev) => ({ ...prev, [day]: "Job labour saved." }))
    setHoursByDay((prev) => ({ ...prev, [day]: "" }))
    setNotesByDay((prev) => ({ ...prev, [day]: "" }))
    setSavingDay(null)
    router.refresh()
  }

  const handleSaveMiscWork = async (day: string) => {
    setSavingDay(day)
    setMessageByDay((prev) => ({ ...prev, [day]: "" }))
    setErrorByDay((prev) => ({ ...prev, [day]: "" }))

    const workType = miscWorkTypeByDay[day] || "other"
    const propertyId = miscPropertyIdByDay[day] || null
    const freeText = miscFreeTextByDay[day]?.trim() || null
    const parsedHours = parseFloat(miscHoursByDay[day] || "")
    const billableStatus = miscBillableStatusByDay[day] || "needs_review"
    const notes = miscNotesByDay[day]?.trim() || null
    const property = properties.find((item) => item.id === propertyId)

    if (isNaN(parsedHours) || parsedHours <= 0) {
      setErrorByDay((prev) => ({
        ...prev,
        [day]: "Please enter valid misc work hours.",
      }))
      setSavingDay(null)
      return
    }

    if (!propertyId && !freeText) {
      setErrorByDay((prev) => ({
        ...prev,
        [day]: "Add a property or a short customer/address label.",
      }))
      setSavingDay(null)
      return
    }

    const { error } = await supabase.from("job_labour_entries").insert({
      job_type: "misc",
      work_type: workType,
      scheduled_job_id: null,
      property_id: propertyId,
      job_name: freeText || (property ? formatPropertyOption(property) : getWorkTypeLabel(workType)),
      job_code: workType,
      staff_member_id: staffMember.id,
      staff_name: staffMember.name,
      work_date: day,
      hours_worked: parsedHours,
      billable: billableStatus === "billable",
      billable_status: billableStatus,
      notes,
    })

    if (error) {
      setErrorByDay((prev) => ({ ...prev, [day]: error.message }))
      setSavingDay(null)
      return
    }

    setMessageByDay((prev) => ({ ...prev, [day]: "Misc work saved." }))
    setMiscWorkTypeByDay((prev) => ({ ...prev, [day]: "" }))
    setMiscPropertyIdByDay((prev) => ({ ...prev, [day]: "" }))
    setMiscFreeTextByDay((prev) => ({ ...prev, [day]: "" }))
    setMiscHoursByDay((prev) => ({ ...prev, [day]: "" }))
    setMiscBillableStatusByDay((prev) => ({ ...prev, [day]: "" }))
    setMiscNotesByDay((prev) => ({ ...prev, [day]: "" }))
    setSavingDay(null)
    router.refresh()
  }

  const handleSaveTotalHours = async (day: string) => {
    setSavingDay(day)
    setMessageByDay((prev) => ({ ...prev, [day]: "" }))
    setErrorByDay((prev) => ({ ...prev, [day]: "" }))

    const existingTimesheet = getTimesheetForDay(day)
    const selectedDayStatus =
      timesheetStatusByDay[day] || existingTimesheet?.day_status || "worked"
    const isWorkedDay = selectedDayStatus === "worked"
    const enteredHoursValue = totalHoursByDay[day]
    const enteredTotalHours = enteredHoursValue
      ? parseFloat(enteredHoursValue)
      : Number(
          existingTimesheet?.hours_entered ??
            existingTimesheet?.total_hours ??
            0
        )
    const totalHours =
      isWorkedDay && deductLunchFromTotalByDay[day]
        ? Math.max(enteredTotalHours - 0.5, 0)
        : enteredTotalHours

    if (
      isWorkedDay &&
      (isNaN(enteredTotalHours) || enteredTotalHours <= 0 || totalHours <= 0)
    ) {
      setErrorByDay((prev) => ({
        ...prev,
        [day]: "Enter valid total hours for the day.",
      }))
      setSavingDay(null)
      return
    }

    const notes = Object.prototype.hasOwnProperty.call(timesheetNotesByDay, day)
      ? timesheetNotesByDay[day]?.trim() || null
      : existingTimesheet?.status_notes || existingTimesheet?.notes || null

    const { error } = await supabase
      .from("staff_daily_timesheets")
      .upsert(
        {
          staff_member_id: staffMember.id,
          staff_name: staffMember.name,
          work_date: day,
          hours_entered: enteredTotalHours,
          total_hours: totalHours,
          day_status: selectedDayStatus,
          status_notes: notes,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "staff_member_id,work_date",
        }
      )

    if (error) {
      setErrorByDay((prev) => ({ ...prev, [day]: error.message }))
      setSavingDay(null)
      return
    }

    setMessageByDay((prev) => ({
      ...prev,
      [day]: "Staff total hours saved.",
    }))

    setTotalHoursByDay((prev) => ({ ...prev, [day]: "" }))
    setDeductLunchFromTotalByDay((prev) => ({ ...prev, [day]: false }))
    setTimesheetStatusByDay((prev) => ({ ...prev, [day]: selectedDayStatus }))
    setTimesheetNotesByDay((prev) => ({ ...prev, [day]: notes || "" }))
    setEditingTimesheetByDay((prev) => ({ ...prev, [day]: false }))
    setSavingDay(null)
    router.refresh()
  }

  const handleSaveDayStatus = async (
  day: string,
  dayStatus: "sick_leave" | "public_holiday"
) => {
  setSavingDay(day)
  setMessageByDay((prev) => ({ ...prev, [day]: "" }))
  setErrorByDay((prev) => ({ ...prev, [day]: "" }))
  const statusNote = Object.prototype.hasOwnProperty.call(timesheetNotesByDay, day)
    ? timesheetNotesByDay[day]?.trim() || null
    : dayStatus === "sick_leave"
      ? "Sick leave"
      : "Public holiday"

  const { error } = await supabase
    .from("staff_daily_timesheets")
    .upsert(
      {
        staff_member_id: staffMember.id,
        staff_name: staffMember.name,
        work_date: day,
        hours_entered: 7.5,
        total_hours: 7.5,
        day_status: dayStatus,
        status_notes: statusNote,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "staff_member_id,work_date",
      }
    )

  if (error) {
    setErrorByDay((prev) => ({ ...prev, [day]: error.message }))
    setSavingDay(null)
    return
  }

  setMessageByDay((prev) => ({
    ...prev,
    [day]:
      dayStatus === "sick_leave"
        ? "Sick leave saved."
        : "Public holiday saved.",
  }))

  setEditingTimesheetByDay((prev) => ({ ...prev, [day]: false }))
  setTimesheetStatusByDay((prev) => ({ ...prev, [day]: dayStatus }))
  setSavingDay(null)
  router.refresh()
}

const handleStartEditEntry = (entry: LabourEntry) => {
  setEditingEntryId(entry.id)
  setEditEntryHours(String(entry.hours_worked))
  setEditEntryNotes(entry.notes || "")
}

const handleCancelEditEntry = () => {
  setEditingEntryId(null)
  setEditEntryHours("")
  setEditEntryNotes("")
}

const handleUpdateEntry = async (entryId: string) => {
  const parsedHours = parseFloat(editEntryHours)

  if (isNaN(parsedHours) || parsedHours <= 0) {
    setErrorByDay((prev) => ({
      ...prev,
      general: "Enter valid hours.",
    }))
    return
  }

  const { error } = await supabase
    .from("job_labour_entries")
    .update({
      hours_worked: parsedHours,
      notes: editEntryNotes.trim() || null,
    })
    .eq("id", entryId)
    .eq("staff_member_id", staffMember.id)

  if (error) {
    setErrorByDay((prev) => ({
      ...prev,
      general: error.message,
    }))
    return
  }

  handleCancelEditEntry()
  router.refresh()
}

const handleDeleteEntry = async (entryId: string) => {
  const confirmed = window.confirm("Delete this entry? This cannot be undone.")

  if (!confirmed) return

  const { error } = await supabase
    .from("job_labour_entries")
    .delete()
    .eq("id", entryId)
    .eq("staff_member_id", staffMember.id)

  if (error) {
    setErrorByDay((prev) => ({
      ...prev,
      general: error.message,
    }))
    return
  }

  router.refresh()
}

  return (
    <div className="p-4 pb-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Landscaping Labour</h1>
        <p className="text-muted-foreground">
          {staffMember.name} · Monday to Friday
        </p>
      </header>

      <div className="mb-6 rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">Week total</p>
        <p className="text-3xl font-bold">{weeklyTotalHours}h</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Landscaping job hours: {weeklyJobHours}h
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {weekDays.map((day) => {
          const entries = getEntriesForDay(day)
          const calculatedHours = getCalculatedHours(day)
          const jobHours = getDayTotalFromEntries(day)
          const timesheet = getTimesheetForDay(day)
          const totalHours = Number(timesheet?.total_hours || 0)
          const enteredHours =
            timesheet?.hours_entered === null ||
            timesheet?.hours_entered === undefined
              ? null
              : Number(timesheet.hours_entered)
          const otherHours = Math.max(totalHours - jobHours, 0)
          const dayStatus = timesheet?.day_status || (timesheet ? "worked" : null)
          const editDayStatus =
            timesheetStatusByDay[day] || dayStatus || "worked"
          const isNonWorkedDay = Boolean(dayStatus && dayStatus !== "worked")
          const dayStatusLabel = formatDayStatus(dayStatus)
          const startTime = formatTime(timesheet?.start_time)
          const finishTime = formatTime(timesheet?.finish_time)
          const timesheetNote = timesheet?.status_notes || timesheet?.notes
          const hasAllocationWarning =
            dayStatus === "worked" && totalHours > jobHours

          const defaultExpectedWorkDay = isExpectedWorkDay(staffMember.name, day)
          const manuallyEnabledWorkDay =
            manualWorkDayByDay[day] || !!timesheet || entries.length > 0

          const expectedWorkDay =
            defaultExpectedWorkDay || manuallyEnabledWorkDay

          const isMissingHours = expectedWorkDay && isPastWorkDay(day) && !timesheet
          const isEditingTimesheet = editingTimesheetByDay[day] || !timesheet

          return (
            <section
              key={day}
              className={`rounded-xl border p-3 ${
                isMissingHours
                  ? "border-red-300 bg-red-50"
                  : isNonWorkedDay
                    ? "border-blue-200 bg-blue-50"
                    : "bg-card"
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">
                    {formatDayLabel(day)}
                  </h2>

                  {timesheet ? (
                    <div className="mt-1 space-y-1 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                            isNonWorkedDay
                              ? "border-blue-200 bg-blue-100 text-blue-800"
                              : "border-green-200 bg-green-100 text-green-800"
                          }`}
                        >
                          {dayStatusLabel}
                        </span>
                        <span className="text-muted-foreground">
                          Hours: {totalHours.toFixed(2)}
                        </span>
                        {enteredHours !== null && enteredHours !== totalHours && (
                          <span className="text-muted-foreground">
                            Entered: {enteredHours.toFixed(2)}
                          </span>
                        )}
                        {(startTime || finishTime) && (
                          <span className="text-muted-foreground">
                            {startTime || "--:--"} - {finishTime || "--:--"}
                          </span>
                        )}
                      </div>

                      {timesheetNote && (
                        <p className="text-muted-foreground">
                          Note: {timesheetNote}
                        </p>
                      )}

                      {!isNonWorkedDay && totalHours > 0 && (
                        <p className="font-medium text-green-700">
                          {jobHours}h jobs
                          {otherHours > 0 ? ` + ${otherHours}h other` : ""}
                          {" = "}
                          {totalHours}h total
                        </p>
                      )}

                      {hasAllocationWarning && (
                        <p className="font-medium text-amber-700">
                          Daily hours entered, but job hours have not been allocated yet.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p
                      className={`text-sm ${
                        isMissingHours
                          ? "font-medium text-red-700"
                          : "text-muted-foreground"
                      }`}
                    >
                      {expectedWorkDay
                        ? "Missing staff total hours"
                        : "Not scheduled work day"}
                    </p>
                  )}

                  {!defaultExpectedWorkDay && !timesheet && entries.length === 0 && (
                    <label className="mt-2 flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={manualWorkDayByDay[day] || false}
                        onChange={(e) =>
                          setManualWorkDayByDay((prev) => ({
                            ...prev,
                            [day]: e.target.checked,
                          }))
                        }
                      />
                      Worked this day
                    </label>
                  )}
                </div>

                <p className="text-sm text-muted-foreground">
                  {entries.length} entr{entries.length === 1 ? "y" : "ies"}
                </p>
              </div>

              {(expectedWorkDay || timesheet || entries.length > 0) && (
                <>
                  {entries.length > 0 && (
                    <div className="mb-4 space-y-2">
                      {entries.map((entry) => (
  <div
    key={entry.id}
    className="rounded-lg border bg-white p-3 text-sm"
  >
    {editingEntryId === entry.id ? (
      <div className="space-y-2">
        <p className="font-medium">
          {formatLabourEntryLabel(entry)}
        </p>

        <input
          type="number"
          step="0.25"
          min="0.25"
          className="h-10 w-full rounded-md border px-3"
          value={editEntryHours}
          onChange={(e) => setEditEntryHours(e.target.value)}
        />

        <textarea
          className="min-h-20 w-full rounded-md border px-3 py-2"
          value={editEntryNotes}
          onChange={(e) => setEditEntryNotes(e.target.value)}
          placeholder="Optional notes..."
        />

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleUpdateEntry(entry.id)}
            className="h-10 rounded-md bg-green-600 text-sm font-medium text-white"
          >
            Save
          </button>

          <button
            type="button"
            onClick={handleCancelEditEntry}
            className="h-10 rounded-md border bg-white text-sm font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    ) : (
      <>
        <p className="font-medium">
          {formatLabourEntryLabel(entry)}
        </p>

        <p className="text-muted-foreground">
          {entry.hours_worked}h {getBillableStatusLabel(entry.billable_status, entry.billable)}
        </p>

        {entry.notes && (
          <p className="mt-1 text-muted-foreground">
            {entry.notes}
          </p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleStartEditEntry(entry)}
            className="h-9 rounded-md border bg-white text-sm font-medium"
          >
            Edit
          </button>

          <button
            type="button"
            onClick={() => handleDeleteEntry(entry.id)}
            className="h-9 rounded-md border border-red-200 bg-red-50 text-sm font-medium text-red-700"
          >
            Delete
          </button>
        </div>
      </>
    )}
  </div>
))}
                    </div>
                  )}

                  <div className="space-y-3 rounded-lg border bg-white p-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        Landscaping Job
                      </label>
                      <select
                        className="h-11 w-full rounded-md border px-3"
                        value={selectedJobByDay[day] || ""}
                        onChange={(e) =>
                          setSelectedJobByDay((prev) => ({
                            ...prev,
                            [day]: e.target.value,
                          }))
                        }
                      >
                        <option value="">Select job</option>
                        {landscapingJobs.map((job) => (
                          <option key={job.id} value={job.id}>
                            {formatLandscapingJobLabel(job)}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => copyJobToRemainingDays(day)}
                        className="mt-2 text-sm font-medium text-green-700 hover:underline"
                      >
                        Use this job for remaining days
                      </button>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        Job Hours Worked
                      </label>
                      <input
                        type="number"
                        step="0.25"
                        min="0.25"
                        className="h-11 w-full rounded-md border px-3"
                        placeholder="e.g. 7.5"
                        value={hoursByDay[day] || ""}
                        onChange={(e) =>
                          setHoursByDay((prev) => ({
                            ...prev,
                            [day]: e.target.value,
                          }))
                        }
                      />
                    </div>

                    <p className="text-sm text-muted-foreground">
                      Final job hours: {calculatedHours || "0"}h
                    </p>

                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        Job Notes
                      </label>
                      <textarea
                        className="min-h-20 w-full rounded-md border px-3 py-2"
                        placeholder="Optional job notes..."
                        value={notesByDay[day] || ""}
                        onChange={(e) =>
                          setNotesByDay((prev) => ({
                            ...prev,
                            [day]: e.target.value,
                          }))
                        }
                      />
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={billableByDay[day] ?? true}
                        onChange={(e) =>
                          setBillableByDay((prev) => ({
                            ...prev,
                            [day]: e.target.checked,
                          }))
                        }
                      />
                      Billable
                    </label>

                    <button
                      type="button"
                      onClick={() => handleSaveDay(day)}
                      disabled={savingDay === day}
                      className="h-11 w-full rounded-md bg-green-600 font-medium text-white"
                    >
                      {savingDay === day ? "Saving..." : "Save Job Labour"}
                    </button>

                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <div className="mb-3">
                        <p className="text-sm font-semibold text-amber-950">
                          Unscheduled / Misc Work
                        </p>
                        <p className="text-xs text-amber-800">
                          Use this for real work that was not on the schedule.
                        </p>
                      </div>

                      <div className="grid gap-3">
                        <label className="block">
                          <span className="mb-1 block text-sm font-medium">
                            Work type
                          </span>
                          <select
                            className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                            value={miscWorkTypeByDay[day] || "other"}
                            onChange={(event) =>
                              setMiscWorkTypeByDay((prev) => ({
                                ...prev,
                                [day]: event.target.value,
                              }))
                            }
                          >
                            {miscWorkTypeOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-sm font-medium">
                            Property
                          </span>
                          <select
                            className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                            value={miscPropertyIdByDay[day] || ""}
                            onChange={(event) =>
                              setMiscPropertyIdByDay((prev) => ({
                                ...prev,
                                [day]: event.target.value,
                              }))
                            }
                          >
                            <option value="">No linked property</option>
                            {properties.map((property) => (
                              <option key={property.id} value={property.id}>
                                {formatPropertyOption(property)}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-sm font-medium">
                            Customer / address label
                          </span>
                          <input
                            className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                            placeholder="e.g. 424 Remuera Road / tip run"
                            value={miscFreeTextByDay[day] || ""}
                            onChange={(event) =>
                              setMiscFreeTextByDay((prev) => ({
                                ...prev,
                                [day]: event.target.value,
                              }))
                            }
                          />
                        </label>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block">
                            <span className="mb-1 block text-sm font-medium">
                              Hours worked
                            </span>
                            <input
                              type="number"
                              step="0.25"
                              min="0.25"
                              className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                              placeholder="e.g. 2.5"
                              value={miscHoursByDay[day] || ""}
                              onChange={(event) =>
                                setMiscHoursByDay((prev) => ({
                                  ...prev,
                                  [day]: event.target.value,
                                }))
                              }
                            />
                          </label>

                          <label className="block">
                            <span className="mb-1 block text-sm font-medium">
                              Billable status
                            </span>
                            <select
                              className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                              value={miscBillableStatusByDay[day] || "needs_review"}
                              onChange={(event) =>
                                setMiscBillableStatusByDay((prev) => ({
                                  ...prev,
                                  [day]: event.target.value,
                                }))
                              }
                            >
                              <option value="needs_review">Needs review</option>
                              <option value="billable">Billable</option>
                              <option value="non_billable">Non-billable</option>
                            </select>
                          </label>
                        </div>

                        <label className="block">
                          <span className="mb-1 block text-sm font-medium">
                            Notes
                          </span>
                          <textarea
                            className="min-h-20 w-full rounded-md border bg-white px-3 py-2 text-sm"
                            placeholder="What was done, why, or what admin should check..."
                            value={miscNotesByDay[day] || ""}
                            onChange={(event) =>
                              setMiscNotesByDay((prev) => ({
                                ...prev,
                                [day]: event.target.value,
                              }))
                            }
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() => handleSaveMiscWork(day)}
                          disabled={savingDay === day}
                          className="h-10 w-full rounded-md bg-amber-600 text-sm font-medium text-white"
                        >
                          {savingDay === day ? "Saving..." : "Save Misc Work"}
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 rounded-lg border bg-gray-50 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-medium">
                          Staff Total Hours for Day
                        </p>

                        {!isEditingTimesheet && (
                          <button
                            type="button"
                            onClick={() =>
                              setEditingTimesheetByDay((prev) => ({
                                ...prev,
                                [day]: true,
                              }))
                            }
                            className="text-sm font-medium text-green-700 hover:underline"
                          >
                            Edit
                          </button>
                        )}
                      </div>

                      {!isEditingTimesheet ? (
                        <div className="rounded-md bg-white p-3 text-sm">
                          {isNonWorkedDay ? (
                            <p className="font-medium text-blue-700">
                              {dayStatusLabel} · {totalHours}h
                            </p>
                          ) : (
                            <p className="font-medium text-green-700">
                              {totalHours}h total worked
                            </p>
                          )}

                          {timesheet?.status_notes && (
                            <p className="mt-1 text-muted-foreground">
                              {timesheet.status_notes}
                            </p>
                          )}
                        </div>
                      ) : (
                        <>
                          <p className="mb-2 text-xs text-muted-foreground">
                            Select the day status, then save the daily timesheet.
                            Existing leave/public holiday statuses remain selected
                            until changed.
                          </p>

                          <label className="mb-2 block">
                            <span className="mb-1 block text-xs font-medium text-muted-foreground">
                              Day status
                            </span>
                            <select
                              className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                              value={editDayStatus}
                              onChange={(event) =>
                                setTimesheetStatusByDay((prev) => ({
                                  ...prev,
                                  [day]: event.target.value,
                                }))
                              }
                            >
                              <option value="worked">Worked</option>
                              <option value="public_holiday">Public holiday</option>
                              <option value="sick_leave">Sick leave</option>
                              <option value="sick_day">Sick day</option>
                              <option value="annual_leave">Annual leave</option>
                              <option value="unpaid_leave">Unpaid leave</option>
                              <option value="day_off">Day off</option>
                              {![
                                "worked",
                                "public_holiday",
                                "sick_leave",
                                "sick_day",
                                "annual_leave",
                                "unpaid_leave",
                                "day_off",
                              ].includes(editDayStatus) && (
                                <option value={editDayStatus}>
                                  {formatDayStatus(editDayStatus)}
                                </option>
                              )}
                            </select>
                          </label>

                          <input
                            type="number"
                            step="0.25"
                            min={editDayStatus === "worked" ? "0.25" : "0"}
                            placeholder={
                              totalHours > 0 ? String(totalHours) : "e.g. 8"
                            }
                            className="mb-2 h-10 w-full rounded-md border px-3"
                            value={totalHoursByDay[day] || ""}
                            onChange={(e) =>
                              setTotalHoursByDay((prev) => ({
                                ...prev,
                                [day]: e.target.value,
                              }))
                            }
                          />

                          <label className="mb-2 flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={deductLunchFromTotalByDay[day] || false}
                              disabled={editDayStatus !== "worked"}
                              onChange={(e) =>
                                setDeductLunchFromTotalByDay((prev) => ({
                                  ...prev,
                                  [day]: e.target.checked,
                                }))
                              }
                            />
                            Deduct lunch break from staff total (-0.5h)
                          </label>

                          <input
                            type="text"
                            placeholder={
                              timesheet?.status_notes ||
                              "Optional note e.g. travel, yard, loading"
                            }
                            className="mb-2 h-10 w-full rounded-md border px-3"
                            value={timesheetNotesByDay[day] || ""}
                            onChange={(e) =>
                              setTimesheetNotesByDay((prev) => ({
                                ...prev,
                                [day]: e.target.value,
                              }))
                            }
                          />

                          <button
                            type="button"
                            onClick={() => handleSaveTotalHours(day)}
                            disabled={savingDay === day}
                            className="h-10 w-full rounded-md bg-gray-800 text-sm font-medium text-white"
                          >
                            {savingDay === day
                              ? "Saving..."
                              : "Save Staff Total Hours"}
                          </button>

                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleSaveDayStatus(day, "sick_leave")
                              }
                              disabled={savingDay === day}
                              className="h-10 rounded-md border bg-white text-sm font-medium"
                            >
                              Sick Leave
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleSaveDayStatus(day, "public_holiday")
                              }
                              disabled={savingDay === day}
                              className="h-10 rounded-md border bg-white text-sm font-medium"
                            >
                              Public Holiday
                            </button>
                          </div>

                          {timesheet && (
                            <button
                              type="button"
                              onClick={() =>
                                setEditingTimesheetByDay((prev) => ({
                                  ...prev,
                                  [day]: false,
                                }))
                              }
                              className="mt-2 h-9 w-full rounded-md border bg-white text-sm"
                            >
                              Cancel Edit
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    {messageByDay[day] && (
                      <p className="text-sm font-medium text-green-700">
                        {messageByDay[day]}
                      </p>
                    )}

                    {errorByDay[day] && (
                      <p className="text-sm font-medium text-red-700">
                        {errorByDay[day]}
                      </p>
                    )}
                  </div>
                </>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
