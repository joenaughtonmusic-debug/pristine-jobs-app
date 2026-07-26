import { createClient } from "@/lib/supabase/server"
import { PmReportsClient, type PmReportRow } from "@/components/pm-reports-client"
import { severityRank, worstSeverity } from "@/lib/walk-around"

// Deterministic NZ-style date from a YYYY-MM-DD date string — no locale
// surprises in SSR text (see docs/CODING_AGENT_RULES.md on hydration).
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

function formatDateOnly(value: string | null | undefined): string {
  if (!value) return "Unknown date"
  const [y, m, d] = value.slice(0, 10).split("-").map(Number)
  if (!y || !m || !d) return value
  return `${d} ${MONTHS[m - 1]} ${y}`
}

// sent_at is a UTC timestamp; render it as the NZ calendar day it happened.
function formatTimestampNz(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value || ""
  return `${get("day")} ${get("month")} ${get("year")}`
}

export default async function AdminPmReportsPage() {
  const supabase = await createClient()

  // Walk-around issues are the driver: an issue photo with a severity and a
  // visit. Issues without a visit_id can't be reported (the engine sends per
  // visit) — none should exist, but if one does it stays visible on the
  // property dialog rather than silently vanishing here.
  const { data: issuePhotos, error: issuesError } = await supabase
    .from("job_photos")
    .select("id, visit_id, property_id, public_url, caption, severity, created_at")
    .eq("photo_type", "issue")
    .not("severity", "is", null)
    .not("visit_id", "is", null)
    .order("created_at", { ascending: false })

  const issuesByVisit = new Map<string, NonNullable<typeof issuePhotos>>()
  for (const photo of issuePhotos || []) {
    const key = photo.visit_id as string
    const list = issuesByVisit.get(key) || []
    list.push(photo)
    issuesByVisit.set(key, list)
  }

  const visitIds = Array.from(issuesByVisit.keys())

  const [{ data: visits }, reportsResult] = await Promise.all([
    visitIds.length
      ? supabase.from("visits").select("id, property_id, visit_date").in("id", visitIds)
      : Promise.resolve({ data: [] as { id: string; property_id: string | null; visit_date: string | null }[] }),
    visitIds.length
      ? supabase
          .from("pm_reports")
          .select("visit_id, status, sent_at, recipient_email, error, created_at")
          .in("visit_id", visitIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null } as {
          data: {
            visit_id: string | null
            status: string
            sent_at: string | null
            recipient_email: string | null
            error: string | null
            created_at: string
          }[]
          error: null
        }),
  ])

  const propertyIds = Array.from(
    new Set((visits || []).map((v) => v.property_id).filter(Boolean))
  ) as string[]

  const { data: properties } = propertyIds.length
    ? await supabase
        .from("properties")
        .select("id, client_name, address_line_1, suburb, is_rental, property_manager_id")
        .in("id", propertyIds)
    : { data: [] as never[] }

  const pmIds = Array.from(
    new Set((properties || []).map((p) => p.property_manager_id).filter(Boolean))
  ) as string[]

  const { data: propertyManagers } = pmIds.length
    ? await supabase.from("property_managers").select("id, name, email").in("id", pmIds)
    : { data: [] as never[] }

  const propertyById = new Map((properties || []).map((p) => [p.id as string, p]))
  const pmById = new Map((propertyManagers || []).map((pm) => [pm.id as string, pm]))

  // Latest report per visit (query is created_at desc, first wins). A sent
  // report parks the visit in the Sent section; a failed one stays in the
  // queue with the error surfaced — fail loudly, never silently.
  const latestReportByVisit = new Map<
    string,
    { status: string; sent_at: string | null; recipient_email: string | null; error: string | null }
  >()
  const everSentVisits = new Set<string>()
  for (const report of reportsResult.data || []) {
    if (!report.visit_id) continue
    if (!latestReportByVisit.has(report.visit_id)) {
      latestReportByVisit.set(report.visit_id, report)
    }
    if (report.status === "sent") everSentVisits.add(report.visit_id)
  }

  const rows: PmReportRow[] = (visits || [])
    .map((visit) => {
      const issues = (issuesByVisit.get(visit.id as string) || [])
        .slice()
        .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
      const property = visit.property_id ? propertyById.get(visit.property_id) : undefined
      const pm = property?.property_manager_id
        ? pmById.get(property.property_manager_id)
        : undefined
      const latest = latestReportByVisit.get(visit.id as string)

      return {
        visitId: visit.id as string,
        visitDate: visit.visit_date ? visit.visit_date.slice(0, 10) : "",
        visitDateLabel: formatDateOnly(visit.visit_date),
        clientName: property?.client_name || "Unknown property",
        address:
          [property?.address_line_1, property?.suburb].filter(Boolean).join(", ") ||
          "No address",
        pmName: pm?.name || null,
        pmEmail: pm?.email?.trim() || null,
        issues: issues.map((issue) => ({
          id: issue.id as string,
          publicUrl: (issue.public_url as string | null) || null,
          caption: (issue.caption as string | null) || "",
          severity: issue.severity as string,
        })),
        worst: worstSeverity(issues.map((issue) => issue.severity)),
        everSent: everSentVisits.has(visit.id as string),
        lastSentAtLabel: formatTimestampNz(
          latest?.status === "sent" ? latest.sent_at : null
        ),
        lastSentTo: latest?.status === "sent" ? latest.recipient_email : null,
        lastError: latest?.status === "failed" ? latest.error || "send failed" : null,
      }
    })
    .sort((a, b) => b.visitDate.localeCompare(a.visitDate))

  const loadError =
    issuesError?.message ||
    (reportsResult.error ? `Send history unavailable: ${reportsResult.error.message}` : null)

  return (
    <div className="p-4">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">PM Reports</h1>
        <p className="text-muted-foreground text-sm">
          Review walk-around issues from rental visits, tidy the notes, and send
          the report to the property manager.
        </p>
      </header>
      <PmReportsClient rows={rows} loadError={loadError} />
    </div>
  )
}
