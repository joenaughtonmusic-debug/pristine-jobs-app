import { createHash } from "crypto"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

const TIMEZONE = "Pacific/Auckland"
const CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=600"
const CONTACT_CTA = {
  label: "Book a visit",
  href: "https://www.pristinegardens.co.nz/contact",
}

type Nested<T> = T | T[] | null

type PropertyRow = {
  suburb?: string | null
  service_type?: string | null
  service_frequency?: string | null
}

type StaffRow = {
  name?: string | null
}

type ScheduledJobStaffRow = {
  staff_member_id?: string | null
  staff_members?: Nested<StaffRow>
}

type JobRow = {
  id: string
  scheduled_date?: string | null
  status?: string | null
  job_type?: string | null
  job_order?: number | string | null
  planned_start_time?: string | null
  assigned_staff_id?: string | null
  hide_from_public_map?: boolean | null
  created_at?: string | null
  properties?: Nested<PropertyRow>
  scheduled_job_staff?: ScheduledJobStaffRow[] | null
}

type SuburbLocationRow = {
  suburb: string
  display_name?: string | null
  latitude: number | string
  longitude: number | string
}

type StaffMemberRow = {
  id: string
  name?: string | null
}

type PublicMarker = {
  publicId: string
  suburb: string
  coordinates: {
    lat: number
    lng: number
  }
  staff: string[]
  jobType: string
  summary: string
  cta: typeof CONTACT_CTA
}

function firstOrValue<T>(value: Nested<T>) {
  return Array.isArray(value) ? value[0] : value
}

function getTodayInTimeZone() {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())

  const year = parts.find((part) => part.type === "year")?.value
  const month = parts.find((part) => part.type === "month")?.value
  const day = parts.find((part) => part.type === "day")?.value

  return `${year}-${month}-${day}`
}

function normalizeSuburb(suburb?: string | null) {
  return String(suburb || "").trim().toLowerCase()
}

function getFirstName(name?: string | null) {
  return String(name || "").trim().split(/\s+/)[0] || null
}

function uniqueNames(names: Array<string | null>) {
  return Array.from(new Set(names.filter(Boolean) as string[]))
}

function getJobTypeLabel(job: JobRow, property: PropertyRow | null) {
  const text = [
    job.job_type,
    property?.service_type,
    property?.service_frequency,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  if (text.includes("landscap")) return "Landscaping"
  if (text.includes("lawn")) return "Lawn mowing"
  if (
    text.includes("tidy") ||
    text.includes("one_off") ||
    text.includes("one-off") ||
    text.includes("one off")
  ) {
    return "Garden tidy"
  }
  if (text.includes("maintenance") || Boolean(property?.service_frequency)) {
    return "Garden maintenance"
  }

  return "General garden work"
}

function lowerFirst(value: string) {
  return value.charAt(0).toLowerCase() + value.slice(1)
}

function getSummary(jobType: string, suburb: string) {
  return `Our team is working on ${lowerFirst(jobType)} in ${suburb} today.`
}

function getCta(jobType: string) {
  if (jobType === "Landscaping") {
    return {
      label: "Book landscaping work",
      href: CONTACT_CTA.href,
    }
  }

  if (jobType === "Lawn mowing") {
    return {
      label: "Book lawn mowing",
      href: CONTACT_CTA.href,
    }
  }

  if (jobType === "Garden maintenance") {
    return {
      label: "Book garden maintenance",
      href: CONTACT_CTA.href,
    }
  }

  return CONTACT_CTA
}

function getPublicId(jobId: string, date: string) {
  return createHash("sha256")
    .update(`${date}:${jobId}`)
    .digest("hex")
    .slice(0, 16)
}

function getSortValue(job: JobRow) {
  return [
    job.planned_start_time || "99:99",
    String(job.job_order ?? "9999").padStart(4, "0"),
    job.created_at || "",
  ].join("|")
}

/**
 * Collect all unique staff IDs associated with a job, merging assigned_staff_id
 * and every entry in scheduled_job_staff into one deduplicated list.
 */
function getJobStaffIds(job: JobRow): string[] {
  return Array.from(
    new Set(
      [
        job.assigned_staff_id ?? "",
        ...(job.scheduled_job_staff?.map(
          (item) => item.staff_member_id ?? ""
        ) ?? []),
      ].filter(Boolean)
    )
  )
}

function offsetCoordinate(
  latitude: number,
  longitude: number,
  index: number,
  total: number
) {
  if (total <= 1) {
    return { lat: latitude, lng: longitude }
  }

  const angle = (Math.PI * 2 * index) / total
  const offset = 0.0012

  return {
    lat: Number((latitude + Math.sin(angle) * offset).toFixed(6)),
    lng: Number((longitude + Math.cos(angle) * offset).toFixed(6)),
  }
}

function responseJson(body: unknown, status = 200, cacheControl = CACHE_CONTROL) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": cacheControl,
      "Access-Control-Allow-Origin": "*",
    },
  })
}

function summarizeJobSuburbs(jobs: JobRow[]) {
  return Array.from(
    new Set(
      jobs
        .map((job) => firstOrValue(job.properties)?.suburb)
        .filter(Boolean)
        .map((suburb) => String(suburb).trim())
    )
  ).sort((a, b) => a.localeCompare(b))
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": CACHE_CONTROL,
    },
  })
}

function parseDateParam(raw: string | null, today: string): string {
  if (!raw) return today
  // Accept YYYY-MM-DD only; fall back to today for malformed input
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : today
}

export async function GET(request: Request) {
  const today = getTodayInTimeZone()
  const { searchParams } = new URL(request.url)
  const date = parseDateParam(searchParams.get("date"), today)

  const emptyState = {
    summary: "No public job updates are available today.",
    cta: CONTACT_CTA,
  }

  const supabase = await createAdminClient()

  const { data: jobs, error: jobsError } = await supabase
    .from("scheduled_jobs")
    .select(`
      id,
      scheduled_date,
      status,
      job_type,
      job_order,
      planned_start_time,
      assigned_staff_id,
      hide_from_public_map,
      created_at,
      properties (
        suburb,
        service_type,
        service_frequency
      ),
      scheduled_job_staff (
        staff_member_id,
        staff_members (
          name
        )
      )
    `)
    .eq("scheduled_date", date)
    .eq("schedule_confirmation_status", "confirmed")
    .eq("hide_from_public_map", false)
    .in("status", ["scheduled", "in_progress", "completed"])
    .order("planned_start_time", { ascending: true, nullsFirst: false })
    .order("job_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })

  if (jobsError) {
    console.error("[public-working-today] scheduled_jobs query failed", {
      code: jobsError.code,
      message: jobsError.message,
      details: jobsError.details,
      hint: jobsError.hint,
    })

    return responseJson(
      {
        date,
        timezone: TIMEZONE,
        count: 0,
        markers: [],
        emptyState,
        error: "Public working today feed is temporarily unavailable.",
      },
      503,
      "no-store"
    )
  }

  console.info("[public-working-today] scheduled_jobs returned", {
    date,
    count: jobs?.length || 0,
  })

  const jobRows = ((jobs || []) as JobRow[])
    .filter((job) => {
      const property = firstOrValue(job.properties)
      return Boolean(property?.suburb && job.hide_from_public_map !== true)
    })
    .sort((a, b) => getSortValue(a).localeCompare(getSortValue(b)))

  console.info("[public-working-today] job suburbs found", {
    date,
    scheduledJobCount: jobs?.length || 0,
    afterSuburbFilterCount: jobRows.length,
    suburbs: summarizeJobSuburbs(jobRows),
  })

  const staffIds = Array.from(
    new Set(
      jobRows
        .map((job) => job.assigned_staff_id)
        .filter(Boolean) as string[]
    )
  )

  const { data: suburbLocations, error: suburbLocationsError } =
    jobRows.length > 0
      ? await supabase
          .from("public_suburb_locations")
          .select("suburb, display_name, latitude, longitude")
          .eq("is_active", true)
      : { data: [], error: null }

  const { data: fallbackStaff } =
    staffIds.length > 0
      ? await supabase
          .from("staff_members")
          .select("id, name")
          .in("id", staffIds)
      : { data: [] }

  const locationsBySuburb = new Map(
    ((suburbLocations || []) as SuburbLocationRow[]).map((location) => [
      normalizeSuburb(location.suburb),
      location,
    ])
  )

  if (suburbLocationsError) {
    console.error("[public-working-today] suburb location query failed", {
      code: suburbLocationsError.code,
      message: suburbLocationsError.message,
      details: suburbLocationsError.details,
      hint: suburbLocationsError.hint,
    })
  }

  const coordinateLookupResults = summarizeJobSuburbs(jobRows).map((suburb) => {
    const location = locationsBySuburb.get(normalizeSuburb(suburb))

    return {
      suburb,
      hasActiveLocation: Boolean(location),
      hasUsableCoordinates: Boolean(
        location &&
          Number.isFinite(Number(location.latitude)) &&
          Number.isFinite(Number(location.longitude))
      ),
      displayName: location?.display_name || location?.suburb || null,
    }
  })

  console.info("[public-working-today] coordinate lookup results", {
    date,
    activeLocationCount: suburbLocations?.length || 0,
    results: coordinateLookupResults,
  })

  const fallbackStaffById = new Map(
    ((fallbackStaff || []) as StaffMemberRow[]).map((member) => [
      member.id,
      member.name || null,
    ])
  )

  // Pre-compute which staff IDs have at least one solo job (exactly 1 staff
  // member). Solo jobs take priority: those staff members will be reserved for
  // their own marker and excluded from any shared-job markers they also appear
  // on, regardless of which job sorts first.
  const staffWithSoloJob = new Set<string>()
  for (const job of jobRows) {
    const ids = getJobStaffIds(job)
    if (ids.length === 1) {
      staffWithSoloJob.add(ids[0])
    }
  }

  type SelectedJob = { job: JobRow; effectiveStaffIds: ReadonlySet<string> }

  const usedStaff = new Set<string>()
  const selectedJobs: SelectedJob[] = []
  const skippedJobs = {
    missingLocation: 0,
    duplicateStaff: 0,
  }

  for (const job of jobRows) {
    const property = firstOrValue(job.properties)
    const suburbKey = normalizeSuburb(property?.suburb)
    const location = locationsBySuburb.get(suburbKey)

    if (!location) {
      skippedJobs.missingLocation += 1
      continue
    }

    const allStaffIds = getJobStaffIds(job)
    const isSolo = allStaffIds.length === 1

    // For shared jobs: exclude staff who are already placed OR who have their
    // own solo job (they will be — or already were — covered by that marker).
    // For solo jobs: only check usedStaff (no look-ahead restriction).
    const eligibleStaffIds = allStaffIds.filter(
      (id) => !usedStaff.has(id) && (isSolo || !staffWithSoloJob.has(id))
    )

    if (allStaffIds.length > 0 && eligibleStaffIds.length === 0) {
      // All staff are already placed on their own or earlier markers.
      skippedJobs.duplicateStaff += 1
      continue
    }

    const effectiveStaffIds = new Set(eligibleStaffIds)
    selectedJobs.push({ job, effectiveStaffIds })
    eligibleStaffIds.forEach((id) => usedStaff.add(id))
  }

  const suburbCounts = selectedJobs.reduce<Record<string, number>>(
    (counts, { job }) => {
      const suburbKey = normalizeSuburb(firstOrValue(job.properties)?.suburb)
      counts[suburbKey] = (counts[suburbKey] || 0) + 1
      return counts
    },
    {}
  )

  const suburbSeen: Record<string, number> = {}

  const markers: PublicMarker[] = selectedJobs.map(
    ({ job, effectiveStaffIds }) => {
      const property = firstOrValue(job.properties)
      const suburbKey = normalizeSuburb(property?.suburb)
      const location = locationsBySuburb.get(suburbKey) as SuburbLocationRow
      const suburb = location.display_name || property?.suburb || location.suburb
      const jobType = getJobTypeLabel(job, property || null)

      // Only include staff who belong to this marker's effective set so that
      // staff members trimmed from shared jobs do not appear in the output.
      const staffFromJoin =
        job.scheduled_job_staff
          ?.filter((item) =>
            effectiveStaffIds.has(item.staff_member_id ?? "")
          )
          .map((item) => getFirstName(firstOrValue(item.staff_members)?.name)) ??
        []

      const fallbackStaffName =
        job.assigned_staff_id &&
        effectiveStaffIds.has(job.assigned_staff_id)
          ? getFirstName(
              fallbackStaffById.get(job.assigned_staff_id) ?? null
            )
          : null

      const staff = uniqueNames([fallbackStaffName, ...staffFromJoin])
      const suburbIndex = suburbSeen[suburbKey] || 0
      suburbSeen[suburbKey] = suburbIndex + 1
      const coordinates = offsetCoordinate(
        Number(location.latitude),
        Number(location.longitude),
        suburbIndex,
        suburbCounts[suburbKey] || 1
      )

      return {
        publicId: getPublicId(job.id, date),
        suburb,
        coordinates,
        staff,
        jobType,
        summary: getSummary(jobType, suburb),
        cta: getCta(jobType),
      }
    }
  )

  console.info("[public-working-today] marker count after grouping", {
    date,
    sourceJobCount: jobRows.length,
    selectedJobCount: selectedJobs.length,
    markerCount: markers.length,
    skippedJobs,
  })

  console.info("[public-working-today] final response count", {
    date,
    count: markers.length,
  })

  return responseJson({
    date,
    timezone: TIMEZONE,
    count: markers.length,
    markers,
    emptyState,
  })
}
