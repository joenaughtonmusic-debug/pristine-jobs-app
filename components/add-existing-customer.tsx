"use client"

import { useMemo, useState, useTransition } from "react"
import { Plus } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { createExistingCustomerLead } from "@/app/(app)/sales-pipeline/actions"
import { fromDatetimeLocalValue } from "@/lib/sales-leads"
import type { ExistingCustomerProperty } from "@/lib/sales-lead-manual"

// Slice 6 (Phase1 spec §6): repeat customers skip the New lead → Contacted
// courtship — search properties, say what they want, and the lead enters the
// board at Visit booked. Sits between the board and the Invoiced section.
export function AddExistingCustomer() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [properties, setProperties] = useState<ExistingCustomerProperty[]>([])
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<ExistingCustomerProperty | null>(
    null
  )
  const [service, setService] = useState("")
  const [message, setMessage] = useState("")
  const [visitAt, setVisitAt] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const openPanel = async () => {
    setOpen(true)
    setError(null)

    if (properties.length > 0) return

    setLoading(true)
    const supabase = createClient()
    const { data, error: loadError } = await supabase
      .from("properties")
      .select(
        "id, client_name, client_email, phone, suburb, address_line_1, property_code"
      )
      .eq("is_active", true)
      .order("client_name")

    setLoading(false)

    if (loadError) {
      setError(loadError.message)
      return
    }

    setProperties((data || []) as ExistingCustomerProperty[])
  }

  const close = () => {
    setOpen(false)
    setSearch("")
    setSelected(null)
    setService("")
    setMessage("")
    setVisitAt("")
    setError(null)
  }

  const results = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return []

    return properties
      .filter((property) =>
        [property.client_name, property.suburb, property.address_line_1]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(query))
      )
      .slice(0, 8)
  }, [properties, search])

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!selected) return

    if (!service.trim()) {
      setError("Enter what they want.")
      return
    }

    setError(null)

    startTransition(async () => {
      try {
        const result = await createExistingCustomerLead(selected.id, {
          service_needed: service,
          message,
          site_visit_at: fromDatetimeLocalValue(visitAt),
        })

        if ("error" in result) {
          setError(result.error)
          return
        }

        close()
      } catch {
        setError("Failed to save the lead. Please try again.")
      }
    })
  }

  if (!open) {
    return (
      <div className="mt-8">
        <Button type="button" variant="outline" onClick={openPanel}>
          <Plus className="h-4 w-4" />
          Add existing customer
        </Button>
      </div>
    )
  }

  return (
    <section className="mt-8 rounded-lg border bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-gray-900">
        Add existing customer
      </h2>
      <p className="mb-3 text-sm text-gray-500">
        Known customers skip straight to Visit booked.
      </p>

      {!selected ? (
        <>
          <Input
            autoFocus
            placeholder="Search customers by name, suburb or address"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          {loading ? (
            <p className="mt-3 text-sm text-gray-500">Loading customers…</p>
          ) : search.trim() && results.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">No customers match.</p>
          ) : (
            <ul className="mt-3 divide-y rounded-md border empty:hidden">
              {results.map((property) => (
                <li key={property.id}>
                  <button
                    type="button"
                    className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left hover:bg-gray-50"
                    onClick={() => {
                      setSelected(property)
                      setError(null)
                    }}
                  >
                    <span className="text-sm font-medium text-gray-900">
                      {property.client_name || "Unnamed client"}
                    </span>
                    <span className="truncate text-xs text-gray-500">
                      {[property.address_line_1, property.suburb]
                        .filter(Boolean)
                        .join(", ") || property.property_code}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

          <div className="mt-3">
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="rounded-md border bg-gray-50 px-3 py-2 text-sm">
            <span className="font-medium text-gray-900">
              {selected.client_name}
            </span>{" "}
            <span className="text-gray-500">
              {[selected.address_line_1, selected.suburb]
                .filter(Boolean)
                .join(", ")}
            </span>
            <button
              type="button"
              className="ml-2 text-xs text-gray-500 underline"
              onClick={() => setSelected(null)}
            >
              change
            </button>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Input
              placeholder="What do they want? (required)"
              value={service}
              onChange={(event) => setService(event.target.value)}
            />
            <label className="grid gap-1 text-sm">
              <Input
                type="datetime-local"
                aria-label="Visit date and time (optional)"
                value={visitAt}
                onChange={(event) => setVisitAt(event.target.value)}
              />
            </label>
          </div>

          <Textarea
            className="mt-3"
            placeholder="Notes (optional)"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />

          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

          <div className="mt-3 flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add at Visit booked"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={close}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}
