"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

type Enquiry = {
  id: string
  name: string
  email: string | null
  phone: string | null
  suburb: string | null
  address: string | null
  job_type: string | null
  budget_range: string | null
  notes: string | null
  status: string
  created_at: string
}

type Props = {
  enquiries: Enquiry[]
}

export function AdminEnquiriesClient({
  enquiries = [],
}: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [suburb, setSuburb] = useState("")
  const [address, setAddress] = useState("")
  const [jobType, setJobType] = useState("quote")
  const [budgetRange, setBudgetRange] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  const handleCreateEnquiry = async () => {
    if (!name.trim()) {
      alert("Add customer name.")
      return
    }

    setSaving(true)

    const { error } = await supabase
      .from("admin_enquiries")
      .insert({
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        suburb: suburb.trim() || null,
        address: address.trim() || null,
        job_type: jobType,
        budget_range: budgetRange.trim() || null,
        notes: notes.trim() || null,
        status: "new",
      })

    setSaving(false)

    if (error) {
      alert(error.message)
      return
    }

    setName("")
    setEmail("")
    setPhone("")
    setSuburb("")
    setAddress("")
    setJobType("quote")
    setBudgetRange("")
    setNotes("")

    router.refresh()
  }

  return (
    <div className="mx-auto max-w-7xl p-4 pb-10">
      <header className="mb-6">
  <h1 className="text-2xl font-bold">Admin Enquiries</h1>

  <p className="text-sm text-gray-500">
    Phone enquiries, quote requests and admin lead capture.
  </p>
</header>

<details className="mb-8 rounded-xl border bg-white p-5 shadow-sm">
  <summary className="cursor-pointer text-lg font-semibold">
    Lead Qualification Script
  </summary>

  <div className="mt-4 space-y-6 text-sm text-gray-700">
    <section>
      <h3 className="font-semibold">1. Ongoing Garden Maintenance</h3>

      <p className="mt-2 font-medium">Main Goals</p>
      <p>
        Confirm service area, ensure client wants ongoing maintenance, qualify
        budget, gather contact details and book estimate follow-up.
      </p>

      <p className="mt-3 font-medium">Key Questions</p>

      <p className="mt-2">
        <strong>Area:</strong> “We currently service Central Auckland and
        selected North Shore areas such as Devonport and Birkenhead — what area
        is the property located in?”
      </p>

      <p className="mt-2">
        <strong>Service Type:</strong> “Are you looking for ongoing garden
        maintenance or more of a one-off tidy?”
      </p>

      <p className="mt-2">
        <strong>Garden Overview:</strong> Approximate property/garden size?
        Hedges involved? Fairly tidy or overgrown? Looking for general upkeep?
      </p>

      <p className="mt-2">
        <strong>Budget Qualification:</strong> “Our ongoing maintenance services
        generally start from around $305 per month depending on the property —
        does that sound roughly in line with what you were expecting?”
      </p>

      <p className="mt-2">
        <strong>Contact Details:</strong> Name, mobile, email, address. If email
        is difficult: “We’ll text you after the call so you can reply with your
        email and any photos.”
      </p>

      <p className="mt-3 font-medium">Internal Notes VA Should Capture</p>
      <p>
        Area, garden size, hedges Y/N, overgrown Y/N, budget aligned Y/N,
        preferred contact times, referral source.
      </p>
    </section>

    <section>
      <h3 className="font-semibold">2. Landscaping</h3>

      <p className="mt-2 font-medium">Main Goals</p>
      <p>
        Filter low-budget projects, confirm area, determine project seriousness,
        gather plans/photos.
      </p>

      <p className="mt-3 font-medium">Key Questions</p>

      <p className="mt-2">
        <strong>Area:</strong> Same service-area filter.
      </p>

      <p className="mt-2">
        <strong>Project Type:</strong> “What type of landscaping project are you
        considering?”
      </p>

      <p className="mt-2">
        <strong>Design Status:</strong> “Do you already have plans or a
        landscape design prepared?”
      </p>

      <p className="mt-2">
        <strong>Budget Qualification:</strong> “For landscaping projects we
        generally focus on projects with budgets starting from around $30,000+
        depending on scope — does that align roughly with what you’re planning?”
      </p>

      <p className="mt-2">
        <strong>Expectation Setting:</strong> “We’re fairly selective with
        landscaping projects to maintain quality and scheduling standards.”
      </p>

      <p className="mt-2">
        <strong>Gather:</strong> Photos, plans, measurements, desired timeframe.
      </p>

      <p className="mt-3 font-medium">Internal Notes</p>
      <p>
        Budget aligned Y/N, design complete Y/N, project type, timeframe,
        referral source.
      </p>
    </section>

    <section>
      <h3 className="font-semibold">3. One-Off Garden Tidies</h3>

      <p className="mt-2 font-medium">Main Goals</p>
      <p>
        Avoid lengthy phone quoting, push toward photo/email submission, filter
        small/low-quality jobs.
      </p>

      <p className="mt-3 font-medium">Script Summary</p>
      <p>
        “For one-off garden tidy work, the best next step is to email through
        photos along with a brief description of the work required.”
      </p>

      <p className="mt-2">
        “Once reviewed, we’ll let you know whether it’s something we can assist
        with and discuss next steps.”
      </p>

      <p className="mt-2">
        Optional: “For larger one-off tidy jobs we generally work on a minimum
        full-day team basis.”
      </p>
    </section>

    <section>
      <h3 className="font-semibold">Service Area Rules</h3>

      <p className="mt-2 font-medium">Areas Serviced</p>
      <p>
        Central Auckland, Remuera, Epsom, Mt Eden, Meadowbank, Kohimarama, St
        Heliers, Grey Lynn, Herne Bay, Devonport, Birkenhead.
      </p>

      <p className="mt-3 font-medium">Areas Not Currently Serviced</p>
      <p>South of Onehunga. South of Mt Wellington.</p>
    </section>
  </div>
</details>

      <section className="mb-8 rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">
          New Enquiry
        </h2>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">
              Name
            </label>

            <input
              className="h-11 w-full rounded-md border px-3"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Email
            </label>

            <input
              className="h-11 w-full rounded-md border px-3"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Phone
            </label>

            <input
              className="h-11 w-full rounded-md border px-3"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Suburb
            </label>

            <input
              className="h-11 w-full rounded-md border px-3"
              value={suburb}
              onChange={(e) => setSuburb(e.target.value)}
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">
              Address
            </label>

            <input
              className="h-11 w-full rounded-md border px-3"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Job Type
            </label>

            <select
              className="h-11 w-full rounded-md border px-3"
              value={jobType}
              onChange={(e) => setJobType(e.target.value)}
            >
              <option value="quote">Quote</option>
              <option value="maintenance">
                Ongoing Maintenance
              </option>
              <option value="landscaping">
                Landscaping
              </option>
              <option value="planting">
                Planting
              </option>
              <option value="hedges">
                Hedge Work
              </option>
              <option value="irrigation">
                Irrigation
              </option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Budget Range
            </label>

            <input
              className="h-11 w-full rounded-md border px-3"
              value={budgetRange}
              onChange={(e) => setBudgetRange(e.target.value)}
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">
              Notes
            </label>

            <textarea
              className="min-h-[140px] w-full rounded-md border p-3"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleCreateEnquiry}
          disabled={saving}
          className="mt-5 h-11 w-full rounded-md bg-blue-600 font-medium text-white disabled:bg-gray-300"
        >
          {saving ? "Saving..." : "Create Enquiry"}
        </button>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">
          Recent Enquiries
        </h2>

        <div className="space-y-3">
          {enquiries.length > 0 ? (
            enquiries.map((enquiry) => (
              <div
                key={enquiry.id}
                className="rounded-lg border p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold">
                      {enquiry.name}
                    </div>

                    <div className="mt-1 text-sm text-gray-500">
                      {enquiry.suburb || "No suburb"}
                    </div>

                    {enquiry.address && (
                      <div className="text-sm text-gray-500">
                        {enquiry.address}
                      </div>
                    )}

                    <div className="mt-2 text-xs text-gray-400">
                      {enquiry.job_type}
                    </div>

                    {enquiry.notes && (
                      <div className="mt-3 text-sm text-gray-600">
                        {enquiry.notes}
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                    {enquiry.status}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-400">
              No enquiries yet.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}