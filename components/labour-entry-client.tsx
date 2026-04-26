"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"

type StaffMember = {
  id: string
  name: string
}

type Property = {
  id: string
  client_name: string
  address_line_1: string | null
  property_code: string
}

type LandscapingJob = {
  id: string
  job_code: string
  job_name: string
  client_name: string | null
  address_line_1: string | null
  suburb: string | null
}

type Props = {
  staff: StaffMember[]
  properties: Property[]
  landscapingJobs: LandscapingJob[]
}

export function LabourEntryClient({
  staff,
  properties,
  landscapingJobs,
}: Props) {
  const supabase = createClient()

  const [jobType, setJobType] = useState("landscaping")
  const [workDate, setWorkDate] = useState(
    new Date().toISOString().split("T")[0]
  )
  const [propertyId, setPropertyId] = useState("")
  const [landscapingJobId, setLandscapingJobId] = useState("")
  const [staffMemberId, setStaffMemberId] = useState("")
  const [hoursWorked, setHoursWorked] = useState("")
  const [deductLunchBreak, setDeductLunchBreak] = useState(false)
  const [billable, setBillable] = useState(true)
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

const calculatedHours = (() => {
  const parsed = parseFloat(hoursWorked)

  if (isNaN(parsed) || parsed <= 0) return ""

  return deductLunchBreak
    ? (parsed - 0.5).toFixed(2)
    : parsed.toFixed(2)
})()

  const selectedStaff = staff.find((member) => member.id === staffMemberId)
  const selectedProperty = properties.find(
    (property) => property.id === propertyId
  )
  const selectedLandscapingJob = landscapingJobs.find(
    (job) => job.id === landscapingJobId
  )

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    setError(null)

    const hours = parseFloat(hoursWorked)

    if (!selectedStaff) {
      setError("Please select a staff member.")
      setSaving(false)
      return
    }

    if (isNaN(hours) || hours <= 0) {
      setError("Please enter valid hours.")
      setSaving(false)
      return
    }

    if (jobType === "maintenance" && !selectedProperty) {
      setError("Please select a property for maintenance labour.")
      setSaving(false)
      return
    }

    if (jobType === "landscaping" && !selectedLandscapingJob) {
      setError("Please select a landscaping job.")
      setSaving(false)
      return
    }

    const { error } = await supabase.from("job_labour_entries").insert({
      job_type: jobType,
      property_id: jobType === "maintenance" ? propertyId : null,
      job_name:
        jobType === "landscaping"
          ? selectedLandscapingJob?.job_name
          : selectedProperty?.client_name || null,
      job_code:
        jobType === "landscaping"
          ? selectedLandscapingJob?.job_code
          : selectedProperty?.property_code || null,
      staff_member_id: selectedStaff.id,
      staff_name: selectedStaff.name,
      work_date: workDate,
      hours_worked: parseFloat(calculatedHours),
      billable,
      notes: notes.trim() || null,
    })

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    setMessage("Labour entry saved.")
    setHoursWorked("")
    setNotes("")
    setSaving(false)
  }

  return (
    <div className="mx-auto max-w-2xl p-4 pb-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Labour Entry</h1>
        <p className="text-sm text-gray-500">
          Record staff hours for landscaping or maintenance jobs.
        </p>
      </header>

      <div className="space-y-4 rounded-xl border bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium">Date</label>
          <input
            type="date"
            className="h-11 w-full rounded-md border px-3"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Job Type</label>
          <select
            className="h-11 w-full rounded-md border px-3"
            value={jobType}
            onChange={(e) => {
              setJobType(e.target.value)
              setPropertyId("")
              setLandscapingJobId("")
            }}
          >
            <option value="landscaping">Landscaping</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>

        {jobType === "maintenance" ? (
          <div>
            <label className="mb-1 block text-sm font-medium">Property</label>
            <select
              className="h-11 w-full rounded-md border px-3"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
            >
              <option value="">Select property</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.client_name} — {property.address_line_1}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-sm font-medium">
              Landscaping Job
            </label>
            <select
              className="h-11 w-full rounded-md border px-3"
              value={landscapingJobId}
              onChange={(e) => setLandscapingJobId(e.target.value)}
            >
              <option value="">Select landscaping job</option>
              {landscapingJobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.job_code} — {job.job_name}
                </option>
              ))}
            </select>

            {selectedLandscapingJob && (
              <p className="mt-1 text-sm text-gray-500">
                {selectedLandscapingJob.address_line_1 || "No address"}
              </p>
            )}
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium">Staff Member</label>
          <select
            className="h-11 w-full rounded-md border px-3"
            value={staffMemberId}
            onChange={(e) => setStaffMemberId(e.target.value)}
          >
            <option value="">Select staff</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Hours Worked</label>
          <input
            type="number"
            step="0.25"
            min="0.25"
            className="h-11 w-full rounded-md border px-3"
            placeholder="e.g. 7.5"
            value={hoursWorked}
            onChange={(e) => setHoursWorked(e.target.value)}
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
  <input
    type="checkbox"
    checked={deductLunchBreak}
    onChange={(e) => setDeductLunchBreak(e.target.checked)}
  />
  Deduct lunch break (-0.5h)
</label>

<p className="text-sm text-gray-500">
  Final billable hours: {calculatedHours || "0"}h
</p>

        <div>
          <label className="mb-1 block text-sm font-medium">Notes</label>
          <textarea
            className="min-h-24 w-full rounded-md border px-3 py-2"
            placeholder="Optional notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={billable}
            onChange={(e) => setBillable(e.target.checked)}
          />
          Billable
        </label>

        {error && (
          <p className="rounded-md bg-red-50 p-2 text-sm text-red-600">
            {error}
          </p>
        )}

        {message && (
          <p className="rounded-md bg-green-50 p-2 text-sm text-green-700">
            {message}
          </p>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="h-11 w-full rounded-md bg-green-600 font-medium text-white"
        >
          {saving ? "Saving..." : "Save Labour Entry"}
        </button>
      </div>
    </div>
  )
}