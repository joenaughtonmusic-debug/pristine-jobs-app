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

export function StaffTimesheetForm({
  staffMemberId,
  staffName,
  workDate,
  existingTimesheet,
}: StaffTimesheetFormProps) {
  const router = useRouter()
  const supabase = createClient()

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

    const totalHours = parseFloat(calculatedTotalHours)

    if (isNaN(totalHours) || totalHours <= 0) {
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
          hours_entered: parseFloat(workedHours),
          start_time: startTime || null,
          finish_time: finishTime || null,
          lunch_break_deducted: lunchBreakDeducted,
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
  return (
    <div className="mb-4 rounded-lg border bg-green-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-green-800">
            Hours submitted: {existingTimesheet.total_hours}h
          </p>
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
          <p className="text-sm font-medium">Worked hours</p>

          <p className="text-xs text-muted-foreground">
            Enter worked hours directly or use optional start/finish times.
          </p>
        </div>

        {existingTimesheet && (
          <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
            Saved
          </span>
        )}
      </div>

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
            const checked = e.target.checked
            setLunchBreakDeducted(checked)
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

      {error && (
        <p className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}