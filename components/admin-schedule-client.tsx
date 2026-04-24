"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

type StaffMember = {
  id: string
  name: string
}

type Property = {
  id: string
  property_code: string
  client_name: string
  address_line_1: string | null
  suburb: string | null
  default_staff_id: string | null
  default_job_order: number | null
  default_duration_hours: number | null
  default_start_time: string | null
  is_active: boolean
}

type Job = {
  id: string
  property_id: string
  scheduled_date: string
  status: string
  job_order: number | null
  assigned_staff_id: string | null
  planned_duration_hours: number | null
  planned_start_time: string | null
  properties?: {
    id: string
    client_name: string
    address_line_1: string | null
    suburb: string | null
  } | null
  staff_members?: {
    id: string
    name: string
  } | null
}

type Props = {
  today: string
  tomorrow: string
  jobs: Job[]
  properties: Property[]
  staff: StaffMember[]
}

export function AdminScheduleClient({
  today,
  tomorrow,
  jobs,
  properties,
  staff,
}: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [quickAddOpen, setQuickAddOpen] = useState(true)
  const [selectedSuburb, setSelectedSuburb] = useState("All")
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const [jobDate, setJobDate] = useState(today)
  const [assignedStaffId, setAssignedStaffId] = useState("")
  const [jobOrder, setJobOrder] = useState("")
  const [plannedDuration, setPlannedDuration] = useState("")
  const [plannedStartTime, setPlannedStartTime] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const suburbs = useMemo(() => {
    const set = new Set<string>()

    properties.forEach((property) => {
      if (property.suburb) set.add(property.suburb)
    })

    return ["All", ...Array.from(set).sort()]
  }, [properties])

  const filteredProperties = useMemo(() => {
    if (selectedSuburb === "All") return properties

    return properties.filter((property) => property.suburb === selectedSuburb)
  }, [properties, selectedSuburb])

  const todayJobs = jobs.filter((job) => job.scheduled_date === today)
  const tomorrowJobs = jobs.filter((job) => job.scheduled_date === tomorrow)

  const getNextJobOrder = (date: string) => {
    const jobsForDate = jobs.filter((job) => job.scheduled_date === date)
    const maxOrder = jobsForDate.reduce((max, job) => {
      return Math.max(max, job.job_order || 0)
    }, 0)

    return maxOrder + 1
  }

  const openAddModal = (property: Property) => {
    setSelectedProperty(property)
    setJobDate(today)
    setAssignedStaffId(property.default_staff_id || "")
    setJobOrder(
      property.default_job_order
        ? property.default_job_order.toString()
        : getNextJobOrder(today).toString()
    )
    setPlannedDuration(
      property.default_duration_hours
        ? property.default_duration_hours.toString()
        : ""
    )
    setPlannedStartTime(property.default_start_time || "")
    setError(null)
    setModalOpen(true)
  }

  const handleDateChange = (date: string) => {
    setJobDate(date)

    if (!selectedProperty?.default_job_order) {
      setJobOrder(getNextJobOrder(date).toString())
    }
  }

  const handleCreateJob = async () => {
    if (!selectedProperty) return

    setSaving(true)
    setError(null)

    const { error } = await supabase.from("scheduled_jobs").insert({
      property_id: selectedProperty.id,
      scheduled_date: jobDate,
      status: "scheduled",
      job_order: parseInt(jobOrder) || getNextJobOrder(jobDate),
      assigned_staff_id: assignedStaffId || null,
      planned_duration_hours: plannedDuration
        ? parseFloat(plannedDuration)
        : null,
      planned_start_time: plannedStartTime || null,
    })

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    setSaving(false)
    setModalOpen(false)
    setSelectedProperty(null)
    router.refresh()
  }

  const JobCard = ({ job }: { job: Job }) => (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">
            Job {job.job_order || "?"} –{" "}
            {job.properties?.client_name || "Unknown"}
          </div>
          <div className="text-sm text-gray-500">
            {job.properties?.address_line_1 || "No address"}
          </div>
          <div className="mt-1 text-sm">
            Staff: {job.staff_members?.name || "Unassigned"}
          </div>
          {job.planned_duration_hours && (
            <div className="text-sm">
              Planned: {job.planned_duration_hours}h
            </div>
          )}
          {job.planned_start_time && (
            <div className="text-sm">
              Start: {job.planned_start_time.slice(0, 5)}
            </div>
          )}
        </div>

        <div className="rounded-full bg-gray-100 px-2 py-1 text-xs capitalize text-gray-600">
          {job.status}
        </div>
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-4xl p-4 pb-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Admin Schedule</h1>
        <p className="text-sm text-gray-500">
          Overview first, then quick-add jobs below.
        </p>
      </header>

      <section className="mb-8 grid gap-4 md:grid-cols-2">
        <div>
          <h2 className="mb-3 text-lg font-semibold">Today</h2>
          <div className="space-y-3">
            {todayJobs.length > 0 ? (
              todayJobs.map((job) => <JobCard key={job.id} job={job} />)
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-sm text-gray-500">
                No jobs scheduled today.
              </p>
            )}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold">Tomorrow</h2>
          <div className="space-y-3">
            {tomorrowJobs.length > 0 ? (
              tomorrowJobs.map((job) => <JobCard key={job.id} job={job} />)
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-sm text-gray-500">
                No jobs scheduled tomorrow.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <button
          type="button"
          onClick={() => setQuickAddOpen(!quickAddOpen)}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <h2 className="text-lg font-semibold">Quick Add Job</h2>
            <p className="text-sm text-gray-500">
              Filter by suburb, choose a customer, then schedule.
            </p>
          </div>
          <span className="text-sm text-gray-500">
            {quickAddOpen ? "Hide" : "Show"}
          </span>
        </button>

        {quickAddOpen && (
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium">Suburb</label>
            <select
              className="mb-4 h-11 w-full rounded-md border px-3"
              value={selectedSuburb}
              onChange={(e) => setSelectedSuburb(e.target.value)}
            >
              {suburbs.map((suburb) => (
                <option key={suburb} value={suburb}>
                  {suburb}
                </option>
              ))}
            </select>

            <div className="space-y-2">
              {filteredProperties.map((property) => (
                <div
                  key={property.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {property.client_name}
                    </div>
                    <div className="truncate text-sm text-gray-500">
                      {property.address_line_1 || "No address"}
                    </div>
                    {property.suburb && (
                      <div className="text-xs text-gray-400">
                        {property.suburb}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => openAddModal(property)}
                    className="shrink-0 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {modalOpen && selectedProperty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="mb-1 text-xl font-semibold">Add Job</h2>
            <p className="mb-4 text-sm text-gray-500">
              {selectedProperty.client_name}
            </p>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Date</label>
                <input
                  type="date"
                  className="h-11 w-full rounded-md border px-3"
                  value={jobDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Staff</label>
                <select
                  className="h-11 w-full rounded-md border px-3"
                  value={assignedStaffId}
                  onChange={(e) => setAssignedStaffId(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {staff.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Job Order
                  </label>
                  <input
                    type="number"
                    className="h-11 w-full rounded-md border px-3"
                    value={jobOrder}
                    onChange={(e) => setJobOrder(e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Duration
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    className="h-11 w-full rounded-md border px-3"
                    value={plannedDuration}
                    onChange={(e) => setPlannedDuration(e.target.value)}
                    placeholder="e.g. 3"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Planned Start Time
                </label>
                <input
                  type="time"
                  className="h-11 w-full rounded-md border px-3"
                  value={plannedStartTime}
                  onChange={(e) => setPlannedStartTime(e.target.value)}
                />
              </div>

              {error && (
                <p className="rounded-md bg-red-50 p-2 text-sm text-red-600">
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="h-11 flex-1 rounded-md border"
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleCreateJob}
                  className="h-11 flex-1 rounded-md bg-green-600 font-medium text-white"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Create Job"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}