import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

type StaffSummary = {
  id: string
  name: string
}

type PropertySummary = {
  id: string
  property_code?: string | null
  client_name?: string | null
  address_line_1?: string | null
  suburb?: string | null
}

type JobBoardItem = {
  id: string
  title: string
  description?: string | null
  property_id?: string | null
  suburb?: string | null
  preferred_date?: string | null
  preferred_time_window?: string | null
  assigned_staff_id?: string | null
  status: "open" | "assigned" | "completed" | "cancelled"
  priority: "low" | "normal" | "urgent"
  created_at?: string | null
  properties?: PropertySummary | PropertySummary[] | null
  assigned_staff?: StaffSummary | StaffSummary[] | null
  job_board_responses?: JobBoardResponse[]
}

type JobBoardResponse = {
  id: string
  response: "available" | "claimed" | "not_available"
  note?: string | null
  created_at?: string | null
  staff?: StaffSummary | StaffSummary[] | null
}

const statusOptions = ["open", "assigned", "completed", "cancelled"] as const
const priorityOptions = ["low", "normal", "urgent"] as const

function firstOrValue<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function formatDate(value?: string | null) {
  if (!value) return "No date"

  return new Date(`${value}T12:00:00`).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function formatPropertyAddress(property?: PropertySummary | null) {
  return [property?.address_line_1, property?.suburb].filter(Boolean).join(", ")
}

function formatPropertyOption(property: PropertySummary) {
  const address = formatPropertyAddress(property)
  return [
    property.property_code,
    property.client_name,
    address,
  ]
    .filter(Boolean)
    .join(" - ")
}

function statusClasses(status: JobBoardItem["status"]) {
  if (status === "completed") return "border-green-200 bg-green-50 text-green-800"
  if (status === "cancelled") return "border-gray-200 bg-gray-50 text-gray-600"
  if (status === "assigned") return "border-blue-200 bg-blue-50 text-blue-800"
  return "border-amber-200 bg-amber-50 text-amber-800"
}

function priorityClasses(priority: JobBoardItem["priority"]) {
  if (priority === "urgent") return "border-red-200 bg-red-50 text-red-800"
  if (priority === "low") return "border-gray-200 bg-gray-50 text-gray-600"
  return "border-slate-200 bg-slate-50 text-slate-700"
}

function responseClasses(response: JobBoardResponse["response"]) {
  if (response === "claimed") return "border-blue-200 bg-blue-50 text-blue-800"
  if (response === "not_available") return "border-gray-200 bg-gray-50 text-gray-600"
  return "border-green-200 bg-green-50 text-green-800"
}

function responseLabel(response: JobBoardResponse["response"]) {
  if (response === "not_available") return "Not available"
  if (response === "claimed") return "Claimed"
  return "Available"
}

async function createJobBoardItem(formData: FormData) {
  "use server"

  const supabase = await createClient()
  const title = String(formData.get("title") || "").trim()

  if (!title) return

  const propertyId = String(formData.get("propertyId") || "").trim() || null
  let suburb = String(formData.get("suburb") || "").trim() || null

  if (propertyId && !suburb) {
    const { data: property } = await supabase
      .from("properties")
      .select("suburb")
      .eq("id", propertyId)
      .maybeSingle()

    suburb = property?.suburb || null
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  await supabase.from("job_board_items").insert({
    title,
    description: String(formData.get("description") || "").trim() || null,
    property_id: propertyId,
    suburb,
    preferred_date:
      String(formData.get("preferredDate") || "").trim() || null,
    preferred_time_window:
      String(formData.get("preferredTimeWindow") || "").trim() || null,
    assigned_staff_id:
      String(formData.get("assignedStaffId") || "").trim() || null,
    priority: String(formData.get("priority") || "normal"),
    status: String(formData.get("assignedStaffId") || "").trim()
      ? "assigned"
      : "open",
    created_by: user?.id || null,
  })

  revalidatePath("/admin/job-board")
  revalidatePath("/team/job-board")
}

async function updateJobBoardItem(formData: FormData) {
  "use server"

  const supabase = await createClient()
  const itemId = String(formData.get("itemId") || "").trim()
  const status = String(formData.get("status") || "open")
  const assignedStaffId =
    String(formData.get("assignedStaffId") || "").trim() || null

  if (!itemId) return

  await supabase
    .from("job_board_items")
    .update({
      status,
      assigned_staff_id: assignedStaffId,
    })
    .eq("id", itemId)

  revalidatePath("/admin/job-board")
  revalidatePath("/team/job-board")
}

export default async function AdminJobBoardPage() {
  const supabase = await createClient()

  const { data: items, error } = await supabase
    .from("job_board_items")
    .select(`
      id,
      title,
      description,
      property_id,
      suburb,
      preferred_date,
      preferred_time_window,
      assigned_staff_id,
      status,
      priority,
      created_at,
      properties (
        id,
        property_code,
        client_name,
        address_line_1,
        suburb
      ),
      assigned_staff:staff_members!job_board_items_assigned_staff_id_fkey (
        id,
        name
      ),
      job_board_responses (
        id,
        response,
        note,
        created_at,
        staff:staff_members!job_board_responses_staff_id_fkey (
          id,
          name
        )
      )
    `)
    .order("created_at", { ascending: false })

  const { data: properties } = await supabase
    .from("properties")
    .select("id, property_code, client_name, address_line_1, suburb")
    .eq("is_active", true)
    .order("client_name", { ascending: true })

  const { data: staff } = await supabase
    .from("staff_members")
    .select("id, name")
    .eq("is_active", true)
    .order("name", { ascending: true })

  const jobBoardItems = (items || []) as JobBoardItem[]
  const propertyOptions = (properties || []) as PropertySummary[]
  const staffOptions = (staff || []) as StaffSummary[]

  return (
    <div className="mx-auto max-w-7xl p-4 pb-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Team Job Board</h1>
        <p className="text-sm text-gray-500">
          Overflow, unscheduled and quick jobs. Separate from the main schedule.
        </p>
      </header>

      <section className="mb-6 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Add Team Job Board Item</h2>

        <form action={createJobBoardItem} className="grid gap-4 lg:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Title</span>
            <input
              name="title"
              required
              className="h-10 w-full rounded-md border px-3 text-sm"
              placeholder="Quick hedge tidy"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Property</span>
            <select
              name="propertyId"
              className="h-10 w-full rounded-md border px-3 text-sm"
              defaultValue=""
            >
              <option value="">No linked property</option>
              {propertyOptions.map((property) => (
                <option key={property.id} value={property.id}>
                  {formatPropertyOption(property)}
                </option>
              ))}
            </select>
          </label>

          <label className="block lg:col-span-2">
            <span className="mb-1 block text-sm font-medium">Description / notes</span>
            <textarea
              name="description"
              className="min-h-[90px] w-full rounded-md border p-3 text-sm"
              placeholder="Scope, access notes, photos to check, or customer context..."
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Suburb</span>
            <input
              name="suburb"
              className="h-10 w-full rounded-md border px-3 text-sm"
              placeholder="Leave blank to use linked property suburb"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Preferred date</span>
            <input
              name="preferredDate"
              type="date"
              className="h-10 w-full rounded-md border px-3 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Preferred time window</span>
            <input
              name="preferredTimeWindow"
              className="h-10 w-full rounded-md border px-3 text-sm"
              placeholder="Morning, after 2pm, this week..."
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Assigned staff</span>
            <select
              name="assignedStaffId"
              className="h-10 w-full rounded-md border px-3 text-sm"
              defaultValue=""
            >
              <option value="">Unassigned</option>
              {staffOptions.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Priority</span>
            <select
              name="priority"
              className="h-10 w-full rounded-md border px-3 text-sm"
              defaultValue="normal"
            >
              {priorityOptions.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <button
              type="submit"
              className="h-10 rounded-md bg-blue-600 px-4 text-sm font-medium text-white"
            >
              Add Item
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">All Items</h2>
          <span className="text-sm text-gray-500">
            {jobBoardItems.length} item{jobBoardItems.length === 1 ? "" : "s"}
          </span>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Error loading job board items: {error.message}
          </div>
        ) : jobBoardItems.length > 0 ? (
          <div className="space-y-3">
            {jobBoardItems.map((item) => {
              const property = firstOrValue(item.properties)
              const assignedStaff = firstOrValue(item.assigned_staff)
              const propertyAddress = formatPropertyAddress(property)

              return (
                <article key={item.id} className="rounded-lg border p-4">
                  <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                    <div>
                      <div className="mb-2 flex flex-wrap gap-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusClasses(
                            item.status
                          )}`}
                        >
                          {item.status}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${priorityClasses(
                            item.priority
                          )}`}
                        >
                          {item.priority} priority
                        </span>
                      </div>

                      <h3 className="text-lg font-semibold">{item.title}</h3>

                      <div className="mt-1 space-y-1 text-sm text-gray-600">
                        <p>
                          {property?.client_name || "No linked property"}
                          {propertyAddress ? ` - ${propertyAddress}` : ""}
                        </p>
                        <p>Suburb: {item.suburb || property?.suburb || "Not set"}</p>
                        <p>
                          Preferred: {formatDate(item.preferred_date)}
                          {item.preferred_time_window
                            ? ` - ${item.preferred_time_window}`
                            : ""}
                        </p>
                        <p>Assigned: {assignedStaff?.name || "Unassigned"}</p>
                      </div>

                      {item.description && (
                        <p className="mt-3 whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-sm text-gray-700">
                          {item.description}
                        </p>
                      )}

                      <div className="mt-3 rounded-md border bg-white p-3">
                        <div className="mb-2 text-sm font-semibold text-gray-900">
                          Responses
                        </div>

                        {item.job_board_responses &&
                        item.job_board_responses.length > 0 ? (
                          <div className="space-y-2">
                            {item.job_board_responses.map((response) => {
                              const responseStaff = firstOrValue(response.staff)

                              return (
                                <div
                                  key={response.id}
                                  className="flex flex-wrap items-center gap-2 text-sm text-gray-700"
                                >
                                  <span className="font-medium">
                                    {responseStaff?.name || "Unknown staff"}:
                                  </span>
                                  <span
                                    className={`rounded-full border px-2 py-0.5 text-xs font-medium ${responseClasses(
                                      response.response
                                    )}`}
                                  >
                                    {responseLabel(response.response)}
                                  </span>
                                  {response.note && (
                                    <span className="whitespace-pre-wrap text-gray-600">
                                      - {response.note}
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">
                            No staff responses yet.
                          </p>
                        )}
                      </div>
                    </div>

                    <form
                      action={updateJobBoardItem}
                      className="grid gap-2 sm:grid-cols-3 lg:w-80 lg:grid-cols-1"
                    >
                      <input type="hidden" name="itemId" value={item.id} />

                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-gray-500">
                          Status
                        </span>
                        <select
                          name="status"
                          className="h-9 w-full rounded-md border px-2 text-sm"
                          defaultValue={item.status}
                        >
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-gray-500">
                          Staff
                        </span>
                        <select
                          name="assignedStaffId"
                          className="h-9 w-full rounded-md border px-2 text-sm"
                          defaultValue={item.assigned_staff_id || ""}
                        >
                          <option value="">Unassigned</option>
                          {staffOptions.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <button
                        type="submit"
                        className="h-9 self-end rounded-md border px-3 text-sm font-medium hover:bg-gray-50"
                      >
                        Save
                      </button>
                    </form>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-sm text-gray-500">
            No job board items yet.
          </div>
        )}
      </section>
    </div>
  )
}
