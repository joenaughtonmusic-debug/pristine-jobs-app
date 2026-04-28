"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Timesheet = {
  id: string
  staff_member_id: string
  staff_name: string
  work_date: string
  hours_entered: number | null
  start_time: string | null
  finish_time: string | null
  lunch_break_deducted: boolean
  total_hours: number
  day_status?: string | null
  status_notes?: string | null
  notes?: string | null
}

type StaffTimesheetFormProps = {
  staffMemberId: string
  staffName: string
  workDate: string
  existingTimesheet?: Timesheet | null
}

function calculateHours(
  startTime: string,
  finishTime: string,
  lunchBreakDeducted: boolean
) {
  if (!startTime || !finishTime) return ""

  const start = new Date(`1970-01-01T${startTime}:00`)
  const finish = new Date(`1970-01-01T${finishTime}:00`)

  const diffMs = finish.getTime() - start.getTime()
  let diffHours = diffMs / (1000 * 60 * 60)

  if (diffHours <= 0) return ""

  if (lunchBreakDeducted) {
    diffHours -= 0.5
  }

  if (diffHours <= 0) return ""

  return (Math.round(diffHours * 4) / 4).toString()
}

function formatStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "worked":
      return "Worked"
    case "sick_day":
      return "Sick day"
    case "public_holiday":
      return "Public holiday"
    case "annual_leave":
      return "Annual leave"
    case "day_off":
      return "Day off"
    case "unpaid_leave":
      return "Unpaid leave"
    default:
      return "Worked"
  }
}

export function StaffTimesheetForm({
  staffMemberId,
  staffName,
  workDate,
  existingTimesheet,
}: StaffTimesheetFormProps) {
  const router = useRouter()
  const supabase = createClient()

  const [dayStatus, setDayStatus] = useState(
    existingTimesheet?.day_status || "worked"
  )

  const [statusNotes, setStatusNotes] = useState(
    existingTimesheet?.status_notes || ""
  )

  const [workedHours, setWorkedHours] = useState(
    existingTimesheet?.hours_entered?.toString() ||
      existingTimesheet?.total_hours?.toString() ||
      ""
  )

  const [startTime, setStartTime] = useState(
    existingTimesheet?.start_time?.slice(0, 5) || ""
  )

  const [finishTime, setFinishTime] = useState(
    existingTimesheet?.finish_time?.slice(0, 5) || ""
  )

  const [lunchBreakDeducted, setLunchBreakDeducted] = useState(
    existingTimesheet?.lunch_break_deducted ?? false
  )

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(!existingTimesheet)

  const calculatedTotalHours = (() => {
    if (dayStatus !== "worked") return "0"

    const parsed = parseFloat(workedHours)

    if (isNaN(parsed) || parsed <= 0) return ""

    return lunchBreakDeducted
      ? (parsed - 0.5).toFixed(2)
      : parsed.toFixed(2)
  })()

  const handleTimeChange = (
    newStartTime: string,
    newFinishTime: string,
    newLunchBreakDeducted: boolean
  ) => {
    setStartTime(newStartTime)
    setFinishTime(newFinishTime)
    setLunchBreakDeducted(newLunchBreakDeducted)

    const calculated = calculateHours(
      newStartTime,
      newFinishTime,
      newLunchBreakDeducted
    )

    if (calculated) {
      setWorkedHours(calculated)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    const isWorkedDay = dayStatus === "worked"
    const totalHours = isWorkedDay ? parseFloat(calculatedTotalHours) : 0

    if (isWorkedDay && (isNaN(totalHours) || totalHours <= 0)) {
      setError("Please enter valid hours.")
      setSaving(false)
      return
    }

    const { error } = await supabase
      .from("staff_daily_timesheets")
      .upsert(
        {
          staff_member_id: staffMemberId,
          staff_name: staffName,
          work_date: workDate,
          day_status: dayStatus,
          status_notes: statusNotes.trim() || null,
          hours_entered: isWorkedDay ? parseFloat(workedHours) : 0,
          start_time: isWorkedDay ? startTime || null : null,
          finish_time: isWorkedDay ? finishTime || null : null,
          lunch_break_deducted: isWorkedDay ? lunchBreakDeducted : false,
          total_hours: totalHours,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "staff_member_id,work_date",
        }
      )

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    setSaving(false)
    setExpanded(false)
    router.refresh()
  }

  if (!expanded && existingTimesheet) {
    const existingStatus = existingTimesheet.day_status || "worked"

    return (
      <div className="mb-4 rounded-lg border bg-green-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-green-800">
              {existingStatus === "worked"
                ? `Hours submitted: ${existingTimesheet.total_hours}h`
                : `Day marked as: ${formatStatusLabel(existingStatus)}`}
            </p>

            {existingTimesheet.status_notes && (
              <p className="text-xs text-green-700">
                {existingTimesheet.status_notes}
              </p>
            )}

            <p className="text-xs text-green-700">
              Tap edit if this needs changing.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setExpanded(true)}
          >
            Edit
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-4 rounded-lg border bg-background p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Daily hours / status</p>

          <p className="text-xs text-muted-foreground">
            Enter worked hours or mark the day as leave/public holiday.
          </p>
        </div>

        {existingTimesheet && (
          <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
            Saved
          </span>
        )}
      </div>

      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Day status
        </label>

        <select
          className="h-11 w-full rounded-md border px-3 text-sm"
          value={dayStatus}
          onChange={(e) => setDayStatus(e.target.value)}
        >
          <option value="worked">Worked</option>
          <option value="sick_day">Sick day</option>
          <option value="public_holiday">Public holiday</option>
          <option value="annual_leave">Annual leave</option>
          <option value="day_off">Day off</option>
          <option value="unpaid_leave">Unpaid leave</option>
        </select>
      </div>

      {dayStatus === "worked" ? (
        <>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Input
              type="number"
              step="0.25"
              min="0.25"
              placeholder="e.g. 8"
              value={workedHours}
              onChange={(e) => setWorkedHours(e.target.value)}
              className="h-11"
            />

            <Button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="h-11"
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>

          <p className="mt-2 text-sm text-muted-foreground">
            Total after lunch deduction:{" "}
            <span className="font-medium text-foreground">
              {calculatedTotalHours || "0"}h
            </span>
          </p>

          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={lunchBreakDeducted}
              onChange={(e) => {
                setLunchBreakDeducted(e.target.checked)
              }}
            />

            Deduct lunch break (-0.5h)
          </label>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Start time optional
              </label>

              <Input
                type="time"
                value={startTime}
                onChange={(e) =>
                  handleTimeChange(
                    e.target.value,
                    finishTime,
                    lunchBreakDeducted
                  )
                }
                className="h-11"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Finish time optional
              </label>

              <Input
                type="time"
                value={finishTime}
                onChange={(e) =>
                  handleTimeChange(
                    startTime,
                    e.target.value,
                    lunchBreakDeducted
                  )
                }
                className="h-11"
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-800">
            This day will be recorded as {formatStatusLabel(dayStatus)} with 0
            worked hours.
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Optional note
            </label>

            <Input
              type="text"
              placeholder="e.g. flu, Auckland Anniversary, approved day off"
              value={statusNotes}
              onChange={(e) => setStatusNotes(e.target.value)}
              className="h-11"
            />
          </div>

          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="mt-3 h-11 w-full"
          >
            {saving ? "Saving..." : "Save Day Status"}
          </Button>
        </>
      )}

      {dayStatus === "worked" && (
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Optional note
          </label>

          <Input
            type="text"
            placeholder="Optional day note"
            value={statusNotes}
            onChange={(e) => setStatusNotes(e.target.value)}
            className="h-11"
          />
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}