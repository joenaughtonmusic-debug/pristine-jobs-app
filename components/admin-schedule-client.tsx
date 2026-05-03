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
  property_category: string | null
  default_staff_id: string | null
  default_job_order: number | null
  default_duration_hours: number | null
  default_start_time: string | null
  is_active: boolean
}

type ServiceTemplate = {
  id: string
  property_id: string
  template_name: string
  default_duration_hours: number | null
  default_staff_id: string | null
  default_job_notes: string | null
  colour_label: string | null
  billing_mode: string
  time_limit_type: string
  is_active: boolean
}

type ScheduledJobStaff = {
  id: string
  staff_member_id: string
  staff_members?: {
    id: string
    name: string
  } | null
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
  billing_mode: string | null
  time_limit_type: string | null
  quoted_scope?: string | null
  quoted_materials?: string | null
  scheduled_job_staff?: ScheduledJobStaff[]

  properties?: {
    id: string
    client_name: string
    address_line_1: string | null
    suburb: string | null
  } | null
}

type Props = {
  thisWeekStart: string
  nextWeekStart: string
  jobs: Job[]
  properties: Property[]
  staff: StaffMember[]
  serviceTemplates: ServiceTemplate[]
}

function parseLocalDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number)
  return new Date(year, month - 1, day)
}

function toLocalDateString(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function addDays(dateString: string, days: number) {
  const date = parseLocalDate(dateString)
  date.setDate(date.getDate() + days)
  return toLocalDateString(date)
}

function formatDayLabel(dateString: string) {
  return parseLocalDate(dateString).toLocaleDateString("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}

export function AdminScheduleClient({
  thisWeekStart,
  nextWeekStart,
  jobs,
  properties,
  staff,
  serviceTemplates,
}: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [quickAddOpen, setQuickAddOpen] = useState(true)
  const [selectedSuburb, setSelectedSuburb] = useState("All")
  const [selectedCategory, setSelectedCategory] = useState("All")
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)
  const [propertySearch, setPropertySearch] = useState("")
  const [selectedTemplate, setSelectedTemplate] =
    useState<ServiceTemplate | null>(null)

  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const [jobDate, setJobDate] = useState(thisWeekStart)
  const [assignedStaffId, setAssignedStaffId] = useState("")
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([])
  const [jobOrder, setJobOrder] = useState("")
  const [plannedDuration, setPlannedDuration] = useState("")
  const [plannedStartTime, setPlannedStartTime] = useState("")
  const [quotedScope, setQuotedScope] = useState("")
  const [quotedMaterials, setQuotedMaterials] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const thisWeekDays = [0, 1, 2, 3, 4].map((day) =>
    addDays(thisWeekStart, day)
  )

  const nextWeekDays = [0, 1, 2, 3, 4].map((day) =>
    addDays(nextWeekStart, day)
  )

  const suburbs = useMemo(() => {
    const set = new Set<string>()

    properties.forEach((property) => {
      if (property.suburb) set.add(property.suburb)
    })

    return ["All", ...Array.from(set).sort()]
  }, [properties])

  const categories = [
    "All",
    "maintenance",
    "one_off",
    "landscaping",
    "commercial",
  ]

  const filteredProperties = useMemo(() => {
  const search = propertySearch.trim().toLowerCase()

  return properties.filter((property) => {
    const suburbMatch =
      selectedSuburb === "All" || property.suburb === selectedSuburb

    const categoryMatch =
      selectedCategory === "All" ||
      property.property_category === selectedCategory

    const searchableText = [
      property.property_code,
      property.client_name,
      property.address_line_1,
      property.suburb,
      property.property_category,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()

    const searchMatch = !search || searchableText.includes(search)

    return suburbMatch && categoryMatch && searchMatch
  })
}, [properties, selectedSuburb, selectedCategory, propertySearch])

  const getTemplatesForProperty = (propertyId: string) => {
    return serviceTemplates.filter(
      (template) => template.property_id === propertyId
    )
  }

  const getStaffName = (staffId: string | null) => {
    return staff.find((member) => member.id === staffId)?.name || "Unassigned"
  }

  const getJobStaffIds = (job: Job) => {
    const linkedStaff =
      job.scheduled_job_staff?.map((item) => item.staff_member_id) || []

    const allStaffIds = [
      job.assigned_staff_id || "",
      ...linkedStaff,
    ].filter(Boolean)

    return Array.from(new Set(allStaffIds))
  }

  const getJobStaffNames = (job: Job) => {
    const staffIds = getJobStaffIds(job)

    if (staffIds.length === 0) return "Unassigned"

    return staffIds.map((id) => getStaffName(id)).join(", ")
  }

  const getJobsForDate = (date: string) => {
    return jobs
      .filter((job) => job.scheduled_date === date)
      .sort((a, b) => {
        const staffA = getStaffName(a.assigned_staff_id)
        const staffB = getStaffName(b.assigned_staff_id)

        if (staffA !== staffB) return staffA.localeCompare(staffB)

        const timeA = a.planned_start_time || "99:99"
        const timeB = b.planned_start_time || "99:99"

        if (timeA !== timeB) return timeA.localeCompare(timeB)

        return (a.job_order || 999) - (b.job_order || 999)
      })
  }

  const getStaffColourClasses = (staffId: string | null) => {
    const staffName = getStaffName(staffId)

    if (staffName === "Charles") return "border-green-300 bg-green-50"
    if (staffName === "Hugh") return "border-orange-300 bg-orange-50"
    if (staffName === "Alex") return "border-purple-300 bg-purple-50"
    if (staffName === "Graham") return "border-blue-300 bg-blue-50"
    if (staffName === "Temp Worker") return "border-gray-300 bg-gray-50"

    return "border-gray-200 bg-white"
  }

  const getNextJobOrder = (date: string) => {
    const jobsForDate = jobs.filter((job) => job.scheduled_date === date)

    const maxOrder = jobsForDate.reduce((max, job) => {
      return Math.max(max, job.job_order || 0)
    }, 0)

    return maxOrder + 1
  }

  const getDayTotalHours = (date: string) => {
    return getJobsForDate(date).reduce((total, job) => {
      return total + Number(job.planned_duration_hours || 0)
    }, 0)
  }

  const applyTemplateDefaults = (
    template: ServiceTemplate | null,
    property: Property
  ) => {
    setSelectedTemplate(template)

    const leadStaffId =
      template?.default_staff_id || property.default_staff_id || ""

    setAssignedStaffId(leadStaffId)
    setSelectedStaffIds(leadStaffId ? [leadStaffId] : [])

    setPlannedDuration(
      template?.default_duration_hours
        ? template.default_duration_hours.toString()
        : property.default_duration_hours
          ? property.default_duration_hours.toString()
          : ""
    )

    if (template?.default_job_notes) {
      setQuotedScope(template.default_job_notes)
    }
  }

  const openAddModal = (property: Property) => {
    const templates = getTemplatesForProperty(property.id)
    const firstTemplate = templates[0] || null

    setSelectedJob(null)
    setSelectedProperty(property)
    setSelectedTemplate(firstTemplate)

    setJobDate(thisWeekStart)

    setJobOrder(
      property.default_job_order
        ? property.default_job_order.toString()
        : getNextJobOrder(thisWeekStart).toString()
    )

    setPlannedStartTime(property.default_start_time || "")
    setQuotedScope(firstTemplate?.default_job_notes || "")
    setQuotedMaterials("")

    applyTemplateDefaults(firstTemplate, property)

    setError(null)
    setModalOpen(true)
  }

  const openEditModal = (job: Job) => {
    const property = properties.find((p) => p.id === job.property_id)

    if (!property) {
      alert("Could not find property for this job.")
      return
    }

    const existingStaffIds = getJobStaffIds(job)

    setSelectedJob(job)
    setSelectedProperty(property)
    setSelectedTemplate(null)

    setJobDate(job.scheduled_date)
    setAssignedStaffId(job.assigned_staff_id || existingStaffIds[0] || "")
    setSelectedStaffIds(existingStaffIds)
    setJobOrder(job.job_order ? job.job_order.toString() : "")

    setPlannedDuration(
      job.planned_duration_hours
        ? job.planned_duration_hours.toString()
        : ""
    )

    setPlannedStartTime(job.planned_start_time || "")
    setQuotedScope(job.quoted_scope || "")
    setQuotedMaterials(job.quoted_materials || "")

    setError(null)
    setModalOpen(true)
  }

  const handleTemplateChange = (templateId: string) => {
    if (!selectedProperty) return

    if (templateId === "custom") {
      setSelectedTemplate(null)
      setPlannedDuration("")
      setQuotedScope("")
      return
    }

    const template = getTemplatesForProperty(selectedProperty.id).find(
      (item) => item.id === templateId
    )

    if (!template) return

    applyTemplateDefaults(template, selectedProperty)
  }

  const handleLeadStaffChange = (staffId: string) => {
    setAssignedStaffId(staffId)

    if (staffId && !selectedStaffIds.includes(staffId)) {
      setSelectedStaffIds([...selectedStaffIds, staffId])
    }
  }

  const toggleStaffSelection = (staffId: string) => {
    if (selectedStaffIds.includes(staffId)) {
      if (staffId === assignedStaffId) {
        setAssignedStaffId("")
      }

      setSelectedStaffIds(selectedStaffIds.filter((id) => id !== staffId))
      return
    }

    setSelectedStaffIds([...selectedStaffIds, staffId])

    if (!assignedStaffId) {
      setAssignedStaffId(staffId)
    }
  }

  const handleDateChange = (date: string) => {
    setJobDate(date)

    if (!selectedProperty?.default_job_order) {
      setJobOrder(getNextJobOrder(date).toString())
    }
  }

  const syncScheduledJobStaff = async (
    scheduledJobId: string,
    staffIds: string[]
  ) => {
    const uniqueStaffIds = Array.from(new Set(staffIds.filter(Boolean)))

    const { error: deleteError } = await supabase
      .from("scheduled_job_staff")
      .delete()
      .eq("scheduled_job_id", scheduledJobId)

    if (deleteError) return deleteError

    if (uniqueStaffIds.length === 0) return null

    const rows = uniqueStaffIds.map((staffId) => ({
      scheduled_job_id: scheduledJobId,
      staff_member_id: staffId,
    }))

    const { error: insertError } = await supabase
      .from("scheduled_job_staff")
      .insert(rows)

    return insertError
  }

  const handleCreateJob = async () => {
    if (!selectedProperty) return

    setSaving(true)
    setError(null)

    const finalStaffIds = Array.from(
      new Set([assignedStaffId, ...selectedStaffIds].filter(Boolean))
    )

    const leadStaffId = assignedStaffId || finalStaffIds[0] || null

    const jobPayload = {
      property_id: selectedProperty.id,
      scheduled_date: jobDate,
      status: selectedJob?.status || "scheduled",
      job_order: parseInt(jobOrder) || getNextJobOrder(jobDate),
      assigned_staff_id: leadStaffId,
      planned_duration_hours: plannedDuration
        ? parseFloat(plannedDuration)
        : null,
      planned_start_time: plannedStartTime || null,
      billing_mode: selectedTemplate?.billing_mode || "charge_up",
      time_limit_type: selectedTemplate?.time_limit_type || "flexible",
      quoted_scope: quotedScope || null,
      quoted_materials: quotedMaterials || null,
    }

    let savedJobId = selectedJob?.id || ""

    if (selectedJob) {
      const { error } = await supabase
        .from("scheduled_jobs")
        .update(jobPayload)
        .eq("id", selectedJob.id)

      if (error) {
        setError(error.message)
        setSaving(false)
        return
      }
    } else {
      const { data, error } = await supabase
        .from("scheduled_jobs")
        .insert(jobPayload)
        .select("id")
        .single()

      if (error) {
        setError(error.message)
        setSaving(false)
        return
      }

      savedJobId = data.id
    }

    const staffSyncError = await syncScheduledJobStaff(
      savedJobId,
      finalStaffIds
    )

    if (staffSyncError) {
      setError(staffSyncError.message)
      setSaving(false)
      return
    }

    setSaving(false)
    setModalOpen(false)
    setSelectedProperty(null)
    setSelectedTemplate(null)
    setSelectedJob(null)
    setAssignedStaffId("")
    setSelectedStaffIds([])
    setQuotedScope("")
    setQuotedMaterials("")

    router.refresh()
  }

  const handleDeleteJob = async (jobId: string) => {
    const confirmed = window.confirm("Delete this scheduled job?")

    if (!confirmed) return

    const { data: visits } = await supabase
      .from("visits")
      .select("id")
      .eq("scheduled_job_id", jobId)
      .limit(1)

    if (visits && visits.length > 0) {
      alert("This job has a completed visit attached, so it cannot be deleted.")
      return
    }

    const { error } = await supabase
      .from("scheduled_jobs")
      .delete()
      .eq("id", jobId)

    if (error) {
      alert(error.message)
      return
    }

    router.refresh()
  }

  const JobCard = ({
    job,
    displayNumber,
  }: {
    job: Job
    displayNumber: number
  }) => (
    <div
      className={`rounded-lg border p-3 shadow-sm ${getStaffColourClasses(
        job.assigned_staff_id
      )}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">Job {displayNumber}</div>

          <div className="truncate text-sm text-gray-500">
            {job.properties?.address_line_1 || "No address"}
          </div>

          <div className="mt-1 text-sm font-medium">
            Staff: {getJobStaffNames(job)}
          </div>

          <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
            {job.planned_start_time && (
              <span>Start {job.planned_start_time.slice(0, 5)}</span>
            )}

            {job.planned_duration_hours && (
              <span>{job.planned_duration_hours}h</span>
            )}

            {job.time_limit_type === "fixed_time" && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                Fixed time
              </span>
            )}

            {job.quoted_scope && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-800">
                Scope attached
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="rounded-full bg-gray-100 px-2 py-1 text-xs capitalize text-gray-600">
            {job.status}
          </div>

          <button
            type="button"
            onClick={() => openEditModal(job)}
            className="text-xs text-blue-600 hover:underline"
          >
            Edit
          </button>

          <button
            type="button"
            onClick={() => handleDeleteJob(job.id)}
            className="text-xs text-red-600 hover:underline"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )

  const WeekSection = ({
    title,
    days,
  }: {
    title: string
    days: string[]
  }) => (
    <section className="mb-8">
      <h2 className="mb-3 text-xl font-semibold">{title}</h2>

      <div className="grid gap-4 md:grid-cols-5">
        {days.map((day) => {
          const dayJobs = getJobsForDate(day)
          const totalHours = getDayTotalHours(day)

          return (
            <div key={day} className="rounded-xl border bg-gray-50 p-3">
              <div className="mb-3">
                <div className="font-semibold">{formatDayLabel(day)}</div>

                <div className="text-xs text-gray-500">
                  {dayJobs.length} jobs
                  {totalHours > 0 ? ` · ${totalHours}h planned` : ""}
                </div>
              </div>

              <div className="space-y-2">
                {dayJobs.length > 0 ? (
                  dayJobs.map((job) => {
                    const jobsForSameStaffBeforeThisJob = dayJobs.filter(
                      (otherJob) => {
                        const sameStaff =
                          otherJob.assigned_staff_id === job.assigned_staff_id

                        const comesBefore =
                          dayJobs.findIndex(
                            (item) => item.id === otherJob.id
                          ) <= dayJobs.findIndex((item) => item.id === job.id)

                        return sameStaff && comesBefore
                      }
                    )

                    return (
                      <JobCard
                        key={job.id}
                        job={job}
                        displayNumber={jobsForSameStaffBeforeThisJob.length}
                      />
                    )
                  })
                ) : (
                  <p className="rounded-lg border border-dashed bg-white p-3 text-sm text-gray-400">
                    No jobs
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )

  return (
    <div className="mx-auto max-w-7xl p-4 pb-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Admin Schedule</h1>

        <p className="text-sm text-gray-500">
          Plan this week and next week, then quick-add jobs below.
        </p>
      </header>

      <WeekSection title="This Week" days={thisWeekDays} />
      <WeekSection title="Next Week" days={nextWeekDays} />

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <button
          type="button"
          onClick={() => setQuickAddOpen(!quickAddOpen)}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <h2 className="text-lg font-semibold">Quick Add Job</h2>

            <p className="text-sm text-gray-500">
              Filter by suburb/category, choose a customer, then add job type in
              the modal.
            </p>
          </div>

          <span className="text-sm text-gray-500">
            {quickAddOpen ? "Hide" : "Show"}
          </span>
        </button>

        {quickAddOpen && (
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium">Search Property</label>

<input
  className="mb-4 h-11 w-full rounded-md border px-3"
  value={propertySearch}
  onChange={(e) => setPropertySearch(e.target.value)}
  placeholder="Search by code, client, address, suburb..."
/>
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

            <label className="mb-1 block text-sm font-medium">Category</label>

            <select
              className="mb-4 h-11 w-full rounded-md border px-3"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>

            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
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
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <h2 className="mb-1 text-xl font-semibold">
              {selectedJob ? "Edit Job" : "Add Job"}
            </h2>

            <p className="mb-4 text-sm text-gray-500">
              {selectedProperty.client_name}
            </p>

            {!selectedJob && (
              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium">
                  Job Type / Template
                </label>

                <select
                  className="h-11 w-full rounded-md border px-3"
                  value={selectedTemplate?.id || "custom"}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                >
                  <option value="custom">Custom</option>

                  {getTemplatesForProperty(selectedProperty.id).map(
                    (template) => (
                      <option key={template.id} value={template.id}>
                        {template.template_name}
                      </option>
                    )
                  )}
                </select>

                {selectedTemplate && (
                  <p className="mt-1 text-xs text-gray-500">
                    Billing: {selectedTemplate.billing_mode} · Time:{" "}
                    {selectedTemplate.time_limit_type}
                  </p>
                )}
              </div>
            )}

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
                <label className="mb-1 block text-sm font-medium">
                  Lead Worker
                </label>

                <select
                  className="h-11 w-full rounded-md border px-3"
                  value={assignedStaffId}
                  onChange={(e) => handleLeadStaffChange(e.target.value)}
                >
                  <option value="">Unassigned</option>

                  {staff.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Assigned Staff
                </label>

                <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
                  {staff.map((member) => (
                    <label
                      key={member.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedStaffIds.includes(member.id)}
                        onChange={() => toggleStaffSelection(member.id)}
                      />

                      {member.name}
                    </label>
                  ))}
                </div>

                <p className="mt-1 text-xs text-gray-500">
                  Lead worker is used for sorting. All selected staff will see
                  this job once staff jobs page is updated.
                </p>
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

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Quoted Scope / Job Notes
                </label>

                <textarea
                  className="min-h-[120px] w-full rounded-md border p-3"
                  value={quotedScope}
                  onChange={(e) => setQuotedScope(e.target.value)}
                  placeholder="Paste labour/scope notes from Xero quote"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Included Materials
                </label>

                <textarea
                  className="min-h-[80px] w-full rounded-md border p-3"
                  value={quotedMaterials}
                  onChange={(e) => setQuotedMaterials(e.target.value)}
                  placeholder="e.g. 2m3 mulch, 6 GW bags included"
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
                  onClick={() => {
                    setModalOpen(false)
                    setSelectedJob(null)
                    setSelectedProperty(null)
                    setSelectedTemplate(null)
                    setAssignedStaffId("")
                    setSelectedStaffIds([])
                    setQuotedScope("")
                    setQuotedMaterials("")
                  }}
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
                  {saving
                    ? "Saving..."
                    : selectedJob
                      ? "Save Changes"
                      : "Create Job"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}