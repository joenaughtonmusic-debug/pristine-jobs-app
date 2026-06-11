import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

type StaffSummary = {
  id: string
  name: string
}

type PropertySummary = {
  client_name?: string | null
  address_line_1?: string | null
  suburb?: string | null
}

type JobBoardItem = {
  id: string
  title: string
  description?: string | null
  assigned_staff_id?: string | null
  suburb?: string | null
  preferred_date?: string | null
  preferred_time_window?: string | null
  status: "open" | "assigned" | "completed" | "cancelled"
  priority: "low" | "normal" | "urgent"
  properties?: PropertySummary | PropertySummary[] | null
  assigned_staff?: StaffSummary | StaffSummary[] | null
  job_board_responses?: JobBoardResponse[]
}

type JobBoardResponse = {
  id: string
  staff_id: string
  response: "available" | "claimed" | "not_available"
  note?: string | null
}

type SearchParams =
  | {
      message?: string
    }
  | Promise<{
      message?: string
    }>

function firstOrValue<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function formatDate(value?: string | null) {
  if (!value) return "No preferred date"

  return new Date(`${value}T12:00:00`).toLocaleDateString("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}

function formatPropertyAddress(property?: PropertySummary | null) {
  return [property?.address_line_1, property?.suburb].filter(Boolean).join(", ")
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

async function respondToJobBoardItem(formData: FormData) {
  "use server"

  const supabase = await createClient()
  const itemId = String(formData.get("itemId") || "").trim()
  const response = String(formData.get("response") || "").trim()
  const note = String(formData.get("note") || "").trim() || null

  if (
    !itemId ||
    !["available", "claimed", "not_available"].includes(response)
  ) {
    return
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/team/job-board?message=no-staff")

  const { data: staffMember } = await supabase
    .from("staff_members")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle()

  if (!staffMember?.id) redirect("/team/job-board?message=no-staff")

  if (response === "claimed") {
    const { data: item } = await supabase
      .from("job_board_items")
      .select("assigned_staff_id")
      .eq("id", itemId)
      .maybeSingle()

    if (
      item?.assigned_staff_id &&
      item.assigned_staff_id !== staffMember.id
    ) {
      redirect("/team/job-board?message=already-assigned")
    }
  }

  await supabase.from("job_board_responses").upsert(
    {
      job_board_item_id: itemId,
      staff_id: staffMember.id,
      response,
      note,
    },
    {
      onConflict: "job_board_item_id,staff_id",
    }
  )

  if (response === "claimed") {
    await supabase
      .from("job_board_items")
      .update({
        status: "assigned",
        assigned_staff_id: staffMember.id,
      })
      .eq("id", itemId)
      .or(`assigned_staff_id.is.null,assigned_staff_id.eq.${staffMember.id}`)
  }

  revalidatePath("/team/job-board")
  revalidatePath("/admin/job-board")
}

export default async function TeamJobBoardPage({
  searchParams,
}: {
  searchParams?: SearchParams
}) {
  const params = await Promise.resolve(searchParams || {})
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: staffMember } = user
    ? await supabase
        .from("staff_members")
        .select("id, name")
        .eq("auth_user_id", user.id)
        .maybeSingle()
    : { data: null }

  const { data: items, error } = await supabase
    .from("job_board_items")
    .select(`
      id,
      title,
      description,
      assigned_staff_id,
      suburb,
      preferred_date,
      preferred_time_window,
      status,
      priority,
      properties (
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
        staff_id,
        response,
        note
      )
    `)
    .neq("status", "cancelled")
    .order("preferred_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })

  const jobBoardItems = (items || []) as JobBoardItem[]

  return (
    <div className="mx-auto max-w-4xl p-4 pb-24">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Team Job Board</h1>
        <p className="text-sm text-muted-foreground">
          Overflow and quick jobs that are not on the main schedule yet.
        </p>
      </header>

      {params.message === "already-assigned" && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
          This job is already assigned.
        </div>
      )}

      {params.message === "no-staff" && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
          No linked staff profile was found for this account.
        </div>
      )}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Error loading job board: {error.message}
        </div>
      ) : jobBoardItems.length > 0 ? (
        <div className="space-y-3">
          {jobBoardItems.map((item) => {
            const property = firstOrValue(item.properties)
            const assignedStaff = firstOrValue(item.assigned_staff)
            const address = formatPropertyAddress(property)
            const suburb = item.suburb || property?.suburb
            const myResponse = item.job_board_responses?.find(
              (response) => response.staff_id === staffMember?.id
            )
            const canRespond =
              item.status === "open" || item.status === "assigned"

            return (
              <article key={item.id} className="rounded-xl border bg-card p-4">
                <div className="mb-3 flex flex-wrap gap-2">
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

                <h2 className="text-lg font-semibold text-foreground">
                  {item.title}
                </h2>

                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {suburb && (
                    <p className="font-medium text-foreground">{suburb}</p>
                  )}
                  <p>{property?.client_name || "No linked property"}</p>
                  {address && <p className="whitespace-normal break-words">{address}</p>}
                  <p>
                    {formatDate(item.preferred_date)}
                    {item.preferred_time_window
                      ? ` - ${item.preferred_time_window}`
                      : ""}
                  </p>
                  <p>Assigned: {assignedStaff?.name || "Unassigned"}</p>
                </div>

                {item.description && (
                  <div className="mt-3 whitespace-pre-wrap rounded-md bg-muted p-3 text-sm text-muted-foreground">
                    {item.description}
                  </div>
                )}

                {myResponse && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    <span>Your response:</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${responseClasses(
                        myResponse.response
                      )}`}
                    >
                      {responseLabel(myResponse.response)}
                    </span>
                    {myResponse.note && (
                      <span className="text-muted-foreground">
                        - {myResponse.note}
                      </span>
                    )}
                  </div>
                )}

                {canRespond && staffMember && (
                  <form action={respondToJobBoardItem} className="mt-4 space-y-3">
                    <input type="hidden" name="itemId" value={item.id} />

                    <textarea
                      name="note"
                      className="min-h-[72px] w-full rounded-md border bg-background p-3 text-sm"
                      defaultValue={myResponse?.note || ""}
                      placeholder="Add note, e.g. free after 2pm / need water blaster / can do tomorrow"
                    />

                    <div className="grid gap-2 sm:grid-cols-3">
                      <button
                        type="submit"
                        name="response"
                        value="available"
                        className="h-10 rounded-md border border-green-200 bg-green-50 px-3 text-sm font-medium text-green-800"
                      >
                        Available
                      </button>
                      <button
                        type="submit"
                        name="response"
                        value="claimed"
                        className="h-10 rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-medium text-blue-800"
                      >
                        Claim job
                      </button>
                      <button
                        type="submit"
                        name="response"
                        value="not_available"
                        className="h-10 rounded-md border px-3 text-sm font-medium"
                      >
                        Not available
                      </button>
                    </div>
                  </form>
                )}
              </article>
            )
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No job board items right now.
        </div>
      )}
    </div>
  )
}
