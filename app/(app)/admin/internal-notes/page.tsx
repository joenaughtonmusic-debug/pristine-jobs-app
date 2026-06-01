import Link from "next/link"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

type SearchParams =
  | {
      tab?: string
    }
  | Promise<{
      tab?: string
    }>

type PropertySummary = {
  client_name?: string | null
  address_line_1?: string | null
  suburb?: string | null
}

type InternalJobNote = {
  id: string
  scheduled_job_id?: string | null
  property_address?: string | null
  note: string | null
  submitted_by_staff_name?: string | null
  created_at?: string | null
  status?: string | null
  completed_at?: string | null
  completed_by?: string | null
  properties?: PropertySummary | PropertySummary[] | null
}

function firstOrValue<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function formatDate(value?: string | null) {
  if (!value) return "No date"

  return new Date(value).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function getPropertyLabel(note: InternalJobNote) {
  const property = firstOrValue(note.properties)
  const address = [property?.address_line_1, property?.suburb]
    .filter(Boolean)
    .join(", ")

  return property?.client_name || address || note.property_address || "No property"
}

async function markNoteCompleted(formData: FormData) {
  "use server"

  const supabase = await createClient()
  const noteId = formData.get("noteId") as string

  if (!noteId) return

  const {
    data: { user },
  } = await supabase.auth.getUser()

  await supabase
    .from("internal_job_notes")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      completed_by: user?.email || "admin",
    })
    .eq("id", noteId)

  revalidatePath("/admin/internal-notes")
}

export default async function AdminInternalNotesPage({
  searchParams,
}: {
  searchParams?: SearchParams
}) {
  const params = await Promise.resolve(searchParams || {})
  const activeTab =
    params.tab === "completed" || params.tab === "all" ? params.tab : "open"
  const supabase = await createClient()

  let query = supabase
    .from("internal_job_notes")
    .select(`
      id,
      scheduled_job_id,
      property_address,
      note,
      submitted_by_staff_name,
      created_at,
      status,
      completed_at,
      completed_by,
      properties (
        client_name,
        address_line_1,
        suburb
      )
    `)
    .order("created_at", { ascending: false })
    .limit(200)

  if (activeTab === "open") {
    query = query.eq("status", "open")
  }

  if (activeTab === "completed") {
    query = query.eq("status", "completed")
  }

  const { data: notes, error } = await query

  const tabs = [
    { value: "open", label: "Open" },
    { value: "completed", label: "Completed" },
    { value: "all", label: "All" },
  ]

  return (
    <div className="mx-auto max-w-5xl p-4 pb-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Internal Job Notes</h1>
        <p className="text-sm text-gray-500">
          Follow up internal notes submitted from completed visits and jobs.
        </p>
      </header>

      <div className="mb-4 grid max-w-md grid-cols-3 rounded-lg border bg-gray-50 p-1 text-sm">
        {tabs.map((tab) => (
          <Link
            key={tab.value}
            href={
              tab.value === "open"
                ? "/admin/internal-notes"
                : `/admin/internal-notes?tab=${tab.value}`
            }
            className={`flex h-9 items-center justify-center rounded-md font-medium ${
              activeTab === tab.value
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Error loading internal notes: {error.message}
        </div>
      ) : notes && notes.length > 0 ? (
        <div className="space-y-3">
          {(notes as InternalJobNote[]).map((note) => {
            const status = note.status || "open"

            return (
              <article key={note.id} className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-gray-900">
                      {getPropertyLabel(note)}
                    </h2>
                    <div className="mt-1 text-xs text-gray-500">
                      Created {formatDate(note.created_at)}
                      {note.submitted_by_staff_name
                        ? ` by ${note.submitted_by_staff_name}`
                        : ""}
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      status === "completed"
                        ? "bg-green-100 text-green-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {status}
                  </span>
                </div>

                <div className="mt-3 whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-sm text-gray-700">
                  {note.note || "No note text"}
                </div>

                {status === "completed" && (
                  <div className="mt-3 text-xs text-gray-500">
                    Completed {formatDate(note.completed_at)}
                    {note.completed_by ? ` by ${note.completed_by}` : ""}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-3">
                  {note.scheduled_job_id && (
                    <Link
                      href={`/jobs/${note.scheduled_job_id}`}
                      className="inline-flex rounded-md border px-3 py-2 text-sm font-medium hover:bg-gray-50"
                    >
                      Open Job
                    </Link>
                  )}

                  {status !== "completed" && (
                    <form action={markNoteCompleted}>
                      <input type="hidden" name="noteId" value={note.id} />
                      <button
                        type="submit"
                        className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
                      >
                        Mark Completed
                      </button>
                    </form>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed bg-white p-6 text-sm text-gray-500">
          No internal job notes found for this view.
        </div>
      )}
    </div>
  )
}
