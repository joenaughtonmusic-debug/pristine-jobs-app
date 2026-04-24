import { createClient } from "@/lib/supabase/server"

export default async function AdminSchedulePage({
  searchParams,
}: {
  searchParams?: { date?: string }
}) {
  const supabase = await createClient()

  const selectedDate =
    searchParams?.date || new Date().toISOString().split("T")[0]

  const { data: jobs } = await supabase
    .from("scheduled_jobs")
    .select(`
      *,
      properties (
        client_name,
        address_line_1
      ),
      staff_members (
        name
      )
    `)
    .eq("scheduled_date", selectedDate)
    .order("job_order", { ascending: true })

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Admin Schedule</h1>

      {/* Date Picker */}
      <form method="get" className="mb-6">
        <input
          type="date"
          name="date"
          defaultValue={selectedDate}
          className="border rounded px-3 py-2"
        />
        <button className="ml-2 px-4 py-2 bg-black text-white rounded">
          Load
        </button>
      </form>

      {/* Jobs List */}
      <div className="space-y-3">
        {jobs && jobs.length > 0 ? (
          jobs.map((job) => (
            <div
              key={job.id}
              className="border rounded p-4 flex justify-between items-center"
            >
              <div>
                <div className="font-semibold">
                  {job.properties?.client_name || "Unknown"}
                </div>
                <div className="text-sm text-gray-500">
                  {job.properties?.address_line_1}
                </div>

                <div className="text-sm mt-1">
                  Staff: {job.staff_members?.name || "Unassigned"}
                </div>

                {job.planned_duration_hours && (
                  <div className="text-sm">
                    ⏱ {job.planned_duration_hours}h
                  </div>
                )}
              </div>

              <div className="text-right">
                <div className="text-sm">Job #{job.job_order}</div>
                <div className="text-xs text-gray-500 capitalize">
                  {job.status}
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-gray-500">No jobs for this date</p>
        )}
      </div>

      {/* Add Job Button (placeholder for now) */}
      <div className="mt-6">
        <button className="px-4 py-2 bg-green-600 text-white rounded">
          + Add Job
        </button>
      </div>
    </div>
  )
}