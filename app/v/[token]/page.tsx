import type { Metadata } from "next"
import { createServiceClient } from "@/lib/supabase/service"
import { loadCustomerPhotos } from "@/lib/photo-email"
import { VisitPhotoGrid } from "@/components/visit-photo-grid"

// Public visit photo page (Brief_Public_Visit_Photo_Page): the link printed
// on Xero invoice lines. NO auth, NO RLS involvement — the lookup runs
// server-side as the service role (fail-loud client; the key never reaches
// the browser) and the payload carries ONLY address, date, photo URLs.
// Never client name/contact, prices, hours, staff, or notes.

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Visit photos — Pristine Gardens",
  robots: { index: false, follow: false },
}

// Deterministic NZ-style date — never toLocaleString in SSR text
// (docs/CODING_AGENT_RULES.md: hydration).
function formatVisitDate(value: string | null | undefined): string {
  if (!value) return ""
  const [y, m, d] = value.slice(0, 10).split("-").map(Number)
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"]
  if (!y || !m || !d) return ""
  return `${d} ${months[m - 1]} ${y}`
}

type PageData = {
  address: string
  visitDate: string
  photoUrls: string[]
}

async function loadPage(token: string): Promise<PageData | null> {
  // Tokens are 9 chars from a fixed alphabet (075) — refuse anything else
  // before touching the database.
  if (!/^[abcdefghjkmnpqrstuvwxyz23456789]{9}$/.test(token)) return null

  try {
    return await lookupVisit(token)
  } catch (err) {
    // Config or DB failure must degrade to the SAME generic page a bad token
    // gets (never a 500/stack — brief requirement), but a real failure for a
    // real customer must not be invisible: log it server-side.
    console.error("[public-visit-page] lookup failed", {
      message: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

async function lookupVisit(token: string): Promise<PageData | null> {
  const supabase = createServiceClient()

  const { data: visit } = await supabase
    .from("visits")
    .select("id, visit_date, property_id, scheduled_job_id")
    .eq("public_token", token)
    .maybeSingle()

  if (!visit) return null

  const { data: property } = await supabase
    .from("properties")
    .select("address_line_1, suburb")
    .eq("id", visit.property_id)
    .maybeSingle()

  // ONE definition of "customer-visible photo" (loadCustomerPhotos, shared
  // with the photo-email review) — the brief forbids a second definition.
  // Here we drop the VA-hidden ones for the public view; the review keeps them
  // greyed so the VA can unhide. force-dynamic (top of file) means this runs
  // live on every load, so a hide takes effect on this page immediately.
  const photos = await loadCustomerPhotos(supabase, {
    id: visit.id as string,
    scheduled_job_id: visit.scheduled_job_id as string | null,
  })

  return {
    address: [property?.address_line_1, property?.suburb]
      .filter(Boolean)
      .join(", "),
    visitDate: formatVisitDate(visit.visit_date),
    photoUrls: photos.filter((p) => !p.hidden).map((p) => p.public_url),
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      <header className="mb-6 border-b pb-4">
        <p className="text-2xl font-bold text-green-800">Pristine Gardens</p>
        <p className="text-sm text-gray-500">Visit photos</p>
      </header>
      {children}
      <footer className="mt-10 border-t pt-4 text-xs text-gray-400">
        Pristine Gardens · contact@pristinegardens.co.nz
      </footer>
    </main>
  )
}

export default async function PublicVisitPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const data = await loadPage(token)

  // Unknown/invalid token: one generic page, identical whether the token
  // ever existed. Plain 200 — no stack, no hint.
  if (!data) {
    return (
      <Shell>
        <p className="text-gray-700">This link isn&apos;t available.</p>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="mb-6">
        {data.address && (
          <h1 className="text-lg font-semibold text-gray-900">{data.address}</h1>
        )}
        {data.visitDate && (
          <p className="text-sm text-gray-500">Visit date: {data.visitDate}</p>
        )}
      </div>

      {data.photoUrls.length === 0 ? (
        <p className="text-gray-700">
          No photos were recorded for this visit.
        </p>
      ) : (
        <VisitPhotoGrid photoUrls={data.photoUrls} />
      )}
    </Shell>
  )
}
