"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

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
}

type LabourEntry = {
  id: string
  job_type: string
  job_name: string | null
  job_code: string | null
  staff_member_id: string
  staff_name: string
  work_date: string
  hours_worked: number
  billable: boolean
  notes: string | null
}

type Timesheet = {
  id: string
  staff_member_id: string
  staff_name: string
  work_date: string
  total_hours: number
  day_status: string | null
  status_notes: string | null
}

type Props = {
  staffMember: StaffMember
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

  if (staffName === "Charles") {
    return [2, 3, 4, 5].includes(dayNumber)
  }

  if (staffName === "Fletch" || staffName === "Fletcher") {
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
  const today = new Date()
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

export function LabourEntryClient({
  staffMember,
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

  const [totalHoursByDay, setTotalHoursByDay] = useState<Record<string, string>>({})
  const [deductLunchFromTotalByDay, setDeductLunchFromTotalByDay] = useState<Record<string, boolean>>({})
  const [timesheetNotesByDay, setTimesheetNotesByDay] = useState<Record<string, string>>({})
  const [editingTimesheetByDay, setEditingTimesheetByDay] = useState<Record<string, boolean>>({})
  const [manualWorkDayByDay, setManualWorkDayByDay] = useState<Record<string, boolean>>({})

  const [savingDay, setSavingDay] = useState<string | null>(null)
  const [messageByDay, setMessageByDay] = useState<Record<string, string>>({})
  const [errorByDay, setErrorByDay] = useState<Record<string, string>>({})

  const weeklyTotalHours =
    timesheets?.reduce((total, timesheet) => {
      return total + Number(timesheet.total_hours || 0)
    }, 0) || 0

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

    const { error: labourError } = await supabase
      .from("job_labour_entries")
      .insert({
        job_type: "landscaping",
        property_id: null,
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

  const handleSaveTotalHours = async (day: string) => {
    setSavingDay(day)
    setMessageByDay((prev) => ({ ...prev, [day]: "" }))
    setErrorByDay((prev) => ({ ...prev, [day]: "" }))

    const enteredTotalHours = parseFloat(totalHoursByDay[day] || "0")
    const totalHours = deductLunchFromTotalByDay[day]
      ? Math.max(enteredTotalHours - 0.5, 0)
      : enteredTotalHours

    if (isNaN(enteredTotalHours) || enteredTotalHours <= 0 || totalHours <= 0) {
      setErrorByDay((prev) => ({
        ...prev,
        [day]: "Enter valid total hours for the day.",
      }))
      setSavingDay(null)
      return
    }

    const notes = timesheetNotesByDay[day]?.trim() || null

    const { error } = await supabase
      .from("staff_daily_timesheets")
      .upsert(
        {
          staff_member_id: staffMember.id,
          staff_name: staffMember.name,
          work_date: day,
          hours_entered: totalHours,
          total_hours: totalHours,
          day_status: "worked",
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
    setTimesheetNotesByDay((prev) => ({ ...prev, [day]: "" }))
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
          status_notes:
            dayStatus === "sick_leave" ? "Sick leave" : "Public holiday",
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
    setSavingDay(null)
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
      </div>

      <div className="flex flex-col gap-6">
        {weekDays.map((day) => {
          const entries = getEntriesForDay(day)
          const calculatedHours = getCalculatedHours(day)
          const jobHours = getDayTotalFromEntries(day)
          const timesheet = getTimesheetForDay(day)
          const totalHours = Number(timesheet?.total_hours || 0)
          const otherHours = Math.max(totalHours - jobHours, 0)
          const dayStatus = timesheet?.day_status
          const isLeaveDay =
            dayStatus === "sick_leave" || dayStatus === "public_holiday"

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
                  : isLeaveDay
                    ? "border-blue-200 bg-blue-50"
                    : "bg-card"
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">
                    {formatDayLabel(day)}
                  </h2>

                  {totalHours > 0 ? (
                    <p className="text-sm font-medium text-green-700">
                      {jobHours}h jobs
                      {otherHours > 0 ? ` + ${otherHours}h other` : ""}
                      {" = "}
                      {totalHours}h total
                    </p>
                  ) : (
                    <p
                      className={`text-sm ${
                        isMissingHours
                          ? "font-medium text-red-700"
                          : "text-muted-foreground"
                      }`}
                    >
                      {dayStatus === "sick_leave"
                        ? "Sick leave"
                        : dayStatus === "public_holiday"
                          ? "Public holiday"
                          : expectedWorkDay
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
                          <p className="font-medium">
                            {entry.job_code} — {entry.job_name}
                          </p>
                          <p className="text-muted-foreground">
                            {entry.hours_worked}h{" "}
                            {entry.billable ? "billable" : "non-billable"}
                          </p>
                          {entry.notes && (
                            <p className="mt-1 text-muted-foreground">
                              {entry.notes}
                            </p>
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
                            {job.job_code} — {job.job_name}
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
                          {dayStatus === "sick_leave" ? (
                            <p className="font-medium text-blue-700">
                              Sick leave · {totalHours}h
                            </p>
                          ) : dayStatus === "public_holiday" ? (
                            <p className="font-medium text-blue-700">
                              Public holiday · {totalHours}h
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
                            Enter total hours worked for payroll/timesheet. Tick
                            lunch deduction here if the entered day total
                            includes lunch.
                          </p>

                          <input
                            type="number"
                            step="0.25"
                            min="0.25"
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